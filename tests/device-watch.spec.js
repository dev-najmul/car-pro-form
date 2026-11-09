import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const controls = new WeakMap();
const original = 'Original confirmed pickup';
const destination = 'Patuakhali, Bangladesh';
const address = '123 Test Road, Barishal, Bangladesh';
const exact = { latitude: 22.7413, longitude: 90.4357, accuracy: 25 };
const input = page => page.getByLabel('Pickup location', { exact: true });
const detect = page => page.getByRole('button', { name: 'Use current location', exact: true });
const map = page => page.getByTestId('pickup-map-picker');

async function install(page) {
  const control = { routes: [], errors: [] }; controls.set(page, control);
  page.on('pageerror', failure => control.errors.push(failure.message));
  await page.addInitScript(({ original, destination, address, exact }) => {
    const id = value => 'test-' + encodeURIComponent(value);
    window.__mapsMock = {
      calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [],
      failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [],
      countries: { [id(original)]: 'BD', [id(destination)]: 'BD' },
      locations: { [id(original)]: { lat: 22.75, lng: 90.40 }, [id(destination)]: { lat: 22.35, lng: 90.32 } },
    };
    window.__geocodeMock = { results: [{ formatted_address: address, geometry: { location: { lat: exact.latitude, lng: exact.longitude } }, types: ['street_address'], address_components: [{ short_name: 'BD', long_name: 'Bangladesh', types: ['country'] }] }] };
    window.__watchMock = { entries: [], clears: [] };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(success, failure, options) { const id = window.__watchMock.entries.length; window.__watchMock.entries.push({ success, failure, options }); return id; },
      clearWatch(id) { window.__watchMock.clears.push(id); },
    } });
  }, { original, destination, address, exact });
  await page.route('**/maps-config.json', route => route.fulfill({ json: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'server' } }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route('**/api/maps/route', route => {
    control.routes.push(route.request().postDataJSON());
    return route.fulfill({ json: { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google' } });
  });
  await page.goto('/');
}
async function place(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
}
async function trip(page) {
  await place(page, 'Pickup location', original); await place(page, 'Drop-off location', destination);
  await expect(page.getByTestId('total-duration')).toHaveText('30 min');
}
async function watch(page, index = 0) {
  await detect(page).click(); await expect.poll(() => page.evaluate(() => window.__watchMock.entries.length)).toBe(index + 1);
}
async function emit(page, index, coords) {
  await page.evaluate(({ index, coords }) => window.__watchMock.entries[index].success({ coords, timestamp: Date.now() }), { index, coords });
}
async function cleared(page, value) { await expect.poll(() => page.evaluate(() => window.__watchMock.clears)).toEqual(value); }

test.afterEach(async ({ page }) => { expect(controls.get(page)?.errors || []).toEqual([]); });

for (const phone of [false, true]) {
  test.describe(phone ? 'phone live-reading improvement' : 'desktop live-reading improvement', () => {
    test.use(phone ? { viewport: { width: 393, height: 900 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 } });
    test('an initial 100 km network fix can improve to a precise address without accepting the wrong point', async ({ page }) => {
      await install(page); await trip(page); const baseline = controls.get(page).routes.length;
      await watch(page); await emit(page, 0, { latitude: 23.7891, longitude: 90.4126, accuracy: 100000 });
      await expect(input(page)).toHaveValue(original);
      expect(controls.get(page).routes).toHaveLength(baseline);
      expect(await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'geocode').length)).toBe(0);
      await emit(page, 0, exact);
      await expect(input(page)).toHaveValue(address); await cleared(page, [0]);
      await expect.poll(() => controls.get(page).routes.at(-1)?.origin).toEqual({ latitude: exact.latitude, longitude: exact.longitude });
      await expect(page.locator('[data-selected-place="pickup"]')).toBeHidden();
      await emit(page, 0, { latitude: 23.7891, longitude: 90.4126, accuracy: 2 });
      await expect(input(page)).toHaveValue(address);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    });
  });
}

test('the best coarse reading opens a correction map and becomes a route only after an exact user choice', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
  await install(page); await trip(page); const baseline = controls.get(page).routes.length;
  await watch(page); await emit(page, 0, { latitude: 23.7891, longitude: 90.4126, accuracy: 100000 });
  await page.clock.fastForward(3000);
  await emit(page, 0, { latitude: 22.7413, longitude: 90.4357, accuracy: 1000 });
  await emit(page, 0, { latitude: 23.1, longitude: 90.4, accuracy: 5000 });
  await page.clock.fastForward(3000);
  await cleared(page, [0]); await expect(map(page)).toBeVisible();
  await expect(page.getByTestId('google-map-mock-canvas')).toBeVisible();
  expect(await page.evaluate(() => window.__mapPickerMock.maps.at(-1).options.center)).toEqual({ lat: 22.7413, lng: 90.4357 });
  await expect(input(page)).toHaveValue(original); expect(controls.get(page).routes).toHaveLength(baseline);
  await expect(page.getByRole('button', { name: 'Use this map point', exact: true })).toBeDisabled();
  await map(page).screenshot({ path: 'wordpress-test-results/gps-241/main-coarse-map.png' });
  await page.evaluate(() => window.__mapPickerMock.click(22.75, 90.43));
  await expect(page.getByRole('button', { name: 'Use this map point', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Use this map point', exact: true }).click();
  await expect.poll(() => controls.get(page).routes.at(-1)?.origin).toEqual({ latitude: 22.75, longitude: 90.43 });
  await expect(page.locator('[data-selected-place="pickup"]')).toBeHidden();
});

test('cancelling current-location detection clears the watch immediately and late GPS callbacks stay cancelled', async ({ page }) => {
  await install(page); await trip(page); const baseline = controls.get(page).routes.length;
  await watch(page); await page.getByRole('button', { name: 'Cancel location detection', exact: true }).click();
  await cleared(page, [0]); await emit(page, 0, exact);
  await expect(input(page)).toHaveValue(original); expect(controls.get(page).routes).toHaveLength(baseline);
  await expect(page.getByTestId('device-location-preview')).toHaveCount(0);
});

test('a retry owns its own watch and cannot be overwritten by the previous cancelled reading', async ({ page }) => {
  await install(page); await trip(page);
  await watch(page); await page.getByRole('button', { name: 'Cancel location detection', exact: true }).click();
  await watch(page, 1); await cleared(page, [0]);
  await emit(page, 0, { latitude: 23.7891, longitude: 90.4126, accuracy: 2 });
  await expect(input(page)).toHaveValue(original);
  await emit(page, 1, exact); await expect(input(page)).toHaveValue(address); await cleared(page, [0, 1]);
  await expect.poll(() => controls.get(page).routes.at(-1)?.origin).toEqual({ latitude: exact.latitude, longitude: exact.longitude });
});

test('typing a different pickup while locating aborts its watch instead of overwriting the user edit', async ({ page }) => {
  await install(page); await trip(page);
  await watch(page); await input(page).fill('My new pickup address'); await cleared(page, [0]);
  await emit(page, 0, exact); await expect(input(page)).toHaveValue('My new pickup address');
  expect(await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'geocode').length)).toBe(0);
});

test('opening the map while locating aborts device tracking and preserves the deliberate map workflow', async ({ page }) => {
  await install(page); await trip(page);
  await watch(page);
  await expect(page.locator('.location-map-open[data-map-field="pickup"]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Choose pickup on map', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Choose pickup on map', exact: true }).click();
  await cleared(page, [0]); await expect(map(page)).toBeVisible();
  await emit(page, 0, exact); await expect(input(page)).toHaveValue(original); await expect(map(page)).toBeVisible();
});
