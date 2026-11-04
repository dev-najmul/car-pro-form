import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = `${origin}/wp-json/tuxano-booking/v1/`;
const date = '2030-11-06';
const dateLabel = 'Nov 6, 2030';
const pickupId = 'test-Pickup245';
const dropoffId = 'test-Dropoff245';
const pickup = 'সুজন দেবনাথ মেডিকেল এসোসিয়েট টেকনোলজি এক্সপার্ট, নাজির মহল্লা বোস বাড়ির গলি কায়সার বিল্ডিং এর নিচতলায়, সদর রোড বটতলা হলের বিপরীতে বরিশাল, Barishal 8200, Bangladesh';
const dropoff = 'FDFN INTERNET (RAJABARI), Sreepur Road, Bhawal Bazar, Gazipur 1742, Bangladesh, Building 27, Floor 4, Customer Pickup and Passenger Reception';
const controls = new WeakMap();

async function install(page, addresses) {
  const control = { errors: [], routes: [], bookings: [] }; controls.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(({ origin, restUrl, addresses, pickupId, dropoffId }) => {
    window.TuxanoBooking = {
      token: 'a'.repeat(64), nonce: 'long-address-layout-fixture', assetUrl: `${origin}/`, restUrl,
      maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: `${restUrl}route` },
      settings: { companyName: 'TUXANO', timezone: 'UTC', pickupTimezones: true, typography: { titleLetterSpacing: 1, textLetterSpacing: 1, buttonLetterSpacing: 2 } },
      vehicles: [{ id: '41', name: 'CITY SEDAN', display: 'City Sedan', capacity: 4, luggageCapacity: 4, image: `${origin}/assets/premium-suv.png`, models: ['Configured sedan'], features: ['Private transfers'], category: 'TEST COLLECTION', tariff: { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 } }],
    };
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], countries: { [pickupId]: 'BD', [dropoffId]: 'BD' }, locations: { [pickupId]: { lat: 22.714, lng: 90.35 }, [dropoffId]: { lat: 23.8, lng: 90.4 } } };
    window.__placeCountryNames = { [pickupId]: 'Bangladesh', [dropoffId]: 'Bangladesh' };
    window.__placeCanonicalLabels = { [pickupId]: addresses[0], [dropoffId]: addresses[1] };
  }, { origin, restUrl, addresses, pickupId, dropoffId });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route(`${restUrl}timezone`, route => route.fulfill({ json: { timezone: 'Asia/Dhaka', label: 'Bangladesh Time' } }));
  await page.route(`${restUrl}route`, route => {
    control.routes.push(route.request().postDataJSON());
    return route.fulfill({ json: { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', pickupTimezone: 'Asia/Dhaka', pickupTimezoneLabel: 'Bangladesh Time', quoteToken: 'b'.repeat(64) } });
  });
  await page.route(`${restUrl}bookings`, route => { control.bookings.push(route.request().postDataJSON()); return route.abort(); });
  await page.goto('/');
  for (const [label, query] of [['Pickup location', 'Pickup245'], ['Drop-off location', 'Dropoff245']]) {
    await page.getByLabel(label, { exact: true }).fill(query);
    await page.getByRole('option', { name: query, exact: true }).click();
  }
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill('13:58');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await expect(page).toHaveURL(/#vehicles$/);
  await page.evaluate(() => document.fonts.ready);
  return control;
}

async function textRects(locator) {
  return locator.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); const boxes = [];
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.textContent.trim() || text.parentElement.closest('svg, .sr-only')) continue;
      const range = document.createRange(); range.selectNodeContents(text);
      for (const rect of range.getClientRects()) if (rect.width && rect.height) boxes.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    }
    return boxes;
  });
}
function noOverlap(a, b) { return a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5; }
async function readableSummary(page, addresses) {
  const strip = page.locator('.trip-strip');
  for (const address of addresses) await expect(strip.getByText(address, { exact: true })).toBeVisible();
  const dateText = strip.getByText(dateLabel, { exact: true });
  await expect(dateText).toBeVisible();
  const dateRects = await textRects(dateText);
  expect(new Set(dateRects.map(box => Math.round(box.top))).size, 'Pickup date must remain a readable single line rather than a column of characters').toBe(1);
  const primary = strip.locator('.time-12h');
  const secondary = strip.locator('[data-time24-value]');
  await expect(primary).toHaveText('1:58 PM (Bangladesh Time)');
  await expect(secondary).toHaveText('13:58 (Bangladesh Time)');
  const edit = strip.getByRole('button', { name: 'Edit Trip', exact: true });
  const fragments = [dateRects, await textRects(primary), await textRects(secondary), await textRects(edit), ...await Promise.all(addresses.map(address => textRects(strip.getByText(address, { exact: true }))))];
  for (let i = 0; i < fragments.length; ++i) for (let j = i + 1; j < fragments.length; ++j) {
    for (const a of fragments[i]) for (const b of fragments[j]) expect(noOverlap(a, b), 'Addresses, date, the two pickup clocks and Edit Trip must not paint over one another').toBe(true);
  }
  const stripBox = await strip.boundingBox();
  for (const address of addresses) {
    const text = strip.getByText(address, { exact: true });
    for (const box of await textRects(text)) {
      expect(box.left).toBeGreaterThanOrEqual(stripBox.x - 0.5);
      expect(box.right).toBeLessThanOrEqual(stripBox.x + stripBox.width + 0.5);
    }
  }
  for (const icon of await strip.locator('svg').all()) {
    const box = await icon.boundingBox();
    expect(box.width, 'Summary icons must retain a usable size even beside long addresses').toBeGreaterThanOrEqual(18);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const body = controls.get(page).routes.at(-1);
  expect(body.origin).toEqual({ placeId: pickupId });
  expect(body.destination).toEqual({ placeId: dropoffId });
}

test.afterEach(async ({ page }) => {
  expect(controls.get(page)?.errors || []).toEqual([]);
  expect(controls.get(page)?.bookings || []).toEqual([]);
});

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`full Bengali and English addresses leave dates, dual clocks and editing readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await install(page, [pickup, dropoff]);
    await readableSummary(page, [pickup, dropoff]);
    if (width === 1440 || width === 390) await page.screenshot({ path: width === 1440 ? '/tmp/tuxano-245-long-desktop.png' : '/tmp/tuxano-245-long-phone.png', fullPage: true });
    await page.locator('.trip-strip').getByRole('button', { name: 'Edit Trip', exact: true }).click();
    await expect(page).toHaveURL(/#trip$/);
    await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue(pickup);
    await expect(page.getByLabel('Drop-off location', { exact: true })).toHaveValue(dropoff);
    for (const [field, id] of [['pickup', pickupId], ['dropoff', dropoffId]]) {
      const href = await page.locator(`[data-selected-place="${field}"]`).getByRole('link', { name: /Google Maps/ }).getAttribute('href');
      expect(new URL(href).searchParams.get('query_place_id')).toBe(id);
    }
  });
}

test('an address containing a long unbroken token wraps without altering its canonical identity', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  const unbroken = 'CustomerReceptionAndInternationalTransferTerminal'.repeat(7);
  await install(page, [unbroken, dropoff]);
  await readableSummary(page, [unbroken, dropoff]);
});

test('short addresses retain a compact readable summary with all schedule controls available', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const addresses = ['Barishal, Bangladesh', 'Gazipur, Bangladesh'];
  await install(page, addresses);
  await readableSummary(page, addresses);
});
