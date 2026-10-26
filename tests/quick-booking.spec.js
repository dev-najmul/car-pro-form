import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const bookingUrl = origin + '/booking-test/?target=1';
const pickupDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const metrics = { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', quoteToken: 'b'.repeat(64) };
const tariff = { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 };
const settings = { currency: 'USD', currencySymbol: '$', minHours: 2, maxHours: 12, defaultGratuity: 20, bookingPageUrl: bookingUrl, timezone: 'UTC', maxStops: 5 };
const vehicles = [{ id: '104', name: 'CITY SEDAN', display: 'City Sedan', capacity: 3, luggageCapacity: 3, image: origin + '/assets/premium-suv.png', models: ['Configured sedan'], features: ['Configured feature'], category: 'CITY COLLECTION', categoryDescription: 'Our city cars.', tariff }];
const controls = new WeakMap();

test.beforeEach(async ({ page, context }) => {
  const control = { sessions: 0, routes: [], bookings: 0, errors: [], routeStatus: 200, mainSettings: {}, formCount: 1, holdRestore: false, holdRoute: false, routeResolvers: [] };
  controls.set(page, control);
  await context.addInitScript(() => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], countries: { 'test-AlphaPickup': 'US', 'test-BetaDropoff': 'US' } };
    window.__placeCanonicalLabels = { 'test-AlphaPickup': 'Canonical Pickup, New York, USA', 'test-BetaDropoff': 'Canonical Destination, Queens, USA' };
  });
  await context.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await context.route(restUrl + 'session', route => {
    control.sessions++;
    return route.fulfill({ json: { token: String(control.sessions).repeat(64), settings: { ...settings, ...(control.sessions > 1 ? control.mainSettings : {}) }, vehicles, maps: { browserConfigured: true, browserKey: 'test-browser-key', providerMode: 'remote', routeEndpoint: restUrl + 'route', routesConfigured: true } } });
  });
  await context.route(restUrl + 'route', async route => {
    control.routes.push({ body: route.request().postDataJSON(), headers: await route.request().allHeaders() });
    if (control.holdRoute) await new Promise(resolve => control.routeResolvers.push(resolve));
    await route.fulfill({ status: control.routeStatus, json: control.routeStatus === 200 ? metrics : { message: 'The configured route is unavailable. Please choose another destination.' } });
  });
  await context.route(restUrl + 'bookings', route => { control.bookings++; return route.abort(); });
  await context.route(origin + '/quick-test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/quick-booking.css"><style>body{margin:0;padding:24px;background:linear-gradient(135deg,#183b3c,#a56242);min-height:100vh;box-sizing:border-box}button,input,select{font-family:serif}input{color:red}button{background:red}</style></head><body>${Array.from({ length: control.formCount }, (_, i) => `<div id="tuxano-quick-test-${i}" data-tuxano-quick-booking data-rest-url="${restUrl}" data-asset-url="${origin}/" data-booking-url="${bookingUrl}"><p>Loading…</p></div>`).join('')}<script type="module" src="/quick-booking.js"></script></body></html>` }));
  await context.route(origin + '/booking-test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe id="quick-booking-frame" data-tuxano-booking-frame src="/main-frame-test/${control.holdRestore ? '?held_restore=1' : ''}" style="display:block;border:0;width:100%;height:1800px"></iframe><script src="/wp-embed-test.js"></script></body></html>` }));
  await context.route(origin + '/main-frame-test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body class="form-page"><div id="app"></div><div id="announcement" role="status"></div><script>globalThis.TuxanoBookingBoot=${JSON.stringify({ restUrl, assetUrl: origin + '/', frameId: 'quick-booking-frame', timezone: 'UTC' })};window.__mapsMock.holdDetails=${JSON.stringify(control.holdRestore ? ['AlphaPickup'] : [])};</script><script type="module" src="/wp-bootstrap-test.js"></script></body></html>` }));
  await context.route(origin + '/wp-bootstrap-test.js', async route => route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL('../wordpress/tuxano-booking/assets/bootstrap.js', import.meta.url), 'utf8') }));
  await context.route(origin + '/wp-embed-test.js', async route => route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL('../wordpress/tuxano-booking/assets/embed.js', import.meta.url), 'utf8') }));
  page.on('pageerror', error => control.errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(controls.get(page).bookings, 'Quick booking must never submit a reservation').toBe(0);
  expect(controls.get(page).errors, 'No unhandled errors during quick booking').toEqual([]);
});

async function chooseQuick(page, key, query) {
  const input = page.getByLabel(key === 'pickup' ? 'Pickup Location' : 'Drop-off Location', { exact: true });
  await input.fill(query);
  await page.getByRole('option', { name: query, exact: true }).click();
  await expect(input).toHaveValue(key === 'pickup' ? 'Canonical Pickup, New York, USA' : 'Canonical Destination, Queens, USA');
}
async function prepareQuick(page, hourly = false) {
  await page.goto('/quick-test/');
  if (hourly) { await page.getByRole('button', { name: 'HOURLY', exact: true }).click(); await page.getByLabel('Hours', { exact: true }).selectOption('7'); }
  await chooseQuick(page, 'pickup', 'AlphaPickup'); await chooseQuick(page, 'dropoff', 'BetaDropoff');
  await page.getByLabel('Date', { exact: true }).fill(pickupDate); await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
}
async function openBooking(page) {
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/booking-test/');
  const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await expect(frame.locator('#app')).not.toBeEmpty();
  return frame;
}

test('desktop quick form uses glass and transfers canonical trip into freshly quoted step two', async ({ page }) => {
  await prepareQuick(page);
  const card = page.locator('[data-tuxano-quick-booking]');
  await expect(card).toHaveCSS('backdrop-filter', 'blur(14px)');
  const frame = await openBooking(page);
  await expect.poll(() => new URL(frame.url()).hash).toBe('#vehicles');
  await expect(frame.getByRole('heading', { name: 'CITY COLLECTION', exact: true })).toBeVisible();
  const control = controls.get(page);
  expect(control.sessions).toBe(2);
  expect(control.routes).toHaveLength(1);
  expect(control.routes[0].headers['x-tuxano-session']).toBe('2'.repeat(64));
  expect(control.routes[0].body).toEqual({ origin: { placeId: 'test-AlphaPickup' }, destination: { placeId: 'test-BetaDropoff' }, stops: [] });
  await expect(frame.locator('.vehicle-price strong').first()).toHaveText('$120USD');
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('tuxano-quick-trip-v1:')))).toEqual([]);
  await frame.getByRole('button', { name: /Edit Trip/i }).click();
  await expect(frame.getByLabel('Pickup location', { exact: true })).toHaveValue('Canonical Pickup, New York, USA');
  await expect(frame.getByLabel('Drop-off location', { exact: true })).toHaveValue('Canonical Destination, Queens, USA');
  await expect(frame.getByLabel('Date', { exact: true })).toHaveValue(pickupDate);
  await expect(frame.getByLabel('Pickup time', { exact: true })).toHaveValue('14:30');
});

test.describe('touch phone quick booking', () => {
  test.use({ viewport: { width: 393, height: 900 }, isMobile: true, hasTouch: true });
  test('white card, readable fields and hourly selection transfer without losing hours', async ({ page }) => {
    await prepareQuick(page, true);
    const card = page.locator('[data-tuxano-quick-booking]');
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveCSS('font-size', '16px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const frame = await openBooking(page);
    await expect.poll(() => new URL(frame.url()).hash).toBe('#vehicles');
    await frame.getByRole('button', { name: /Edit Trip/i }).tap();
    await expect(frame.getByRole('button', { name: 'HOURLY', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(frame.getByLabel('Hours', { exact: true })).toHaveValue('7');
    expect(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});

test('typed addresses without explicit selections cannot redirect or fabricate a quote', async ({ page }) => {
  await page.goto('/quick-test/');
  await page.getByLabel('Pickup Location', { exact: true }).fill('Unselected pickup');
  await page.getByLabel('Drop-off Location', { exact: true }).fill('Unselected dropoff');
  await page.getByLabel('Date', { exact: true }).fill(pickupDate); await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Choose this location');
  expect(new URL(page.url()).pathname).toBe('/quick-test/');
  expect(controls.get(page).routes).toHaveLength(0);
});

test('fresh configuration controls destination and retry refreshes an invalid destination', async ({ page }) => {
  let available = false, sessions = 0;
  // Make the first fresh session unavailable while the fixture still has a
  // plausible stale data-booking-url, as a cached public page can.
  await page.route(restUrl + 'session', route => {
    sessions++;
    return route.fulfill({ json: { settings: { ...settings, bookingPageUrl: available ? bookingUrl : '' }, maps: { browserConfigured: true, browserKey: 'test-browser-key' } } });
  });
  await page.goto('/quick-test/');
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'TRY AGAIN', exact: true }).click();
  await expect(page.getByLabel('Pickup Location', { exact: true })).toBeEditable();
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeEnabled();
  expect(sessions).toBe(2);
});

test('storage-blocked browser keeps the entered trip and provides a retryable explanation', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
  await prepareQuick(page);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Allow website storage');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue('Canonical Pickup, New York, USA');
});

test('restoring the quick page from browser history re-enables checking prices without losing the trip', async ({ page }) => {
  await prepareQuick(page, true);
  await page.route(origin + '/booking-test/**', route => route.fulfill({ status: 204, body: '' }));
  // Capture the submitted document before it can unload, then dispatch the
  // lifecycle event a browser emits when that document returns from history.
  const snapshot = await page.evaluate(() => {
    const form = document.querySelector('.tuxano-quick-booking-form');
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    const submit = form.querySelector('[type="submit"]');
    const busy = { text: submit.textContent, disabled: submit.disabled };
    window.stop();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    return { busy, restored: { text: submit.textContent, disabled: submit.disabled } };
  });
  expect(snapshot.busy).toEqual({ text: 'OPENING BOOKING…', disabled: true });
  expect(snapshot.restored).toEqual({ text: 'CHECK PRICE', disabled: false });
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue('Canonical Pickup, New York, USA');
  await expect(page.getByLabel('Drop-off Location', { exact: true })).toHaveValue('Canonical Destination, Queens, USA');
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('7');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(pickupDate);
  await expect(page.getByLabel('Pickup time', { exact: true })).toHaveValue('14:30');
});

test('provider route failure preserves a verified trip on step one instead of showing false prices', async ({ page }) => {
  controls.get(page).routeStatus = 503;
  await prepareQuick(page); const frame = await openBooking(page);
  await expect(frame.locator('.form-error')).toContainText('configured route is unavailable');
  expect(new URL(frame.url()).hash).toBe('#trip');
  await expect(frame.getByLabel('Pickup location', { exact: true })).toHaveValue('Canonical Pickup, New York, USA');
  await expect(frame.getByLabel('Date', { exact: true })).toHaveValue(pickupDate);
  await expect(frame.locator('.vehicle-card')).toHaveCount(0);
});

test('expired handoff cannot skip the first step or reuse a booking session', async ({ page }) => {
  await page.goto('/quick-test/');
  const url = await page.evaluate(async ({ bookingUrl, pickupDate }) => {
    const { createQuickHandoff, QUICK_HANDOFF_PREFIX, QUICK_HANDOFF_TTL } = await import('/quick-handoff.js');
    const url = createQuickHandoff(sessionStorage, { service: 'transfer', hours: 3, date: pickupDate, time: '14:30', pickup: { placeId: 'test-AlphaPickup', query: 'AlphaPickup' }, dropoff: { placeId: 'test-BetaDropoff', query: 'BetaDropoff' } }, bookingUrl, { now: Date.now() - QUICK_HANDOFF_TTL - 100 });
    return url;
  }, { bookingUrl, pickupDate });
  await page.goto(url);
  const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await expect(frame.locator('.form-error')).toContainText('expired');
  expect(new URL(frame.url()).hash).toBe('#trip');
  await expect(frame.getByLabel('Pickup location', { exact: true })).toHaveValue('');
  expect(controls.get(page).routes).toHaveLength(0);
});

test('opening a map during held restoration cancels automatic advance and keeps that picker', async ({ page }) => {
  controls.get(page).holdRestore = true;
  await prepareQuick(page); const frame = await openBooking(page);
  await expect.poll(() => frame.evaluate(() => window.__mapsMock.pending.some(item => item.kind === 'details' && item.key === 'AlphaPickup'))).toBe(true);
  await frame.getByRole('button', { name: 'Choose pickup on map', exact: true }).click();
  const picker = frame.locator('[data-map-picker]'); await expect(picker).toBeVisible();
  await expect(frame.getByLabel('Search map for pickup', { exact: true })).toBeEditable();
  await frame.evaluate(() => window.__mapsMock.pending.filter(item => item.key === 'AlphaPickup').forEach(item => item.resolve()));
  await expect(frame.getByLabel('Pickup location', { exact: true })).toHaveValue('Canonical Pickup, New York, USA');
  await expect(picker).toBeVisible();
  await expect.poll(() => controls.get(page).routes.length).toBe(1);
  expect(new URL(frame.url()).hash).toBe('#trip');
});

test('editing while the fresh route is pending cancels automatic step-two navigation', async ({ page }) => {
  controls.get(page).holdRoute = true;
  await prepareQuick(page); const frame = await openBooking(page);
  await expect.poll(() => controls.get(page).routeResolvers.length).toBe(1);
  const changed = new Date(Date.now() + 16 * 86400000).toISOString().slice(0, 10);
  await frame.getByLabel('Date', { exact: true }).fill(changed);
  controls.get(page).routeResolvers.shift()();
  await expect(frame.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await expect(frame.getByLabel('Date', { exact: true })).toHaveValue(changed);
  expect(new URL(frame.url()).hash).toBe('#trip');
});

test('new administrator hour bounds require a correction instead of accepting outdated hours', async ({ page }) => {
  controls.get(page).mainSettings = { minHours: 8, maxHours: 12 };
  await prepareQuick(page, true); const frame = await openBooking(page);
  await expect(frame.locator('.form-error')).toContainText('Service hours changed');
  await expect(frame.getByLabel('Hours', { exact: true })).toHaveValue('8');
  expect(new URL(frame.url()).hash).toBe('#trip');
  expect(controls.get(page).routes).toHaveLength(0);
});

test('multiple quick forms use independent fields while sharing one fresh configuration', async ({ page }) => {
  controls.get(page).formCount = 2;
  await page.goto('/quick-test/');
  const cards = page.locator('[data-tuxano-quick-booking]');
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByLabel('Pickup Location', { exact: true }).fill('First query');
  await cards.nth(1).getByLabel('Pickup Location', { exact: true }).fill('AlphaPickup');
  await cards.nth(1).getByRole('option', { name: 'AlphaPickup', exact: true }).click();
  await expect(cards.nth(0).getByLabel('Pickup Location', { exact: true })).toHaveValue('First query');
  await expect(cards.nth(1).getByLabel('Pickup Location', { exact: true })).toHaveValue('Canonical Pickup, New York, USA');
  expect(controls.get(page).sessions).toBe(1);
});
