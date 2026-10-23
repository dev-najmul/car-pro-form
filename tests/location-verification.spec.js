import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const id = query => 'test-' + encodeURIComponent(query);
const pickupQuery = 'Nathullahbad Central Bus Terminal';
const pickupAddress = 'Nathullahbad, Barishal Highway, বরিশাল, Bangladesh';
const pickupLabel = `${pickupQuery}, ${pickupAddress}`;
const dropoff = 'Sayedabad, Dhaka, Bangladesh';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ pickupId, pickupQuery, pickupAddress }) => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] };
    window.__placeDisplayNames = { [pickupId]: pickupQuery };
    window.__placeCanonicalLabels = { [pickupId]: pickupAddress };
  }, { pickupId: id(pickupQuery), pickupQuery, pickupAddress });
  await page.route('**/maps-config.json', route => route.fulfill({ json: { browserKey: 'public-verification.fixture', browserConfigured: true, routesConfigured: true, providerMode: 'server' } }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route('**/api/maps/route', route => route.fulfill({ json: { distanceMeters: 166685, durationSeconds: 12171, provider: 'google' } }));
  await page.goto('/');
});

async function select(page, label, query, canonical = query) {
  await page.getByLabel(label, { exact: true }).fill(query);
  await page.getByRole('option', { name: query, exact: true }).click();
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(canonical);
}
async function directTrip(page) {
  await select(page, 'Pickup location', pickupQuery, pickupLabel);
  await select(page, 'Drop-off location', dropoff);
  await expect(page.getByTestId('route-distance')).toHaveText('166.7 km / 103.6 mi');
}
const selectedPickup = page => page.locator('[data-selected-place="pickup"]');
const comparison = page => page.getByRole('link', { name: 'View route in Google Maps', exact: true });

test('full selected addresses and Maps links retain exact pickup and destination IDs and direction', async ({ page }) => {
  await directTrip(page);
  await expect(selectedPickup(page)).toContainText(pickupLabel);
  const placeLink = new URL(await page.getByRole('link', { name: 'View selected pickup location in Google Maps' }).getAttribute('href'));
  expect(placeLink.origin + placeLink.pathname).toBe('https://www.google.com/maps/search/');
  expect(placeLink.searchParams.get('query_place_id')).toBe(id(pickupQuery));
  const routeLink = new URL(await comparison(page).getAttribute('href'));
  expect(routeLink.searchParams.get('origin_place_id')).toBe(id(pickupQuery));
  expect(routeLink.searchParams.get('destination_place_id')).toBe(id(dropoff));
  expect(routeLink.searchParams.get('travelmode')).toBe('driving');
  await expect(page.getByText('Baseline driving estimate. Live traffic and pickup date/time are not included.')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('tuxano-booking-v1')));
  expect(saved.trip.pickupPlace).toEqual({ placeId: id(pickupQuery), text: pickupQuery });
  expect(JSON.stringify(saved)).not.toContain(pickupAddress);
  await page.getByLabel('Pickup location', { exact: true }).fill('Different city');
  await expect(selectedPickup(page)).toBeHidden();
  await expect(comparison(page)).toHaveCount(0);
  await expect(page.getByTestId('route-distance')).toHaveCount(0);
  await expect(page.getByLabel('Travel time', { exact: true })).toBeHidden();
});

test('route comparison preserves stop order and removal replaces the old Maps link', async ({ page }) => {
  await directTrip(page);
  for (const [i, query] of ['First selected stop', 'Second selected stop'].entries()) {
    await page.getByRole('button', { name: 'Add stop', exact: true }).click();
    await select(page, `Stop ${i + 1}`, query);
  }
  await expect(comparison(page)).toBeVisible();
  let link = new URL(await comparison(page).getAttribute('href'));
  expect(link.searchParams.get('waypoint_place_ids')).toBe([id('First selected stop'), id('Second selected stop')].join('|'));
  await page.getByRole('button', { name: 'Remove stop 1', exact: true }).click();
  await expect(page.locator('.selected-location:visible')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'View selected stop 1 in Google Maps' })).toBeVisible();
  await expect.poll(async () => new URL(await comparison(page).getAttribute('href')).searchParams.get('waypoint_place_ids')).toBe(id('Second selected stop'));
  link = new URL(await comparison(page).getAttribute('href'));
  expect(link.searchParams.get('origin_place_id')).toBe(id(pickupQuery));
  expect(link.searchParams.get('destination_place_id')).toBe(id(dropoff));
});

test('fresh draft restoration repopulates readable canonical locations and exact-ID links', async ({ page }) => {
  await directTrip(page);
  const replacement = 'Fresh Google address, Barishal, Bangladesh';
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `window.__placeCanonicalLabels[${JSON.stringify(id(pickupQuery))}]=${JSON.stringify(replacement)};(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.reload();
  await expect(selectedPickup(page)).toContainText(replacement);
  await expect(selectedPickup(page)).not.toContainText(pickupAddress);
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveValue(`${pickupQuery}, ${replacement}`);
  await expect(comparison(page)).toBeVisible();
  expect(new URL(await comparison(page).getAttribute('href')).searchParams.get('origin_place_id')).toBe(id(pickupQuery));
});

test('long canonical address text is safe and fully readable at phone widths; demo data gets no real Maps links', async ({ page }) => {
  const hostile = '<img src=x onerror="window.__unsafeLocation=1">';
  const address = `${hostile}, ${'দীর্ঘ সড়কের নাম '.repeat(16)}, Barishal, Bangladesh`;
  const query = 'Long selected location';
  await page.evaluate(({ placeId, address }) => { window.__placeCanonicalLabels[placeId] = address; }, { placeId: id(query), address });
  await select(page, 'Pickup location', query, address);
  await expect(selectedPickup(page)).toContainText(address);
  expect(await page.evaluate(() => window.__unsafeLocation)).toBeUndefined();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(selectedPickup(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await selectedPickup(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  await page.goto('/?demo=1#trip');
  await expect(page.locator('.selected-location:visible')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /in Google Maps/ })).toHaveCount(0);
});
