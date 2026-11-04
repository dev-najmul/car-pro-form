import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

// Chromium supplies the engine for these request-order/activation regressions.
// The Safari user agent selects helpful recovery wording; native iOS permission
// dialogs and OS settings still require a physical device check.
const safariAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const original = 'Original pickup, Chicago, USA';
const address = '304 Sype Dr, Carol Stream, IL 60188, USA';
const coords = { latitude: 41.8818, longitude: -87.6232, accuracy: 35 };
const controls = new WeakMap();

async function install(page, quick, { native = false } = {}) {
  const control = { errors: [], bookings: 0 }; controls.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(({ address, coords, native }) => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] };
    window.__geocodeMock = { results: [{ formatted_address: address, geometry: { location: { lat: coords.latitude, lng: coords.longitude } }, types: ['street_address'], address_components: [{ short_name: 'US', long_name: 'United States', types: ['country'] }] }] };
    window.__nearbyPickupMock = { places: [] };
    window.__dualGeo = { behavior: 'precise', watchBehavior: 'deny', calls: [], pending: [], watch: null, clears: [] };
    if (native) return;
    const point = accuracy => ({ coords: { ...coords, accuracy }, timestamp: Date.now() });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, failure, options) {
        const mock = window.__dualGeo;
        mock.calls.push({ method: 'current', active: navigator.userActivation?.isActive, options });
        if (mock.behavior === 'held') mock.pending.push({ success, failure });
        else if (mock.behavior === 'denied') failure({ code: 1, message: 'private native diagnostic' });
        else success(point(mock.behavior === 'coarse' ? 100000 : coords.accuracy));
      },
      watchPosition(success, failure, options) {
        const mock = window.__dualGeo;
        mock.calls.push({ method: 'watch', options }); mock.watch = { success, failure };
        if (mock.watchBehavior === 'deny') failure({ code: 1, message: 'watch permission trap' });
        return 0;
      },
      clearWatch(id) { window.__dualGeo.clears.push(id); },
    } });
  }, { address, coords, native });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route('**/maps-config.json', route => route.fulfill({ json: { browserConfigured: true, browserKey: 'test-browser-key', routesConfigured: true, providerMode: 'server' } }));
  await page.route(restUrl + 'session', route => route.fulfill({ json: { token: 'a'.repeat(64), settings: { minHours: 3, maxHours: 24, timezone: 'America/Chicago', bookingPageUrl: origin + '/unused-safari-destination/' }, maps: { browserConfigured: true, browserKey: 'test-browser-key' } } }));
  await page.route(restUrl + 'bookings', route => { control.bookings++; return route.abort(); });
  await page.route(origin + '/safari-quick-test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/quick-booking.css"><style>body{margin:0;padding:16px}</style></head><body><div id="safari-quick" data-tuxano-quick-booking data-rest-url="${restUrl}" data-asset-url="${origin}/"></div><script type="module" src="/quick-booking.js"></script></body></html>` }));
  await page.goto(quick ? '/safari-quick-test/' : '/');
  await expect(page.getByRole('button', { name: 'Use current location', exact: true })).toBeEnabled();
}
function pickup(page, quick) { return page.getByLabel(quick ? 'Pickup Location' : 'Pickup location', { exact: true }); }
async function chooseOriginal(page, quick) {
  await pickup(page, quick).fill(original);
  await page.getByRole('option', { name: original, exact: true }).click();
  await expect(pickup(page, quick)).toHaveValue(original);
}
async function detect(page) { await page.getByRole('button', { name: 'Use current location', exact: true }).tap(); }
async function expectedMethods(page, methods) {
  await expect.poll(() => page.evaluate(() => window.__dualGeo.calls.map(call => call.method))).toEqual(methods);
}

test.use({ userAgent: safariAgent, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.afterEach(async ({ page }) => {
  expect(controls.get(page)?.errors || []).toEqual([]);
  expect(controls.get(page)?.bookings || 0).toBe(0);
});

for (const quick of [false, true]) {
  test.describe(quick ? 'quick card Safari-compatible location request' : 'main form Safari-compatible location request', () => {
    test('a tap requests one accurate position in its activation task without starting a permission-denied watch', async ({ page }) => {
      await install(page, quick); await chooseOriginal(page, quick); await detect(page);
      await expect(pickup(page, quick)).toHaveValue(address);
      await expectedMethods(page, ['current']);
      expect(await page.evaluate(() => window.__dualGeo.calls[0])).toMatchObject({ active: true, options: { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 } });
      expect(await page.evaluate(() => window.__dualGeo.clears)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    });

    test('a true denial preserves pickup, explains Safari settings and only a fresh customer tap retries', async ({ page }) => {
      await install(page, quick); await chooseOriginal(page, quick);
      await page.evaluate(() => { window.__dualGeo.behavior = 'denied'; }); await detect(page);
      const error = quick ? page.locator('.tuxano-quick-booking-error') : page.getByTestId('device-location-preview');
      await expect(error).toContainText('Location permission was denied');
      await expect(error).toContainText('Safari');
      await expect(error).toContainText('Location Services');
      await expect(error).not.toContainText('private native diagnostic');
      await expect(pickup(page, quick)).toHaveValue(original); await expectedMethods(page, ['current']);
      await page.evaluate(() => { window.__dualGeo.behavior = 'precise'; }); await detect(page);
      await expect(pickup(page, quick)).toHaveValue(address); await expectedMethods(page, ['current', 'current']);
    });

    test('editing pickup aborts a held one-shot so its late location cannot overwrite the customer', async ({ page }) => {
      await install(page, quick); await chooseOriginal(page, quick);
      await page.evaluate(() => { window.__dualGeo.behavior = 'held'; }); await detect(page); await expectedMethods(page, ['current']);
      await pickup(page, quick).fill('My deliberate new pickup');
      await page.evaluate(coords => window.__dualGeo.pending[0].success({ coords, timestamp: Date.now() }), coords);
      await expect(pickup(page, quick)).toHaveValue('My deliberate new pickup'); await expectedMethods(page, ['current']);
      expect(await page.evaluate(() => window.__mapsMock.calls.filter(call => call.kind === 'geocode'))).toHaveLength(0);
    });

    test('a coarse one-shot starts refinement and a fresh precise watch point fills the address', async ({ page }) => {
      await install(page, quick); await chooseOriginal(page, quick);
      await page.evaluate(() => { window.__dualGeo.behavior = 'coarse'; window.__dualGeo.watchBehavior = 'held'; }); await detect(page);
      await expectedMethods(page, ['current', 'watch']); await expect(pickup(page, quick)).toHaveValue(original);
      await page.evaluate(coords => window.__dualGeo.watch.success({ coords, timestamp: Date.now() }), coords);
      await expect(pickup(page, quick)).toHaveValue(address);
      expect(await page.evaluate(() => window.__dualGeo.clears)).toEqual([0]);
    });
  });
}
