import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const date = '2030-11-18';
const revision = 'd'.repeat(64);
const bootstrap = readFileSync(new URL('../wordpress/tuxano-booking/assets/bootstrap.js', import.meta.url), 'utf8');
const controls = new WeakMap();
const baseTariff = {
  base: 0, perMile: 3, perDrivingMinute: 2.5, minimum: 150, perWaitingMinute: 2.5, hourly: 150,
  transfer: { version: 2, mode: 'mileage', pickupFreeMinutes: 30, returnFreeMinutes: 30, roundingMinutes: 15, minimumMinutes: 60, pickupFreeMiles: 20, returnFreeMiles: 20 },
  hourlyBooking: { hourly: 150, perMile: 2, perWaitingMinute: 1 },
};
const settings = {
  currency: 'USD', currencySymbol: '$', companyName: 'TUXANO', minHours: 3, maxHours: 24, maxStops: 5,
  timezone: 'America/New_York', pickupTimezones: true, availabilityChecks: true,
  transferPricing: true, transferTrafficBasis: 'pickup', meetPrice: 50,
  firstSeatPrice: 75, additionalSeatPrice: 50, defaultGratuity: 20,
  bookingPageUrl: origin + '/transfer-destination/',
  termsUrl: 'https://example.test/terms', privacyUrl: 'https://example.test/privacy',
};
const vehicle = (id, display, mode) => ({
  id, name: display.toUpperCase(), display, capacity: 6, luggageCapacity: 6,
  image: origin + '/assets/premium-suv.png', models: ['Configured vehicle'], features: ['Private transportation'],
  category: 'SUV COLLECTION', tariff: { ...baseTariff, transfer: { ...baseTariff.transfer, mode }, hourlyBooking: { ...baseTariff.hourlyBooking } },
});
function metrics(control, service) {
  const common = { provider: 'google', pickupTimezone: 'America/Chicago', pickupTimezoneLabel: 'Central Time', pricingRevision: revision };
  if (service === 'hourly') return { ...common, distanceMeters: 32186.88, durationSeconds: 1800, trafficAware: false };
  return control.scenario === 'long'
    ? { ...common, distanceMeters: 155301.696, durationSeconds: 6240, trafficAware: true, trafficBasis: 'pickup', transferLegs: { pickup: { distanceMeters: 197949.312, durationSeconds: 7200 }, return: { distanceMeters: 56166.1056, durationSeconds: 2700 } } }
    : { ...common, distanceMeters: 48280.32, durationSeconds: 1800, trafficAware: true, trafficBasis: 'pickup', transferLegs: { pickup: { distanceMeters: 24140.16, durationSeconds: 2100 }, return: { distanceMeters: 16093.44, durationSeconds: 900 } } };
}
function runtimeFor(control) {
  return {
    token: 'a'.repeat(64), restUrl, assetUrl: origin + '/', nonce: 'stale-public-nonce', pricingRevision: revision,
    settings, maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: restUrl + 'route' },
    vehicles: [vehicle('101', 'Premium SUV', control.mode), ...(control.bothModes ? [vehicle('102', 'Time SUV', 'time')] : [])],
  };
}

test.beforeEach(async ({ page }) => {
  const control = { mode: 'mileage', scenario: 'short', bothModes: false, malformed: '', routes: [], quotes: new Map(), availability: [], bookings: [], sessions: 0, expectedBookings: 0, errors: [] };
  controls.set(page, control); page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(() => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], countries: { 'test-AlphaPickup': 'US', 'test-BetaDropoff': 'US', 'test-GammaStop': 'US' }, locations: {} };
    window.__placeCanonicalLabels = { 'test-AlphaPickup': 'Selected pickup, Chicago', 'test-BetaDropoff': 'Selected destination, Chicago', 'test-GammaStop': 'Selected stop, Chicago' };
  });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route(restUrl + 'timezone', route => route.fulfill({ json: { timezone: 'America/Chicago', label: 'Central Time' } }));
  await page.route(restUrl + 'session', route => {
    control.sessions++;
    expect(route.request().headers()['x-wp-nonce']).toBeUndefined();
    return route.fulfill({ json: runtimeFor(control) });
  });
  await page.route(restUrl + 'route', async route => {
    const body = route.request().postDataJSON(), headers = route.request().headers();
    expect(headers['x-tuxano-session']).toBe('a'.repeat(64)); expect(headers['x-wp-nonce']).toBeUndefined();
    for (const point of [body.origin, ...body.stops, body.destination]) expect(point.placeId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.trip).toMatchObject({ service: expect.stringMatching(/^(transfer|hourly)$/), waitMinutes: expect.any(Array) });
    expect(body.trip.waitMinutes).toHaveLength(body.stops.length);
    if (body.trip.service === 'transfer') expect(body.trip).toMatchObject({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), time: expect.stringMatching(/^\d{2}:\d{2}$/) });
    else expect(Boolean(body.trip.date)).toBe(Boolean(body.trip.time));
    control.routes.push(body);
    if (control.malformed === 'unreachable') return route.fulfill({ status: 502, json: { code: 'tuxano_transfer_route', message: 'Service base travel could not be calculated. Please contact the booking team.' } });
    const result = { ...metrics(control, body.trip.service), quoteToken: control.routes.length.toString(16).padStart(64, '0') };
    if (body.trip.service === 'transfer') {
      if (control.malformed === 'pickup') delete result.transferLegs.pickup;
      if (control.malformed === 'return') delete result.transferLegs.return;
      if (control.malformed === 'traffic') result.trafficAware = false;
    }
    control.quotes.set(result.quoteToken, { request: body, result });
    return route.fulfill({ json: result });
  });
  await page.route(restUrl + 'availability', route => {
    const body = route.request().postDataJSON(), quote = control.quotes.get(body.quoteToken);
    control.availability.push(body);
    expect(quote, 'Availability requires the latest verified service quote').toBeTruthy();
    expect(body).toMatchObject({ service: quote.request.trip.service, date: quote.request.trip.date, time: quote.request.trip.time });
    return route.fulfill({ json: { state: 'available', message: 'Available' } });
  });
  await page.route(restUrl + 'bookings', route => {
    const body = route.request().postDataJSON(), quote = control.quotes.get(body.quoteToken);
    control.bookings.push(body);
    expect(quote).toBeTruthy();
    expect(body.booking.trip).toMatchObject({ service: quote.request.trip.service, date: quote.request.trip.date, time: quote.request.trip.time });
    expect(body.booking.trip.stops.map(stop => stop.waitMinutes)).toEqual(quote.request.trip.waitMinutes);
    // This literal server receipt includes waiting exactly once: 150 + 37.50
    // transportation, 50 meet, 75 seat, and 37.50 gratuity = 350.
    return route.fulfill({ json: {
      requestId: 'TUX-V2-VERIFIED', route: quote.result,
      pricing: { transportation: 187.5, carCost: 75, boosterCost: 0, seats: 75, meet: 50, percent: 20, tip: 37.5, total: 350, currency: 'USD', fare: { drivingCharge: 150, waitingCharge: 37.5, transportation: 187.5, pricingMode: 'mileage', waitingMinutes: 15 } },
    } });
  });
  await page.route(origin + '/transfer-pricing/', route => {
    const runtime = runtimeFor(control);
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body class="form-page"><div id="app"></div><div id="announcement" class="sr-only" role="status"></div><script>window.TuxanoBooking=${JSON.stringify(runtime)};</script><script type="module" src="/app.js"></script></body></html>` });
  });
  await page.route(origin + '/transfer-quick/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/quick-booking.css"></head><body><div data-tuxano-quick-booking data-rest-url="${restUrl}" data-asset-url="${origin}/"></div><script type="module" src="/quick-booking.js"></script></body></html>` }));
  await page.route(origin + '/transfer-bootstrap260.js', route => route.fulfill({ contentType: 'text/javascript', body: bootstrap }));
  await page.route(origin + '/transfer-destination/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body class="form-page"><div id="app"></div><div id="announcement" class="sr-only" role="status"></div><script>window.TuxanoBookingBoot=${JSON.stringify({ restUrl, assetUrl: origin + '/', nonce: 'stale-public-nonce' })};</script><script type="module" src="/transfer-bootstrap260.js"></script></body></html>` }));
});
test.afterEach(async ({ page }) => {
  const control = controls.get(page);
  expect(control.errors, 'No unhandled v2 pricing/runtime exception').toEqual([]);
  expect(control.bookings).toHaveLength(control.expectedBookings);
});

async function choose(page, field, value) {
  const query = { 'Selected pickup, Chicago': 'AlphaPickup', 'Selected destination, Chicago': 'BetaDropoff', 'Selected stop, Chicago': 'GammaStop' }[value] || value;
  await page.getByLabel(field, { exact: true }).fill(query);
  await page.getByRole('option', { name: query, exact: true }).click();
  await expect(page.getByLabel(field, { exact: true })).toHaveValue(value);
}
async function places(page, stop = false) {
  await choose(page, 'Pickup location', 'Selected pickup, Chicago');
  await choose(page, 'Drop-off location', 'Selected destination, Chicago');
  if (stop) {
    await page.getByRole('button', { name: 'Add stop', exact: true }).click();
    await choose(page, 'Stop 1', 'Selected stop, Chicago');
  }
}
async function schedule(page, time = '14:44') {
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill(time);
}
async function trip(page, { stop = false, wait = '15' } = {}) {
  await page.goto('/transfer-pricing/'); await places(page, stop);
  if (stop) await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption(wait);
  await schedule(page);
  const minutes = (controls.get(page).scenario === 'long' ? 104 : 30) + (stop ? Number(wait) : 0);
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes >= 120 ? 's' : ''}${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
  await expect(page.getByTestId('total-duration')).toHaveText(duration);
}
async function vehicles(page) {
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
}
async function select(page, name = 'Premium SUV') {
  await page.getByRole('button', { name: `Select & continue with ${name}`, exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
}
const money = amount => '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function total(page, amount) { await expect(page.locator('[data-testid="estimated-total"]:visible').last()).toHaveText(money(amount)); }

for (const [mode, scenario, fare, estimate] of [['time', 'short', 150, 180], ['time', 'long', 525, 630], ['mileage', 'short', 150, 180], ['mileage', 'long', 643.2, 771.84]]) {
  test(`client ${mode} ${scenario} example is priced before submission`, async ({ page }) => {
    Object.assign(controls.get(page), { mode, scenario });
    await trip(page); await vehicles(page);
    await expect(page.locator('.vehicle-price > strong')).toHaveText('$' + fare.toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'USD');
    await select(page); await total(page, estimate);
    await expect(page.locator('.trip-summary')).toContainText('Traffic-aware estimate for your selected pickup time');
    expect(controls.get(page).routes.at(-1).trip).toEqual({ service: 'transfer', date, time: '14:44', waitMinutes: [] });
  });
}

test('one verified route supports each vehicle’s independently selected Transfer method', async ({ page }) => {
  Object.assign(controls.get(page), { scenario: 'long', bothModes: true });
  await trip(page); await vehicles(page);
  const card = name => page.locator('.vehicle-card').filter({ has: page.getByRole('button', { name: `Select & continue with ${name}`, exact: true }) });
  await expect(card('Premium SUV').locator('.vehicle-price > strong')).toHaveText('$643.2USD');
  await expect(card('Time SUV').locator('.vehicle-price > strong')).toHaveText('$525USD');
  await select(page, 'Time SUV'); await total(page, 630);
  expect(controls.get(page).availability.at(-1).vehicleId).toBe('102');
});

test('Transfer waits for a complete pickup schedule without sending malformed forecast requests', async ({ page }) => {
  await page.goto('/transfer-pricing/'); await places(page);
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.waitForTimeout(450);
  expect(controls.get(page).routes).toHaveLength(0);
  await expect(page.getByTestId('total-duration')).toHaveCount(0);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:44');
  await expect(page.getByTestId('total-duration')).toHaveText('30 min');
  expect(controls.get(page).routes.at(-1).trip).toEqual({ service: 'transfer', date, time: '14:44', waitMinutes: [] });
});

test('Hourly preview accepts incomplete schedules as an empty pair and uses independent service prices', async ({ page }) => {
  await page.goto('/transfer-pricing/'); await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await places(page);
  await expect.poll(() => controls.get(page).routes.at(-1)?.trip.service).toBe('hourly');
  await expect(page.getByTestId('service-hours')).toHaveText('3 hours');
  await expect(page.getByTestId('total-duration')).toHaveCount(0);
  await expect(page.getByTestId('route-distance')).toHaveCount(0);
  expect(controls.get(page).routes.at(-1).trip).toEqual({ service: 'hourly', date: '', time: '', waitMinutes: [] });
  await page.getByLabel('Date', { exact: true }).fill(date); await page.waitForTimeout(450);
  expect(controls.get(page).routes.at(-1).trip).toMatchObject({ service: 'hourly', date: '', time: '' });
  await page.getByLabel('Pickup time', { exact: true }).fill('14:44');
  await page.getByLabel('Hours', { exact: true }).fill('4'); await page.getByLabel('Hours', { exact: true }).blur();
  await vehicles(page); await expect(page.locator('.vehicle-price > strong')).toHaveText('$640USD');
  await select(page); await total(page, 768);
  expect(controls.get(page).routes.at(-1).trip).toEqual({ service: 'hourly', date, time: '14:44', waitMinutes: [] });
});

test('switching service invalidates the previous service quote in both directions', async ({ page }) => {
  await trip(page); const control = controls.get(page), transferQuote = [...control.quotes.keys()].at(-1);
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await expect.poll(() => control.routes.at(-1)?.trip.service).toBe('hourly');
  await vehicles(page); await expect(page.locator('.vehicle-price > strong')).toHaveText('$490USD');
  await page.getByRole('button', { name: 'Edit Trip', exact: true }).click();
  await page.getByRole('button', { name: 'TRANSFER', exact: true }).click();
  await expect.poll(() => control.routes.at(-1)?.trip.service).toBe('transfer');
  await vehicles(page); await expect(page.locator('.vehicle-price > strong')).toHaveText('$150USD');
  await select(page); await total(page, 180);
  expect(control.availability.at(-1).service).toBe('transfer');
  expect(control.availability.at(-1).quoteToken).not.toBe(transferQuote);
});

test('pickup date, time and ordered waiting changes each refresh the bound Transfer forecast', async ({ page }) => {
  await trip(page, { stop: true }); const control = controls.get(page);
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('30');
  await expect.poll(() => control.routes.at(-1)?.trip.waitMinutes).toEqual([30]);
  await page.getByLabel('Date', { exact: true }).fill('2030-11-19');
  await expect.poll(() => control.routes.at(-1)?.trip.date).toBe('2030-11-19');
  await page.getByLabel('Pickup time', { exact: true }).fill('16:05');
  await expect.poll(() => control.routes.at(-1)?.trip.time).toBe('16:05');
  await expect(page.getByTestId('total-duration')).toHaveText('1 hr');
  await vehicles(page); await expect(page.locator('.vehicle-price > strong')).toHaveText('$225USD');
  await select(page); await total(page, 270);
  const quote = control.quotes.get(control.availability.at(-1).quoteToken);
  expect(quote.request.trip).toEqual({ service: 'transfer', date: '2030-11-19', time: '16:05', waitMinutes: [30] });
});

for (const malformed of ['pickup', 'return', 'traffic', 'unreachable']) {
  test(`an incomplete ${malformed} transfer route shows a retained-trip retry instead of guessed prices`, async ({ page }) => {
    const control = controls.get(page); control.malformed = malformed;
    await page.goto('/transfer-pricing/'); await places(page); await schedule(page);
    await expect(page.locator('.route-error')).toBeVisible();
    await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
    await expect(page).toHaveURL(/#trip$/);
    await expect(page.locator('.vehicle-card')).toHaveCount(0);
    await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue('Selected pickup, Chicago');
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(date);
    control.malformed = '';
    await page.locator('.route-error').getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByTestId('total-duration')).toHaveText('30 min');
    await vehicles(page); await expect(page.locator('.vehicle-price > strong')).toHaveText('$150USD');
  });
}

test('v2 submission includes the bound schedule and waiting while the verified receipt charges extras once', async ({ page }) => {
  await trip(page, { stop: true, wait: '15' }); await vehicles(page); await select(page);
  await page.getByLabel('Meet & Greet', { exact: true }).check();
  await page.getByLabel('Child Seats', { exact: true }).check();
  await page.getByRole('button', { name: 'Increase car seats', exact: true }).click();
  await total(page, 350);
  await expect(page.locator('.trip-summary [data-pricing-waiting-line]')).toContainText('$37.50');
  await page.getByRole('button', { name: /continue to contact/i }).click();
  for (const [label, value] of Object.entries({ 'Billing first name': 'Alex', 'Billing last name': 'Verified', 'Billing email': 'verified@example.test', 'Billing phone': '+1 312 555 0134', 'Street address': '10 Test Street', City: 'Chicago' })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United States' });
  await page.getByLabel('Same as billing contact', { exact: true }).check();
  await page.getByRole('button', { name: /continue to review/i }).click();
  await total(page, 350);
  await expect(page.locator('[data-pricing-waiting-line]').first()).toContainText('$37.50');
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
  await page.locator('#booking-form').evaluate(form => { const input = document.createElement('input'); input.type = 'hidden'; input.name = 'total'; input.value = '0'; form.append(input); });
  const control = controls.get(page); control.expectedBookings = 1;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#thank-you$/); await total(page, 350);
  await expect(page.locator('[data-pricing-waiting-line]')).toContainText('$37.50');
  expect(control.bookings[0].booking).not.toHaveProperty('total');
  expect(control.bookings[0].booking).not.toHaveProperty('pricing');
  expect(control.bookings[0].booking.billing.email).toBe('verified@example.test');
  expect(control.bookings[0].requestKey).toEqual(expect.any(String));
});

test('quick booking hands the pickup-local schedule into a fresh v2 Transfer quote on the main form', async ({ page }) => {
  await page.goto('/transfer-quick/');
  await choose(page, 'Pickup Location', 'Selected pickup, Chicago');
  await choose(page, 'Drop-off Location', 'Selected destination, Chicago');
  await expect(page.locator('[data-quick-timezone]')).toHaveCount(0);
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:44');
  expect(controls.get(page).routes).toHaveLength(0);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/\/transfer-destination\/#vehicles$/);
  await expect(page.locator('.vehicle-price > strong')).toHaveText('$150USD');
  const control = controls.get(page);
  expect(control.sessions).toBe(2, 'Quick intent does not reuse an old main booking session or quote');
  expect(control.routes.at(-1).trip).toEqual({ service: 'transfer', date, time: '14:44', waitMinutes: [] });
  await select(page); await total(page, 180);
  await expect(page.locator('.trip-summary')).toContainText('Central Time');
});
