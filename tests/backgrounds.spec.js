import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = `${origin}/wp-json/tuxano-booking/v1/`;
const desktop = `${origin}/test-backgrounds/form-desktop.png`;
const mobile = `${origin}/test-backgrounds/form-mobile.png`;
const thankDesktop = `${origin}/test-backgrounds/thank-desktop.png`;
const thankMobile = `${origin}/test-backgrounds/thank-mobile.png`;
const tinyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=', 'base64');
const controls = new WeakMap();
const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

async function install(page, backgrounds) {
  const control = { errors: [], backgrounds: [], bookings: [] }; controls.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(({ backgrounds, origin, restUrl }) => {
    window.TuxanoBooking = {
      token: 'a'.repeat(64), nonce: 'background-fixture', assetUrl: `${origin}/`, restUrl,
      maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: `${restUrl}route` },
      settings: { companyName: 'TUXANO', backgrounds, termsUrl: 'https://example.test/terms', privacyUrl: 'https://example.test/privacy' },
      vehicles: [{ id: '41', name: 'CITY SEDAN', display: 'City Sedan', capacity: 4, luggageCapacity: 4, image: `${origin}/assets/premium-suv.png`, models: ['Configured sedan'], features: ['Private transfers'], category: 'TEST COLLECTION', tariff: { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 } }],
    };
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] };
  }, { backgrounds, origin, restUrl });
  await page.route(`${origin}/test-backgrounds/**`, route => {
    control.backgrounds.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: tinyImage });
  });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  const metrics = { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', calculatedAt: '2026-11-02T00:00:00Z' };
  await page.route(`${restUrl}route`, route => route.fulfill({ json: { ...metrics, quoteToken: 'b'.repeat(64) } }));
  await page.route(`${restUrl}bookings`, route => {
    control.bookings.push(route.request().postDataJSON());
    return route.fulfill({ json: { requestId: 'TUX-BACKGROUND-243', route: metrics, pricing: { transportation: 120, carCost: 0, boosterCost: 0, seats: 0, meet: 0, percent: 20, tip: 24, total: 144, currency: 'USD' } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'RESERVATION REQUEST', exact: true })).toBeVisible();
  return control;
}

async function choose(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function passengers(page) {
  await choose(page, 'Pickup location', 'Selected pickup, Chicago');
  await choose(page, 'Drop-off location', 'Selected airport, Chicago');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
}
async function submit(page) {
  if (!page.url().endsWith('#passengers')) await passengers(page);
  await page.getByRole('button', { name: /continue to contact/i }).click();
  for (const [label, value] of Object.entries({
    'Billing first name': 'Alex', 'Billing last name': 'Smith', 'Billing email': 'alex@example.test',
    'Billing phone': '+1 312 555 0134', 'Street address': '10 Test Avenue', City: 'Chicago',
  })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United States' });
  await page.getByLabel('Same as billing contact', { exact: true }).check();
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#review$/);
  await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
  await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
  await expect(page).toHaveURL(/#thank-you$/);
  await expect(page.getByText('TUX-BACKGROUND-243', { exact: false }).first()).toBeVisible();
}
async function image(locator, url) {
  await expect.poll(() => locator.evaluate(element => getComputedStyle(element).backgroundImage)).toBe(`url("${url}")`);
}
async function receiptStyle(page) {
  await expect(page.locator('body')).toHaveCSS('background-image', 'none');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.thank-hero')).toHaveCSS('background-color', 'rgb(11, 18, 32)');
  await expect(page.locator('.thank-hero .brand-logo')).toBeVisible();
  await expect(page.getByText('Reservation Request Received', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}

test.afterEach(async ({ page }) => {
  expect(controls.get(page)?.errors || []).toEqual([]);
});

test('inherit mode ignores stored photos and keeps a theme background visible through the form', async ({ page }) => {
  const control = await install(page, { form: { mode: 'inherit', desktopUrl: desktop, mobileUrl: mobile } });
  await expect(page.locator('body')).toHaveCSS('background-image', 'none');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveCSS('background-image', 'none');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(control.backgrounds).toEqual([]);
});

test('custom form photo changes at the phone breakpoint and survives rerenders and step navigation', async ({ page }) => {
  await install(page, { form: { mode: 'custom', desktopUrl: desktop, mobileUrl: mobile } });
  await image(page.locator('body'), desktop);
  await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
  await image(page.locator('body'), desktop);
  for (const [width, expected] of [[639, mobile], [640, desktop], [390, mobile], [1440, desktop]]) {
    await page.setViewportSize({ width, height: 1000 }); await image(page.locator('body'), expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.getByRole('button', { name: 'TRANSFER', exact: true }).click();
  await passengers(page); await image(page.locator('body'), desktop);
  await page.getByRole('button', { name: /continue to contact/i }).click(); await image(page.locator('body'), desktop);
  await expect(page.locator('.contact-panel')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('an omitted phone image uses the chosen desktop photo for form and thank-you hero', async ({ page }) => {
  await install(page, { form: { mode: 'custom', desktopUrl: desktop, mobileUrl: '' }, thankYou: { mode: 'custom', desktopUrl: thankDesktop, mobileUrl: '' } });
  await page.setViewportSize({ width: 390, height: 844 }); await image(page.locator('body'), desktop);
  await page.setViewportSize({ width: 1440, height: 1000 }); await submit(page);
  await image(page.locator('.thank-hero'), thankDesktop); await receiptStyle(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await image(page.locator('.thank-hero'), thankDesktop); await receiptStyle(page);
});

test('custom thank-you photos replace only the hero while the saved receipt and branding remain intact', async ({ page }) => {
  await install(page, { form: { mode: 'custom', desktopUrl: desktop, mobileUrl: mobile }, thankYou: { mode: 'custom', desktopUrl: thankDesktop, mobileUrl: thankMobile } });
  await image(page.locator('body'), desktop); await submit(page);
  await image(page.locator('.thank-hero'), thankDesktop); await receiptStyle(page);
  await expect(page.locator('.thank-content')).toContainText('$144.00');
  for (const [width, expected] of [[639, thankMobile], [640, thankDesktop], [390, thankMobile]]) {
    await page.setViewportSize({ width, height: 1000 }); await image(page.locator('.thank-hero'), expected); await receiptStyle(page);
  }
  expect(controls.get(page).bookings).toHaveLength(1);
});

test('default thank-you mode retains the original desktop and phone artwork despite inactive custom URLs', async ({ page }) => {
  const control = await install(page, { thankYou: { mode: 'default', desktopUrl: thankDesktop, mobileUrl: thankMobile } });
  await submit(page);
  await image(page.locator('.thank-hero'), `${origin}/assets/thank-you-desktop.jpg`); await receiptStyle(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await image(page.locator('.thank-hero'), `${origin}/assets/thank-you-mobile.jpg`); await receiptStyle(page);
  expect(control.backgrounds).toEqual([]);
});

test('no-photo thank-you mode retains a navy branded header and readable saved receipt at both sizes', async ({ page }) => {
  const control = await install(page, { thankYou: { mode: 'none', desktopUrl: thankDesktop, mobileUrl: thankMobile } });
  await submit(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('.thank-hero')).toHaveCSS('background-image', 'none'); await receiptStyle(page);
  }
  expect(control.backgrounds).toEqual([]);
});

for (const [kind, bad] of [
  ['script', 'javascript:alert(1)'], ['data', 'data:image/svg+xml,<svg onload=alert(1)>'],
  ['relative', '//example.test/image.jpg'], ['credentials', 'https://user:secret@example.test/image.jpg'],
  ['fragment', `${desktop}#fragment`], ['control characters', `${desktop}\n);display:none`],
]) {
  test(`unsafe ${kind} background URL cannot inject CSS or replace the transparent booking canvas`, async ({ page }) => {
    await install(page, { form: { mode: 'custom', desktopUrl: bad, mobileUrl: bad } });
    await expect(page.locator('body')).toHaveCSS('background-image', 'none');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.page-header h1')).toBeVisible();
    await expect(page.locator('.trip-panel')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
}

test('corrupt custom settings fall back safely for the form and saved receipt', async ({ page }) => {
  await install(page, { form: { mode: 'custom', desktopUrl: '', mobileUrl: mobile }, thankYou: { mode: 'custom', desktopUrl: 'javascript:alert(1)', mobileUrl: thankMobile } });
  await expect(page.locator('body')).toHaveCSS('background-image', 'none');
  await submit(page);
  await image(page.locator('.thank-hero'), `${origin}/assets/thank-you-desktop.jpg`); await receiptStyle(page);
});

test('an invalid phone URL does not discard the valid chosen desktop photo', async ({ page }) => {
  await install(page, { form: { mode: 'custom', desktopUrl: desktop, mobileUrl: 'javascript:alert(1)' } });
  await page.setViewportSize({ width: 390, height: 844 }); await image(page.locator('body'), desktop);
});
