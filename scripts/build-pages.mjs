import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const publicFiles = ['index.html', 'styles.css', 'app.js', 'maps.js', 'pickup-map.js', 'pricing.js', 'countries.js', 'quick-booking.js', 'quick-handoff.js', 'quick-booking.css', 'terms.html', 'privacy.html'];
const assetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.ttf', '.woff', '.woff2', '.txt', '.md']);
const marker = '.car-pro-form-pages-build';
const markerValue = 'car-pro-form static Pages build v1\n';
const within = (base, path) => path === base || path.startsWith(base + sep);

/** Build only the public site. The Routes server credential is never read. */
export async function buildPages({ sourceDirectory = projectRoot, outputDirectory, browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY, routeEndpoint = process.env.ROUTE_API_ENDPOINT, previewExpiresAt = process.env.PREVIEW_EXPIRES_AT } = {}) {
  if (typeof browserKey !== 'string' || !browserKey.trim() || /[\u0000-\u001f\u007f]/.test(browserKey)) {
    throw new Error('Set the GitHub Actions secret GOOGLE_MAPS_BROWSER_KEY before building GitHub Pages.');
  }
  const config = { browserKey: browserKey.trim(), browserConfigured: true, routesConfigured: true, providerMode: 'browser' };
  if (routeEndpoint) {
    let endpoint;
    try { endpoint = new URL(routeEndpoint); } catch { throw new Error('The route backend URL is invalid.'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Use an HTTPS route backend URL without credentials or query parameters.');
    config.providerMode = 'remote'; config.routeEndpoint = endpoint.href;
    if (previewExpiresAt) {
      const expires = new Date(previewExpiresAt);
      if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) throw new Error('The temporary route backend expiration must be in the future.');
      config.previewExpiresAt = expires.toISOString();
    }
  } else if (previewExpiresAt) throw new Error('A temporary route backend expiration requires a route backend URL.');
  const source = await realpath(resolve(sourceDirectory));
  const output = resolve(outputDirectory || resolve(source, 'dist'));
  if (within(output, source) || within(resolve(source, 'assets'), output) || publicFiles.some(file => output === resolve(source, file))) {
    throw new Error('Choose a separate output directory; source files must be preserved.');
  }
  await mkdir(dirname(output), { recursive: true });
  if (await realpath(dirname(output)) !== dirname(output)) throw new Error('The output parent must not be a symbolic link.');
  try {
    const existing = await lstat(output);
    if (!existing.isDirectory() || existing.isSymbolicLink() || await readFile(resolve(output, marker), 'utf8') !== markerValue) {
      throw new Error('Refusing to replace a directory that is not a previous Pages build.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // An existing unmarked directory is not an output owned by this builder.
    try { await lstat(output); throw new Error('Refusing to replace an unmarked output directory.'); } catch (check) { if (check.code !== 'ENOENT') throw check; }
  }
  const staging = await mkdtemp(output + '.tmp-');
  let copied = 0;
  try {
    for (const file of publicFiles) {
      const path = resolve(source, file);
      if (!(await lstat(path)).isFile() || await realpath(path) !== path) throw new Error('Public source files must be regular files.');
      await copyFile(path, resolve(staging, file)); copied++;
    }
    async function copyAssets(folder, destination) {
      await mkdir(destination, { recursive: true });
      for (const item of await readdir(folder, { withFileTypes: true })) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;
        const from = resolve(folder, item.name), to = resolve(destination, item.name);
        if (item.isSymbolicLink()) throw new Error('Public asset links are not allowed in a Pages build.');
        if (item.isDirectory()) await copyAssets(from, to);
        else if (item.isFile() && assetExtensions.has(extname(item.name).toLowerCase())) { await copyFile(from, to); copied++; }
      }
    }
    const assets = resolve(source, 'assets');
    if (!(await lstat(assets)).isDirectory() || await realpath(assets) !== assets) throw new Error('The assets directory must not be a symbolic link.');
    await copyAssets(assets, resolve(staging, 'assets'));
    await writeFile(resolve(staging, 'maps-config.json'), JSON.stringify(config) + '\n');
    await writeFile(resolve(staging, '.nojekyll'), '');
    await writeFile(resolve(staging, marker), markerValue);
    await rm(output, { recursive: true, force: true });
    await rename(staging, output);
    return { outputDirectory: output, publicFileCount: copied + 2 };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildPages();
    console.log(`Built ${result.publicFileCount} public files for GitHub Pages in ${relative(projectRoot, result.outputDirectory)}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
