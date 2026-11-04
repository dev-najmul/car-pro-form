import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = `${origin}/wp-json/tuxano-booking/v1/`;
const configured = { titleLetterSpacing: 1, textLetterSpacing: 1, buttonLetterSpacing: 2 };
const controls = new WeakMap();
const date = '2030-11-18';
const vehicle = { id: '41', name: 'CITY SEDAN', display: 'City Sedan', capacity: 4, luggageCapacity: 4, image: `${origin}/assets/premium-suv.png`, models: ['Configured sedan'], features: ['Private transfers'], category: 'CITY COLLECTION', tariff: { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 } };

async function install(page, typography, quick = false) {
  const control = { errors: [], bookingPosts: 0, redirects: [] }; controls.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  const settings = { typography, timezone: 'UTC', bookingPageUrl: `${origin}/typography-destination/`, minHours: 3, maxHours: 24, termsUrl: 'https://example.test/terms', privacyUrl: 'https://example.test/privacy' };
  const maps = { browserConfigured: true, browserKey: 'test-browser-key', routesConfigured: true, providerMode: 'remote', routeEndpoint: `${restUrl}route` };
  await page.addInitScript(({ quick, settings, maps, vehicle, origin, restUrl }) => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [], countries: { 'test-Pickup': 'US', 'test-Dropoff': 'US' } };
    window.__placeCanonicalLabels = { 'test-Pickup': '312 Sype Dr, Carol Stream, IL, USA', 'test-Dropoff': "Chicago O’Hare International Airport, Chicago, USA" };
    if (!quick) window.TuxanoBooking = { token: 'a'.repeat(64), nonce: 'typography-fixture', assetUrl: `${origin}/`, restUrl, settings, maps, vehicles: [vehicle] };
  }, { quick, settings, maps, vehicle, origin, restUrl });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route(`${restUrl}session`, route => route.fulfill({ json: { token: 'a'.repeat(64), settings, maps, vehicles: [vehicle] } }));
  await page.route(`${restUrl}route`, route => route.fulfill({ json: { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', quoteToken: 'b'.repeat(64) } }));
  await page.route(`${restUrl}bookings`, route => { control.bookingPosts++; return route.abort(); });
  await page.route(`${origin}/typography-destination/**`, route => { control.redirects.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Trip destination</title>' }); });
  await page.route(`${origin}/typography-quick/`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/quick-booking.css"><style>body{margin:0;padding:12px;box-sizing:border-box;font-family:Arial,sans-serif}.host-copy{letter-spacing:3px}.host-button{letter-spacing:4px}</style></head><body><p class="host-copy">Host page text</p><button class="host-button">Host page button</button><div id="spacing-quick" data-tuxano-quick-booking data-rest-url="${restUrl}"></div><script type="module" src="/quick-booking.js"></script></body></html>` }));
  await page.goto(quick ? '/typography-quick/' : '/');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeVisible();
}
async function choose(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function trip(page, quick = false) {
  await choose(page, quick ? 'Pickup Location' : 'Pickup location', 'Pickup');
  await choose(page, quick ? 'Drop-off Location' : 'Drop-off location', 'Dropoff');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:44');
  if (!quick) await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
}
async function fit(page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const overlaps = await page.locator('.progress .step-label').evaluateAll(labels => {
    // Measure rendered text fragments, not the wider label containers: a long
    // word can extend outside its container without increasing page scrollWidth.
    const fragments = labels.map(label => {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      const rects = []; let text;
      while ((text = walker.nextNode())) {
        const range = document.createRange(); range.selectNodeContents(text);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) rects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
        }
      }
      return { label: label.textContent.trim(), rects };
    });
    const collisions = [];
    for (let i = 1; i < fragments.length; i++) {
      for (const previous of fragments[i - 1].rects) for (const current of fragments[i].rects) {
        const horizontal = Math.min(previous.right, current.right) - Math.max(previous.left, current.left);
        const vertical = Math.min(previous.bottom, current.bottom) - Math.max(previous.top, current.top);
        if (horizontal > .5 && vertical > 1) collisions.push({ previous: fragments[i - 1].label, current: fragments[i].label, horizontal });
      }
    }
    return collisions;
  });
  expect(overlaps, 'Adjacent progress labels must not overlap their rendered text').toEqual([]);
}

test.afterEach(async ({ page }) => {
  expect(controls.get(page)?.errors || []).toEqual([]);
  expect(controls.get(page)?.bookingPosts || 0).toBe(0);
});

test('main title, copy, labels, inputs and buttons use the independently configured spacing', async ({ page }) => {
  await install(page, configured);
  await expect(page.locator('.page-header h1')).toHaveCSS('letter-spacing', '1px');
  await expect(page.locator('.page-header > p')).toHaveCSS('letter-spacing', '1px');
  await expect(page.locator('.trip-panel .label').first()).toHaveCSS('letter-spacing', '1px');
  await expect(page.getByLabel('Pickup location', { exact: true })).toHaveCSS('letter-spacing', '1px');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toHaveCSS('letter-spacing', '2px');
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await expect(page.locator('.panel-header h2')).toHaveCSS('letter-spacing', '1px');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toHaveCSS('letter-spacing', '2px');
});

test('quick card typography remains scoped and does not recolor host typography', async ({ page }) => {
  await install(page, configured, true);
  await expect(page.locator('.tuxano-quick-booking-title')).toHaveCSS('letter-spacing', '1px');
  await expect(page.getByLabel('Pickup Location', { exact: true })).toHaveCSS('letter-spacing', '1px');
  await expect(page.locator('.tuxano-quick-booking-note')).toHaveCSS('letter-spacing', '1px');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toHaveCSS('letter-spacing', '2px');
  await expect(page.locator('.host-copy')).toHaveCSS('letter-spacing', '3px');
  await expect(page.locator('.host-button')).toHaveCSS('letter-spacing', '4px');
});

for (const quick of [false, true]) {
  const type = quick ? 'quick' : 'main';
  test(`${type} blank preferences retain original title and control spacing`, async ({ page }) => {
    await install(page, { titleLetterSpacing: null, textLetterSpacing: null, buttonLetterSpacing: null }, quick);
    await expect(page.locator(quick ? '.tuxano-quick-booking-title' : '.page-header h1')).toHaveCSS('letter-spacing', quick ? '-0.6px' : '-1px');
    await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toHaveCSS('letter-spacing', 'normal');
    expect(await page.locator(quick ? '[data-tuxano-quick-booking]' : 'html').getAttribute('data-title-spacing')).toBeNull();
  });
  test(`${type} explicit zero spacing is preserved instead of falling back to defaults`, async ({ page }) => {
    await install(page, { titleLetterSpacing: 0, textLetterSpacing: 0, buttonLetterSpacing: 0 }, quick);
    await expect(page.locator(quick ? '.tuxano-quick-booking-title' : '.page-header h1')).toHaveCSS('letter-spacing', 'normal');
    await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toHaveCSS('letter-spacing', 'normal');
    expect(await page.locator(quick ? '[data-tuxano-quick-booking]' : 'html').evaluate(element => element.style.getPropertyValue('--form-title-letter-spacing'))).toBe('0px');
  });
  test(`${type} unsafe or out-of-bounds values cannot inject CSS or alter the form`, async ({ page }) => {
    await install(page, { titleLetterSpacing: '1px;display:none', textLetterSpacing: 6, buttonLetterSpacing: .05 }, quick);
    await expect(page.locator(quick ? '.tuxano-quick-booking-title' : '.page-header h1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toHaveCSS('letter-spacing', 'normal');
    expect(await page.locator(quick ? '[data-tuxano-quick-booking]' : 'html').getAttribute('data-text-spacing')).toBeNull();
    expect(await page.locator(quick ? '[data-tuxano-quick-booking]' : 'html').getAttribute('data-button-spacing')).toBeNull();
  });
}

for (const width of [320, 390]) {
  test(`configured ${width}px main journey fits through review and keeps long navigation buttons readable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await install(page, configured); await trip(page); await fit(page);
    await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
    await expect(page).toHaveURL(/#vehicles$/); await fit(page);
    await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
    await expect(page).toHaveURL(/#passengers$/); await fit(page);
    const next = page.getByRole('button', { name: /continue to contact/i });
    expect(await next.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await next.click(); await fit(page);
    for (const [field, value] of Object.entries({ 'Billing first name': 'Alex', 'Billing last name': 'Smith', 'Billing email': 'alex@example.test', 'Billing phone': '+1 312 555 0134', 'Street address': '10 Test Avenue', City: 'Chicago' })) await page.getByLabel(field, { exact: true }).fill(value);
    await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United States' });
    await page.getByLabel('Same as billing contact', { exact: true }).check();
    await page.getByRole('button', { name: /continue to review/i }).click();
    await expect(page).toHaveURL(/#review$/); await fit(page);
    await expect(page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true })).toHaveCSS('letter-spacing', '2px');
    if (width === 390) await page.screenshot({ path: '/tmp/tuxano-244-typography-main-phone.png', fullPage: true });
  });
}

test('phone quick card retains both clock formats and transfers the unchanged native time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await install(page, configured, true);
  const time = page.getByLabel('Pickup time', { exact: true });
  for (const [raw, primary] of [['00:00', '12:00 AM'], ['12:00', '12:00 PM'], ['14:44', '2:44 PM'], ['23:59', '11:59 PM']]) {
    await time.fill(raw);
    await expect(page.locator('[data-quick-display="time"]')).toHaveText(primary);
    await expect(page.locator('[data-quick-time24-value]')).toHaveText(raw);
    await expect(page.locator('[data-quick-time24]')).toBeVisible();
    await expect(time).toHaveValue(raw);
  }
  await time.fill(''); await expect(page.locator('[data-quick-time24]')).toBeHidden();
  await trip(page, true); await fit(page);
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toHaveCSS('letter-spacing', '2px');
  await page.screenshot({ path: '/tmp/tuxano-244-typography-quick-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/typography-destination/');
  const handoff = await page.evaluate(() => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(key => key.startsWith('tuxano-quick-trip-v1:')))));
  expect(handoff.trip.time).toBe('14:44');
  expect(handoff.trip).not.toHaveProperty('time24');
  expect(handoff.trip).not.toHaveProperty('time12');
});
