import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const revision = 'e'.repeat(64);
const controls = new WeakMap();
const tariff = {
  base: 0, perMile: 3, perDrivingMinute: 2.5, minimum: 150, perWaitingMinute: 2.5, hourly: 150,
  transfer: { version: 2, mode: 'mileage', pickupFreeMinutes: 30, returnFreeMinutes: 30, roundingMinutes: 15, minimumMinutes: 60, pickupFreeMiles: 20, returnFreeMiles: 20 },
  hourlyBooking: { hourly: 150, perMile: 2, perWaitingMinute: 1 },
};
function runtime(control) {
  return {
    token: 'a'.repeat(64), pricingRevision: revision, restUrl, assetUrl: origin + '/',
    maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: restUrl + 'route' },
    settings: { companyName: 'TUXANO', currency: 'USD', currencySymbol: '$', timezone: 'UTC', pickupTimezones: true, transferPricing: true, minHours: 3, maxHours: 24, maxStops: 5, defaultGratuity: 20, termsUrl: 'https://example.test/terms', privacyUrl: 'https://example.test/privacy' },
    vehicles: [{ id: '71', name: 'PREMIUM SUV', display: 'Premium SUV', capacity: 6, luggageCapacity: 6, image: origin + '/assets/premium-suv.png', models: ['Configured SUV'], features: ['Private transportation'], category: 'SUV COLLECTION', tariff }],
    ...(control.quickTrip ? { quickTrip: control.quickTrip } : {}),
  };
}

test.use({ timezoneId: 'Asia/Dhaka' });
test.beforeEach(async ({ page }) => {
  const control = { static: false, zone: 'America/Chicago', label: 'Central Time', routes: [], errors: [], quickTrip: null };
  controls.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(() => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], countries: { 'test-Pickup': 'US', 'test-Destination': 'US', 'test-StopOne': 'US', 'test-StopTwo': 'US' } };
  });
  await page.route(origin + '/form261/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="app"></div><div id="announcement" role="status"></div>${control.static ? '' : `<script>window.TuxanoBooking=${JSON.stringify(runtime(control))}</script>`}<script type="module" src="/app.js"></script></body></html>` }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  const config = { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'server' };
  await page.route('**/api/maps/config', route => route.fulfill({ json: config }));
  await page.route('**/maps-config.json', route => route.fulfill({ json: config }));
  await page.route(restUrl + 'session', route => route.fulfill({ json: runtime(control) }));
  await page.route(restUrl + 'timezone', route => route.fulfill({ json: { timezone: control.zone, label: control.label } }));
  const quote = route => {
    const body = route.request().postDataJSON(); control.routes.push(body);
    return route.fulfill({ json: {
      provider: 'google', distanceMeters: 32186.88, durationSeconds: 1800, quoteToken: control.routes.length.toString(16).padStart(64, '0'), pricingRevision: revision,
      ...(control.static ? {} : { pickupTimezone: control.zone, pickupTimezoneLabel: control.label }),
      ...(body.trip?.service === 'transfer' ? { trafficAware: true, trafficBasis: 'pickup', transferLegs: { pickup: { distanceMeters: 16093.44, durationSeconds: 1200 }, return: { distanceMeters: 16093.44, durationSeconds: 1200 } } } : {}),
    } });
  };
  await page.route(restUrl + 'route', quote);
  await page.route('**/api/maps/route', quote);
});
test.afterEach(async ({ page }) => { expect(controls.get(page).errors).toEqual([]); });
async function visit(page) { await page.goto('/form261/'); await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeVisible(); }
async function choose(page, field, query) { await page.getByLabel(field, { exact: true }).fill(query); await page.getByRole('option', { name: query, exact: true }).click(); }
async function schedule(page, time = '23:55', date = '2030-11-18') { await page.getByLabel('Date', { exact: true }).fill(date); await page.getByLabel('Pickup time', { exact: true }).fill(time); }
async function places(page) { await choose(page, 'Pickup location', 'Pickup'); await choose(page, 'Drop-off location', 'Destination'); }
async function addStop(page, name = 'StopOne') { await page.getByRole('button', { name: 'Add stop', exact: true }).click(); await choose(page, 'Stop 1', name); }

test('Transfer75 uses miles and travel plus waiting with correct pickup-local next-day arrival', async ({ page }) => {
  await visit(page); await places(page); await addStop(page); await schedule(page);
  const wait = page.getByLabel('Stop 1 wait time', { exact: true });
  expect(await wait.locator('option').evaluateAll(options => options.map(option => option.value))).toEqual(['15', '30', '45', '60', '75', '90', '120']);
  await wait.selectOption('75');
  await expect(page.getByTestId('route-distance')).toHaveText('20.0 mi');
  await expect(page.getByTestId('total-duration')).toHaveText('1 hr 45 min');
  await expect(page.getByTestId('estimated-arrival')).toHaveText('1:40 AM · Nov 19');
  expect(controls.get(page).routes.at(-1).trip).toEqual({ service: 'transfer', date: '2030-11-18', time: '23:55', waitMinutes: [75] });
  await expect(page.locator('.selected-location, .maps-policies, [data-pickup-timezone]')).toHaveCount(0);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^View place/ })).toHaveCount(0);
  await expect(page.locator('.helper')).toHaveCount(1);
  for (const name of ['Choose pickup on map', 'Choose stop 1 on map', 'Choose drop-off on map']) {
    const action = page.getByRole('button', { name, exact: true });
    await expect(action).toBeVisible(); await expect(action).toHaveText('');
  }
  await expect(page.getByRole('link', { name: 'View route on Google Maps', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/tuxano261-transfer-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.getByTestId('estimated-arrival')).toHaveText('1:40 AM · Nov 19');
  await page.screenshot({ path: '/tmp/tuxano261-transfer-phone.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('.waiting-price')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select & continue with Premium SUV', exact: true }).click();
  const summary = page.locator('.trip-summary');
  await expect(summary.locator('.price-lines > div').first()).toHaveText('Transportation$150.00');
  await expect(summary.locator('[data-pricing-waiting-line]')).toHaveText('Stop waiting (75 min)$187.50');
  await expect(summary.getByTestId('estimated-total')).toHaveText('$405.00');
});

test('service switching retains route stops but Hourly has no hidden waiting charge', async ({ page }) => {
  await visit(page); await places(page); await addStop(page); await schedule(page, '11:00');
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('75');
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await expect(page.getByLabel('Stop 1', { exact: true })).toHaveValue('StopOne');
  await expect(page.locator('[data-stop-wait]')).toHaveCount(0);
  await expect(page.getByTestId('service-hours')).toHaveText('3 hours');
  await expect(page.getByTestId('service-start')).toHaveText('11:00 AM');
  await expect(page.getByTestId('service-end')).toHaveText('2:00 PM');
  await expect(page.getByTestId('route-distance')).toHaveCount(0);
  await expect(page.getByTestId('total-duration')).toHaveCount(0);
  await expect.poll(() => controls.get(page).routes.at(-1)?.trip).toMatchObject({ service: 'hourly', waitMinutes: [0] });
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('.waiting-price')).toHaveCount(0);
  await expect(page.locator('.vehicle-price > strong')).toHaveText('$490USD');
  await page.getByRole('button', { name: 'Select & continue with Premium SUV', exact: true }).click();
  const summary = page.locator('.trip-summary');
  await expect(summary.locator('[data-pricing-waiting-line]')).toHaveCount(0);
  await expect(summary.locator('.price-lines > div').first()).toHaveText('Transportation$490.00');
  await expect(summary.getByTestId('estimated-total')).toHaveText('$588.00');
});

test('Hourly24 count and stepper update service end with next-day date immediately', async ({ page }) => {
  await visit(page); await page.getByRole('button', { name: 'HOURLY', exact: true }).click(); await places(page); await schedule(page);
  const hours = page.getByLabel('Hours', { exact: true });
  await expect(hours).toHaveAttribute('min', '3'); await expect(hours).toHaveAttribute('max', '24');
  await expect(page.locator('.hour-quantity')).toHaveText('');
  await expect(page.locator('.hours-limits')).toHaveText('3-hour minimum · 24-hour maximum');
  await hours.fill('24');
  await expect(page.getByTestId('service-hours')).toHaveText('24 hours');
  await expect(page.getByTestId('service-end')).toHaveText('11:55 PM · Nov 19');
  await expect(page.getByRole('button', { name: 'Increase hours', exact: true })).toBeDisabled();
  await page.screenshot({ path: '/tmp/tuxano261-hourly-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: '/tmp/tuxano261-hourly-phone.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Decrease hours', exact: true }).click();
  await expect(hours).toHaveValue('23');
  await expect(page.getByTestId('service-end')).toHaveText('10:55 PM · Nov 19');
});

for (const [date, time, expected] of [['2030-03-10', '01:30', '5:30 AM'], ['2030-11-03', '00:30', '2:30 AM']]) {
  test(`Hourly end adds elapsed hours through the ${date} daylight-saving change`, async ({ page }) => {
    await visit(page); await page.getByRole('button', { name: 'HOURLY', exact: true }).click(); await places(page); await schedule(page, time, date);
    await expect.poll(() => controls.get(page).routes.at(-1)?.trip.service).toBe('hourly');
    await expect(page.getByTestId('service-end')).toHaveText(expected);
  });
}

test('restored Hourly drafts clear old selected waiting without losing their stop or itinerary', async ({ page }) => {
  controls.get(page).static = true;
  await visit(page); await places(page); await addStop(page); await schedule(page, '11:00');
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('75');
  await page.evaluate(() => {
    const draft = JSON.parse(sessionStorage.getItem('tuxano-booking-v1'));
    draft.trip.service = 'hourly'; draft.trip.hours = 24; draft.completed = 4; draft.consent = true;
    sessionStorage.setItem('tuxano-booking-v1', JSON.stringify(draft));
  });
  await page.reload();
  await expect(page.getByLabel('Stop 1', { exact: true })).toHaveValue('StopOne');
  await expect(page.locator('[data-stop-wait]')).toHaveCount(0);
  await expect(page.getByTestId('service-hours')).toHaveText('24 hours');
  await expect(page.getByTestId('service-end')).toHaveText('11:00 AM · Nov 19');
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')));
  expect(draft.trip.stops[0].waitMinutes).toBe(0); expect(draft.completed).toBe(0); expect(draft.consent).toBe(false);
});

test('main quick intent restores ordered stop identities and binds waiting to a fresh route', async ({ page }) => {
  controls.get(page).quickTrip = {
    service: 'transfer', hours: 3, date: '2030-11-18', time: '11:00',
    pickup: { placeId: 'test-Pickup', query: 'Pickup' }, dropoff: { placeId: 'test-Destination', query: 'Destination' },
    stops: [{ placeId: 'test-StopOne', query: 'StopOne', waitMinutes: 75 }, { placeId: 'test-StopTwo', query: 'StopTwo', waitMinutes: 15 }],
  };
  await page.goto('/form261/');
  await expect(page).toHaveURL(/#vehicles$/);
  const route = controls.get(page).routes.at(-1);
  expect(route.stops).toEqual([{ placeId: 'test-StopOne' }, { placeId: 'test-StopTwo' }]);
  expect(route.trip.waitMinutes).toEqual([75, 15]);
  const restorations = await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'restore').map(call => call.id));
  expect(restorations).toEqual(expect.arrayContaining(['test-Pickup', 'test-StopOne', 'test-StopTwo', 'test-Destination']));
  await page.getByRole('button', { name: 'Edit Trip', exact: true }).click();
  await expect(page.getByLabel('Stop 1', { exact: true })).toHaveValue('StopOne');
  await expect(page.getByLabel('Stop 2', { exact: true })).toHaveValue('StopTwo');
  await expect(page.getByLabel('Stop 1 wait time', { exact: true })).toHaveValue('75');
  await expect(page.getByLabel('Stop 2 wait time', { exact: true })).toHaveValue('15');
  await expect(page.getByTestId('total-duration')).toHaveText('2 hrs');
});
