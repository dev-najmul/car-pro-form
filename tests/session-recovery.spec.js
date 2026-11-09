import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const token = 'a'.repeat(64);
const proof = letter => `v1.1800000000.1800604800.${letter.repeat(64)}`;
const date = '2030-11-18';
const gpsAddress = '312 Sype Dr, Carol Stream, IL 60188, USA';
const controls = new WeakMap();
const bootstrap = readFileSync(new URL('../wordpress/tuxano-booking/assets/bootstrap.js', import.meta.url), 'utf8');
const metrics = { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', pickupTimezone: 'America/Chicago', pickupTimezoneLabel: 'Central Time', quoteToken: 'b'.repeat(64) };

test.beforeEach(async ({ page }) => {
  const control = { errors: [], fresh: 0, renewals: 0, expired: false, recovery: proof('b'), calls: [], bookingBodies: [], saved: null, accepted: 0, loseReply: false, originBlocked: false, initialExpiry: Date.now() / 1000 + 7200, routeRevision: 'd'.repeat(64), serverRevision: 'd'.repeat(64), vehicleBase: 50, expireWithNewPrice: false, expireAvailability: false, failRenewals: false, failRouteAfterRenewal: false, routeDistance: metrics.distanceMeters, routeTimezone: metrics.pickupTimezone, routeTimezoneLabel: metrics.pickupTimezoneLabel, expireWithNewMetrics: false, expireWithNewTimezone: false, expireWithTinyMetrics: false };
  controls.set(page, control); page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(({ gpsAddress }) => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], countries: {}, locations: {} };
    window.__geocodeMock = { results: [{ formatted_address: gpsAddress, geometry: { location: { lat: 41.8818, lng: -87.6232 } }, types: ['street_address'], address_components: [{ short_name: 'US', long_name: 'United States', types: ['country'] }] }] };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success) { success({ coords: { latitude: 41.8818, longitude: -87.6232, accuracy: 30 }, timestamp: Date.now() }); },
    } });
  }, { gpsAddress });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  const settings = { companyName: 'TUXANO', minHours: 3, maxHours: 24, timezone: 'America/New_York', pickupTimezones: true, availabilityChecks: true, bookingPageUrl: origin + '/session-booking-destination/', termsUrl: 'https://example.test/terms', privacyUrl: 'https://example.test/privacy' };
  const vehicle = { id: '41', name: 'CITY SEDAN', display: 'City Sedan', capacity: 4, luggageCapacity: 4, image: origin + '/assets/premium-suv.png', models: ['Configured sedan'], features: ['Private transfers'], category: 'TEST COLLECTION', tariff: { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 } };
  await page.route(restUrl + 'session', async route => {
    const headers = route.request().headers();
    expect(headers['x-wp-nonce']).toBeUndefined();
    if (headers['x-tuxano-session']) {
      expect(headers['x-tuxano-session']).toBe(token);
      expect(headers['x-tuxano-recovery']).toBe(control.recovery);
      control.renewals++;
      if (control.failRenewals) return route.fulfill({ status: 503, json: { code: 'tuxano_session_retry', message: 'The connection could not be refreshed. Your details are still here. Please try again.' } });
      control.expired = false; control.recovery = proof('c');
    } else control.fresh++;
    return route.fulfill({ json: { token, sessionRecovery: control.recovery, sessionExpiresAt: control.renewals ? Date.now() / 1000 + 7200 : control.initialExpiry, vehicles: [{ ...vehicle, tariff: { ...vehicle.tariff, base: control.vehicleBase } }], settings, pricingRevision: control.serverRevision, maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: restUrl + 'route' } } });
  });
  await page.route(restUrl + '*', async route => {
    const path = new URL(route.request().url()).pathname.split('/').at(-1);
    if (path === 'session') return route.fallback();
    const headers = route.request().headers(), body = route.request().postDataJSON();
    control.calls.push({ path, headers, body });
    expect(headers['x-wp-nonce']).toBeUndefined();
    expect(headers['x-tuxano-session']).toBe(token);
    if (control.originBlocked) return route.fulfill({ status: 403, json: { code: 'tuxano_origin', message: 'Please use the booking form on this website.' } });
    if (control.expired || headers['x-tuxano-recovery'] !== control.recovery) return route.fulfill({ status: 403, json: { code: 'tuxano_session', message: 'Your booking session has expired. Refresh this page to start a new session.' } });
    if (path === 'timezone') return route.fulfill({ json: { timezone: 'America/Chicago', label: 'Central Time' } });
    if (path === 'route') {
      if (control.failRouteAfterRenewal && control.renewals) return route.fulfill({ status: 503, json: { code: 'tuxano_route_failed', message: 'The driving route could not be verified. Please try again.' } });
      return route.fulfill({ json: { ...metrics, distanceMeters: control.routeDistance, pickupTimezone: control.routeTimezone, pickupTimezoneLabel: control.routeTimezoneLabel, pricingRevision: control.routeRevision } });
    }
    if (path === 'availability') {
      if (control.expireAvailability) {
        control.expireAvailability = false; control.routeRevision = 'e'.repeat(64); control.serverRevision = 'e'.repeat(64); control.vehicleBase = 100;
        return route.fulfill({ status: 409, json: { code: 'tuxano_quote_expired', message: 'The route quote expired.' } });
      }
      return route.fulfill({ json: { state: 'available', message: 'Available' } });
    }
    if (path === 'bookings') {
      control.bookingBodies.push(body);
      if (control.expireWithNewPrice) {
        control.expireWithNewPrice = false; control.routeRevision = 'e'.repeat(64); control.serverRevision = 'e'.repeat(64); control.vehicleBase = 100;
        return route.fulfill({ status: 409, json: { code: 'tuxano_quote_expired', message: 'The route quote expired.' } });
      }
      if (control.expireWithNewMetrics || control.expireWithNewTimezone || control.expireWithTinyMetrics) {
        if (control.expireWithNewMetrics) control.routeDistance = 48280.32;
        if (control.expireWithTinyMetrics) control.routeDistance = metrics.distanceMeters + 1;
        if (control.expireWithNewTimezone) { control.routeTimezone = 'America/New_York'; control.routeTimezoneLabel = 'Eastern Time'; }
        control.expireWithNewMetrics = false; control.expireWithNewTimezone = false; control.expireWithTinyMetrics = false;
        return route.fulfill({ status: 409, json: { code: 'tuxano_quote_expired', message: 'The route quote expired.' } });
      }
      if (!control.saved) {
        control.accepted++;
        control.saved = { requestId: 'TUX-SESSION-RECOVERED', route: metrics, pricing: { transportation: 120, carCost: 0, boosterCost: 0, seats: 0, meet: 0, percent: 20, tip: 24, total: 144, currency: 'USD' } };
      }
      if (control.loseReply) { control.loseReply = false; return route.abort(); }
      return route.fulfill({ json: control.saved });
    }
    return route.abort();
  });
  await page.route(origin + '/session-recovery-bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: bootstrap }));
  await page.route(origin + '/session-main/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body class="form-page"><div id="app"></div><div id="announcement" class="sr-only" role="status"></div><script>window.TuxanoBookingBoot=${JSON.stringify({ restUrl, assetUrl: origin + '/', nonce: 'stale-cached-wordpress-nonce' })};</script><script type="module" src="/session-recovery-bootstrap.js"></script></body></html>` }));
  await page.route(origin + '/session-quick/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/quick-booking.css"></head><body><div data-tuxano-quick-booking data-rest-url="${restUrl}" data-asset-url="${origin}/"></div><script type="module" src="/quick-booking.js"></script></body></html>` }));
});
test.afterEach(async ({ page }) => { expect(controls.get(page).errors).toEqual([]); });

async function choose(page, field, value) {
  await page.getByLabel(field, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function trip(page) {
  await page.goto('/session-main/');
  await fillTrip(page);
}
async function fillTrip(page) {
  await choose(page, 'Pickup location', 'Selected pickup, Chicago');
  await choose(page, 'Drop-off location', 'Selected airport, Chicago');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:44');
  await expect(page.getByTestId('total-duration')).toHaveText('30 min');
}
async function review(page) {
  await trip(page);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await page.getByRole('button', { name: /continue to contact/i }).click();
  for (const [label, value] of Object.entries({ 'Billing first name': 'Alex', 'Billing last name': 'Retained', 'Billing email': 'retained@example.test', 'Billing phone': '+1 312 555 0134', 'Street address': '10 Test Avenue', City: 'Chicago' })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United States' });
  await page.getByLabel('Same as billing contact', { exact: true }).check();
  await page.getByRole('button', { name: /continue to review/i }).click();
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
}

test('GPS selection silently recovers an expired main session without losing its trip', async ({ page }) => {
  await trip(page); const control = controls.get(page); control.expired = true;
  await page.getByRole('button', { name: 'Use current location', exact: true }).click();
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue(gpsAddress);
  await expect(page.getByTestId('total-duration')).toHaveText('30 min');
  await expect(page.locator('[data-pickup-timezone]')).toHaveCount(0);
  await expect.poll(() => control.renewals).toBe(1);
  await expect(page.getByLabel('Drop-off location', { exact: true })).toHaveValue('Selected airport, Chicago');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(date);
  await expect(page.getByLabel('Pickup time', { exact: true })).toHaveValue('14:44');
  await expect(page.locator('body')).not.toContainText('session has expired');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeEnabled();
});

test('final submission resumes the same booking identity and preserves all review details', async ({ page }) => {
  await review(page); const control = controls.get(page); control.expired = true;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#thank-you$/);
  await expect(page.locator('body')).toContainText('TUX-SESSION-RECOVERED');
  expect(control.renewals).toBe(1); expect(control.accepted).toBe(1);
  expect(control.bookingBodies[0].booking.billing.email).toBe('retained@example.test');
  expect(control.bookingBodies[0].booking.consent).toBe(true);
  const posts = control.calls.filter(call => call.path === 'bookings');
  expect(posts).toHaveLength(2); expect(posts[1].body).toEqual(posts[0].body);
});

test('a lost successful reply followed by session expiry cannot create duplicate reservations', async ({ page }) => {
  await review(page); const control = controls.get(page); control.loseReply = true;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page.locator('#booking-form > .form-error')).toContainText(/could not confirm/i);
  expect(control.accepted).toBe(1); control.expired = true;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#thank-you$/);
  expect(control.accepted).toBe(1); expect(control.renewals).toBe(1);
  expect(control.bookingBodies).toHaveLength(2);
  expect(control.bookingBodies[1]).toEqual(control.bookingBodies[0]);
});

test('an expired quick GPS timezone lookup resumes in place without discarding selected locations', async ({ page }) => {
  await page.goto('/session-quick/'); const control = controls.get(page);
  await choose(page, 'Drop-off Location', 'Selected airport, Chicago');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:44');
  control.expired = true;
  await page.getByRole('button', { name: 'Use current location', exact: true }).click();
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveValue(gpsAddress);
  await expect(page.locator('[data-quick-timezone]')).toContainText('Central Time');
  expect(control.renewals).toBe(1);
  await expect(page.getByLabel('Drop-off Location', { exact: true })).toHaveValue('Selected airport, Chicago');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(date);
  await expect(page.getByLabel('Pickup time', { exact: true })).toHaveValue('14:44');
  await expect(page.locator('.tuxano-quick-booking-error')).toBeHidden();
  expect(control.accepted).toBe(0);
});

test('an unrelated forbidden response never reissues a booking or silently replaces its session', async ({ page }) => {
  await review(page); const control = controls.get(page); control.originBlocked = true;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#review$/);
  await expect(page.locator('#booking-form > .form-error')).toContainText('Please use the booking form on this website.');
  expect(control.renewals).toBe(0); expect(control.accepted).toBe(0);
  await expect(page.getByRole('checkbox', { name: /I agree to the Terms/i })).toBeChecked();
  await expect(page.locator('body')).toContainText('retained@example.test');
});

test('known session expiry renews before protected work while the initial form and nonce stay intact', async ({ page }) => {
  const control = controls.get(page); control.initialExpiry = Date.now() / 1000 - 1;
  await trip(page);
  expect(control.fresh).toBe(1); expect(control.renewals).toBe(1);
  expect(control.calls.every(call => !call.headers['x-wp-nonce'])).toBe(true);
  await expect(page.getByLabel('Pickup time', { exact: true })).toHaveValue('14:44');
});

test('a refreshed quote with changed tariffs requires a fresh review instead of automatic submission', async ({ page }) => {
  await review(page); const control = controls.get(page); control.expireWithNewPrice = true;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
  expect(control.accepted).toBe(0);
  await expect(page.locator('.vehicle-price')).toContainText('$170');
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await page.getByRole('button', { name: /continue to contact/i }).click();
  await expect(page.getByLabel('Billing email', { exact: true })).toHaveValue('retained@example.test');
  await expect(page.getByLabel('Billing last name', { exact: true })).toHaveValue('Retained');
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page.getByRole('checkbox', { name: /I agree to the Terms/i })).not.toBeChecked();
  expect(control.accepted).toBe(0);
});

test('tariffs changed before the first route are refreshed before a vehicle estimate can be selected', async ({ page }) => {
  await page.goto('/session-main/');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeVisible();
  const control = controls.get(page);
  control.routeRevision = 'e'.repeat(64); control.serverRevision = 'e'.repeat(64); control.vehicleBase = 100;
  await fillTrip(page);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('.vehicle-price')).toContainText('$170');
  await expect(page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true })).toBeEnabled();
  expect(control.renewals).toBeGreaterThanOrEqual(1);
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(0);
  await page.getByRole('button', { name: 'Edit Trip', exact: true }).click();
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue('Selected pickup, Chicago');
  await expect(page.getByLabel('Drop-off location', { exact: true })).toHaveValue('Selected airport, Chicago');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(date);
  await expect(page.getByLabel('Pickup time', { exact: true })).toHaveValue('14:44');
});

test('an expired availability quote with changed tariffs requires selecting the newly priced vehicle again', async ({ page }) => {
  await trip(page); const control = controls.get(page);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page.locator('.vehicle-price')).toContainText('$120');
  control.expireAvailability = true;
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('.vehicle-price')).toContainText('$170');
  await expect(page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true })).toBeEnabled();
  expect(control.renewals).toBeGreaterThanOrEqual(1);
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(0);
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  expect(control.accepted).toBe(0);
});

test('a failed pricing metadata refresh retains all contact data and cannot be bypassed by retrying submission', async ({ page }) => {
  await review(page); const control = controls.get(page);
  control.expireWithNewPrice = true; control.failRenewals = true;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#review$/);
  await expect(page.locator('#booking-form > .form-error')).toContainText(/try again|refreshed/i);
  await expect(page.locator('body')).toContainText('retained@example.test');
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
  expect(control.accepted).toBe(0);
  const failedRenewals = control.renewals;
  await page.evaluate(() => {
    const notice = document.querySelector('#booking-form > .form-error');
    window.__nextRenewalNotice = new Promise(resolve => {
      const observer = new MutationObserver(() => {
        if (notice.textContent.includes('could not reconnect')) { observer.disconnect(); resolve(); }
      });
      observer.observe(notice, { childList: true, characterData: true, subtree: true });
    });
  });
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect.poll(() => control.renewals).toBeGreaterThan(failedRenewals);
  await page.evaluate(() => window.__nextRenewalNotice);
  await expect(page.locator('#booking-form > .form-error')).toContainText(/could not reconnect/i);
  await expect(page).toHaveURL(/#review$/);
  await expect(page.locator('body')).toContainText('retained@example.test');
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
  expect(control.accepted).toBe(0);
  control.failRenewals = false;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('.vehicle-price')).toContainText('$170');
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await page.getByRole('button', { name: /continue to contact/i }).click();
  await expect(page.getByLabel('Billing email', { exact: true })).toHaveValue('retained@example.test');
  await expect(page.getByLabel('Billing last name', { exact: true })).toHaveValue('Retained');
  expect(control.accepted).toBe(0);
});

test('a failed route verification during a pricing refresh cannot mark the new tariffs as reviewed', async ({ page }) => {
  await review(page); const control = controls.get(page);
  control.expireWithNewPrice = true; control.failRouteAfterRenewal = true;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#review$/);
  await expect(page.locator('#booking-form > .form-error')).toContainText(/could not be verified/i);
  await expect(page.locator('body')).toContainText('retained@example.test');
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
  expect(control.accepted).toBe(0);
  const routeAttempts = control.calls.filter(call => call.path === 'route').length;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect.poll(() => control.calls.filter(call => call.path === 'route').length).toBeGreaterThan(routeAttempts);
  await expect(page).toHaveURL(/#review$/);
  await expect(page.locator('#booking-form > .form-error')).toContainText('The driving route could not be verified. Please try again.');
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
  control.failRouteAfterRenewal = false;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('.vehicle-price')).toContainText('$170');
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
  expect(control.accepted).toBe(0);
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await page.getByRole('button', { name: /continue to contact/i }).click();
  await expect(page.getByLabel('Billing email', { exact: true })).toHaveValue('retained@example.test');
});

for (const change of [
  { name: 'changed route fare', flag: 'expireWithNewMetrics', price: '$140', zone: 'Central Time' },
  { name: 'changed pickup time zone', flag: 'expireWithNewTimezone', price: '$120', zone: 'Eastern Time' },
]) {
  test(`an expired quote with a ${change.name} requires fresh consent even when tariff settings are unchanged`, async ({ page }) => {
    await review(page); const control = controls.get(page); control[change.flag] = true;
    await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
    await expect(page).toHaveURL(/#vehicles$/);
    await expect(page.locator('.vehicle-price')).toContainText(change.price);
    await expect(page.locator('.trip-strip-time')).toContainText(change.zone);
    expect(control.routeRevision).toBe('d'.repeat(64));
    expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
    expect(control.accepted).toBe(0);
    expect(control.bookingBodies[0].booking.trip.time).toBe('14:44');
    await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
    await page.getByRole('button', { name: /continue to contact/i }).click();
    await expect(page.getByLabel('Billing email', { exact: true })).toHaveValue('retained@example.test');
    await expect(page.getByLabel('Billing last name', { exact: true })).toHaveValue('Retained');
    await page.getByRole('button', { name: /continue to review/i }).click();
    await expect(page.getByRole('checkbox', { name: /I agree to the Terms/i })).not.toBeChecked();
    expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(1);
    expect(control.accepted).toBe(0);
  });
}

test('an expired quote with a harmless one-metre route fluctuation retries when rounded fares and time zone stay unchanged', async ({ page }) => {
  await review(page); const control = controls.get(page); control.expireWithTinyMetrics = true;
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#thank-you$/);
  expect(control.calls.filter(call => call.path === 'bookings')).toHaveLength(2);
  expect(control.bookingBodies[1].booking).toEqual(control.bookingBodies[0].booking);
  expect(control.bookingBodies[1].requestKey).toBe(control.bookingBodies[0].requestKey);
  expect(control.accepted).toBe(1);
  await expect(page.locator('body')).toContainText('TUX-SESSION-RECOVERED');
});
