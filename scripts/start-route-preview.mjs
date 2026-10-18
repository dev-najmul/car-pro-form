import { spawn } from 'node:child_process';
import { appendFile, chmod, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { downloadCloudflared } from './download-cloudflared.mjs';

export const PREVIEW_DURATION_MS = 2 * 60 * 60 * 1000;
export const PREVIEW_ORIGIN = 'https://dev-najmul.github.io';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const within = (base, candidate) => candidate.startsWith(base + sep);

export function previewPaths(runnerTemp = process.env.RUNNER_TEMP || tmpdir()) {
  const base = resolve(runnerTemp, 'car-pro-form-route-preview');
  return { base, state: resolve(base, 'state.json'), serverLog: resolve(base, 'server.log'), tunnelLog: resolve(base, 'tunnel.log'), binary: resolve(base, 'cloudflared') };
}

export function parseTunnelUrl(log) {
  // Reject suffix hosts, credentials, query strings and non-HTTPS URLs.
  const matches = String(log).matchAll(/(?:^|[\s|])https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com)(?=[\s|]|$)/gm);
  for (const match of matches) return `https://${match[1]}`;
  return null;
}

export function validatePreviewState(state, { statePath, runnerTemp = process.env.RUNNER_TEMP || tmpdir() } = {}) {
  const paths = previewPaths(runnerTemp);
  if (resolve(statePath || paths.state) !== paths.state) throw new Error('The route preview state is outside its runner directory.');
  if (!state || state.version !== 1 || !Number.isInteger(state.serverPid) || !Number.isInteger(state.tunnelPid) || state.serverPid < 2 || state.tunnelPid < 2 || state.serverPid === state.tunnelPid) {
    throw new Error('The route preview process state is invalid.');
  }
  const started = Date.parse(state.startedAt), expires = Date.parse(state.expiresAt);
  if (!Number.isFinite(started) || !Number.isFinite(expires) || expires - started !== PREVIEW_DURATION_MS || state.serverPath !== resolve(projectRoot, 'server.js') || state.binaryPath !== paths.binary || !within(paths.base, paths.state)) {
    throw new Error('The route preview paths or lifetime are invalid.');
  }
  return state;
}

export async function readPreviewState(statePath, { runnerTemp = process.env.RUNNER_TEMP || tmpdir() } = {}) {
  const expected = previewPaths(runnerTemp).state;
  if (resolve(statePath || expected) !== expected) throw new Error('The route preview state is outside its runner directory.');
  const info = await lstat(expected);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(expected) !== expected) throw new Error('The route preview state must be a regular file.');
  return validatePreviewState(JSON.parse(await readFile(expected, 'utf8')), { statePath: expected, runnerTemp });
}

export function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function ownsPreviewProcess(pid, kind, state) {
  try {
    const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean);
    if (kind === 'server') return args[0] === process.execPath && args[1] === '--use-env-proxy' && args[2] === state.serverPath && args[3] === '--port' && args[4] === '3000';
    return kind === 'tunnel' && args[0] === state.binaryPath && args[1] === 'tunnel' && args.includes('http://127.0.0.1:3000');
  } catch { return false; }
}

export async function stopPreviewProcesses(state) {
  for (const [kind, pid] of [['tunnel', state.tunnelPid], ['server', state.serverPid]]) {
    if (!await ownsPreviewProcess(pid, kind, state)) continue;
    try { process.kill(-pid, 'SIGTERM'); } catch { /* It may already have stopped. */ }
  }
}

async function detachedProcess(executable, args, { logPath, env }) {
  const log = await open(logPath, 'w', 0o600);
  try {
    const child = spawn(executable, args, { cwd: projectRoot, detached: true, stdio: ['ignore', log.fd, log.fd], env });
    await new Promise((resolveStarted, reject) => { child.once('spawn', resolveStarted); child.once('error', reject); });
    child.unref();
    return child.pid;
  } finally { await log.close(); }
}

async function waitForBackend(pid) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!processExists(pid)) throw new Error('The temporary Routes backend stopped during startup.');
    try {
      const response = await fetch('http://127.0.0.1:3000/api/maps/config', { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).routesConfigured === true) return;
    } catch { /* The server may still be starting. */ }
    await delay(250);
  }
  throw new Error('The temporary Routes backend did not become ready.');
}

async function waitForTunnel(pid, logPath) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!processExists(pid)) throw new Error('The temporary tunnel stopped during startup.');
    const url = parseTunnelUrl(await readFile(logPath, 'utf8'));
    if (url) return url;
    await delay(250);
  }
  throw new Error('The temporary tunnel did not supply a valid HTTPS address.');
}

export async function waitForPublicBackend(tunnelUrl, { fetchImpl = fetch, timeoutMs = 30_000, retryMs = 1000 } = {}) {
  if (parseTunnelUrl(tunnelUrl) !== tunnelUrl) throw new Error('The temporary tunnel address is invalid.');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Node sends no Origin header. This checks the tunnel, not Google Routes.
      const response = await fetchImpl(`${tunnelUrl}/api/maps/config`, { signal: AbortSignal.timeout(Math.min(2000, Math.max(1, deadline - Date.now()))), cache: 'no-store' });
      if (response.ok && (await response.json()).routesConfigured === true) return;
    } catch { /* DNS and the edge connection may still be becoming ready. */ }
    if (Date.now() < deadline) await delay(Math.min(retryMs, deadline - Date.now()));
  }
  throw new Error('The temporary Routes tunnel did not become publicly reachable.');
}

async function output(values, destination = process.env.GITHUB_OUTPUT) {
  if (!destination) return;
  await appendFile(destination, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
}

export async function startRoutePreview() {
  const routesKey = process.env.GOOGLE_ROUTES_API_KEY?.trim();
  if (!routesKey) {
    await output({ enabled: 'false' });
    console.log('No temporary Routes backend requested. Pages will use browser routing.');
    return null;
  }
  if (/[\u0000-\u0020\u007f]/.test(routesKey)) throw new Error('The Routes API secret contains invalid whitespace.');
  const paths = previewPaths();
  await mkdir(paths.base, { recursive: true, mode: 0o700 });
  if (await realpath(paths.base) !== paths.base) throw new Error('The route preview directory must not contain symbolic links.');
  await chmod(paths.base, 0o700);
  try { await lstat(paths.state); throw new Error('A route preview state already exists. Use a fresh runner.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const binary = await downloadCloudflared({ destination: paths.binary });
  const serverEnv = { ...process.env, PORT: '3000', GOOGLE_ROUTES_API_KEY: routesKey, GOOGLE_MAPS_BROWSER_KEY: '', ALLOWED_WEB_ORIGINS: PREVIEW_ORIGIN, PREVIEW_ROUTE_REQUEST_LIMIT: '200' };
  const tunnelEnv = { ...process.env };
  delete tunnelEnv.GOOGLE_ROUTES_API_KEY;
  delete tunnelEnv.GOOGLE_MAPS_BROWSER_KEY;
  let state;
  try {
    const serverPid = await detachedProcess(process.execPath, ['--use-env-proxy', resolve(projectRoot, 'server.js'), '--port', '3000'], { logPath: paths.serverLog, env: serverEnv });
    state = { version: 1, serverPid, tunnelPid: 0, serverPath: resolve(projectRoot, 'server.js'), binaryPath: binary };
    await waitForBackend(serverPid);
    const tunnelPid = await detachedProcess(binary, ['tunnel', '--url', 'http://127.0.0.1:3000', '--protocol', 'http2', '--no-autoupdate'], { logPath: paths.tunnelLog, env: tunnelEnv });
    state.tunnelPid = tunnelPid;
    const url = await waitForTunnel(tunnelPid, paths.tunnelLog);
    await waitForPublicBackend(url);
    const started = Date.now();
    state.startedAt = new Date(started).toISOString();
    state.expiresAt = new Date(started + PREVIEW_DURATION_MS).toISOString();
    validatePreviewState(state);
    const temporary = `${paths.state}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, paths.state);
    await output({ enabled: 'true', route_endpoint: `${url}/api/maps/route`, preview_expires_at: state.expiresAt, state_path: paths.state });
    console.log(`Temporary Routes preview started. It expires at ${state.expiresAt}.`);
    return state;
  } catch (error) {
    if (state) await stopPreviewProcesses(state);
    await rm(paths.state, { force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await startRoutePreview(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
