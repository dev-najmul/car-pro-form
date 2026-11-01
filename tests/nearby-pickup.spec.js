import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const controlByPage = new WeakMap();
const original = 'Original pickup, Chicago, USA';
const dropoff = 'Airport drop-off, Chicago, USA';
const corrected = 'A different pickup, Chicago, USA';
const nearestId = 'ChIJNearestPickup242';
const fartherId = 'ChIJFartherPickup242';
const nearestAddress = '10 Test Avenue, Chicago, IL, USA';
const nearestName = 'Closest Hotel';
const nearestLabel = `${nearestName}, ${nearestAddress}`;
const estimate = { latitude: 41.8818, longitude: -87.6232, accuracy: 100000 };
const nearestPoint = { latitude: 41.8819, longitude: -87.6233 };
const id = value => 'test-' + encodeURIComponent(value);
const pickup = page => page.getByLabel('Pickup location', { exact: true });
const detect = page => page.getByRole('button', { name: 'Use current location', exact: true });
const selected = page => page.locator('[data-selected-place="pickup"]');
const note = page => page.locator('[data-suggested-pickup]');
const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

async function install(page) {
  const control = { routes: [], errors: [], bookingPosts: 0 }; controlByPage.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(({ original, dropoff, corrected, nearestId, fartherId, nearestAddress, nearestName, nearestPoint }) => {
    const id = value => 'test-' + encodeURIComponent(value);
    window.__mapsMock = {
      calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [],
      failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [],
      countries: { [id(original)]: 'US', [id(dropoff)]: 'US', [id(corrected)]: 'US', [nearestId]: 'US' },
      locations: { [id(original)]: { lat: 41.89, lng: -87.64 }, [id(dropoff)]: { lat: 41.97, lng: -87.90 }, [id(corrected)]: { lat: 41.885, lng: -87.626 }, [nearestId]: { lat: nearestPoint.latitude, lng: nearestPoint.longitude } },
      release(kind, key) { const matches = this.pending.filter(item => item.kind === kind && item.key === key); this.pending = this.pending.filter(item => !matches.includes(item)); matches.forEach(item => item.resolve()); },
    };
    window.__placeCanonicalLabels = { [nearestId]: nearestAddress };
    window.__placeDisplayNames = { [nearestId]: nearestName };
    const components = [{ shortText: 'US', longText: 'United States', types: ['country', 'political'] }];
    window.__nearbyPickupMock = { places: [
      { id: fartherId, displayName: 'Farther Hotel', formattedAddress: '40 Test Avenue, Chicago, IL, USA', location: { lat: 41.883, lng: -87.6249 }, addressComponents: components, attributions: [] },
      { id: nearestId, displayName: nearestName, formattedAddress: nearestAddress, location: { lat: nearestPoint.latitude, lng: nearestPoint.longitude }, addressComponents: components, attributions: [{ provider: 'Fixture Maps Provider', providerURI: 'https://example.test/maps-provider' }] },
    ] };
    // Existing context-only lookups remain independent from canonical pickup
    // discovery. Empty reverse geocoding deliberately exercises nearby fallback.
    window.__nearbyMock = { places: [] };
    window.__geocodeMock = { results: [] };
    window.__deviceMock = { pending: [], requests: [] };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, failure, options) { window.__deviceMock.requests.push(options); window.__deviceMock.pending.push({ success, failure }); },
    } });
  }, { original, dropoff, corrected, nearestId, fartherId, nearestAddress, nearestName, nearestPoint });
  const configuration = { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'server' };
  await page.route('**/maps-config.json', route => route.fulfill({ json: configuration }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route('**/api/maps/route', route => {
    const request = route.request().postDataJSON(); control.routes.push(request);
    const nearby = request.origin?.placeId === nearestId;
    return route.fulfill({ json: { distanceMeters: nearby ? 8046.72 : 32186.88, durationSeconds: nearby ? 600 : 1800, provider: 'google' } });
  });
  await page.route('**/wp-json/tuxano-booking/v1/bookings', route => { control.bookingPosts++; return route.abort(); });
  await page.goto('/');
}
async function choose(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
}
async function trip(page) {
  await choose(page, 'Pickup location', original); await choose(page, 'Drop-off location', dropoff);
  await page.getByLabel('Date', { exact: true }).fill(date); await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
}
async function locate(page, point = estimate) {
  await detect(page).click();
  await expect.poll(() => page.evaluate(() => window.__deviceMock.pending.length)).toBeGreaterThan(0);
  await page.evaluate(point => window.__deviceMock.pending.shift().success({ coords: point, timestamp: Date.now() }), point);
}
async function settled(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function suggested(page) {
  await locate(page); await expect(pickup(page)).toHaveValue(nearestLabel);
  await expect(note(page)).toContainText(/Suggested pickup nearby/i);
  await expect.poll(() => controlByPage.get(page).routes.at(-1)?.origin).toEqual({ placeId: nearestId });
}

test.afterEach(async ({ page }) => {
  expect(controlByPage.get(page)?.errors || []).toEqual([]);
  expect(controlByPage.get(page)?.bookingPosts || 0).toBe(0);
});

test('coarse GPS fills the closest canonical place and refreshes fares without claiming precise GPS', async ({ page }) => {
  await install(page); await trip(page);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page.locator('[data-vehicle-card="premium"] .vehicle-price')).toContainText('$195');
  await page.getByRole('button', { name: 'Edit Trip', exact: true }).click();
  await suggested(page);
  await expect(page.getByTestId('pickup-map-picker')).toHaveCount(0);
  await expect(selected(page)).not.toContainText('accuracy within');
  await expect(selected(page).getByRole('link', { name: 'Fixture Maps Provider', exact: true })).toHaveAttribute('href', 'https://example.test/maps-provider');
  const maps = new URL(await selected(page).getByRole('link', { name: /Google Maps/i }).getAttribute('href'));
  expect(maps.searchParams.get('query_place_id')).toBe(nearestId);
  await page.screenshot({ path: '/tmp/tuxano-242-main-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await expect(page.locator('[data-vehicle-card="premium"] .vehicle-price')).toContainText('$105');
  expect(controlByPage.get(page).routes.at(-1).origin).not.toHaveProperty('latitude');
  expect(controlByPage.get(page).routes.at(-1).origin.placeId).not.toBe(fartherId);
});

test('a precise device reading whose street lookup is unavailable can still use a labelled nearby pickup', async ({ page }) => {
  await install(page); await trip(page); await locate(page, { ...estimate, accuracy: 20 });
  await expect(pickup(page)).toHaveValue(nearestLabel);
  await expect(note(page)).toContainText(/Suggested pickup/i);
  await expect(page.getByRole('button', { name: 'Use this pickup location', exact: true })).toHaveCount(0);
  await expect.poll(() => controlByPage.get(page).routes.at(-1)?.origin).toEqual({ placeId: nearestId });
});

test('adjusting a nearby suggestion starts at its canonical place and a manual choice clears its suggestion marker', async ({ page }) => {
  await install(page); await trip(page); await suggested(page);
  await selected(page).getByRole('button', { name: 'Adjust on map', exact: true }).click();
  await expect(page.getByTestId('google-map-mock-canvas')).toBeVisible();
  expect(await page.evaluate(() => window.__mapPickerMock.maps.at(-1).options.center)).toEqual({ lat: nearestPoint.latitude, lng: nearestPoint.longitude });
  const search = page.getByLabel('Search map for pickup', { exact: true }); await expect(search).toBeEditable();
  await search.fill(corrected); await page.getByRole('option', { name: corrected, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use this map point', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Use this map point', exact: true }).click();
  await expect(pickup(page)).toHaveValue(corrected); await expect(note(page)).toHaveCount(0);
  await expect.poll(() => controlByPage.get(page).routes.at(-1)?.origin).toEqual({ placeId: id(corrected) });
});

test('the displayed suggested point can be deliberately kept on the map without converting it to sensor coordinates', async ({ page }) => {
  await install(page); await trip(page); await suggested(page);
  await selected(page).getByRole('button', { name: 'Adjust on map', exact: true }).click();
  await expect(page.getByTestId('google-map-mock-canvas')).toBeVisible();
  await page.evaluate(() => window.__mapPickerMock.maps.at(-1).emit('idle'));
  await expect(page.getByRole('button', { name: 'Use this map point', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Use this map point', exact: true }).click();
  await expect(pickup(page)).toHaveValue(nearestLabel); await expect(note(page)).toHaveCount(0);
  expect(controlByPage.get(page).routes.at(-1).origin).toEqual({ placeId: nearestId });
});

test('a late nearby response cannot replace a manually selected pickup', async ({ page }) => {
  await install(page); await trip(page);
  await page.evaluate(() => { window.__nearbyPickupMock.hold = true; }); await locate(page);
  await expect.poll(() => page.evaluate(() => window.__mapsMock.pending.some(p => p.kind === 'nearby'))).toBe(true);
  await choose(page, 'Pickup location', corrected);
  await page.evaluate(() => window.__mapsMock.release('nearby', 'nearby')); await settled(page);
  await expect(pickup(page)).toHaveValue(corrected); await expect(note(page)).toHaveCount(0);
  expect(controlByPage.get(page).routes.at(-1).origin).toEqual({ placeId: id(corrected) });
});

test('cancel and retry own independent nearby requests so a stale earlier result cannot win', async ({ page }) => {
  await install(page); await trip(page);
  await page.evaluate(() => { window.__nearbyPickupMock.hold = true; }); await locate(page);
  await expect.poll(() => page.evaluate(() => window.__mapsMock.pending.some(p => p.kind === 'nearby'))).toBe(true);
  await page.getByRole('button', { name: 'Cancel location detection', exact: true }).click();
  await expect(pickup(page)).toHaveValue(original);
  await page.evaluate(() => { window.__nearbyPickupMock = { places: window.__nearbyPickupMock.places.slice(0, 1) }; });
  await locate(page);
  await expect(pickup(page)).toHaveValue('Farther Hotel, 40 Test Avenue, Chicago, IL, USA');
  await page.evaluate(() => window.__mapsMock.release('nearby', 'nearby')); await settled(page);
  await expect(pickup(page)).toHaveValue('Farther Hotel, 40 Test Avenue, Chicago, IL, USA');
  expect(controlByPage.get(page).routes.at(-1).origin).toEqual({ placeId: fartherId });
});

test('when Google has no usable place the existing exact-map correction still works without inventing a pickup', async ({ page }) => {
  await install(page); await trip(page); const before = controlByPage.get(page).routes.length;
  await page.evaluate(() => { window.__nearbyPickupMock.places = []; }); await locate(page);
  await expect(page.getByTestId('pickup-map-picker')).toBeVisible();
  await expect(page.getByTestId('google-map-mock-canvas')).toBeVisible();
  await expect(pickup(page)).toHaveValue(original); expect(controlByPage.get(page).routes).toHaveLength(before);
  await expect(page.getByRole('button', { name: 'Use this map point', exact: true })).toBeDisabled();
  await page.evaluate(() => window.__mapPickerMock.click(41.884, -87.627));
  await expect(page.getByRole('button', { name: 'Use this map point', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Use this map point', exact: true }).click();
  await expect(note(page)).toHaveCount(0);
  await expect.poll(() => controlByPage.get(page).routes.at(-1)?.origin).toEqual({ latitude: 41.884, longitude: -87.627 });
});

test('a restored nearby suggestion retains its review hint until the customer chooses a new pickup', async ({ page }) => {
  await install(page); await trip(page); await suggested(page);
  await page.reload(); await expect(pickup(page)).toHaveValue(nearestLabel); await expect(note(page)).toContainText(/Suggested pickup/i);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('10 min');
  await choose(page, 'Pickup location', corrected); await expect(note(page)).toHaveCount(0);
});

test.describe('phone nearby pickup suggestion', () => {
  test.use({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
  test('a coarse reading fills a compact editable suggestion without opening a large map or overflowing the form', async ({ page }) => {
    await install(page); await trip(page); await suggested(page);
    await expect(page.getByTestId('pickup-map-picker')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: '/tmp/tuxano-242-main-phone.png', fullPage: true });
    await selected(page).getByRole('button', { name: 'Adjust on map', exact: true }).tap();
    await expect(page.getByTestId('google-map-mock-canvas')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
