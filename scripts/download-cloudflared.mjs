import { createHash, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// The digest is the official GitHub release asset digest, not downloaded metadata.
export const CLOUDFLARED_VERSION = '2026.10.1';
export const CLOUDFLARED_SHA256 = '3bfc539f45d2620c71debb7a86be0efa737ed5ccbad9eb85c787116900e5c586';
export const CLOUDFLARED_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64`;
const maximumBinarySize = 64 * 1024 * 1024;

export function verifyBinaryDigest(bytes, expectedDigest = CLOUDFLARED_SHA256) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (!bytes.length || bytes.length > maximumBinarySize || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error('The cloudflared download or checksum is invalid.');
  }
  const digest = createHash('sha256').update(bytes).digest();
  if (!timingSafeEqual(digest, Buffer.from(expectedDigest, 'hex'))) {
    throw new Error('The cloudflared checksum did not match the pinned release.');
  }
  return bytes;
}

export async function downloadCloudflared({ destination = resolve(process.env.RUNNER_TEMP || tmpdir(), 'car-pro-form-route-preview', 'cloudflared'), fetchImpl = fetch, expectedDigest = CLOUDFLARED_SHA256 } = {}) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('The preview tunnel requires a Linux x64 runner.');
  const path = resolve(destination), folder = dirname(path);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  if (await realpath(folder) !== folder) throw new Error('The tunnel download folder must not contain symbolic links.');
  try {
    const existing = await lstat(path);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('The tunnel binary path is not a regular file.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetchImpl(CLOUDFLARED_URL, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error('The pinned cloudflared release could not be downloaded.');
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maximumBinarySize) throw new Error('The cloudflared download exceeds the size limit.');
  const bytes = verifyBinaryDigest(Buffer.from(await response.arrayBuffer()), expectedDigest);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o700, flag: 'wx' });
    await chmod(temporary, 0o700);
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Verified cloudflared ${CLOUDFLARED_VERSION}: ${await downloadCloudflared()}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
