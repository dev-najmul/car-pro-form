import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const pickupDate = '2030-11-18';
const deviceAddress = '312 Sype Dr, Carol Stream, IL 60188, USA';
const controls = new WeakMap();
const tariff = { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 };
const cities = {
  Chicago: { latitude: 41.8818, longitude: -87.6232, timezone: 'America/Chicago', label: 'Central Time', token: 'b'.repeat(64) },
  Indianapolis: { latitude: 39.7684, longitude: -86.1581, timezone: 'America/Indiana/Indianapolis', label: 'Eastern Time', token: 'c'.repeat(64) },
};
const runtime = {
  token: 'a'.repeat(64), restUrl, nonce: 'client-changes-fixture', assetUrl: origin + '/',
  settings: { currency: 'USD', currencySymbol: '$', companyName: 'TUXANO', timezone: 'UTC', minHours: 3, maxHours: 24, maxStops: 5, defaultGratuity: 20, availabilityChecks: true, pickupTimezones: true },
  maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: restUrl + 'route' },
  vehicles: [{ id: '104', name: 'CITY SEDAN', display: 'City Sedan', capacity: 4, luggageCapacity: 4, image: origin + '/assets/premium-suv.png', models: ['City sedan'], features: ['City transfers'], category: 'CITY COLLECTION', categoryDescription: 'City vehicles.', tariff }],
};

test.beforeEach(async ({ page, context }) => {
  const control = { errors: [], routes: [], timezones: [], availability: [], bookingPosts: 0, expiredAvailabilityOnce: false, refreshQuote: false, omitRouteTimezone: false, previewLabel: '', previewTimezone: '', holdRoutes: false, routeResolvers: [], holdTimezones: false, timezoneResolvers: [], holdAvailability: false, availabilityResolvers: [] };
  controls.set(page, control);
  page.on('pageerror', failure => control.errors.push(failure.message));
  await context.addInitScript(({ runtime, deviceAddress }) => {
    globalThis.TuxanoBooking = runtime;
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], countries: { 'test-Chicago': 'US', 'test-Indianapolis': 'US', 'test-Dropoff': 'US' }, locations: { 'test-Chicago': { lat: 41.8818, lng: -87.6232 }, 'test-Indianapolis': { lat: 39.7684, lng: -86.1581 }, 'test-Dropoff': { lat: 41.9742, lng: -87.9073 } } };
    window.__geocodeMock = { results: [{ formatted_address: deviceAddress, geometry: { location: { lat: 41.8819, lng: -87.6233 } }, types: ['street_address'], address_components: [{ short_name: 'US', long_name: 'United States', types: ['country'] }] }] };
    window.__deviceMock = { pending: [], options: [] };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure, options) { window.__deviceMock.options.push(options); window.__deviceMock.pending.push({ success, failure }); } } });
  }, { runtime, deviceAddress });
  await context.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await context.route(restUrl + 'timezone', async route => {
    const point = route.request().postDataJSON();
    control.timezones.push(point);
    const city = point.longitude > -87 ? cities.Indianapolis : cities.Chicago;
    const response = { timezone: control.previewTimezone || city.timezone, label: control.previewLabel || city.label };
    if (control.holdTimezones) await new Promise(resolve => control.timezoneResolvers.push(resolve));
    await route.fulfill({ json: response });
  });
  await context.route(restUrl + 'route', async route => {
    const body = route.request().postDataJSON(); control.routes.push(body);
    const city = body.origin.placeId === 'test-Indianapolis' ? cities.Indianapolis : cities.Chicago;
    const response = { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', quoteToken: control.refreshQuote && control.routes.length > 1 ? 'd'.repeat(64) : city.token, ...(control.omitRouteTimezone ? {} : { pickupTimezone: city.timezone, pickupTimezoneLabel: city.label }) };
    if (control.holdRoutes) await new Promise(resolve => control.routeResolvers.push(resolve));
    await route.fulfill({ json: response });
  });
  await context.route(restUrl + 'availability', async route => {
    control.availability.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
    if (control.expiredAvailabilityOnce) { control.expiredAvailabilityOnce = false; return route.fulfill({ status: 409, json: { code: 'tuxano_quote_expired', message: 'Refresh your route before checking vehicle availability.', data: { status: 409 } } }); }
    if (control.holdAvailability) await new Promise(resolve => control.availabilityResolvers.push(resolve));
    await route.fulfill({ json: { state: 'available', message: 'This vehicle is available at the selected pickup time.' } });
  });
  await context.route(restUrl + 'bookings', route => { control.bookingPosts++; return route.abort(); });
});
test.afterEach(async ({ page }) => {
  expect(controls.get(page).errors).toEqual([]);
  expect(controls.get(page).bookingPosts).toBe(0);
});
async function visit(page) { await page.goto('/'); await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeVisible(); }
async function choose(page, label, query) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(query); await page.getByRole('option', { name: query, exact: true }).click();
  await expect(input).toHaveValue(query);
}
async function trip(page, city = 'Chicago', time = '17:50') {
  await choose(page, 'Pickup location', city); await choose(page, 'Drop-off location', 'Dropoff');
  await page.getByLabel('Date', { exact: true }).fill(pickupDate); await page.getByLabel('Pickup time', { exact: true }).fill(time);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
}
async function vehicles(page, city = 'Chicago') {
  await visit(page); await trip(page, city);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
}
async function gpsAddress(page) {
  await visit(page); await choose(page, 'Drop-off location', 'Dropoff');
  await page.getByRole('button', { name: 'Use current location', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__deviceMock.pending.length)).toBe(1);
  await page.evaluate(() => window.__deviceMock.pending.shift().success({ coords: { latitude: 41.8818, longitude: -87.6232, accuracy: 80 }, timestamp: Date.now() }));
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue(deviceAddress);
  await expect(page.locator('[data-selected-place="pickup"]')).toContainText(deviceAddress);
  await expect(page.getByRole('button', { name: 'Use this pickup location', exact: true })).toHaveCount(0);
  await expect.poll(() => controls.get(page).routes.at(-1)?.origin).toEqual({ latitude: 41.8818, longitude: -87.6232 });
  expect(await page.evaluate(() => window.__deviceMock.options[0])).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
}

test('desktop GPS fills the real address automatically and routes to exact original device coordinates', async ({ page }) => {
  await gpsAddress(page);
});

test('hourly quantity supports editing and bounds while date/time controls retain client formats and native pickers', async ({ page }) => {
  await visit(page); await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  const hours = page.getByLabel('Hours', { exact: true });
  await expect(hours).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Decrease hours', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Increase hours', exact: true }).click(); await expect(hours).toHaveValue('4');
  await hours.fill('25'); await expect(page.locator('#hours-feedback')).toContainText('3 and 24');
  await hours.press('Tab'); await expect(hours).toHaveValue('24'); await expect(page.locator('#hours-feedback')).toContainText('Set to 24');
  await expect(page.getByRole('button', { name: 'Increase hours', exact: true })).toBeDisabled();
  await hours.fill('2'); await hours.press('Tab'); await expect(hours).toHaveValue('3');
  await hours.fill(''); await hours.press('Tab'); await expect(hours).toHaveValue('3');
  await expect(page.locator('.hours-service-note')).toContainText('Trip Notes');
  await trip(page, 'Chicago', '12:21');
  await expect(page.locator('[data-display="trip.date"]')).toHaveText('Nov 18, 2030');
  await expect(page.locator('[data-display="trip.time"]')).toHaveText('12:21 PM');
  for (const label of ['Date', 'Pickup time']) {
    const input = page.getByLabel(label, { exact: true }); await input.click();
    await expect.poll(() => input.evaluate(element => element.matches(':open'))).toBe(true);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('.trip-strip')).toContainText('12:21 PM (Central Time)');
});

for (const [city, expected] of Object.entries(cities)) {
  test(`${city} uses its pickup-local full time-zone name and vehicle selection continues after a quote-bound availability check`, async ({ page }) => {
    await vehicles(page, city);
    await expect(page.locator('.trip-strip')).toContainText(`5:50 PM (${expected.label})`);
    await expect(page.getByRole('button', { name: /CONTINUE TO PASSENGERS AND EXTRAS/i })).toHaveCount(0);
    const select = page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true });
    await expect(select).toHaveText('SELECT & CONTINUE'); await select.click();
    await expect(page).toHaveURL(/#passengers$/);
    await expect(page.locator('.trip-summary')).toContainText(`5:50 PM (${expected.label})`);
    const request = controls.get(page).availability.at(-1);
    expect(request.body).toEqual({ vehicleId: '104', date: pickupDate, time: '17:50', quoteToken: expected.token });
    expect(request.headers['x-tuxano-session']).toBe(runtime.token);
    expect(request.body).not.toHaveProperty('timezone');
  });
}

test('the server route time zone overrides a provisional pickup preview in every subsequent summary', async ({ page }) => {
  const control = controls.get(page); control.previewTimezone = cities.Indianapolis.timezone; control.previewLabel = cities.Indianapolis.label;
  await visit(page); await choose(page, 'Pickup location', 'Chicago');
  await expect(page.locator('[data-pickup-timezone]')).toContainText('Eastern Time');
  await choose(page, 'Drop-off location', 'Dropoff');
  await page.getByLabel('Date', { exact: true }).fill(pickupDate); await page.getByLabel('Pickup time', { exact: true }).fill('17:50');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await expect(page.locator('[data-pickup-timezone]')).toContainText('Central Time');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  await expect(page.locator('.trip-summary')).toContainText('5:50 PM (Central Time)');
  await expect(page.locator('.trip-summary')).not.toContainText('Eastern Time');
});

test('a route missing its authoritative time zone cannot display prices or skip the trip step', async ({ page }) => {
  const control = controls.get(page); control.omitRouteTimezone = true;
  await visit(page); await choose(page, 'Pickup location', 'Chicago'); await choose(page, 'Drop-off location', 'Dropoff');
  await page.getByLabel('Date', { exact: true }).fill(pickupDate); await page.getByLabel('Pickup time', { exact: true }).fill('17:50');
  await expect(page.locator('.route-error')).toContainText('time zone could not be verified');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#trip$/);
  await expect(page.locator('.vehicle-card')).toHaveCount(0);
  expect(control.availability).toHaveLength(0);
});

test('late route and preview replies for an edited pickup cannot restore the old zone or quote', async ({ page }) => {
  const control = controls.get(page); control.holdRoutes = true; control.holdTimezones = true;
  await visit(page); await choose(page, 'Pickup location', 'Chicago'); await choose(page, 'Drop-off location', 'Dropoff');
  await expect.poll(() => control.routes.length).toBe(1); await expect.poll(() => control.timezones.length).toBe(1);
  await choose(page, 'Pickup location', 'Indianapolis');
  await expect.poll(() => control.routes.length).toBe(2); await expect.poll(() => control.timezones.length).toBe(2);
  control.timezoneResolvers.splice(0).reverse().forEach(resolve => resolve()); control.routeResolvers.splice(0).reverse().forEach(resolve => resolve());
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await expect(page.locator('[data-pickup-timezone]')).toContainText('Eastern Time');
  await page.getByLabel('Date', { exact: true }).fill(pickupDate); await page.getByLabel('Pickup time', { exact: true }).fill('17:50');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  expect(control.availability.at(-1).body.quoteToken).toBe(cities.Indianapolis.token);
  await expect(page.locator('.trip-summary')).toContainText('5:50 PM (Eastern Time)');
});

test('a pickup-local date remains selectable while its zone and route are pending near UTC midnight', async ({ page }) => {
  const control = controls.get(page); control.holdTimezones = true; control.holdRoutes = true;
  await page.clock.install({ time: new Date('2030-11-19T02:00:00Z') }); // Still Nov 18 in both US pickup zones.
  await visit(page); await choose(page, 'Pickup location', 'Chicago'); await choose(page, 'Drop-off location', 'Dropoff');
  await expect.poll(() => control.routes.length).toBe(1);
  const date = page.getByLabel('Date', { exact: true });
  await date.fill('2030-11-18'); await page.getByLabel('Pickup time', { exact: true }).fill('21:00');
  expect(await date.evaluate(input => input.validity.rangeUnderflow)).toBe(false);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  control.timezoneResolvers.splice(0).forEach(resolve => resolve()); control.routeResolvers.splice(0).forEach(resolve => resolve());
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('.trip-strip')).toContainText('9:00 PM (Central Time)');
});

test('editing a pickup during vehicle availability cancels automatic advance and binds the replacement selection to its new quote', async ({ page }) => {
  const control = controls.get(page); control.holdAvailability = true;
  await vehicles(page); await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect.poll(() => control.availability.length).toBe(1);
  await page.getByRole('button', { name: /Edit Trip/i }).click();
  await choose(page, 'Pickup location', 'Indianapolis');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  control.availabilityResolvers.splice(0).forEach(resolve => resolve());
  await expect(page).toHaveURL(/#trip$/);
  control.holdAvailability = false;
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  expect(control.availability.at(-1).body.quoteToken).toBe(cities.Indianapolis.token);
});

test.describe('phone main-form changes', () => {
  test.use({ viewport: { width: 393, height: 900 }, isMobile: true, hasTouch: true });
  test('accurate GPS fills the address and editable hourly controls fit the mobile form', async ({ page }) => {
    await gpsAddress(page); await page.getByRole('button', { name: 'HOURLY', exact: true }).tap();
    await page.getByRole('button', { name: 'Increase hours', exact: true }).tap();
    await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByLabel('Date', { exact: true }).fill(pickupDate); await page.getByLabel('Pickup time', { exact: true }).fill('17:50');
    await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).tap();
    await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).tap();
    await expect(page).toHaveURL(/#passengers$/);
    await expect(page.locator('.trip-summary')).toContainText('5:50 PM (Central Time)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});

for (const [date, message] of [['2027-03-14', 'does not exist'], ['2027-11-07', 'occurs twice']]) {
  test(`pickup-local DST wall time ${date} is corrected at the trip step`, async ({ page }) => {
    const control = controls.get(page);
    await page.clock.install({ time: new Date('2026-11-18T17:00:00Z') });
    await visit(page); await choose(page, 'Pickup location', 'Chicago'); await choose(page, 'Drop-off location', 'Dropoff');
    await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
    await page.getByLabel('Date', { exact: true }).fill(date);
    await page.getByLabel('Pickup time', { exact: true }).fill(date.endsWith('03-14') ? '02:30' : '01:30');
    await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
    await expect(page.locator('.form-error')).toContainText(message);
    await expect(page).toHaveURL(/#trip$/);
    expect(control.availability).toHaveLength(0);
  });
}

test('an expired availability quote refreshes once and advances only with the new server quote', async ({ page }) => {
  const control = controls.get(page); control.expiredAvailabilityOnce = true; control.refreshQuote = true;
  await vehicles(page);
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  expect(control.routes).toHaveLength(2);
  expect(control.availability).toHaveLength(2);
  expect(control.availability[0].body.quoteToken).toBe(cities.Chicago.token);
  expect(control.availability[1].body.quoteToken).toBe('d'.repeat(64));
  await expect(page.locator('[data-availability-dialog]')).toHaveCount(0);
});
