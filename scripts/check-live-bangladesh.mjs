import assert from 'node:assert/strict';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { formatDuration, PRICING, quoteTransportation } from '../pricing.js';

const site = 'https://dev-najmul.github.io/car-pro-form/';
const artifacts = resolve('test-results/live-bangladesh');
const redact = value => String(value).replace(/AIza[\w-]{35}/g, '[redacted]');
// Public Google identities, independently checked against Places details. These are not credentials.
const places = {
  terminal: { id: 'ChIJWd5tgSc0VTcR6Gc887Of8GA', query: 'Nathullahbad Central Bus Terminal', match: /Nathullahbad Central Bus Terminal.*Barishal/i, city: /Barishal|বরিশাল/i },
  sayedabad: { id: 'ChIJIca_Mku4VTcRfKwVI0fvMAY', query: 'Sayedabad Dhaka Bangladesh', match: /^Sayedabad, Dhaka, Bangladesh$/, city: /Dhaka/i },
  notunBazar: { id: 'ChIJXV1dIADHVTcRvlhkXGMJ6so', query: 'Notun Bazar Bus Stop Dhaka Bangladesh', match: /Notun Bazar Bus Stop.*Dhaka/i, city: /Dhaka/i },
  dhakaAirport: { id: 'ChIJvY9HupHGVTcR7BXrcRP3s9E', query: 'Hazrat Shahjalal International Airport Dhaka Bangladesh', match: /Hazrat Shahjalal International Airport.*Dhaka/i, city: /Dhaka/i },
  chattogramAirport: { id: 'ChIJIaMGeunfrDARg1bXlUbnrB8', query: 'Shah Amanat International Airport Chattogram Bangladesh', match: /Shah Amanat International Airport.*Chattogram/i, city: /Chattogram|Chittagong/i },
};
const cases = [
  { name: 'Barishal terminal → Sayedabad', origin: 'terminal', destination: 'sayedabad', bounds: [150_000, 190_000] },
  { name: 'Sayedabad → Barishal terminal', origin: 'sayedabad', destination: 'terminal', bounds: [150_000, 190_000] },
  { name: 'Notun Bazar Dhaka → Sayedabad', origin: 'notunBazar', destination: 'sayedabad', bounds: [7_000, 20_000] },
  { name: 'Dhaka airport → Barishal via Sayedabad', origin: 'dhakaAirport', destination: 'terminal', stops: ['sayedabad'], waitingMinutes: 15, bounds: [170_000, 220_000] },
  { name: 'Sayedabad → Chattogram airport', origin: 'sayedabad', destination: 'chattogramAirport', bounds: [220_000, 290_000] },
];
const report = { site, startedAt: new Date().toISOString(), passed: false, enterWithoutSelectionPassed: false, cases: [], browserErrors: [], routeErrors: [] };
let browser, context, page;

async function activeConfiguration() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const url = new URL('maps-config.json', site);
      url.searchParams.set('bangladesh-check', String(Date.now()));
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (response.ok) {
        const config = await response.json();
        if (config.providerMode === 'remote' && config.browserConfigured && config.browserKey && config.routesConfigured && Date.parse(config.previewExpiresAt) > Date.now() + 120_000) {
          const endpoint = new URL(config.routeEndpoint);
          assert.equal(endpoint.protocol, 'https:');
          assert.match(endpoint.hostname, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/);
          assert.equal(endpoint.pathname, '/api/maps/route');
          assert.equal(endpoint.search + endpoint.username + endpoint.password + endpoint.port + endpoint.hash, '');
          return config;
        }
      }
    } catch { /* Pages can briefly serve the preceding deployment while warming up. */ }
    await delay(1000);
  }
  throw new Error('An active public Pages Routes preview with at least two minutes remaining is required.');
}

async function selectPlace(label, key, checkEnter = false) {
  const expected = places[key], input = page.getByLabel(label, { exact: true });
  await input.fill(expected.query);
  const option = page.getByRole('option', { name: expected.match }).first();
  await expect(option).toBeVisible();
  const fieldId = await input.getAttribute('data-place-field');
  const box = page.locator(`[data-selected-place="${fieldId}"]`);
  if (checkEnter) {
    await input.press('Enter');
    await expect(input).toHaveValue(expected.query);
    await expect(box).toBeHidden();
    await expect(page.locator('.places-selection-hint')).toBeVisible();
    await expect(page.getByTestId('route-distance')).toHaveCount(0);
    report.enterWithoutSelectionPassed = true;
  }
  const prediction = await option.getAttribute('aria-label');
  const predictionPosition = await page.getByRole('option').evaluateAll((options, name) => options.findIndex(option => option.getAttribute('aria-label') === name), prediction);
  await option.click();
  await expect(box).toBeVisible();
  const address = box.locator('.selected-location-address');
  await expect(address).toHaveText(expected.city);
  await expect(address).toContainText('Bangladesh');
  const canonicalLabel = await address.innerText();
  await expect(input).toHaveValue(canonicalLabel);
  const url = new URL(await box.getByRole('link').getAttribute('href'));
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/search/');
  assert.equal(url.searchParams.get('query_place_id'), expected.id, `${label} must retain the chosen exact Google identity.`);
  assert.equal(url.searchParams.get('query'), canonicalLabel);
  return { key, fieldId, canonicalLabel, prediction, predictionPosition: predictionPosition + 1 };
}

async function phoneFits(selected) {
  await page.setViewportSize({ width: 390, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'The route must fit a 390px phone.');
  for (const point of selected) {
    const address = page.locator(`[data-selected-place="${point.fieldId}"] .selected-location-address`);
    await expect(address).toBeVisible();
    await expect(address).toHaveText(point.canonicalLabel);
    assert.equal(await address.evaluate(element => element.scrollWidth > element.clientWidth + 1), false, 'The full selected address must wrap without clipping.');
  }
}

await mkdir(artifacts, { recursive: true });
try {
  const config = await activeConfiguration();
  report.previewExpiresAt = config.previewExpiresAt;
  browser = await chromium.launch({ headless: true });
  for (const [index, testCase] of cases.entries()) {
    context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Dhaka', locale: 'en-US' });
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on('pageerror', error => report.browserErrors.push({ case: testCase.name, message: redact(error.message) }));
    page.on('console', message => { if (message.type() === 'error') report.browserErrors.push({ case: testCase.name, message: redact(message.text()) }); });
    const requests = [];
    page.on('request', request => { if (request.url() === config.routeEndpoint && request.method() === 'POST') requests.push(request.postDataJSON()); });
    page.on('response', response => {
      if (response.url() === config.routeEndpoint && response.request().method() === 'POST' && response.status() !== 200) report.routeErrors.push({ case: testCase.name, status: response.status() });
    });
    await page.goto(site, { waitUntil: 'domcontentloaded' });
    const origin = await selectPlace('Pickup location', testCase.origin, index === 0), stops = [];
    // Select ordered stops before the destination so each case makes only one Routes call.
    for (const [stopIndex, key] of (testCase.stops || []).entries()) {
      await page.getByRole('button', { name: 'Add stop', exact: true }).click();
      stops.push(await selectPlace(`Stop ${stopIndex + 1}`, key));
      await page.getByLabel(`Stop ${stopIndex + 1} wait time`, { exact: true }).selectOption(String(testCase.waitingMinutes || 0));
    }
    const responsePromise = page.waitForResponse(response => response.url() === config.routeEndpoint && response.request().method() === 'POST');
    const destination = await selectPlace('Drop-off location', testCase.destination);
    const response = await responsePromise;
    assert.equal(response.status(), 200, 'The public route backend must return real Google data.');
    const route = await response.json(), waitingMinutes = testCase.waitingMinutes || 0;
    assert.equal(route.provider, 'google');
    assert.ok(route.distanceMeters > testCase.bounds[0] && route.distanceMeters < testCase.bounds[1], 'Distance must match the selected cities; these broad bounds do not freeze Google estimates.');
    assert.ok(Number.isFinite(route.durationSeconds) && route.durationSeconds > 0 && route.durationSeconds < 86_400);
    assert.deepEqual(response.request().postDataJSON(), { origin: { placeId: places[testCase.origin].id }, destination: { placeId: places[testCase.destination].id }, stops: (testCase.stops || []).map(key => ({ placeId: places[key].id })) });
    const totalSeconds = route.durationSeconds + waitingMinutes * 60;
    await expect(page.getByTestId('route-distance')).toHaveText(`${(route.distanceMeters / 1000).toFixed(1)} km / ${(route.distanceMeters / 1609.344).toFixed(1)} mi`);
    await expect(page.getByTestId('driving-duration')).toHaveText(formatDuration(route.durationSeconds));
    await expect(page.getByTestId('stop-wait-duration')).toHaveText(`${waitingMinutes} min`);
    await expect(page.getByTestId('total-duration')).toHaveText(formatDuration(totalSeconds));
    await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue(formatDuration(totalSeconds));
    await expect(page.getByText('Baseline driving estimate. Live traffic and pickup date/time are not included.')).toBeVisible();
    const routeLink = new URL(await page.getByRole('link', { name: 'View route in Google Maps', exact: true }).getAttribute('href'));
    assert.equal(routeLink.origin + routeLink.pathname, 'https://www.google.com/maps/dir/');
    assert.equal(routeLink.searchParams.get('api'), '1');
    assert.equal(routeLink.searchParams.get('travelmode'), 'driving');
    assert.equal(routeLink.searchParams.get('origin_place_id'), places[testCase.origin].id);
    assert.equal(routeLink.searchParams.get('destination_place_id'), places[testCase.destination].id);
    assert.equal(routeLink.searchParams.get('origin'), origin.canonicalLabel);
    assert.equal(routeLink.searchParams.get('destination'), destination.canonicalLabel);
    assert.equal(routeLink.searchParams.get('waypoint_place_ids'), stops.length ? stops.map(point => places[point.key].id).join('|') : null);
    assert.equal(routeLink.searchParams.get('waypoints'), stops.length ? stops.map(point => point.canonicalLabel).join('|') : null);
    const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Date', { exact: true }).fill(futureDate);
    await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
    await page.screenshot({ path: resolve(artifacts, `${index + 1}-trip-desktop.png`), fullPage: true });
    await phoneFits([origin, ...stops, destination]);
    await page.screenshot({ path: resolve(artifacts, `${index + 1}-trip-phone.png`), fullPage: true });
    await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
    await page.waitForURL('**/#vehicles');
    await expect(page.locator('.vehicle-card')).toHaveCount(6);
    const quotes = {};
    for (const vehicleId of Object.keys(PRICING)) {
      const quote = quoteTransportation(vehicleId, route, waitingMinutes, 'transfer', 3);
      quotes[vehicleId] = { transportation: quote.transportation, waitingCharge: quote.waitingCharge };
      await expect(page.locator(`[data-vehicle-card="${vehicleId}"] .vehicle-price strong`)).toHaveText(`$${quote.transportation.toLocaleString('en-US')}USD`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(requests.length, 1, 'Changing pickup clock time or checking prices must not recalculate the baseline route.');
    const result = { name: testCase.name, selected: [origin, ...stops, destination], distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, waitingMinutes, totalDurationSeconds: totalSeconds, quotes, routeRequests: requests.length, mobileWidth: 390, passed: true };
    report.cases.push(result);
    console.log(redact(JSON.stringify(result)));
    await context.close(); context = null; page = null;
  }
  assert.equal(report.enterWithoutSelectionPassed, true);
  assert.deepEqual(report.routeErrors, []);
  assert.deepEqual(report.browserErrors, []);
  report.passed = true;
} catch (error) {
  report.error = redact(error.message);
  console.error(report.error);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
    report.visibleMessages = (await page.locator('.places-message,.route-status,.form-error:visible').allTextContents().catch(() => [])).map(redact);
  }
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  // Only public selected locations, test metrics and sanitized errors; never config, keys, traces or storage.
  await writeFile(resolve(artifacts, 'report.json'), redact(JSON.stringify(report, null, 2)) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = report.cases.map(item => `| ${item.name} | ${(item.distanceMeters / 1000).toFixed(1)} km | ${formatDuration(item.durationSeconds)} | ${item.waitingMinutes} min | ${formatDuration(item.totalDurationSeconds)} | 6/6 |`);
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Public Bangladesh route regression: ${report.passed ? 'passed' : 'failed'}\n\nReal Google Places and server Routes; baseline estimates exclude live traffic.\n\n| Selected route | Distance | Driving | Waiting | Total journey | Quotes |\n|---|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\nCompleted cases verify exact selected IDs, direction, ordered stops, Maps links, Enter selection and 390px layout.\n${report.error ? `\nFailure: ${report.error.replaceAll('\n', ' ').slice(0, 700)}\n` : ''}`);
  }
  await context?.close();
  await browser?.close();
}
