import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'tuxano-pages-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourceDirectory = join(directory, 'source'), outputDirectory = join(directory, 'public');
  await mkdir(join(sourceDirectory, 'assets', 'licenses'), { recursive: true });
  for (const file of ['index.html', 'styles.css', 'app.js', 'maps.js', 'pricing.js', 'terms.html', 'privacy.html']) await writeFile(join(sourceDirectory, file), `public ${file}`);
  await writeFile(join(sourceDirectory, 'assets', 'photo.png'), 'photo');
  await writeFile(join(sourceDirectory, 'assets', 'font.woff2'), 'font');
  await writeFile(join(sourceDirectory, 'assets', 'licenses', 'OFL.txt'), 'license');
  for (const file of ['.env.local', 'server.js', 'maps-api.js', 'project.md']) await writeFile(join(sourceDirectory, file), 'private-server-key.fixture');
  await writeFile(join(sourceDirectory, 'assets', 'private.env'), 'private-server-key.fixture');
  return { sourceDirectory, outputDirectory, browserKey: 'public-browser.fixture', directory };
}

test('Pages build publishes only public assets and browser configuration, without server inputs', async t => {
  const options = await fixture(t);
  await buildPages(options);
  const config = JSON.parse(await readFile(join(options.outputDirectory, 'maps-config.json'), 'utf8'));
  assert.deepEqual(config, { browserKey: options.browserKey, browserConfigured: true, routesConfigured: true, providerMode: 'browser' });
  const files = await readdir(options.outputDirectory, { recursive: true });
  for (const name of ['index.html', 'maps.js', 'pricing.js', 'terms.html', 'privacy.html', 'assets/photo.png', 'assets/font.woff2', 'assets/licenses/OFL.txt']) assert.ok(files.includes(name), name);
  for (const name of ['.env.local', 'server.js', 'maps-api.js', 'project.md', 'assets/private.env']) assert.ok(!files.includes(name), name);
  for (const file of files.filter(file => file.includes('.'))) {
    try { assert.ok(!(await readFile(join(options.outputDirectory, file), 'utf8')).includes('private-server-key.fixture')); } catch (error) { if (error.code !== 'EISDIR') throw error; }
  }
});

test('missing browser configuration fails before an existing output is modified', async t => {
  const options = await fixture(t);
  await mkdir(options.outputDirectory);
  await writeFile(join(options.outputDirectory, 'keep.txt'), 'keep me');
  await assert.rejects(buildPages({ ...options, browserKey: '' }), /GOOGLE_MAPS_BROWSER_KEY/);
  assert.equal(await readFile(join(options.outputDirectory, 'keep.txt'), 'utf8'), 'keep me');
});

test('remote preview config contains only public endpoint metadata and a future expiration', async t => {
  const options = await fixture(t);
  const expiry = new Date(Date.now() + 7200000).toISOString();
  await buildPages({ ...options, routeEndpoint: 'https://preview.example/api/maps/route', previewExpiresAt: expiry });
  const config = JSON.parse(await readFile(join(options.outputDirectory, 'maps-config.json'), 'utf8'));
  assert.equal(config.providerMode, 'remote');
  assert.equal(config.routeEndpoint, 'https://preview.example/api/maps/route');
  assert.equal(config.previewExpiresAt, expiry);
  assert.ok(!JSON.stringify(config).includes('private-server-key.fixture'));
});

test('unsafe remote endpoints and expired previews fail before publishing', async t => {
  const options = await fixture(t);
  for (const routeEndpoint of ['http://public.example/route', 'https://user:password@preview.example/route', 'https://preview.example/route?key=private', 'javascript:alert(1)']) await assert.rejects(buildPages({ ...options, routeEndpoint }), /HTTPS/);
  await assert.rejects(buildPages({ ...options, routeEndpoint: 'https://preview.example/route', previewExpiresAt: '2000-01-01T00:00:00Z' }), /future/);
  await assert.rejects(buildPages({ ...options, previewExpiresAt: new Date(Date.now() + 3600000).toISOString() }), /requires/);
});

test('source, ancestor, asset directory, and unmarked output cannot be replaced', async t => {
  const options = await fixture(t);
  for (const outputDirectory of [options.sourceDirectory, options.directory, join(options.sourceDirectory, 'assets')]) await assert.rejects(buildPages({ ...options, outputDirectory }), /source files/);
  await mkdir(options.outputDirectory);
  await writeFile(join(options.outputDirectory, 'keep.txt'), 'keep me');
  await assert.rejects(buildPages(options), /unmarked/);
  assert.equal(await readFile(join(options.sourceDirectory, 'app.js'), 'utf8'), 'public app.js');
  assert.equal(await readFile(join(options.outputDirectory, 'keep.txt'), 'utf8'), 'keep me');
});

test('repeated builds replace only their marked output and refresh public configuration', async t => {
  const options = await fixture(t);
  await buildPages(options);
  await writeFile(join(options.outputDirectory, 'stale.txt'), 'old build');
  await buildPages({ ...options, browserKey: 'updated-browser.fixture' });
  assert.ok(!(await readdir(options.outputDirectory)).includes('stale.txt'));
  assert.equal(JSON.parse(await readFile(join(options.outputDirectory, 'maps-config.json'), 'utf8')).browserKey, 'updated-browser.fixture');
});

test('asset symlinks cannot publish private files and failed staging preserves the previous build', async t => {
  const options = await fixture(t);
  await buildPages(options);
  await symlink(join(options.sourceDirectory, '.env.local'), join(options.sourceDirectory, 'assets', 'leak.txt'));
  await assert.rejects(buildPages(options), /asset links/);
  assert.equal(JSON.parse(await readFile(join(options.outputDirectory, 'maps-config.json'), 'utf8')).browserKey, options.browserKey);
  assert.ok(!(await readdir(options.directory)).some(name => name.startsWith('public.tmp-')));
});
