import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const controls = new WeakMap();
const precise = { latitude: 22.7095, longitude: 90.3667, accuracy: 20 };
const pointId = value => 'test-' + encodeURIComponent(value);
const pickup = page => page.getByLabel('Pickup location', { exact: true });
const detect = page => page.getByRole('button', { name: 'Use current location', exact: true });
const confirm = page => page.getByRole('button', { name: 'Use this pickup location', exact: true });
const preview = page => page.getByTestId('device-location-preview');

test.beforeEach(async ({ page }) => {
  const control = { requests: [], errors: [] };
  controls.set(page, control);
  await page.addInitScript(() => {
    window.__mapsMock = {
      calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [],
      failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [],
      release(kind, key) {
        const selected = this.pending.filter(item => item.kind === kind && item.key === key);
        this.pending = this.pending.filter(item => !selected.includes(item));
        selected.forEach(item => item.resolve());
      },
    };
    window.__deviceMock = { requests: [], pending: [] };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, failure, options) {
        window.__deviceMock.requests.push(options);
        window.__deviceMock.pending.push({ success, failure });
      },
    } });
  });
  await page.route('**/maps-config.json', route => route.fulfill({ json: {
    browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'server',
  } }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route('**/api/maps/route', route => {
    control.requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google' } });
  });
  page.on('pageerror', error => control.errors.push(error.message));
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(controls.get(page).errors).toEqual([]);
});

async function selectPlace(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-expanded', 'false');
}

async function originalTrip(page) {
  await selectPlace(page, 'Pickup location', 'Original confirmed pickup');
  await selectPlace(page, 'Drop-off location', 'Patuakhali, Bangladesh');
  await page.getByLabel('Date', { exact: true }).fill('2027-11-12');
  await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
}

async function respond(page, coords = precise, age = 0) {
  await expect.poll(() => page.evaluate(() => window.__deviceMock.pending.length)).toBeGreaterThan(0);
  await page.evaluate(({ coords, age }) => {
    window.__deviceMock.pending.shift().success({ coords, timestamp: Date.now() - age });
  }, { coords, age });
}

async function fail(page, code) {
  await expect.poll(() => page.evaluate(() => window.__deviceMock.pending.length)).toBeGreaterThan(0);
  await page.evaluate(code => window.__deviceMock.pending.shift().failure({ code }), code);
}

async function settle(page) {
  // Process callbacks, rendering, and an optional zero-delay provider response.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

const mapPicker = page => page.getByTestId('pickup-map-picker');
const mapConfirm = page => page.getByRole('button', { name: 'Use this map point', exact: true });
async function openMap(page) {
  await page.getByRole('button', { name: 'Choose pickup on map', exact: true }).click();
  await expect(page.getByTestId('google-map-mock-canvas')).toBeVisible();
}

test('a 100 km PC estimate offers an exact map correction without accepting its initial center', async ({ page }) => {
  await originalTrip(page);
  const before = controls.get(page).requests.length;
  await detect(page).click();
  await respond(page, { latitude: 23.7891, longitude: 90.4126, accuracy: 100000 });
  await expect(preview(page)).toContainText('100.0 km');
  await openMap(page);
  await expect(mapConfirm(page)).toBeDisabled();
  expect(await page.evaluate(() => window.__mapPickerMock.maps.at(-1).options.center)).toEqual({ lat: 23.7891, lng: 90.4126 });
  await page.evaluate(() => window.__mapPickerMock.maps.at(-1).emit('idle'));
  await expect(mapConfirm(page)).toBeDisabled();
  await page.evaluate(() => window.__mapPickerMock.click(22.7095, 90.3667));
  await expect(mapConfirm(page)).toBeEnabled();
  await expect(mapPicker(page)).toContainText('22.70950, 90.36670');
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  expect(controls.get(page).requests).toHaveLength(before);
  await mapConfirm(page).click();
  await expect.poll(() => controls.get(page).requests.at(-1)?.origin).toEqual({ latitude: 22.7095, longitude: 90.3667 });
  await expect(page.locator('[data-selected-place="pickup"]')).toContainText('Manually selected map point');
  await expect(page.getByTestId('route-distance')).toBeVisible();
});

test('map search is keyboard accessible, does not submit the booking, and uses the selected place coordinates', async ({ page }) => {
  await originalTrip(page);
  await openMap(page);
  await page.evaluate(() => { window.__mapsMock.locations = { ['test-' + encodeURIComponent('Nathullahbad, Barishal')]: { lat: 22.7095, lng: 90.3667 } }; });
  const search = page.getByLabel('Search map for pickup', { exact: true });
  await search.fill('Nathullahbad, Barishal');
  await expect(page.getByRole('option', { name: 'Nathullahbad, Barishal', exact: true })).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/#trip$/);
  await expect(mapConfirm(page)).toBeDisabled();
  await search.press('ArrowDown'); await search.press('Enter');
  await expect(mapConfirm(page)).toBeEnabled();
  await expect(mapPicker(page)).toContainText('22.70950, 90.36670');
  expect(await page.evaluate(() => window.__mapPickerMock.maps.at(-1).getCenter().lat())).toBe(22.7095);
  await search.fill('A different unfinished search');
  await expect(mapConfirm(page)).toBeDisabled();
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  await search.fill('Nathullahbad, Barishal');
  await page.getByRole('option', { name: 'Nathullahbad, Barishal', exact: true }).click();
  await expect(mapConfirm(page)).toBeEnabled();
  await mapConfirm(page).click();
  await expect.poll(() => controls.get(page).requests.at(-1)?.origin).toEqual({ latitude: 22.7095, longitude: 90.3667 });
});

test('map dragging keeps the final exact point and ignores obsolete nearby responses', async ({ page }) => {
  await originalTrip(page); await openMap(page);
  await page.evaluate(() => {
    window.__nearbyMock = { hold: true, places: [{ displayName: 'Old landmark', formattedAddress: 'Wrong old point', location: { lat: () => 22.7, lng: () => 90.3 } }] };
    window.__mapPickerMock.click(22.7, 90.3);
  });
  await expect.poll(() => page.evaluate(() => window.__mapsMock.pending.filter(item => item.kind === 'nearby').length)).toBe(1);
  await page.evaluate(() => { window.__nearbyMock = { places: [] }; window.__mapPickerMock.drag(22.7095, 90.3667); });
  await expect(mapPicker(page)).toContainText('22.70950, 90.36670');
  await page.evaluate(() => window.__mapsMock.release('nearby', 'nearby'));
  await settle(page);
  await expect(mapPicker(page)).not.toContainText('Old landmark');
  await mapConfirm(page).click();
  await expect.poll(() => controls.get(page).requests.at(-1)?.origin).toEqual({ latitude: 22.7095, longitude: 90.3667 });
});

test('opening and cancelling the map invalidates late GPS and map callbacks without changing pickup', async ({ page }) => {
  await originalTrip(page);
  const before = controls.get(page).requests.length;
  await detect(page).click(); await openMap(page);
  await respond(page);
  await expect(mapPicker(page)).toBeVisible();
  await expect(mapConfirm(page)).toBeDisabled();
  await page.evaluate(() => { window.__nearbyMock = { hold: true }; window.__mapPickerMock.click(22.7095, 90.3667); });
  await page.getByRole('button', { name: 'Cancel map selection', exact: true }).click();
  await page.evaluate(() => { window.__mapsMock.release('nearby', 'nearby'); window.__mapPickerMock.drag(23.7891, 90.4126); });
  await settle(page);
  await expect(mapPicker(page)).toHaveCount(0);
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  expect(controls.get(page).requests).toHaveLength(before);
});

test('map selection survives a service rerender but manual pickup typing cancels it', async ({ page }) => {
  await originalTrip(page); await openMap(page);
  await page.evaluate(() => window.__mapPickerMock.click(22.7095, 90.3667));
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await expect(mapConfirm(page)).toBeEnabled();
  await expect(mapPicker(page)).toContainText('22.70950, 90.36670');
  await pickup(page).fill('My different pickup');
  await expect(mapPicker(page)).toHaveCount(0);
  await expect(pickup(page)).toHaveValue('My different pickup');
});

test('map load failure retains manual address search and an obsolete map import cannot reopen a cancelled picker', async ({ page }) => {
  await originalTrip(page);
  await page.evaluate(() => {
    const original = google.maps.importLibrary;
    window.__releaseMapImport = null;
    google.maps.importLibrary = name => name === 'maps' ? new Promise(resolve => { window.__releaseMapImport = () => original(name).then(resolve); }) : original(name);
  });
  await page.getByRole('button', { name: 'Choose pickup on map', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.__releaseMapImport)).toBe('function');
  await page.getByRole('button', { name: 'Cancel map selection', exact: true }).click();
  await page.evaluate(() => window.__releaseMapImport());
  await settle(page);
  await expect(mapPicker(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__mapPickerMock.maps.length)).toBe(0);
  await page.evaluate(() => {
    const original = google.maps.importLibrary;
    google.maps.importLibrary = name => name === 'maps' ? Promise.reject(new Error('Map provider unavailable')) : original(name);
  });
  await page.getByRole('button', { name: 'Choose pickup on map', exact: true }).click();
  await expect(mapPicker(page)).toContainText('The map could not load');
  await expect(mapConfirm(page)).toBeDisabled();
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  await selectPlace(page, 'Pickup location', 'New confirmed address');
  await expect(mapPicker(page)).toHaveCount(0);
  await expect(pickup(page)).toHaveValue('New confirmed address');
});

test('map picker fits a phone and confirmed coordinate pickup requires reselection after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await originalTrip(page); await openMap(page);
  await page.evaluate(() => window.__mapPickerMock.click(22.7095, 90.3667));
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await mapConfirm(page).click();
  await expect(page.locator('[data-selected-place="pickup"]')).toContainText('Manually selected map point');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')));
  expect(saved.trip.pickupPlace).toBeNull();
  expect(saved.trip.pickup).toBe('');
  await page.reload();
  await expect(pickup(page)).toHaveValue('');
  await expect(page.getByTestId('route-distance')).toHaveCount(0);
});

test('precise device position requires confirmation and routes original coordinates instead of a nearby landmark', async ({ page }) => {
  await originalTrip(page);
  const initialRequests = controls.get(page).requests.length;
  await page.evaluate(() => {
    window.__nearbyMock = { places: [{
      id: 'nearby-landmark-id', displayName: 'Nathullabad nearby landmark',
      formattedAddress: 'Barishal, Bangladesh',
      location: { lat: () => 22.7096, lng: () => 90.3668 }, attributions: [],
    }] };
  });
  await detect(page).click();
  expect(await page.evaluate(() => window.__deviceMock.requests.at(-1))).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  await respond(page);
  await expect(preview(page)).toContainText(/near.*Nathullabad nearby landmark/i);
  await expect(preview(page)).toContainText(/20\s*m/);
  await expect(preview(page)).toContainText('22.70950');
  await expect(preview(page)).toContainText('90.36670');
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  expect(controls.get(page).requests).toHaveLength(initialRequests);
  const url = new URL(await preview(page).getByRole('link', { name: /google maps/i }).getAttribute('href'));
  expect(url.searchParams.get('query')).toBe('22.7095,90.3667');
  expect(url.searchParams.has('query_place_id')).toBe(false);
  await confirm(page).click();
  await expect.poll(() => controls.get(page).requests.at(-1)?.origin).toEqual({ latitude: precise.latitude, longitude: precise.longitude });
  expect(controls.get(page).requests.at(-1).destination).toEqual({ placeId: pointId('Patuakhali, Bangladesh') });
  expect(controls.get(page).requests.at(-1).origin).not.toHaveProperty('placeId');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  const stored = await page.evaluate(() => sessionStorage.getItem('tuxano-booking-v1'));
  expect(stored).not.toContain('Nathullabad nearby landmark');
  expect(stored).not.toContain('nearby-landmark-id');
});

test('an imprecise Dhaka device result cannot replace a confirmed Barishal pickup or calculate another price', async ({ page }) => {
  await originalTrip(page);
  const initialRequests = controls.get(page).requests.length;
  await detect(page).click();
  await respond(page, { latitude: 23.7891, longitude: 90.4126, accuracy: 12000 });
  await expect(preview(page)).toBeVisible();
  await expect(preview(page)).toContainText(/accur|precis/i);
  await expect(confirm(page)).toHaveCount(0);
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  await expect(page.getByTestId('route-distance')).toHaveText('32.2 km / 20.0 mi');
  expect(controls.get(page).requests).toHaveLength(initialRequests);
  expect(await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'nearby'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel location detection', exact: true }).click();
  await expect(preview(page)).toHaveCount(0);
});

test('missing accuracy, invalid coordinates, and stale positions are rejected before nearby lookup or routing', async ({ page }) => {
  await originalTrip(page);
  const initialRequests = controls.get(page).requests.length;
  for (const [coords, age] of [
    [{ latitude: precise.latitude, longitude: precise.longitude }, 0],
    [{ ...precise, latitude: 91 }, 0],
    [{ ...precise, accuracy: NaN }, 0],
    [precise, 120000],
  ]) {
    await detect(page).click();
    await respond(page, coords, age);
    await expect(preview(page)).toBeVisible();
    await expect(confirm(page)).toHaveCount(0);
    await expect(pickup(page)).toHaveValue('Original confirmed pickup');
    await page.getByRole('button', { name: 'Cancel location detection', exact: true }).click();
  }
  expect(controls.get(page).requests).toHaveLength(initialRequests);
  expect(await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'nearby'))).toHaveLength(0);
});

test('permission denial and timeout retain the original pickup and allow retry or manual address entry', async ({ page }) => {
  await originalTrip(page);
  const initialRequests = controls.get(page).requests.length;
  await detect(page).click();
  await fail(page, 1);
  await expect(preview(page)).toContainText(/permission|allow|denied/i);
  await expect(confirm(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Try location again', exact: true }).click();
  await fail(page, 3);
  await expect(preview(page)).toContainText(/time|location/i);
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  expect(controls.get(page).requests).toHaveLength(initialRequests);
  await pickup(page).fill('A manually typed pickup');
  await expect(preview(page)).toHaveCount(0);
  await expect(pickup(page)).toBeFocused();
});

test('late positioning and nearby lookup responses cannot overwrite a newer manually selected pickup', async ({ page }) => {
  await originalTrip(page);
  await detect(page).click();
  await selectPlace(page, 'Pickup location', 'New manual pickup');
  await respond(page);
  await settle(page);
  await expect(preview(page)).toHaveCount(0);
  await expect(pickup(page)).toHaveValue('New manual pickup');
  expect(controls.get(page).requests.at(-1).origin).toEqual({ placeId: pointId('New manual pickup') });

  await page.evaluate(() => { window.__nearbyMock = { hold: true }; });
  await detect(page).click();
  await respond(page);
  await expect.poll(() => page.evaluate(() => window.__mapsMock.pending.some(item => item.kind === 'nearby'))).toBe(true);
  await selectPlace(page, 'Pickup location', 'Newest manual pickup');
  await page.evaluate(() => window.__mapsMock.release('nearby', 'nearby'));
  await settle(page);
  await expect(preview(page)).toHaveCount(0);
  await expect(pickup(page)).toHaveValue('Newest manual pickup');
  expect(controls.get(page).requests.at(-1).origin).toEqual({ placeId: pointId('Newest manual pickup') });
});

test('a device response started before navigating away and back cannot replace the original pickup', async ({ page }) => {
  await originalTrip(page);
  await detect(page).click();
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await page.getByRole('button', { name: 'Step 1: Trip', exact: true }).click();
  await expect(page).toHaveURL(/#trip$/);
  await respond(page);
  await settle(page);
  await expect(preview(page)).toHaveCount(0);
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  expect(controls.get(page).requests.at(-1).origin).toEqual({ placeId: pointId('Original confirmed pickup') });
});

test('unavailable or empty nearby lookup keeps coordinates explicit, permits deliberate confirmation, and fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await originalTrip(page);
  for (const nearby of [{ fail: true }, { places: [] }]) {
    await page.evaluate(nearby => { window.__nearbyMock = nearby; }, nearby);
    const originalValue = await pickup(page).inputValue();
    const count = controls.get(page).requests.length;
    await detect(page).click();
    await respond(page);
    await expect(confirm(page)).toBeVisible();
    await expect(preview(page)).toContainText('22.70950');
    await expect(preview(page)).toContainText('90.36670');
    await expect(preview(page)).not.toContainText('undefined');
    await expect(pickup(page)).toHaveValue(originalValue);
    expect(controls.get(page).requests).toHaveLength(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Cancel location detection', exact: true }).click();
    await expect(preview(page)).toHaveCount(0);
    await expect(pickup(page)).toHaveValue(originalValue);
  }
});

test('reload requires a new pickup for both confirmed and legacy coordinates while manual place IDs restore normally', async ({ page }) => {
  await originalTrip(page);
  await detect(page).click();
  await respond(page);
  await confirm(page).click();
  await expect.poll(() => controls.get(page).requests.at(-1)?.origin).toEqual({ latitude: precise.latitude, longitude: precise.longitude });
  await page.reload();
  await expect(pickup(page)).toHaveValue('');
  await expect(page.getByLabel('Drop-off location', { exact: true })).toHaveValue('Patuakhali, Bangladesh');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('');

  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem('tuxano-booking-v1'));
    saved.trip.pickup = saved.trip.pickupQuery = '23.78910, 90.41260';
    saved.trip.pickupPlace = { latitude: 23.7891, longitude: 90.4126, text: saved.trip.pickup };
    sessionStorage.setItem('tuxano-booking-v1', JSON.stringify(saved));
  });
  await page.reload();
  await expect(pickup(page)).toHaveValue('');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('');
  await selectPlace(page, 'Pickup location', 'A restored manual pickup');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await page.reload();
  await expect(pickup(page)).toHaveValue('A restored manual pickup');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  expect(controls.get(page).requests.at(-1).origin).toEqual({ placeId: pointId('A restored manual pickup') });
});


test('a candidate that becomes stale before confirmation cannot change the pickup', async ({ page }) => {
  await originalTrip(page);
  const count = controls.get(page).requests.length;
  await detect(page).click(); await respond(page);
  await expect(confirm(page)).toBeVisible();
  await page.evaluate(() => { const originalNow = Date.now.bind(Date); Date.now = () => originalNow() + 61000; });
  await confirm(page).click();
  await expect(confirm(page)).toHaveCount(0);
  await expect(preview(page)).toContainText(/old|timed/i);
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  expect(controls.get(page).requests).toHaveLength(count);
});

test('rerendering keeps the detector busy and a newer request rejects the cancelled callback', async ({ page }) => {
  await originalTrip(page);
  await detect(page).click();
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await expect(detect(page)).toBeDisabled();
  expect(await page.evaluate(() => window.__deviceMock.requests.length)).toBe(1);
  await page.getByRole('button', { name: 'Cancel location detection', exact: true }).click();
  await detect(page).click();
  await respond(page);
  await settle(page);
  await expect(detect(page)).toBeDisabled();
  await expect(confirm(page)).toHaveCount(0);
  await expect(pickup(page)).toHaveValue('Original confirmed pickup');
  await respond(page);
  await expect(confirm(page)).toBeVisible();
  await expect(detect(page)).toBeEnabled();
});
