import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, symlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOUDFLARED_SHA256, CLOUDFLARED_URL, CLOUDFLARED_VERSION, downloadCloudflared, verifyBinaryDigest } from '../scripts/download-cloudflared.mjs';
import { PREVIEW_DURATION_MS, parseTunnelUrl, previewPaths, readPreviewState, validatePreviewState, waitForPublicBackend } from '../scripts/start-route-preview.mjs';

const sourceServer = fileURLToPath(new URL('../server.js', import.meta.url));
const start = '2026-10-19T06:00:00.000Z';
const expires = new Date(Date.parse(start) + PREVIEW_DURATION_MS).toISOString();
const validState = (runnerTemp) => ({ version: 1, serverPid: 10001, tunnelPid: 10002, serverPath: sourceServer, binaryPath: previewPaths(runnerTemp).binary, startedAt: start, expiresAt: expires });

async function temporary(t) {
  const folder = await mkdtemp(resolve(tmpdir(), 'car-route-preview-test-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  return folder;
}

test('cloudflared download pins the official release URL and asset digest', () => {
  assert.equal(CLOUDFLARED_VERSION, '2026.10.1');
  assert.equal(CLOUDFLARED_URL, 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.1/cloudflared-linux-amd64');
  assert.equal(CLOUDFLARED_SHA256, '3bfc539f45d2620c71debb7a86be0efa737ed5ccbad9eb85c787116900e5c586');
});

test('a changed or empty tunnel binary fails checksum verification', () => {
  const fixture = Buffer.from('safe test executable');
  const expected = createHash('sha256').update(fixture).digest('hex');
  assert.equal(verifyBinaryDigest(fixture, expected), fixture);
  assert.throws(() => verifyBinaryDigest(Buffer.from('modified executable'), expected), /checksum did not match/);
  assert.throws(() => verifyBinaryDigest(Buffer.alloc(0), expected), /invalid/);
  assert.throws(() => verifyBinaryDigest(fixture, 'not-a-digest'), /invalid/);
});

test('downloader verifies bytes before installing an executable', async (t) => {
  const folder = await temporary(t), destination = resolve(folder, 'tools', 'cloudflared');
  const bytes = Buffer.from('verified fixture'), digest = createHash('sha256').update(bytes).digest('hex');
  let requested;
  await downloadCloudflared({ destination, expectedDigest: digest, fetchImpl: async (url, options) => {
    requested = { url, options };
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
  } });
  assert.equal(requested.url, CLOUDFLARED_URL);
  assert.equal(requested.options.redirect, 'follow');
  assert.ok(requested.options.signal instanceof AbortSignal);
  assert.deepEqual(await readFile(destination), bytes);
  assert.equal((await stat(destination)).mode & 0o777, 0o700);
});

test('failed download and mismatched checksum never overwrite an existing binary', async (t) => {
  const folder = await temporary(t), destination = resolve(folder, 'cloudflared');
  await writeFile(destination, 'previous verified binary');
  await assert.rejects(downloadCloudflared({ destination, fetchImpl: async () => new Response('failure', { status: 502 }) }), /could not be downloaded/);
  await assert.rejects(downloadCloudflared({ destination, fetchImpl: async () => new Response('tampered') }), /checksum did not match/);
  assert.equal(await readFile(destination, 'utf8'), 'previous verified binary');
});

test('downloader rejects a symbolic link destination or parent', async (t) => {
  const folder = await temporary(t), target = resolve(folder, 'elsewhere');
  await writeFile(target, 'leave unchanged');
  await symlink(target, resolve(folder, 'cloudflared'));
  const noNetwork = async () => { throw new Error('network must not be used'); };
  await assert.rejects(downloadCloudflared({ destination: resolve(folder, 'cloudflared'), fetchImpl: noNetwork }), /regular file/);
  await mkdir(resolve(folder, 'actual'));
  await symlink(resolve(folder, 'actual'), resolve(folder, 'linked'));
  await assert.rejects(downloadCloudflared({ destination: resolve(folder, 'linked', 'cloudflared'), fetchImpl: noNetwork }), /symbolic links/);
  assert.equal(await readFile(target, 'utf8'), 'leave unchanged');
});

test('quick tunnel parser reads the official HTTPS URL from the banner', () => {
  const log = '2026-10-19T06:00:00Z INF |  https://test-preview-four-words.trycloudflare.com  |\n';
  assert.equal(parseTunnelUrl(log), 'https://test-preview-four-words.trycloudflare.com');
  assert.equal(parseTunnelUrl('https://a.trycloudflare.com'), 'https://a.trycloudflare.com');
});

test('quick tunnel parser rejects attacker hosts, credentials, protocols and injected paths', () => {
  for (const value of [
    'http://valid.trycloudflare.com',
    'https://valid.trycloudflare.com.evil.example',
    'https://valid.trycloudflare.com@evil.example',
    'https://user@valid.trycloudflare.com',
    'https://valid.trycloudflare.com/evil',
    'https://valid.trycloudflare.com?key=not-allowed',
    'https://valid.trycloudflare.com:443',
    'https://-invalid.trycloudflare.com',
    'https://invalid-.trycloudflare.com',
    `https://${'a'.repeat(64)}.trycloudflare.com`,
    'https://trycloudflare.com',
    'https://evil.example'
  ]) assert.equal(parseTunnelUrl(value), null, value);
});

test('preview state accepts only its own paths, processes, and exactly two-hour lifetime', async (t) => {
  const folder = await temporary(t), fixture = validState(folder);
  assert.equal(validatePreviewState(fixture, { runnerTemp: folder }), fixture);
  for (const override of [
    { version: 2 }, { serverPid: 1 }, { tunnelPid: fixture.serverPid }, { tunnelPid: 12.5 },
    { serverPath: '/tmp/arbitrary-server.js' }, { binaryPath: '/tmp/arbitrary-cloudflared' },
    { startedAt: 'invalid' }, { expiresAt: 'invalid' },
    { expiresAt: new Date(Date.parse(expires) + 1).toISOString() }
  ]) assert.throws(() => validatePreviewState({ ...fixture, ...override }, { runnerTemp: folder }), /invalid/);
  assert.throws(() => validatePreviewState(fixture, { runnerTemp: folder, statePath: resolve(folder, '..', 'other-state.json') }), /outside/);
});

test('state reader refuses outside paths and symlinks before reading JSON', async (t) => {
  const folder = await temporary(t), paths = previewPaths(folder);
  await mkdir(paths.base);
  await writeFile(paths.state, JSON.stringify(validState(folder)), { mode: 0o600 });
  assert.equal((await readPreviewState(paths.state, { runnerTemp: folder })).serverPid, 10001);
  await assert.rejects(readPreviewState(resolve(folder, 'other.json'), { runnerTemp: folder }), /outside/);
  await rm(paths.state);
  const target = resolve(folder, 'target.json');
  await writeFile(target, JSON.stringify(validState(folder)));
  await symlink(target, paths.state);
  await assert.rejects(readPreviewState(paths.state, { runnerTemp: folder }), /regular file/);
});


test('public readiness checks the tunnel config without Origin or a Google request', async () => {
  let attempts = 0;
  await waitForPublicBackend('https://working-preview.trycloudflare.com', { timeoutMs: 100, retryMs: 1, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://working-preview.trycloudflare.com/api/maps/config');
    assert.equal(options.headers, undefined);
    assert.equal(options.cache, 'no-store');
    attempts++;
    return new Response(JSON.stringify({ routesConfigured: attempts === 2 }));
  } });
  assert.equal(attempts, 2);
});

test('public readiness rejects invalid hosts and times out rather than publishing an unusable tunnel', async () => {
  const noNetwork = async () => { throw new Error('must not fetch invalid host'); };
  await assert.rejects(waitForPublicBackend('https://working.trycloudflare.com.evil.example', { fetchImpl: noNetwork }), /address is invalid/);
  await assert.rejects(waitForPublicBackend('https://not-ready.trycloudflare.com', { timeoutMs: 5, retryMs: 1, fetchImpl: async () => new Response('unavailable', { status: 502 }) }), /did not become publicly reachable/);
});
