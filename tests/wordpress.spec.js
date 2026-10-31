import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

// Exercise the shared form with a WordPress session, rather than duplicating
// the static form's visual/field coverage. Provider and REST replies are fixed
// so changes to admin-configured prices and durable submission are observable.
const origin = 'http://127.0.0.1:4173';
const restUrl = `${origin}/wp-json/tuxano-booking/v1/`;
const metrics = { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', calculatedAt: '2026-10-19T00:00:00Z', quoteToken: 'b'.repeat(64) };
const pickupDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const tariff = { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 };
const runtime = {
  token: 'a'.repeat(64), nonce: 'test-wordpress-nonce', assetUrl: `${origin}/`, restUrl,
  maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: `${restUrl}route` },
  settings: {
    currency: 'GBP', currencySymbol: '£', meetPrice: 17.5, firstSeatPrice: 22,
    additionalSeatPrice: 9, defaultGratuity: 12.5, companyName: 'Test Chauffeurs',
    supportEmail: 'bookings@example.com', supportPhone: '+44 20 7946 0123',
    website: 'https://example.com', termsUrl: 'https://example.com/terms', privacyUrl: 'https://example.com/privacy',
    maxStops: 1, minHours: 4, maxHours: 8,
  },
  vehicles: [
    { id: '104', name: 'CITY SEDAN', display: 'City Sedan', capacity: 2, luggageCapacity: 1, image: `${origin}/assets/premium-suv.png`, models: ['Configured sedan'], features: ['Admin-configured service'], category: 'AIRPORT COLLECTION', categoryDescription: 'Our airport vehicles.', tariff },
    { id: '209', name: 'GROUP SHUTTLE', display: 'Group Shuttle', capacity: 8, luggageCapacity: 10, image: `${origin}/assets/luxury-suv.png`, models: ['Configured shuttle'], features: ['Group transfers'], category: 'GROUP TRAVEL', categoryDescription: 'Travel together.', tariff: { ...tariff, base: 100, hourly: 120 } },
  ],
};
const controls = new WeakMap();

test.beforeEach(async ({ page, context }) => {
  const control = { routes: [], submissions: [], errors: [], bookingHandler: null, routeResult: metrics };
  controls.set(page, control);
  await context.addCookies([{ name: 'wordpress_test_session', value: 'present', url: origin }]);
  await page.addInitScript(config => {
    globalThis.TuxanoBooking = config;
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] };
  }, runtime);
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route('https://maps.gstatic.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=', 'base64') }));
  await page.route(`${restUrl}route`, async route => {
    control.routes.push({ body: route.request().postDataJSON(), headers: await route.request().allHeaders() });
    await route.fulfill({ json: control.routeResult });
  });
  await page.route(`${restUrl}bookings`, async route => {
    control.submissions.push({ body: route.request().postDataJSON(), headers: await route.request().allHeaders() });
    if (control.bookingHandler) await control.bookingHandler(route, control.submissions.length);
    else await route.fulfill({ json: receipt() });
  });
  page.on('pageerror', error => control.errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(controls.get(page).errors, 'No unhandled WordPress runtime exceptions').toEqual([]);
});

function savedRoute({ distanceMeters, durationSeconds, provider, calculatedAt } = metrics) {
  return { distanceMeters, durationSeconds, provider, calculatedAt };
}
function receipt() {
  return {
    requestId: 'TUX-REQUEST-WP-1001', route: savedRoute(),
    // Deliberately differs from the browser estimate to prove the saved server
    // receipt, rather than the untrusted client total, drives the final screen.
    pricing: { transportation: 200, carCost: 22, boosterCost: 9, seats: 31, meet: 17.5, percent: 12.5, tip: 25, total: 273.5, currency: 'GBP' },
  };
}
async function choosePlace(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-expanded', 'false');
}
async function trip(page, { stop = false } = {}) {
  await choosePlace(page, 'Pickup location', 'Selected Pickup, London');
  await choosePlace(page, 'Drop-off location', 'Selected Destination, London');
  if (stop) {
    await page.getByRole('button', { name: 'Add stop', exact: true }).click();
    await choosePlace(page, 'Stop 1', 'Selected Stop, London');
    await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('10');
  }
  await page.getByLabel('Date', { exact: true }).fill(pickupDate);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue(stop ? '40 min' : '30 min');
}
async function passengers(page, options) {
  await trip(page, options);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
}
async function toggle(page, name, checked) {
  const input = page.getByLabel(name, { exact: true });
  if (await input.isChecked() !== checked) await input.click();
}
async function review(page) {
  await passengers(page);
  await page.getByRole('button', { name: /continue to contact/i }).click();
  for (const [label, value] of Object.entries({
    'Billing first name': 'Alex', 'Billing last name': 'Smith', 'Billing email': 'alex@example.com',
    'Billing phone': '+44 2079460123', 'Street address': '15 Test Road', 'City': 'London', 'ZIP / Postal Code': 'SW1A 1AA',
  })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United Kingdom' });
  await page.getByLabel('State / Province', { exact: true }).fill('London');
  await toggle(page, 'Same as billing contact', true);
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#review$/);
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
}
async function total(page, amount) {
  await expect(page.locator('[data-testid="estimated-total"]:visible').last()).toHaveText(`£${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}
function submitButton(page) { return page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }); }

test('admin fleet, categories, tariffs, currency, extras and separate luggage capacity replace static defaults', async ({ page }) => {
  await page.goto('/');
  await trip(page, { stop: true });
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AIRPORT COLLECTION', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'GROUP TRAVEL', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Select & continue with / })).toHaveCount(2);
  await expect(page.locator('.vehicle-card').filter({ has: page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }) })).toContainText('£150');
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page.getByRole('button', { name: '12.5%', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await total(page, 168.75); // (50 + 20mi*2 + 30min*1 + 10min*3) * 1.125.
  await page.getByRole('button', { name: 'Increase passengers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Increase passengers', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Increase luggage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Increase luggage', exact: true })).toBeDisabled();
  await toggle(page, 'Meet & Greet', true);
  await toggle(page, 'Child Seats', true);
  await page.getByRole('button', { name: 'Increase car seats', exact: true }).click();
  await page.getByRole('button', { name: 'Increase booster seats', exact: true }).click();
  await expect(page.locator('.seat-area')).toContainText('First seat £22');
  await expect(page.locator('.seat-area')).toContainText('Each additional seat £9');
  await total(page, 217.25); // Transportation 150 + tip18.75 + meet17.50 + seats31.
  const requests = controls.get(page).routes;
  expect(requests.at(-1).body.stops).toEqual([{ placeId: 'test-' + encodeURIComponent('Selected Stop, London') }]);
  expect(requests.at(-1).headers).toMatchObject({ 'x-tuxano-session': runtime.token, 'x-wp-nonce': runtime.nonce, 'content-type': 'application/json' });
  expect(requests.at(-1).headers.cookie).toContain('wordpress_test_session=present');
});

test('admin stop and hourly bounds govern controls and hourly quotation', async ({ page }) => {
  await page.goto('/');
  await trip(page, { stop: true });
  const addStop = page.getByRole('button', { name: 'Add stop', exact: true });
  expect(await addStop.count() === 0 || await addStop.isDisabled()).toBe(true);
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  const hours = page.getByLabel('Hours', { exact: true });
  await expect(hours).toHaveAttribute('type', 'number');
  await expect(hours).toHaveAttribute('min', '4');
  await expect(hours).toHaveAttribute('max', '8');
  await expect(hours).toHaveValue('4');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await total(page, 438.75); // (4hr*80 + 20mi*2 + 10min*3) * 1.125.
});

test('pending booking waits for durable save; a rejected request retries with the same key and displays the server receipt', async ({ page }) => {
  const control = controls.get(page);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  control.bookingHandler = async (route, count) => {
    if (count === 1) {
      await pending;
      await route.fulfill({ status: 503, json: { code: 'tuxano_save_failed', message: 'The reservation could not be saved. Please try again.', data: { status: 503 } } });
    } else await route.fulfill({ json: receipt() });
  };
  await page.goto('/');
  await review(page);
  await submitButton(page).click();
  await expect.poll(() => control.submissions.length).toBe(1);
  await expect(page).toHaveURL(/#review$/);
  await expect(page.getByRole('button', { name: /submitting/i })).toBeDisabled();
  await page.locator('#booking-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(control.submissions).toHaveLength(1);
  await expect(page.getByRole('heading', { name: /thank you/i })).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await expect(submitButton(page)).toBeEnabled();
  await submitButton(page).click();
  await expect(page).toHaveURL(/#thank-you$/);
  expect(control.submissions).toHaveLength(2);
  const [first, second] = control.submissions;
  expect(first.body.requestKey).toMatch(/^[a-zA-Z0-9-]{16,80}$/);
  expect(second.body).toEqual(first.body);
  expect(second.body).toMatchObject({ quoteToken: metrics.quoteToken, website: '', booking: { vehicle: '104', consent: true, billing: { email: 'alex@example.com' } } });
  expect(second.headers).toMatchObject({ 'x-tuxano-session': runtime.token, 'x-wp-nonce': runtime.nonce, 'content-type': 'application/json' });
  await expect(page.locator('body')).toContainText('TUX-REQUEST-WP-1001');
  await total(page, 273.5);
  await expect(page.getByRole('link', { name: 'bookings@example.com', exact: true })).toHaveAttribute('href', 'mailto:bookings@example.com');
  await expect(page.locator('body')).not.toContainText('static demonstration');
});

test('a lost response retains the booking for idempotent retry instead of showing false success', async ({ page }) => {
  const control = controls.get(page);
  control.bookingHandler = async (route, count) => count === 1 ? route.abort('failed') : route.fulfill({ json: receipt() });
  await page.goto('/');
  await review(page);
  await submitButton(page).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/#review$/);
  await expect(page.locator('body')).toContainText('alex@example.com');
  await submitButton(page).click();
  await expect(page).toHaveURL(/#thank-you$/);
  expect(control.submissions).toHaveLength(2);
  expect(control.submissions[1].body.requestKey).toBe(control.submissions[0].body.requestKey);
  expect(control.submissions[1].body.quoteToken).toBe(metrics.quoteToken);
});

test('an expired route quote is replaced before retrying the retained booking', async ({ page }) => {
  const control = controls.get(page);
  control.bookingHandler = async (route, count) => {
    if (count === 1) await route.fulfill({ status: 409, json: { code: 'tuxano_quote_expired', message: 'Your route quote has expired. Recalculate the route and try again.', data: { status: 409 } } });
    else await route.fulfill({ json: { ...receipt(), route: savedRoute(control.routeResult) } });
  };
  await page.goto('/');
  await review(page);
  await submitButton(page).click();
  await expect(page.getByRole('alert')).toContainText('quote has expired');
  await expect(page).toHaveURL(/#review$/);
  control.routeResult = { ...metrics, quoteToken: 'c'.repeat(64) };
  await submitButton(page).click();
  await expect(page).toHaveURL(/#thank-you$/);
  expect(control.routes).toHaveLength(2);
  expect(control.submissions).toHaveLength(2);
  expect(control.submissions[0].body.quoteToken).toBe(metrics.quoteToken);
  expect(control.submissions[1].body.quoteToken).toBe('c'.repeat(64));
  expect(control.submissions[1].body.requestKey).toBe(control.submissions[0].body.requestKey);
});

test('reopening an unchanged receipt avoids a duplicate while editing starts a freshly quoted request', async ({ page }) => {
  const control = controls.get(page);
  control.bookingHandler = async (route, count) => route.fulfill({ json: { ...receipt(), requestId: `TUX-REQUEST-WP-100${count}` } });
  await page.goto('/');
  await review(page);
  await submitButton(page).click();
  await expect(page).toHaveURL(/#thank-you$/);
  await expect(page.locator('body')).toContainText('TUX-REQUEST-WP-1001');
  await page.evaluate(() => { location.hash = 'review'; });
  await expect(submitButton(page)).toBeVisible();
  await submitButton(page).click();
  await expect(page).toHaveURL(/#thank-you$/);
  expect(control.submissions).toHaveLength(1);

  await page.evaluate(() => { location.hash = 'vehicles'; });
  control.routeResult = { ...metrics, quoteToken: 'd'.repeat(64) };
  await page.getByRole('button', { name: 'Select & continue with Group Shuttle', exact: true }).click();
  await page.getByRole('button', { name: 'Step 5: Review & Submit', exact: true }).click();
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
  await submitButton(page).click();
  await expect(page).toHaveURL(/#thank-you$/);
  await expect(page.locator('body')).toContainText('TUX-REQUEST-WP-1002');
  expect(control.routes).toHaveLength(2);
  expect(control.submissions).toHaveLength(2);
  expect(control.submissions[1].body.booking.vehicle).toBe('209');
  expect(control.submissions[1].body.requestKey).not.toBe(control.submissions[0].body.requestKey);
  expect(control.submissions[1].body.quoteToken).toBe('d'.repeat(64));
});

test('WordPress ignores forged static storage and a thank-you fragment without a saved receipt', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('tuxano-booking-v1', JSON.stringify({
      submitted: true, requestId: 'TUX-REQUEST-FORGED', completed: 4, vehicle: '104',
      billing: { email: 'forged@example.com' }, trip: { pickup: 'Forged pickup', dropoff: 'Forged destination' },
    }));
  });
  await page.goto('/#thank-you');
  await expect(page).toHaveURL(/#trip$/);
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('TUX-REQUEST-FORGED');
  await expect(page.locator('body')).not.toContainText('forged@example.com');
  expect(controls.get(page).submissions).toHaveLength(0);
  await choosePlace(page, 'Pickup location', 'Private pickup, London');
  const saved = await page.evaluate(() => sessionStorage.getItem('tuxano-booking-v1'));
  expect(saved || '').not.toContain('Private pickup');
});

test('demo query cannot replace a live WordPress form with fixtures or bypass real route validation', async ({ page }) => {
  await page.goto('/?demo=1#review');
  await expect(page).toHaveURL(/#trip$/);
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#trip$/);
  await expect(page.locator('body')).not.toContainText('Emily Smith');
  expect(controls.get(page).routes).toHaveLength(0);
  expect(controls.get(page).submissions).toHaveLength(0);
});
