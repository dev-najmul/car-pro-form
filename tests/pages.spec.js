import { test, expect } from '@playwright/test';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';
import { installPlacesStub } from './helpers/google-places-stub.js';

let server, directory, base;
const requests = [];
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuxano-pages-browser-'));
  const output = join(directory, 'public');
  await buildPages({ outputDirectory: output, browserKey: 'public-pages.fixture' });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
  server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    requests.push(path);
    try {
      if (!path.startsWith('/car-pro-form/') || path.includes('/api/')) throw new Error('No backend exists');
      const name = decodeURIComponent(path.slice('/car-pro-form/'.length)) || 'index.html';
      const file = resolve(output, name);
      if (!file.startsWith(output + sep)) throw new Error('Invalid public path');
      const contents = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(contents);
    } catch { res.writeHead(404); res.end('Static files only'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/car-pro-form/`;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });

test('a real static subpath build searches locations and prices stops without any API server', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] }; });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.goto(base);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Privacy Policy', exact: true }).click();
  const policy = await popupPromise;
  await expect(policy).toHaveURL(base + 'privacy.html');
  await policy.getByRole('link', { name: /Return to the reservation form/ }).first().click();
  await expect(policy).toHaveURL(base + '#trip');
  await policy.close();
  for (const [label, query] of [['Pickup location', 'Pages Pickup'], ['Drop-off location', 'Pages Destination']]) {
    await page.getByLabel(label, { exact: true }).fill(query);
    await page.getByRole('option', { name: query, exact: true }).click();
  }
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  await page.getByLabel('Stop 1', { exact: true }).fill('Pages Stop');
  await page.getByRole('option', { name: 'Pages Stop', exact: true }).click();
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('15');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('45 min');
  await expect(page.getByTestId('route-distance')).toHaveText('32.2 km / 20.0 mi');
  await page.getByLabel('Date', { exact: true }).fill('2027-11-12');
  await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select Luxury SUV', exact: true }).click();
  await page.getByRole('button', { name: /continue to passengers/i }).click();
  await expect(page.getByTestId('estimated-total').last()).toHaveText('$297.00');
  expect(requests).toContain('/car-pro-form/maps-config.json');
  expect(requests.filter(path => path.includes('/api/'))).toEqual([]);
  expect(requests).not.toContain('/maps-config.json');
  expect(errors).toEqual([]);
});
