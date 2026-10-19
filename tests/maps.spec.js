import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const contexts = new WeakMap();
const sampleRoute = { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', calculatedAt: '2026-10-18T00:00:00Z' };
const pointId = query => 'test-' + encodeURIComponent(query);


test.beforeEach(async ({ page }) => {
  const control = { errors: [], requests: [], sdk: [], expectedStatuses: new Set(), heldRoutes: [], routeHandler: null, config: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'server' } };
  contexts.set(page, control);
  await page.addInitScript(() => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], release(kind, key) {
      const matches = this.pending.filter(item => item.kind === kind && item.key === key);
      this.pending = this.pending.filter(item => !matches.includes(item));
      matches.forEach(item => item.resolve());
    } };
  });
  await page.route('**/api/maps/config', route => route.fulfill({ json: control.config }));
  await page.route('**/maps-config.json', route => route.fulfill({ json: control.config }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const url = new URL(route.request().url());
    control.sdk.push({ key: url.searchParams.get('key'), callback: url.searchParams.get('callback') });
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(url.searchParams.get('callback'))}]?.();` });
  });
  await page.route('https://maps.gstatic.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/api/maps/route', async route => {
    const request = route.request().postDataJSON();
    control.requests.push(request);
    const response = control.routeHandler ? await control.routeHandler(request) : { json: sampleRoute };
    try { await route.fulfill(response); } catch (error) {
      if (!/Target closed|already handled|Invalid InterceptionId|interception/i.test(error.message)) throw error;
    }
  });
  page.on('pageerror', error => control.errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if ([...control.expectedStatuses].some(status => message.text().includes(`status of ${status}`))) return;
    control.errors.push(message.text());
  });
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:4173') && response.status() >= 400 && !control.expectedStatuses.has(response.status())) control.errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  const control = contexts.get(page);
  control.heldRoutes.forEach(resolve => resolve());
  expect(control.errors, 'No unhandled exceptions, unexpected console errors, or asset failures').toEqual([]);
});

async function selectPlace(page, label, value, keyboard = false) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await expect(page.getByRole('option', { name: value, exact: true })).toBeVisible();
  if (keyboard) { await input.press('ArrowDown'); await input.press('Enter'); }
  else await page.getByRole('option', { name: value, exact: true }).click();
  await expect(input).toHaveValue(value);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
}
async function dateAndTime(page) {
  await page.getByLabel('Date', { exact: true }).fill('2027-11-12');
  await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
}
async function trip(page, destination = 'Demo Destination') {
  await selectPlace(page, 'Pickup location', 'Demo Pickup');
  await selectPlace(page, 'Drop-off location', destination);
  await dateAndTime(page);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
}
async function passengers(page) {
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await page.getByRole('button', { name: 'Select Luxury SUV', exact: true }).click();
  await page.getByRole('button', { name: /continue to passengers/i }).click();
  await expect(page).toHaveURL(/#passengers$/);
}
async function total(page, expected) {
  await expect(page.locator('[data-testid="estimated-total"]:visible').last()).toHaveText('$' + expected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
async function pending(page, kind, key) {
  await expect.poll(() => page.evaluate(({ kind, key }) => window.__mapsMock.pending.some(item => item.kind === kind && item.key === key), { kind, key })).toBe(true);
}
async function release(page, kind, key) {
  await page.evaluate(({ kind, key }) => window.__mapsMock.release(kind, key), { kind, key });
}

test('normal mode requires selected places, supports keyboard selection, and calculates read-only driving metrics', async ({ page }) => {
  await page.getByLabel('Pickup location', { exact: true }).fill('Unselected pickup');
  await page.getByLabel('Drop-off location', { exact: true }).fill('Unselected destination');
  await dateAndTime(page);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#trip$/);
  expect(contexts.get(page).requests).toHaveLength(0);
  await selectPlace(page, 'Pickup location', 'Demo Pickup', true);
  await selectPlace(page, 'Drop-off location', 'Demo Destination', true);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await expect(page.getByTestId('route-distance')).toHaveText('32.2 km / 20.0 mi');
  await expect(page.getByTestId('driving-duration')).toHaveText('30 min');
  await expect(page.getByTestId('stop-wait-duration')).toHaveText('0 min');
  expect(contexts.get(page).requests.at(-1)).toEqual({ origin: { placeId: pointId('Demo Pickup') }, destination: { placeId: pointId('Demo Destination') }, stops: [] });
  expect(contexts.get(page).sdk).toEqual([{ key: 'test-browser-key', callback: '__tuxanoGoogleMapsReady' }]);
  const fields = await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'details').map(call => call.fields));
  expect(fields).toHaveLength(2);
  expect(fields[0]).toEqual(expect.arrayContaining(['id', 'displayName', 'location', 'formattedAddress']));
  await passengers(page);
  await total(page, 270); // $225 transportation + $45 gratuity, no extras.
});

for (const selection of ['keyboard', 'keyboard-up', 'click']) test(`Enter cannot silently choose an unrelated first place; explicit ${selection} selects the intended match`, async ({ page }) => {
  const query = 'Nathullabad Central Bus Terminal';
  const unrelated = 'Notun Bazar Bus Stop, Dhaka, Bangladesh';
  const intended = 'Nathullabad Central Bus Terminal, Barishal, Bangladesh';
  await page.evaluate(({ query, unrelated, intended }) => {
    window.__mapsMock.suggestionsByQuery = { [query]: [unrelated, intended] };
  }, { query, unrelated, intended });
  await selectPlace(page, 'Drop-off location', 'Sayedabad, Dhaka, Bangladesh');
  const pickup = page.getByLabel('Pickup location', { exact: true });
  await pickup.fill(query);
  await expect(page.getByRole('option', { name: intended, exact: true })).toBeVisible();
  expect(await page.evaluate(query => window.__mapsMock.calls.find(call => call.kind === 'suggest' && call.query === query).region, query)).toBeUndefined();
  await pickup.press('Enter');
  await expect(pickup).toHaveValue(query);
  await expect(page.getByRole('option', { name: unrelated, exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: intended, exact: true })).toBeVisible();
  await expect(page.locator('.places-selection-hint')).toHaveAttribute('role', 'status');
  await expect(page.locator('.places-selection-hint')).toContainText('Choose the matching location');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')).trip.pickupPlace)).toBeNull();
  expect(contexts.get(page).requests).toHaveLength(0);
  expect(await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'details').map(call => call.query))).not.toContain(unrelated);
  if (selection === 'keyboard') {
    await pickup.press('ArrowDown'); await pickup.press('ArrowDown'); await pickup.press('Enter');
  } else if (selection === 'keyboard-up') { await pickup.press('ArrowUp'); await pickup.press('Enter'); }
  else await page.getByRole('option', { name: intended, exact: true }).click();
  await expect(pickup).toHaveValue(intended);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  expect(contexts.get(page).requests.at(-1)).toEqual({ origin: { placeId: pointId(intended) }, destination: { placeId: pointId('Sayedabad, Dhaka, Bangladesh') }, stops: [] });
});

test('ordered stops add vehicle-specific wait fees once and removal keeps the surviving stop', async ({ page }) => {
  await trip(page);
  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  await selectPlace(page, 'Stop 1', 'First Demo Stop');
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('10');
  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  await selectPlace(page, 'Stop 2', 'Second Demo Stop');
  await page.getByLabel('Stop 2 wait time', { exact: true }).selectOption('20');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('1 hr');
  await expect(page.getByTestId('driving-duration')).toHaveText('30 min');
  await expect(page.getByTestId('stop-wait-duration')).toHaveText('30 min');
  expect(contexts.get(page).requests.at(-1).stops).toEqual([{ placeId: pointId('First Demo Stop') }, { placeId: pointId('Second Demo Stop') }]);
  const requests = contexts.get(page).requests.length;
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('5');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('55 min');
  expect(contexts.get(page).requests).toHaveLength(requests); // Waiting is not another Google driving route.
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('10');
  await passengers(page);
  await total(page, 324); // $225 + 30×$1.50 waiting = $270; 20% tip $54.
  await page.getByRole('button', { name: 'Step 1: Trip', exact: true }).click();
  await page.getByRole('button', { name: 'Remove stop 1', exact: true }).click();
  await expect(page.getByLabel('Stop 1', { exact: true })).toHaveValue('Second Demo Stop');
  await expect(page.getByLabel('Stop 1 wait time', { exact: true })).toHaveValue('20');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('50 min');
  await page.getByRole('button', { name: 'Step 3: Passengers & Extras', exact: true }).click();
  await total(page, 306); // $225 + $30 waiting + 20% ($51).
});

test('a changed driving route replaces the old quote and observes the fare minimum', async ({ page }) => {
  await trip(page); await passengers(page); await total(page, 270);
  await page.getByRole('button', { name: 'Step 1: Trip', exact: true }).click();
  contexts.get(page).routeHandler = async () => ({ json: { ...sampleRoute, distanceMeters: 6437.376, durationSeconds: 600 } });
  await selectPlace(page, 'Drop-off location', 'Short Destination');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('10 min');
  await page.getByRole('button', { name: 'Step 3: Passengers & Extras', exact: true }).click();
  await total(page, 150); // max($125, $75 + 4×$3 + 10×$3) + 20% = $150.
});

test('editing selected text invalidates its canonical place and previous route immediately', async ({ page }) => {
  await trip(page);
  await page.getByLabel('Pickup location', { exact: true }).fill('Demo Pickup edited');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('route-distance')).toHaveCount(0);
  const count = contexts.get(page).requests.length;
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#trip$/);
  expect(contexts.get(page).requests).toHaveLength(count);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')));
  expect(saved.trip.pickupPlace).toBeNull();
  await selectPlace(page, 'Pickup location', 'Demo Pickup edited');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
});

test('older suggestions and place details cannot overwrite a newer selection', async ({ page }) => {
  await page.evaluate(() => { window.__mapsMock.holdSuggestions = ['Slow Query']; });
  const pickup = page.getByLabel('Pickup location', { exact: true });
  await pickup.fill('Slow Query'); await pending(page, 'suggest', 'Slow Query');
  await pickup.fill('Current Query');
  await expect(page.getByRole('option', { name: 'Current Query', exact: true })).toBeVisible();
  await release(page, 'suggest', 'Slow Query');
  await expect(page.getByRole('option', { name: 'Slow Query', exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.__mapsMock.holdDetails = ['Current Query']; });
  await page.getByRole('option', { name: 'Current Query', exact: true }).click(); await pending(page, 'details', 'Current Query');
  await selectPlace(page, 'Pickup location', 'Final Query');
  await release(page, 'details', 'Current Query');
  await expect(pickup).toHaveValue('Final Query');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')).trip.pickupPlace.placeId)).toBe(pointId('Final Query'));
});

test('pending pickup selection survives blur while drop-off focus and suggestions remain intact', async ({ page }) => {
  const pickupQuery = 'Delayed Pickup';
  const canonicalPickup = '200 Pickup Street, Chicago, IL 60601';
  await page.evaluate(({ pickupQuery, id, canonicalPickup }) => {
    window.__mapsMock.holdDetails = [pickupQuery];
    window.__placeCanonicalLabels = { [id]: canonicalPickup };
  }, { pickupQuery, id: pointId(pickupQuery), canonicalPickup });
  await page.getByLabel('Pickup location', { exact: true }).fill(pickupQuery);
  await page.getByRole('option', { name: pickupQuery, exact: true }).click();
  await pending(page, 'details', pickupQuery);
  const dropoff = page.getByLabel('Drop-off location', { exact: true });
  await dropoff.fill('Active Destination');
  // The real suggestion debounce exceeds the blur delay; waiting for these
  // options reproduces the async selection/blur race without a timing sleep.
  await expect(page.getByRole('option', { name: 'Active Destination', exact: true })).toBeVisible();
  await expect(dropoff).toBeFocused();
  await release(page, 'details', pickupQuery);
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue(canonicalPickup);
  await expect(dropoff).toBeFocused();
  await expect(dropoff).toHaveValue('Active Destination');
  await expect(page.getByRole('option', { name: 'Active Destination', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')).trip.pickupPlace.placeId)).toBe(pointId(pickupQuery));
  await page.getByRole('option', { name: 'Active Destination', exact: true }).click();
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  expect(contexts.get(page).requests.at(-1)).toEqual({ origin: { placeId: pointId(pickupQuery) }, destination: { placeId: pointId('Active Destination') }, stops: [] });
});

test('a deleted stop cannot apply its delayed place details to the next stop', async ({ page }) => {
  await trip(page);
  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  await selectPlace(page, 'Stop 1', 'Removed Stop');
  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  await selectPlace(page, 'Stop 2', 'Surviving Stop');
  await page.evaluate(() => { window.__mapsMock.holdDetails = ['Delayed Removed Stop']; });
  await page.getByLabel('Stop 1', { exact: true }).fill('Delayed Removed Stop');
  await page.getByRole('option', { name: 'Delayed Removed Stop', exact: true }).click(); await pending(page, 'details', 'Delayed Removed Stop');
  await page.getByRole('button', { name: 'Remove stop 1', exact: true }).click();
  await release(page, 'details', 'Delayed Removed Stop');
  await expect(page.getByLabel('Stop 1', { exact: true })).toHaveValue('Surviving Stop');
  await expect(page.getByLabel('Stop 2', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('35 min');
});

test('a stale route response cannot replace newer metrics or prices', async ({ page }) => {
  const control = contexts.get(page);
  let releaseOld;
  control.routeHandler = async request => {
    if (request.destination.placeId === pointId('Slow Destination')) {
      await new Promise(resolve => { releaseOld = resolve; control.heldRoutes.push(resolve); });
      return { json: { ...sampleRoute, distanceMeters: 160934.4, durationSeconds: 7200 } };
    }
    return { json: sampleRoute };
  };
  await selectPlace(page, 'Pickup location', 'Demo Pickup');
  await selectPlace(page, 'Drop-off location', 'Slow Destination');
  await expect.poll(() => typeof releaseOld).toBe('function');
  await selectPlace(page, 'Drop-off location', 'Current Destination');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  releaseOld();
  await expect(page.getByTestId('route-distance')).toHaveText('32.2 km / 20.0 mi');
  await dateAndTime(page); await passengers(page); await total(page, 270);
});

test('provider route failure is visible and retry recovers without a fixture fallback', async ({ page }) => {
  const control = contexts.get(page); control.expectedStatuses.add(503);
  control.routeHandler = async () => control.requests.length === 1 ? { status: 503, json: { error: { message: 'Driving route service temporarily unavailable.' } } } : { json: sampleRoute };
  await selectPlace(page, 'Pickup location', 'Demo Pickup');
  await selectPlace(page, 'Drop-off location', 'Demo Destination');
  await expect(page.getByRole('alert').filter({ hasText: 'Driving route service temporarily unavailable.' })).toBeVisible();
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('route-distance')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  expect(control.requests).toHaveLength(2);
});

test('missing Google configuration and no-result searches remain truthful and editable', async ({ page }) => {
  const control = contexts.get(page); control.config = { browserKey: '', browserConfigured: false, routesConfigured: false };
  await page.getByLabel('Pickup location', { exact: true }).fill('Find unavailable place');
  await expect(page.getByText('Location search is not available yet. Please contact the booking provider.', { exact: true }).first()).toBeVisible();
  expect(control.sdk).toHaveLength(0); expect(control.requests).toHaveLength(0);
  control.config = { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true };
  await page.reload();
  await page.evaluate(() => { window.__mapsMock.emptySuggestions = ['No Results']; });
  await page.getByLabel('Pickup location', { exact: true }).fill('No Results');
  await expect(page.getByText('No places found. Try a more specific address.', { exact: true })).toBeVisible();
  await selectPlace(page, 'Pickup location', 'Available Place');
});

test('draft reload retains selected IDs and waits but recomputes route metrics', async ({ page }) => {
  await trip(page);
  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  await selectPlace(page, 'Stop 1', 'Persistent Stop');
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('15');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('45 min');
  const saved = await page.evaluate(() => sessionStorage.getItem('tuxano-booking-v1'));
  const state = JSON.parse(saved);
  expect(state.trip.pickupPlace.placeId).toBe(pointId('Demo Pickup'));
  expect(state.trip.stops[0].waitMinutes).toBe(15);
  for (const transient of ['distanceMeters', 'durationSeconds', 'suggestions', 'predictions', 'sessionToken', 'calculatedAt']) expect(saved).not.toContain(`"${transient}"`);
  const requests = contexts.get(page).requests.length;
  contexts.get(page).routeHandler = async () => ({ json: { ...sampleRoute, durationSeconds: 2400 } });
  await page.reload();
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('55 min');
  await expect(page.getByLabel('Stop 1 wait time', { exact: true })).toHaveValue('15');
  expect(contexts.get(page).requests.length).toBeGreaterThan(requests);
});

test('reload restores fresh canonical addresses and provider attribution from persisted place IDs', async ({ page }) => {
  const query = 'Airport query';
  const labels = { [pointId(query)]: '100 Airport Road, Chicago, IL 60666' };
  const names = { [pointId(query)]: 'Chicago Airport' };
  const canonicalLabel = `${names[pointId(query)]}, ${labels[pointId(query)]}`;
  await page.addInitScript(({ labels, names }) => { window.__placeCanonicalLabels = labels; window.__placeDisplayNames = names; }, { labels, names });
  await page.evaluate(({ labels, names }) => { window.__placeCanonicalLabels = labels; window.__placeDisplayNames = names; }, { labels, names });
  await page.getByLabel('Pickup location', { exact: true }).fill(query);
  await page.getByRole('option', { name: query, exact: true }).click();
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue(canonicalLabel);
  await selectPlace(page, 'Drop-off location', 'Demo Destination');
  await dateAndTime(page);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  const savedText = await page.evaluate(() => sessionStorage.getItem('tuxano-booking-v1'));
  const saved = JSON.parse(savedText);
  expect(saved.trip.pickup).toBe(query);
  expect(saved.trip.pickupPlace.placeId).toBe(pointId(query));
  expect(savedText).not.toContain(labels[pointId(query)]);
  expect(savedText).not.toContain(names[pointId(query)]);
  expect(savedText).not.toContain('Demo Places Provider');
  expect(savedText).not.toContain('maps-attribution');
  const requests = contexts.get(page).requests.length;
  contexts.get(page).routeHandler = async () => ({ json: { ...sampleRoute, durationSeconds: 2400 } });
  await page.reload();
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue(canonicalLabel);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('40 min');
  await expect(page.getByRole('link', { name: 'Demo Places Provider', exact: true }).first()).toHaveAttribute('href', 'https://example.com/maps-attribution');
  const restored = await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'restore').map(call => call.id));
  expect(restored).toEqual(expect.arrayContaining([pointId(query), pointId('Demo Destination')]));
  expect(contexts.get(page).requests.length).toBeGreaterThan(requests);
});

test('selection retires its token immediately without late details deleting a newer search session', async ({ page }) => {
  await page.evaluate(() => { window.__mapsMock.holdDetails = ['Session A']; });
  const pickup = page.getByLabel('Pickup location', { exact: true });
  await pickup.fill('Session A');
  await page.getByRole('option', { name: 'Session A', exact: true }).click();
  await pending(page, 'details', 'Session A');
  await pickup.fill('Session B');
  await expect(page.getByRole('option', { name: 'Session B', exact: true })).toBeVisible();
  await release(page, 'details', 'Session A');
  await pickup.fill('Session B refined');
  await expect(page.getByRole('option', { name: 'Session B refined', exact: true })).toBeVisible();
  const tokens = await page.evaluate(() => Object.fromEntries(window.__mapsMock.calls.filter(call => call.kind === 'suggest').map(call => [call.query, call.token])));
  expect(tokens['Session B']).not.toBe(tokens['Session A']);
  expect(tokens['Session B refined']).toBe(tokens['Session B']);
  await page.getByRole('option', { name: 'Session B refined', exact: true }).click();
  await expect(pickup).toHaveValue('Session B refined');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')).trip.pickupPlace.placeId)).toBe(pointId('Session B refined'));
});

test('mobile suggestion text is safe, keyboard Escape closes it, and dropdown does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const value = '<img src=x onerror="window.__mapsUnsafe=1">';
  const pickup = page.getByLabel('Pickup location', { exact: true });
  await pickup.fill(value);
  await expect(page.getByRole('option', { name: value, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__mapsUnsafe)).toBeUndefined();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await pickup.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(pickup).toBeFocused();
  await expect(pickup).toHaveAttribute('aria-expanded', 'false');
});

test('reset discards a pending restored route and late response cannot revive the booking', async ({ page }) => {
  await page.goto('/?demo=1#review');
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#thank-you$/);
  const control = contexts.get(page); let resume;
  control.routeHandler = async () => { await new Promise(resolve => { resume = resolve; control.heldRoutes.push(resolve); }); return { json: sampleRoute }; };
  await page.goto('/?reset-pending=1#thank-you');
  await expect.poll(() => typeof resume).toBe('function');
  await page.getByRole('button', { name: 'Start a new request', exact: true }).click();
  await expect(page).toHaveURL(/#trip$/);
  resume();
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('route-distance')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')).submitted)).toBe(false);
});

test('browser Routes SDK uses Place waypoints, millisecond durations, ordered stops, and wait pricing without a backend', async ({ page, context }) => {
  contexts.get(page).config.providerMode = 'browser';
  await trip(page);
  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  await selectPlace(page, 'Stop 1', 'Browser Stop');
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('15');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('45 min');
  await expect(page.getByTestId('route-distance')).toHaveText('32.2 km / 20.0 mi');
  const request = await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'route').at(-1).request);
  expect(request).toMatchObject({
    origin: { kind: 'place', placeId: pointId('Demo Pickup') },
    destination: { kind: 'place', placeId: pointId('Demo Destination') },
    intermediates: [{ location: { kind: 'place', placeId: pointId('Browser Stop') }, via: false }],
    travelMode: 'DRIVING', routingPreference: 'TRAFFIC_UNAWARE', optimizeWaypointOrder: false,
  });
  expect(request.fields).toEqual(expect.arrayContaining(['distanceMeters', 'durationMillis']));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 41.88, longitude: -87.63, accuracy: 20 });
  await page.getByRole('button', { name: 'Use current location', exact: true }).click();
  await expect(page.getByTestId('device-location-preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use this pickup location', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'route').at(-1)?.request.origin)).toEqual({ kind: 'place', placeId: pointId('Demo Pickup') });
  await page.getByRole('button', { name: 'Use this pickup location', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'route').at(-1)?.request.origin)).toEqual({ kind: 'coordinates', lat: 41.88, lng: -87.63 });
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('45 min');
  await passengers(page);
  await total(page, 297); // $225 driving + $22.50 waiting + $49.50 gratuity.
  expect(contexts.get(page).requests).toHaveLength(0);
});

test('browser Routes permission failure never displays a fabricated route or switches to server fallback', async ({ page }) => {
  contexts.get(page).config.providerMode = 'browser';
  await page.evaluate(id => { window.__mapsMock.failRoutes = [id]; }, pointId('Denied Destination'));
  await selectPlace(page, 'Pickup location', 'Demo Pickup');
  await selectPlace(page, 'Drop-off location', 'Denied Destination');
  await expect(page.getByRole('alert').filter({ hasText: /Route calculation is not available for this website yet/i })).toBeVisible();
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('route-distance')).toHaveCount(0);
  await dateAndTime(page);
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#trip$/);
  expect(contexts.get(page).requests).toHaveLength(0);
});

test('aborted browser Routes callbacks cannot overwrite the newer selection or quote', async ({ page }) => {
  contexts.get(page).config.providerMode = 'browser';
  const oldId = pointId('Old Browser Destination');
  await page.evaluate(id => {
    window.__mapsMock.holdRoutes = [id];
    window.__mapsMock.routeResults[id] = { distanceMeters: 160934.4, durationMillis: 7200000 };
  }, oldId);
  await selectPlace(page, 'Pickup location', 'Demo Pickup');
  await selectPlace(page, 'Drop-off location', 'Old Browser Destination');
  await pending(page, 'route', oldId);
  await selectPlace(page, 'Drop-off location', 'New Browser Destination');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await release(page, 'route', oldId);
  await expect(page.getByTestId('route-distance')).toHaveText('32.2 km / 20.0 mi');
  await dateAndTime(page); await passengers(page); await total(page, 270);
  expect(contexts.get(page).requests).toHaveLength(0);
});
