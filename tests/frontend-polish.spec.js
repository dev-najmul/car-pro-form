import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { installPlacesStub } from './helpers/google-places-stub.js';

// Demo state supplies complete trip data; these cases exercise new layout and
// field behaviour through the real controls without a live provider dependency.
test('transparent background and a true 1200px content limit apply to every later step', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const route of ['vehicles', 'passengers', 'contact', 'review']) {
    await page.goto('/?demo=1#' + route);
    const box = await page.locator('main').boundingBox();
    expect(Math.round(box.width)).toBe(1200);
    expect(Math.round(box.x)).toBe(360);
    await expect(page.locator('body')).toHaveCSS('background-image', 'none');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.page-header')).toHaveCSS('color', 'rgb(23, 38, 66)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
});

test('all ISO countries are selectable and state/province always remains an optional text field', async ({ page }) => {
  await page.goto('/?demo=1#contact');
  const countries = page.getByLabel('Country', { exact: true });
  await expect(countries.locator('option')).toHaveCount(250); // 249 + placeholder.
  const values = await countries.locator('option:not([value=""])').evaluateAll(options => options.map(option => option.value));
  expect(new Set(values).size).toBe(249);
  expect(values).toContain('Bangladesh');
  expect(values).toContain('New Zealand');
  expect(values).toContain('Zimbabwe');
  const region = page.getByLabel('State / Province', { exact: true });
  const postal = page.getByLabel('ZIP / Postal Code', { exact: true });
  await expect(region).toHaveJSProperty('tagName', 'INPUT');
  await expect(region).toHaveJSProperty('required', false);
  await expect(postal).toHaveJSProperty('required', false);
  await region.fill('My billing region');
  for (const country of ['United States', 'Canada', 'Bangladesh', 'New Zealand']) {
    await countries.selectOption({ label: country });
    await expect(region).toHaveJSProperty('tagName', 'INPUT');
    await expect(region).toHaveValue('My billing region');
  }
  await region.fill(''); await postal.fill('');
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#review$/);
});

test('contact errors appear inline, link to their field and clear while corrected', async ({ page }) => {
  await page.goto('/?demo=1#contact');
  const email = page.getByLabel('Billing email', { exact: true });
  const phone = page.getByLabel('Billing phone', { exact: true });
  await email.fill('not-an-email');
  await phone.fill('call this number');
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(phone).toHaveAttribute('aria-invalid', 'true');
  const id = await email.getAttribute('aria-describedby');
  await expect(page.locator('#' + id)).toBeVisible();
  await expect(page.locator('#' + id)).toContainText('valid email address');
  await expect(email).toHaveCSS('border-top-color', 'rgb(200, 49, 76)');
  await expect(email).toBeFocused();
  await email.fill('alex@example.com');
  await expect(email).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#' + id)).toBeHidden();
  await phone.fill('+1 (312) 555-0134');
  await expect(phone).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#booking-form > .form-error')).toBeHidden();
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#review$/);
});

test('blank required names and malformed optional passenger email get their own feedback', async ({ page }) => {
  await page.goto('/?demo=1#contact');
  const first = page.getByLabel('Billing first name', { exact: true });
  const passengerEmail = page.getByLabel('Passenger email', { exact: true });
  await first.fill('   '); await passengerEmail.fill('missing-at-sign');
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(first).toHaveAttribute('aria-invalid', 'true');
  await expect(passengerEmail).toHaveAttribute('aria-invalid', 'true');
  await first.fill('Alex'); await passengerEmail.fill('');
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#review$/);
});

test('step navigation starts at the top after the continue and back controls', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?demo=1#passengers');
  await page.getByRole('button', { name: /continue to contact/i }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('button', { name: 'BACK', exact: true }).click();
  await expect(page).toHaveURL(/#passengers$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test('phone controls stay readable without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=1#contact');
  await expect(page.getByLabel('Billing email', { exact: true })).toHaveCSS('font-size', '16px');
  await expect(page.getByLabel('State / Province', { exact: true })).toHaveJSProperty('tagName', 'INPUT');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/frontend-polish-contact-phone.png', fullPage: true });
});

test('embedded navigation reveals the frame only for its exact same-origin source and ID', async ({ page }) => {
  await page.addInitScript(() => { if (window.parent !== window) globalThis.TuxanoBookingBoot = { frameId: 'booking-embed-test' }; });
  await page.goto('/?demo=1#trip');
  await page.setContent(`<style>body{margin:0}#wpadminbar{position:fixed;top:0;left:0;right:0;height:32px;background:#123;z-index:10}</style><div id="wpadminbar"></div><div style="height:900px"></div><iframe data-tuxano-booking-frame id="booking-embed-test" src="/?demo=1#passengers" style="width:100%;height:3200px;border:0"></iframe><div style="height:1000px"></div>`);
  await page.addScriptTag({ path: fileURLToPath(new URL('../wordpress/tuxano-booking/assets/embed.js', import.meta.url)) });
  const child = page.frameLocator('iframe');
  await expect(child.getByRole('button', { name: /continue to contact/i })).toBeVisible();
  await page.evaluate(() => { scrollTo(0, 500); window.postMessage({ type: 'tuxano-booking:scroll', frameId: 'booking-embed-test' }, location.origin); });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => scrollY)).toBe(500);
  await page.frames()[1].evaluate(() => parent.postMessage({ type: 'tuxano-booking:scroll', frameId: 'wrong-id' }, location.origin));
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => scrollY)).toBe(500);
  await child.getByRole('button', { name: /continue to contact/i }).click();
  await expect(child.getByRole('heading', { name: /CONTACT & BILLING/ })).toBeVisible();
  await expect.poll(() => page.locator('iframe').evaluate(frame => Math.round(frame.getBoundingClientRect().top))).toBe(44);
});


// A parent theme/Elementor owns its page background; the child booking canvas
// must remain transparent even after step navigation changes its body classes.
test('embedded form keeps the parent background visible across step changes', async ({ page }) => {
  await page.goto('/?demo=1#trip');
  await page.setContent(`<style>html,body{margin:0;background:linear-gradient(90deg,#1a4b38,#bca77d)}iframe{display:block;width:100%;height:2200px;border:0;background:transparent}</style><iframe title="Booking on a custom background" src="/?demo=1#passengers"></iframe>`);
  const child = page.frameLocator('iframe');
  await expect(child.getByRole('button', { name: /continue to contact/i })).toBeVisible();
  await expect(child.locator('html')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(child.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('body')).toHaveCSS('background-image', /linear-gradient/);
  await child.getByRole('button', { name: /continue to contact/i }).click();
  await expect(child.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(child.getByRole('heading', { name: /CONTACT & BILLING/ })).toBeVisible();
});

for (const [width, height, image, heading] of [[1440, 478, 'thank-you-desktop.jpg', '56px'], [390, 352, 'thank-you-mobile.jpg', '36px']]) {
  test(`thank-you restores the original ${width}px reference hero and white receipt`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?demo=1#review');
    await page.getByRole('checkbox', { name: /I agree to the Terms/i }).check();
    await page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true }).click();
    await expect(page).toHaveURL(/#thank-you$/);
    expect(Math.round((await page.locator('.thank-hero').boundingBox()).height)).toBe(height);
    await expect(page.locator('.thank-hero')).toHaveCSS('background-image', new RegExp(image.replaceAll('.', '\\.')));
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('.thank-content > h1')).toHaveCSS('font-size', heading);
    await expect(page.getByText('Reservation Request Received', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
    await page.screenshot({ path: `wordpress-test-results/frontend-211/thank-you-${width}.png`, fullPage: true });
  });
}

test('configured header and navigation colors suit a dark parent background without recoloring form cards', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.TuxanoBooking = {
      vehicles: [{ id: '1', capacity: 6, luggageCapacity: 6 }],
      settings: { formColors: { title: '#ffffff', subtitle: '#eeeeee', stepLabel: '#dddddd', activeStepLabel: '#cccccc', connector: '#bbbbbb', circleBackground: '#aaaaaa', circleText: '#111111', circleBorder: '#999999', activeCircleBackground: '#222222', activeCircleText: '#ffffff' } },
    };
  });
  await page.goto('/');
  await expect(page.locator('.page-header h1')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.page-header > p')).toHaveCSS('color', 'rgb(238, 238, 238)');
  await expect(page.locator('.progress li').nth(1).locator('.step-label')).toHaveCSS('color', 'rgb(221, 221, 221)');
  await expect(page.locator('.active .step-label')).toHaveCSS('color', 'rgb(204, 204, 204)');
  expect(await page.locator('.progress li').first().evaluate(element => getComputedStyle(element, '::after').backgroundColor)).toBe('rgb(187, 187, 187)');
  const inactive = page.locator('.progress li').nth(1).locator('.step-circle');
  await expect(inactive).toHaveCSS('background-color', 'rgb(170, 170, 170)');
  await expect(inactive).toHaveCSS('color', 'rgb(17, 17, 17)');
  await expect(inactive).toHaveCSS('border-top-color', 'rgb(153, 153, 153)');
  await expect(page.locator('.active .step-circle')).toHaveCSS('background-color', 'rgb(34, 34, 34)');
  await expect(page.locator('.active .step-circle')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.trip-panel')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.panel-header h2')).not.toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('untrusted appearance values cannot inject CSS or replace unrelated properties', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.TuxanoBooking = {
      vehicles: [{ id: '1', capacity: 6, luggageCapacity: 6 }],
      settings: { formColors: { title: '#ffffff;display:none', subtitle: 'url(https://example.test/track)', stepLabel: '#fff', unknown: '#abcdef' } },
    };
  });
  await page.goto('/');
  await expect(page.locator('.page-header h1')).toHaveCSS('color', 'rgb(16, 30, 54)');
  await expect(page.locator('.page-header > p')).toHaveCSS('color', 'rgb(82, 97, 122)');
  await expect(page.locator('.page-header h1')).toBeVisible();
  expect(await page.locator('html').getAttribute('style')).toBeNull();
});

for (const width of [1440, 390]) {
  test(`map predictions occupy a full row below the search field at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] };
    });
    await page.route('**/maps-config.json', route => route.fulfill({ json: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'server' } }));
    await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
      const callback = new URL(route.request().url()).searchParams.get('callback');
      return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Choose pickup on map', exact: true }).click();
    const search = page.getByLabel('Search map for pickup', { exact: true });
    await search.fill('Selected hotel address');
    await expect(page.getByRole('option', { name: 'Selected hotel address', exact: true })).toBeVisible();
    const input = await search.boundingBox();
    const dropdown = await page.locator('.pickup-map-picker .places-dropdown').boundingBox();
    const map = await page.locator('.pickup-map-frame').boundingBox();
    expect(Math.abs(dropdown.x - input.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(dropdown.width - input.width)).toBeLessThanOrEqual(1);
    expect(dropdown.y).toBeGreaterThanOrEqual(input.y + input.height);
    expect(dropdown.y + dropdown.height).toBeLessThanOrEqual(map.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
