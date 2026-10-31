import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const controls = new WeakMap();
const date = '2030-11-18';
const geoAddress = '312 Sype Dr, Carol Stream, IL 60188, USA';

test.beforeEach(async ({ page, context }) => {
  const control = { errors: [], minHours: 3, maxHours: 24, timezones: false, timezoneStatus: 200, timezone: 'America/Chicago', timezoneLabel: 'Central Time', timezoneRequests: [], holdTimezone: false, timezoneResolvers: [], bookingPosts: 0, redirects: [] };
  controls.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  await context.addInitScript(address => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], countries: { 'test-Dropoff': 'US', 'test-Pickup': 'US', 'test-Other': 'US' }, locations: { 'test-Pickup': { lat: 41.8818, lng: -87.6232 }, 'test-Other': { lat: 40.7128, lng: -74.006 } } };
    window.__geocodeMock = { results: [{ formatted_address: address, geometry: { location: { lat: 41.8819, lng: -87.6233 } }, types: ['street_address'], address_components: [{ short_name: 'US', long_name: 'United States', types: ['country'] }] }] };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success) { success({ coords: { latitude: 41.8818, longitude: -87.6232, accuracy: 80 }, timestamp: Date.now() }); } } });
  }, geoAddress);
  await context.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await context.route(restUrl + 'session', route => route.fulfill({ json: { token: 'a'.repeat(64), settings: { minHours: control.minHours, maxHours: control.maxHours, timezone: 'UTC', bookingPageUrl: origin + '/quick-destination/', pickupTimezones: control.timezones }, maps: { browserConfigured: true, browserKey: 'test-browser-key' } } }));
  await context.route(restUrl + 'timezone', async route => {
    control.timezoneRequests.push({ point: route.request().postDataJSON(), token: route.request().headers()['x-tuxano-session'] });
    const result = { status: control.timezoneStatus, timezone: control.timezone, label: control.timezoneLabel };
    if (control.holdTimezone) await new Promise(resolve => control.timezoneResolvers.push(resolve));
    await route.fulfill({ status: result.status, json: result.status === 200 ? { timezone: result.timezone, label: result.label } : { message: 'Unavailable' } });
  });
  await context.route(restUrl + 'bookings', route => { control.bookingPosts++; return route.abort(); });
  await context.route(origin + '/quick-destination/**', route => { control.redirects.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Quick handoff destination</title>' }); });
  await context.route(origin + '/quick-client-test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/quick-booking.css"><style>body{margin:0;padding:24px;box-sizing:border-box}</style></head><body><div id="client-test" data-tuxano-quick-booking data-rest-url="${restUrl}"></div><script type="module" src="/quick-booking.js"></script></body></html>` }));
});
test.afterEach(async ({ page }) => {
  expect(controls.get(page).errors).toEqual([]);
  expect(controls.get(page).bookingPosts).toBe(0);
});
async function visit(page) {
  await page.goto('/quick-client-test/');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeEnabled();
}
async function choose(page, key, query) {
  const input = page.getByLabel(key === 'pickup' ? 'Pickup Location' : 'Drop-off Location', { exact: true });
  await input.fill(query);
  await page.getByRole('option', { name: query, exact: true }).click();
  await expect(input).toHaveValue(query);
}
async function complete(page) {
  await choose(page, 'pickup', 'Pickup');
  await choose(page, 'dropoff', 'Dropoff');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill('12:21');
}

test('hourly quantity is editable, bounded and corrects out-of-range values without losing the helper', async ({ page }) => {
  await visit(page);
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  const hours = page.getByLabel('Hours', { exact: true });
  await expect(hours).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Decrease hours' })).toBeDisabled();
  await page.getByRole('button', { name: 'Increase hours' }).click();
  await expect(hours).toHaveValue('4');
  await hours.fill('25');
  await expect(page.locator('[data-quick-hours-error]')).toContainText('3 to 24 hours');
  await hours.press('Tab');
  await expect(hours).toHaveValue('24');
  await expect(page.locator('[data-quick-hours-error]')).toContainText('set to 24 hours');
  await expect(page.getByRole('button', { name: 'Increase hours' })).toBeDisabled();
  await hours.fill('2'); await hours.press('Tab'); await expect(hours).toHaveValue('3');
  await hours.fill('3.5'); await hours.press('Tab'); await expect(hours).toHaveValue('3');
  await hours.fill(''); await hours.press('Tab'); await expect(hours).toHaveValue('3');
  await expect(page.locator('.tuxano-quick-booking-hours-help')).toContainText('Trip Notes');
  await page.getByRole('button', { name: 'TRANSFER', exact: true }).click();
  await expect(hours).toBeDisabled();
  await expect(page.locator('[data-quick-hours]')).toBeHidden();
});

test('tighter administrator hourly bounds remain respected', async ({ page }) => {
  const control = controls.get(page); control.minHours = 4; control.maxHours = 8;
  await visit(page); await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  const hours = page.getByLabel('Hours', { exact: true });
  await expect(hours).toHaveValue('4');
  await hours.fill('24'); await hours.press('Tab');
  await expect(hours).toHaveValue('8');
  await expect(page.locator('.tuxano-quick-booking-hours-limit')).toHaveText('4-hour minimum (max 8 hours)');
});

test('precise GPS automatically fills a real address and keeps exact device coordinates in the handoff', async ({ page }) => {
  await visit(page); await page.getByRole('button', { name: 'Use current location' }).click();
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue(geoAddress);
  await expect(page.locator('[data-quick-device]')).toBeHidden();
  await choose(page, 'dropoff', 'Dropoff');
  await page.getByLabel('Date', { exact: true }).fill(date); await page.getByLabel('Pickup time', { exact: true }).fill('12:21');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect.poll(() => controls.get(page).redirects.length).toBe(1);
  await page.waitForURL(url => url.pathname === '/quick-destination/');
  const pickup = await page.evaluate(() => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(key => key.startsWith('tuxano-quick-trip-v1:')))).trip.pickup);
  expect(pickup).toMatchObject({ source: 'device', query: geoAddress, latitude: 41.8818, longitude: -87.6232, accuracyMeters: 80 });
  expect(pickup).not.toHaveProperty('placeId');
});

test('late GPS address lookup cannot replace a pickup the customer has changed', async ({ page }) => {
  await visit(page); await page.evaluate(() => { window.__geocodeMock.hold = true; });
  await page.getByRole('button', { name: 'Use current location' }).click();
  await expect.poll(() => page.evaluate(() => window.__mapsMock.pending.filter(entry => entry.kind === 'geocode').length)).toBe(1);
  await choose(page, 'pickup', 'Other');
  await page.evaluate(() => window.__mapsMock.pending.find(entry => entry.kind === 'geocode').resolve());
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue('Other');
  await expect(page.locator('[data-quick-device]')).toBeHidden();
});

test('approximate GPS is rejected and a missing address offers an explicit checked-coordinate fallback', async ({ page }) => {
  await visit(page);
  await page.evaluate(() => { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success) { success({ coords: { latitude: 41.8818, longitude: -87.6232, accuracy: 100000 }, timestamp: Date.now() }); } } }); });
  await page.getByRole('button', { name: 'Use current location' }).click();
  await expect(page.locator('.tuxano-quick-booking-error')).toContainText('approximate');
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue('');
  await page.evaluate(() => {
    window.__geocodeMock.results = [];
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success) { success({ coords: { latitude: 41.8818, longitude: -87.6232, accuracy: 80 }, timestamp: Date.now() }); } } });
  });
  await page.getByRole('button', { name: 'Use current location' }).click();
  await expect(page.locator('[data-quick-device]')).toContainText('address could not be loaded');
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Use this pickup location' }).click();
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue('Device pickup (41.88180, -87.62320)');
});

test('pickup time zone is resolved privately from coordinates and shown with its full name', async ({ page }) => {
  controls.get(page).timezones = true;
  await visit(page); await complete(page);
  await expect(page.locator('[data-quick-timezone]')).toHaveText('Pickup time: Central Time.');
  expect(controls.get(page).timezoneRequests).toEqual([{ point: { latitude: 41.8818, longitude: -87.6232 }, token: 'a'.repeat(64) }]);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect.poll(() => controls.get(page).redirects.length).toBe(1);
  await page.waitForURL(url => url.pathname === '/quick-destination/');
  const trip = await page.evaluate(() => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(key => key.startsWith('tuxano-quick-trip-v1:')))).trip);
  expect(trip).not.toHaveProperty('timezone');
  expect(trip).toMatchObject({ date, time: '12:21' });
});

test('quick future-time validation uses the pickup time zone rather than the server or browser clock', async ({ page }) => {
  controls.get(page).timezones = true;
  await page.clock.install({ time: new Date('2030-11-18T17:00:00Z') }); // 11 AM Chicago, noon Eastern.
  await visit(page); await complete(page);
  await expect(page.locator('[data-quick-timezone]')).toHaveText('Pickup time: Central Time.');
  await page.getByLabel('Pickup time', { exact: true }).fill('11:30');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect.poll(() => controls.get(page).redirects.length).toBe(1);
});

test('failed pickup time zone lookup blocks redirect and can be retried without losing the trip', async ({ page }) => {
  const control = controls.get(page); control.timezones = true; control.timezoneStatus = 503;
  await visit(page); await complete(page);
  await expect(page.locator('[data-quick-timezone]')).toContainText('unavailable');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page.locator('.tuxano-quick-booking-error')).toContainText('time zone could not be checked');
  expect(control.redirects).toHaveLength(0);
  control.timezoneStatus = 200;
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect.poll(() => control.redirects.length).toBe(1);
});

test('stale timezone results cannot override a newly selected pickup', async ({ page }) => {
  const control = controls.get(page); control.timezones = true; control.holdTimezone = true;
  await visit(page); await choose(page, 'pickup', 'Pickup');
  await expect.poll(() => control.timezoneRequests.length).toBe(1);
  control.timezone = 'America/New_York'; control.timezoneLabel = 'Eastern Time';
  await choose(page, 'pickup', 'Other');
  await expect.poll(() => control.timezoneRequests.length).toBe(2);
  control.timezoneResolvers.splice(0).forEach(resolve => resolve());
  await expect(page.locator('[data-quick-timezone]')).toHaveText('Pickup time: Eastern Time.');
});

test('editing the pickup while a submitted time-zone check is pending cancels the old handoff cleanly', async ({ page }) => {
  const control = controls.get(page); control.timezones = true; control.holdTimezone = true;
  await visit(page); await complete(page);
  await expect.poll(() => control.timezoneRequests.length).toBe(1);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  control.timezone = 'America/New_York'; control.timezoneLabel = 'Eastern Time';
  await choose(page, 'pickup', 'Other');
  await expect.poll(() => control.timezoneRequests.length).toBe(2);
  control.timezoneResolvers.splice(0).forEach(resolve => resolve());
  await expect(page.locator('[data-quick-timezone]')).toHaveText('Pickup time: Eastern Time.');
  await expect(page.locator('.tuxano-quick-booking-error')).toBeHidden();
  expect(control.redirects).toHaveLength(0);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect.poll(() => control.redirects.length).toBe(1);
});

test.describe('phone quick booking updated controls', () => {
  test.use({ viewport: { width: 393, height: 900 }, isMobile: true, hasTouch: true });
  test('hour controls, formatted date/time and GPS address fit the white mobile card', async ({ page }) => {
    await visit(page); await page.getByRole('button', { name: 'HOURLY', exact: true }).tap();
    await page.getByRole('button', { name: 'Increase hours' }).tap();
    await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('4');
    await page.getByLabel('Date', { exact: true }).fill(date); await page.getByLabel('Pickup time', { exact: true }).fill('12:21');
    await expect(page.locator('[data-quick-display="date"]')).toHaveText('Nov 18, 2030');
    await expect(page.locator('[data-quick-display="time"]')).toHaveText('12:21 PM');
    await page.getByRole('button', { name: 'Use current location' }).tap();
    await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue(geoAddress);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
