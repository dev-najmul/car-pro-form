import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const pickupDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const metrics = { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', quoteToken: 'b'.repeat(64) };
const tariff = { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 };
const runtime = {
  token: 'a'.repeat(64), nonce: 'test-availability-nonce', restUrl, assetUrl: origin + '/',
  maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: restUrl + 'route' },
  settings: { currency: 'USD', currencySymbol: '$', companyName: 'Test Chauffeurs', minHours: 2, maxHours: 12, defaultGratuity: 20, maxStops: 5, timezone: 'UTC', availabilityChecks: true },
  vehicles: [
    { id: '104', name: 'CITY SEDAN', display: 'City Sedan', capacity: 4, luggageCapacity: 4, image: origin + '/assets/premium-suv.png', models: ['Configured sedan'], features: ['City transfers'], category: 'CITY COLLECTION', categoryDescription: 'City vehicles.', tariff },
    { id: '209', name: 'GROUP SHUTTLE', display: 'Group Shuttle', capacity: 8, luggageCapacity: 10, image: origin + '/assets/luxury-suv.png', models: ['Configured shuttle'], features: ['Group transfers'], category: 'GROUP COLLECTION', categoryDescription: 'Group vehicles.', tariff },
  ],
};
const controls = new WeakMap();
const replies = {
  available: { state: 'available', message: 'This vehicle has no confirmed booking at your pickup date and time.' },
  requested: { state: 'requested', message: 'Another request is awaiting review for this vehicle at your pickup date and time. Availability is not guaranteed.' },
  unavailable: { state: 'unavailable', message: 'This vehicle already has a confirmed booking at your pickup date and time. Please choose another vehicle or pickup time.' },
};

test.beforeEach(async ({ page }) => {
  const control = { calls: [], submissions: [], errors: [], states: { '104': 'available', '209': 'available' }, handler: null, bookingHandler: null };
  controls.set(page, control);
  await page.addInitScript(config => {
    globalThis.TuxanoBooking = config;
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] };
  }, runtime);
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route(restUrl + 'route', route => route.fulfill({ json: metrics }));
  await page.route(restUrl + 'availability', async route => {
    const request = { body: route.request().postDataJSON(), headers: await route.request().allHeaders() };
    control.calls.push(request);
    if (control.handler) return control.handler(route, request, control.calls.length);
    await route.fulfill({ json: replies[control.states[request.body.vehicleId]] || replies.available });
  });
  await page.route(restUrl + 'bookings', async route => {
    control.submissions.push(route.request().postDataJSON());
    if (control.bookingHandler) return control.bookingHandler(route);
    return route.abort();
  });
  page.on('pageerror', error => control.errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(controls.get(page).errors, 'Availability checks do not raise uncaught page errors').toEqual([]);
});

const dialog = page => page.locator('dialog[data-availability-dialog]');
async function choosePlace(page, label, query) {
  await page.getByLabel(label, { exact: true }).fill(query);
  await page.getByRole('option', { name: query, exact: true }).click();
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(query);
}
async function vehicles(page) {
  await page.goto('/');
  await choosePlace(page, 'Pickup location', 'Confirmed pickup, London');
  await choosePlace(page, 'Drop-off location', 'Confirmed destination, London');
  await page.getByLabel('Date', { exact: true }).fill(pickupDate);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
}
async function select(page, name = 'City Sedan') {
  await page.getByRole('button', { name: `Select & continue with ${name}`, exact: true }).click();
}
async function availableSelection(page, name = 'City Sedan') {
  const before = controls.get(page).calls.length;
  await select(page, name);
  await expect.poll(() => controls.get(page).calls.length).toBeGreaterThan(before);
  await expect(page).toHaveURL(/#passengers$/);
  await expect(dialog(page)).toBeHidden();
}
async function passengers(page) {
  await vehicles(page);
  await availableSelection(page);
  await expect(page).toHaveURL(/#passengers$/);
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
  await page.getByLabel('Same as billing contact', { exact: true }).check();
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#review$/);
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
}

test('confirmed vehicle slot blocks continuation while a different vehicle at the same time remains available', async ({ page }) => {
  const control = controls.get(page); control.states['104'] = 'unavailable';
  await vehicles(page); await select(page);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('heading', { name: 'Vehicle already booked', exact: true })).toBeVisible();
  await expect(dialog(page)).toContainText('confirmed booking');
  await expect(page).toHaveURL(/#vehicles$/);
  expect(control.calls[0].body).toEqual({ vehicleId: '104', date: pickupDate, time: '14:30' });
  expect(control.calls[0].headers).toMatchObject({ 'x-tuxano-session': runtime.token, 'content-type': 'application/json' });
  expect(control.calls[0].body).not.toHaveProperty('email');
  await dialog(page).getByRole('button', { name: 'Choose another vehicle', exact: true }).click();
  await availableSelection(page, 'Group Shuttle');
  await expect(page).toHaveURL(/#passengers$/);
  expect(control.calls.at(-1).body).toEqual({ vehicleId: '209', date: pickupDate, time: '14:30' });
  expect(control.submissions).toHaveLength(0);
});

test('a pending request requires explicit acknowledgement and does not reserve or automatically submit the slot', async ({ page }) => {
  const control = controls.get(page); control.states['104'] = 'requested';
  await vehicles(page); await select(page);
  await expect(dialog(page).getByRole('heading', { name: 'Another request is awaiting review', exact: true })).toBeVisible();
  await expect(dialog(page)).toContainText('Availability is not guaranteed');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await select(page);
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(/#vehicles$/);
  await dialog(page).getByRole('button', { name: 'Continue with request', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  expect(control.calls.length).toBeGreaterThanOrEqual(2);
  expect(control.submissions).toHaveLength(0);
});

test('a fresh selection after returning from passengers blocks a newly confirmed booking', async ({ page }) => {
  const control = controls.get(page); control.states['104'] = 'requested';
  await vehicles(page); await select(page);
  await dialog(page).getByRole('button', { name: 'Continue with request', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  await page.getByRole('button', { name: 'BACK', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  const before = control.calls.length;
  control.states['104'] = 'unavailable';
  await select(page);
  await expect.poll(() => control.calls.length).toBeGreaterThan(before);
  await expect(dialog(page).getByRole('heading', { name: 'Vehicle already booked', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#vehicles$/);
});

test('an acknowledged pending request remains valid for the unchanged slot after a fresh selection check', async ({ page }) => {
  const control = controls.get(page); control.states['104'] = 'requested';
  await vehicles(page); await select(page);
  await dialog(page).getByRole('button', { name: 'Continue with request', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  await page.getByRole('button', { name: 'BACK', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  const before = control.calls.length;
  await select(page);
  await expect(page).toHaveURL(/#passengers$/);
  expect(control.calls.length).toBeGreaterThan(before);
  await expect(dialog(page)).toBeHidden();
});

test('a delayed response for the previous vehicle cannot open a warning over the new selection', async ({ page }) => {
  const control = controls.get(page); let release;
  control.handler = async (route, request) => {
    if (request.body.vehicleId === '104') {
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ json: replies.unavailable }).catch(() => {});
    } else await route.fulfill({ json: replies.available });
  };
  await vehicles(page); await select(page);
  await expect.poll(() => typeof release).toBe('function');
  await availableSelection(page, 'Group Shuttle');
  release();
  await expect(dialog(page)).toBeHidden();
  await expect(page).toHaveURL(/#passengers$/);
  expect(control.calls.at(-1).body.vehicleId).toBe('209');
});

test('availability retry can acknowledge a newly discovered pending request and re-enable continuation', async ({ page }) => {
  const control = controls.get(page); let fail = true;
  control.handler = (route, request) => fail
    ? route.fulfill({ status: 503, json: { code: 'tuxano_availability_unavailable', message: 'Availability is temporarily unavailable. Please try again.' } })
    : route.fulfill({ json: replies.requested });
  await vehicles(page); await select(page);
  await expect(dialog(page).getByRole('heading', { name: 'Availability could not be checked', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#vehicles$/);
  const before = control.calls.length; fail = false;
  await dialog(page).getByRole('button', { name: /try again/i }).click();
  await expect.poll(() => control.calls.length).toBeGreaterThan(before);
  await expect(dialog(page).getByRole('heading', { name: 'Another request is awaiting review', exact: true })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Continue with request', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page).toHaveURL(/#passengers$/);
});

test('malformed availability replies fail closed instead of allowing an unverified vehicle', async ({ page }) => {
  const control = controls.get(page);
  control.handler = route => route.fulfill({ json: { state: 'probably-available', message: 'Unverified availability' } });
  await vehicles(page); await select(page);
  await expect(dialog(page).getByRole('heading', { name: 'Availability could not be checked', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#vehicles$/);
  expect(control.submissions).toHaveLength(0);
});

test('a late response after returning to Trip cannot show or commit obsolete slot information', async ({ page }) => {
  const control = controls.get(page); let release;
  control.handler = async route => {
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: replies.unavailable }).catch(() => {});
  };
  await vehicles(page); await select(page);
  await expect.poll(() => typeof release).toBe('function');
  await page.goBack();
  await expect(page).toHaveURL(/#trip$/);
  await page.getByLabel('Pickup time', { exact: true }).fill('15:45');
  release();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByLabel('Pickup time', { exact: true })).toHaveValue('15:45');
  expect(control.submissions).toHaveLength(0);
});

test('a server-side confirmation conflict at final submission never shows a false receipt', async ({ page }) => {
  const control = controls.get(page);
  control.bookingHandler = route => route.fulfill({ status: 409, json: { code: 'tuxano_vehicle_unavailable', message: replies.unavailable.message, data: { status: 409 } } });
  await review(page);
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(dialog(page).getByRole('heading', { name: 'Vehicle already booked', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.getByRole('heading', { name: /thank you/i })).toHaveCount(0);
  expect(control.submissions).toHaveLength(1);
});

test.describe('touch phone availability acknowledgement', () => {
  test.use({ viewport: { width: 393, height: 900 }, isMobile: true, hasTouch: true });
  test('requested-time warning fits the phone and can be acknowledged with a tap', async ({ page }) => {
    controls.get(page).states['104'] = 'requested';
    await vehicles(page);
    await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).tap();
    await expect(dialog(page)).toBeVisible();
    const box = await dialog(page).boundingBox();
    expect(box.width).toBeLessThanOrEqual(393);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await dialog(page).getByRole('button', { name: 'Continue with request', exact: true }).tap();
    await expect(page).toHaveURL(/#passengers$/);
  });
});


test('availability dialog stays inside the visible parent viewport in a tall booking iframe', async ({ page }) => {
  controls.get(page).states['104'] = 'unavailable';
  await page.route(origin + '/availability-embed/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div style="height:650px">Site hero above the booking form</div><iframe id="availability-test-frame" data-tuxano-booking-frame src="/" style="display:block;border:0;width:100%;height:3000px"></iframe><div style="height:800px">Site footer after the form</div></body></html>' }));
  await page.goto('/availability-embed/');
  const iframe = page.locator('#availability-test-frame');
  const frame = await (await iframe.elementHandle()).contentFrame();
  await choosePlace(frame, 'Pickup location', 'Embedded pickup, London');
  await choosePlace(frame, 'Drop-off location', 'Embedded destination, London');
  await frame.getByLabel('Date', { exact: true }).fill(pickupDate);
  await frame.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await expect(frame.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await frame.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect.poll(() => new URL(frame.url()).hash).toBe('#vehicles');
  await page.evaluate(() => scrollTo(0, document.querySelector('iframe').offsetTop + 250));
  await frame.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  const modal = dialog(frame); await expect(modal).toBeVisible();
  await expect.poll(async () => {
    const box = await modal.boundingBox();
    return Boolean(box && box.y >= 0 && box.y + box.height <= 1000 && box.x >= 0 && box.x + box.width <= 1440);
  }).toBe(true);
  const first = await modal.boundingBox();
  // A host page can scroll while the child native dialog remains open.
  // The next layout must still place its actionable content in the viewport.
  await page.evaluate(() => scrollBy(0, 140));
  await expect.poll(async () => {
    const box = await modal.boundingBox();
    return Boolean(box && box.y >= 0 && box.y + box.height <= 1000);
  }).toBe(true);
  expect(first.height).toBeLessThan(1000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await modal.getByRole('button', { name: 'Choose another vehicle', exact: true }).click();
  await expect(modal).toBeHidden();
});
