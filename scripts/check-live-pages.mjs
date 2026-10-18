import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { formatDuration, quoteTransportation, round } from '../pricing.js';

const publicUrl = 'https://dev-najmul.github.io/car-pro-form/';
const artifacts = resolve('test-results/live-pages');
const redact = value => String(value).replace(/AIza[\w-]{35}/g, '[redacted]');
const report = { site: publicUrl, startedAt: new Date().toISOString(), passed: false, checks: [], browserErrors: [], routeErrors: [] };
const log = (stage, details = {}) => {
  const entry = { stage, ...details };
  report.checks.push(entry);
  console.log(redact(JSON.stringify(entry)));
};

async function publicConfiguration() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const url = new URL('maps-config.json', publicUrl);
      url.searchParams.set('live-check', String(Date.now()));
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (response.ok) {
        const config = await response.json();
        if (config.providerMode === 'remote' && typeof config.browserKey === 'string' && config.browserKey && config.routesConfigured === true && Date.parse(config.previewExpiresAt) > Date.now() + 120_000) {
          const endpoint = new URL(config.routeEndpoint);
          assert.equal(endpoint.protocol, 'https:');
          assert.match(endpoint.hostname, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/);
          assert.equal(endpoint.pathname, '/api/maps/route');
          assert.equal(endpoint.search, '');
          assert.equal(endpoint.username + endpoint.password + endpoint.port + endpoint.hash, '');
          return config;
        }
      }
    } catch { /* A newly published Pages config can briefly be warming up. */ }
    await delay(1000);
  }
  throw new Error('Pages does not have an active remote Routes preview with at least two minutes remaining. Start the Pages deployment before this check.');
}

await mkdir(artifacts, { recursive: true });
let browser, context, page;
try {
  const config = await publicConfiguration();
  log('active public preview', { expiresAt: config.previewExpiresAt });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Dhaka', locale: 'en-US' });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => report.browserErrors.push(redact(error.message)));
  page.on('console', message => { if (message.type() === 'error') report.browserErrors.push(redact(message.text())); });
  page.on('response', response => {
    if (response.url() === config.routeEndpoint && response.request().method() === 'POST' && response.status() !== 200) {
      report.routeErrors.push({ status: response.status() });
    }
  });
  await page.goto(publicUrl, { waitUntil: 'domcontentloaded' });
  // A fresh context has no stored draft and no injected SDK or route mocks.
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Drop-off location', { exact: true })).toHaveValue('');

  async function choosePlace(label, query, namePattern) {
    await page.getByLabel(label, { exact: true }).fill(query);
    const suggestion = page.getByRole('option').filter({ hasText: namePattern }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(namePattern);
  }
  async function nextRoute(action) {
    const result = page.waitForResponse(response => response.url() === config.routeEndpoint && response.request().method() === 'POST');
    await action();
    const response = await result;
    assert.equal(response.status(), 200, 'The real remote Google Routes request must succeed.');
    const route = await response.json();
    assert.equal(route.provider, 'google');
    assert.ok(Number.isFinite(route.distanceMeters) && route.distanceMeters > 0);
    assert.ok(Number.isFinite(route.durationSeconds) && route.durationSeconds > 0);
    return { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds };
  }
  async function fitsPhone() {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'The page must fit the 390px viewport.');
  }
  const screenshot = name => page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });

  await choosePlace('Pickup location', 'Willis Tower Chicago', /Willis Tower/i);
  const directRoute = await nextRoute(() => choosePlace('Drop-off location', 'O Hare International Airport Chicago', /O.?Hare|ORD/i));
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue(formatDuration(directRoute.durationSeconds));
  log('real Google Places and direct Routes', directRoute);

  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  const route = await nextRoute(() => choosePlace('Stop 1', 'Millennium Park Chicago', /Millennium Park/i));
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('15');
  await expect(page.getByTestId('stop-wait-duration')).toHaveText('15 min');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue(formatDuration(route.durationSeconds + 15 * 60));
  await expect(page.getByTestId('total-duration')).toHaveText(formatDuration(route.durationSeconds + 15 * 60));
  await expect(page.getByTestId('driving-duration')).toHaveText(formatDuration(route.durationSeconds));
  await expect(page.getByTestId('route-distance')).toHaveText(`${(route.distanceMeters / 1000).toFixed(1)} km / ${(route.distanceMeters / 1609.344).toFixed(1)} mi`);
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel('Date', { exact: true }).fill(futureDate);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await screenshot('trip-desktop');
  log('stop and automatic journey duration', { ...route, waitingMinutes: 15, totalDurationSeconds: route.durationSeconds + 900 });

  await page.setViewportSize({ width: 390, height: 1000 });
  await fitsPhone();
  await screenshot('trip-phone');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.waitForURL('**/#vehicles');
  await expect(page.locator('.vehicle-card')).toHaveCount(6);
  for (const id of ['premium', 'luxury', 'executive', 'ghost', 'cullinan', 'phantom']) {
    const amount = quoteTransportation(id, route, 15, 'transfer', 3).transportation;
    await expect(page.locator(`[data-vehicle-card="${id}"] .vehicle-price strong`)).toHaveText(`$${amount.toLocaleString('en-US')}USD`);
  }
  const quote = quoteTransportation('luxury', route, 15, 'transfer', 3);
  const luxuryPrice = page.locator('[data-vehicle-card="luxury"] .vehicle-price strong');
  await expect(luxuryPrice).toHaveText(`$${quote.transportation.toLocaleString('en-US')}USD`);
  assert.equal(quote.waitingCharge, 22.5, 'Luxury SUV waiting must add $1.50 per minute.');
  await fitsPhone();
  await screenshot('vehicles-phone');
  await page.getByRole('button', { name: 'Select Luxury SUV', exact: true }).click();
  await page.getByRole('button', { name: /continue to passengers/i }).click();
  const expectedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(round(quote.transportation + Math.round(quote.transportation * 20) / 100));
  await expect(page.getByTestId('estimated-total').last()).toHaveText(expectedTotal);
  await page.getByRole('button', { name: /continue to contact/i }).click();
  for (const [label, value] of [
    ['Billing first name', 'Live'], ['Billing last name', 'Demo'], ['Billing email', 'live.demo@example.com'],
    ['Billing phone', '+1 312 555 0134'], ['Street address', '123 Example Street'], ['City', 'Chicago'], ['ZIP / Postal Code', '60601']
  ]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United States' });
  await page.getByLabel('State / Province', { exact: true }).selectOption({ label: 'Illinois' });
  await page.getByRole('checkbox', { name: 'Same as billing contact', exact: true }).check();
  await page.getByRole('button', { name: /continue to review/i }).click();
  await page.waitForURL('**/#review');
  await expect(page.getByTestId('estimated-total').last()).toHaveText(expectedTotal);
  await fitsPhone();
  await screenshot('review-phone');
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await page.waitForURL('**/#thank-you');
  await expect(page.getByTestId('estimated-total').last()).toHaveText(expectedTotal);
  await fitsPhone();
  await screenshot('thank-you-phone');
  assert.deepEqual(report.routeErrors, [], 'No real Routes request may fail.');
  assert.deepEqual(report.browserErrors, [], 'The live flow must have no browser errors.');
  log('full live static confirmation', { transportation: quote.transportation, waitingCharge: quote.waitingCharge, total: expectedTotal, mobileWidth: 390 });
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
  // Only allowlisted test metrics and sanitized messages are stored; no config, HAR, trace or draft data.
  await writeFile(resolve(artifacts, 'report.json'), redact(JSON.stringify(report, null, 2)) + '\n');
  await context?.close();
  await browser?.close();
}
