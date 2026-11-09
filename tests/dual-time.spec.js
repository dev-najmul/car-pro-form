import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = `${origin}/wp-json/tuxano-booking/v1/`;
const date = '2030-11-18';
const timezone = 'America/Chicago';
const label = 'Central Time';
const controls = new WeakMap();

test.use({ timezoneId: 'Asia/Dhaka' });
test.beforeEach(async ({ page }) => {
  const control = { errors: [], availability: [], bookings: [], previewLabel: label, availabilityState: 'available' }; controls.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(({ origin, restUrl }) => {
    window.TuxanoBooking = {
      token: 'a'.repeat(64), nonce: 'dual-time-fixture', assetUrl: `${origin}/`, restUrl,
      maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: `${restUrl}route` },
      settings: { companyName: 'TUXANO', timezone: 'UTC', pickupTimezones: true, availabilityChecks: true, termsUrl: 'https://example.test/terms', privacyUrl: 'https://example.test/privacy' },
      vehicles: [{ id: '41', name: 'CITY SEDAN', display: 'City Sedan', capacity: 4, luggageCapacity: 4, image: `${origin}/assets/premium-suv.png`, models: ['Configured sedan'], features: ['Private transfers'], category: 'TEST COLLECTION', tariff: { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 } }],
    };
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] };
  }, { origin, restUrl });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route(`${restUrl}timezone`, route => route.fulfill({ json: { timezone: control.previewLabel === label ? timezone : 'America/New_York', label: control.previewLabel } }));
  const metrics = { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', pickupTimezone: timezone, pickupTimezoneLabel: label };
  await page.route(`${restUrl}route`, route => route.fulfill({ json: { ...metrics, quoteToken: 'b'.repeat(64) } }));
  await page.route(`${restUrl}availability`, route => {
    control.availability.push(route.request().postDataJSON());
    return route.fulfill({ json: { state: control.availabilityState, message: control.availabilityState === 'requested' ? 'Availability is not guaranteed while another request awaits review.' : 'Available' } });
  });
  await page.route(`${restUrl}bookings`, route => {
    control.bookings.push(route.request().postDataJSON());
    return route.fulfill({ json: { requestId: 'TUX-DUAL-TIME-244', route: metrics, pricing: { transportation: 120, carCost: 0, boosterCost: 0, seats: 0, meet: 0, percent: 20, tip: 24, total: 144, currency: 'USD' } } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeVisible();
});
test.afterEach(async ({ page }) => { expect(controls.get(page).errors).toEqual([]); });
async function choose(page, field, value) {
  await page.getByLabel(field, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function trip(page, time) {
  await choose(page, 'Pickup location', 'Selected pickup, Chicago');
  await choose(page, 'Drop-off location', 'Selected airport, Chicago');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill(time);
  await expect(page.getByTestId('total-duration')).toHaveText('30 min');
}
async function vehicles(page) {
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
}
async function passengers(page) {
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
}
async function review(page) {
  await page.getByRole('button', { name: /continue to contact/i }).click();
  for (const [field, value] of Object.entries({ 'Billing first name': 'Alex', 'Billing last name': 'Smith', 'Billing email': 'alex@example.test', 'Billing phone': '+1 312 555 0134', 'Street address': '10 Test Avenue', City: 'Chicago' })) await page.getByLabel(field, { exact: true }).fill(value);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United States' });
  await page.getByLabel('Same as billing contact', { exact: true }).check();
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#review$/);
}
const secondary = scope => scope.locator('[data-time24-value]');

for (const [time, primary] of [['00:05', '12:05 AM'], ['12:00', '12:00 PM'], ['14:44', '2:44 PM'], ['23:59', '11:59 PM']]) {
  test(`${time} keeps its stored clock and restricts the alternate display to trip summaries`, async ({ page }) => {
    await trip(page, time);
    await expect(page.locator('[data-display="trip.time"]')).toHaveText(primary);
    await expect(page.locator('.picker-time-24h, [data-time24]')).toHaveCount(0);
    await expect(page.getByLabel('Pickup time', { exact: true })).toHaveValue(time);
    await vehicles(page);
    await expect(page.locator('.trip-strip .time-12h')).toHaveText(`${primary} (${label})`);
    await expect(page.locator('.trip-strip [data-time24]')).toHaveCount(0);
    await passengers(page);
    await expect(secondary(page.locator('.trip-summary'))).toHaveText(`${time} (${label})`);
    expect(controls.get(page).availability.at(-1)).toMatchObject({ date, time, quoteToken: 'b'.repeat(64) });
    expect(controls.get(page).availability.at(-1)).not.toHaveProperty('time24');
  });
}

test('both time formats follow the authoritative route zone rather than a provisional preview', async ({ page }) => {
  controls.get(page).previewLabel = 'Eastern Time';
  await choose(page, 'Pickup location', 'Selected pickup, Chicago');
  await page.getByLabel('Pickup time', { exact: true }).fill('14:44');
  await expect(page.locator('[data-pickup-timezone]')).toHaveCount(0);
  await expect(page.locator('.picker-time-24h, [data-time24]')).toHaveCount(0);
  await choose(page, 'Drop-off location', 'Selected airport, Chicago');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await expect(page.getByTestId('total-duration')).toHaveText('30 min');
  await expect(page.locator('[data-pickup-timezone]')).toHaveCount(0);
  await vehicles(page);
  await expect(page.locator('.trip-strip .time-12h')).toHaveText('2:44 PM (Central Time)');
  await expect(page.locator('.trip-strip [data-time24]')).toHaveCount(0);
  await passengers(page);
  await expect(secondary(page.locator('.trip-summary'))).toHaveText('14:44 (Central Time)');
});

test('summaries, review and the saved receipt retain a secondary clock without adding booking authority', async ({ page }) => {
  await trip(page, '14:44'); await vehicles(page); await passengers(page);
  await expect(secondary(page.locator('.trip-summary'))).toHaveText('14:44 (Central Time)');
  await review(page);
  const dateRow = page.locator('.review-block').first().locator('.detail-rows > div').filter({ has: page.locator('dt', { hasText: 'Date & Time:' }) });
  await expect(dateRow.locator('dd')).toContainText('2:44 PM (Central Time)');
  await expect(secondary(dateRow)).toHaveText('14:44 (Central Time)');
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#thank-you$/);
  await expect(page.locator('.received-date')).toContainText('2:44 PM (Central Time)');
  await expect(secondary(page.locator('.received-date'))).toHaveText('14:44 (Central Time)');
  const body = controls.get(page).bookings[0];
  expect(body.booking.trip.time).toBe('14:44');
  expect(body.booking.trip).not.toHaveProperty('time24');
  expect(body.booking.trip).not.toHaveProperty('time12');
  await expect(page.locator('.thank-content')).toContainText('$144.00');
});

test('phone keeps the compact strip single-clock and shows the alternate only in its summary', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await trip(page, '14:44'); await vehicles(page);
  await expect(page.locator('.trip-strip [data-time24]')).toHaveCount(0);
  await expect(page.locator('.trip-strip .time-12h')).toHaveText('2:44 PM (Central Time)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.locator('.trip-strip').screenshot({ path: '/tmp/tuxano-246-compact-phone.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.trip-strip [data-time24]')).toHaveCount(0);
  await page.locator('.trip-strip').screenshot({ path: '/tmp/tuxano-246-compact-desktop.png' });
  await passengers(page);
  const primary = await page.locator('.trip-summary .separate-time').boundingBox();
  const alternate = await page.locator('.trip-summary [data-time24]').boundingBox();
  expect(alternate.y).toBeGreaterThanOrEqual(primary.y + primary.height);
  await expect(secondary(page.locator('.trip-summary'))).toHaveText('14:44 (Central Time)');
});

test('changing or clearing the Step 1 time never adds an alternate helper', async ({ page }) => {
  for (const [raw, primary] of [['14:44', '2:44 PM'], ['00:05', '12:05 AM'], ['', 'Select a time']]) {
    await page.getByLabel('Pickup time', { exact: true }).fill(raw);
    await expect(page.locator('[data-display="trip.time"]')).toHaveText(primary);
    await expect(page.locator('.picker-time-24h, [data-time24]')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await expect(page.locator('.picker-time-24h, [data-time24]')).toHaveCount(0);
});

test('availability notices keep the primary clock while the confirmed summary retains both formats', async ({ page }) => {
  controls.get(page).availabilityState = 'requested';
  await trip(page, '14:44'); await vehicles(page);
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  const dialog = page.locator('.availability-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.availability-slot')).toContainText('2:44 PM (Central Time)');
  await expect(dialog.locator('[data-time24]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Continue with request', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  await expect(secondary(page.locator('.trip-summary'))).toHaveText('14:44 (Central Time)');
});
