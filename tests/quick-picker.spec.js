import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:4173';
const restUrl = origin + '/wp-json/tuxano-booking/v1/';
const controls = new WeakMap();

// These checks exercise trusted mouse/touch/keyboard interactions, rather than
// filling native inputs directly (which cannot prove that their picker opens).
test.beforeEach(async ({ page, context }) => {
  const control = { errors: [], submissions: 0 };
  controls.set(page, control);
  page.on('pageerror', failure => control.errors.push(failure.message));
  await context.addInitScript(() => {
    const native = HTMLInputElement.prototype.showPicker;
    window.__quickPickerCalls = [];
    HTMLInputElement.prototype.showPicker = function (...args) {
      window.__quickPickerCalls.push({ type: this.type, active: navigator.userActivation.isActive });
      return native.apply(this, args);
    };
  });
  await context.route(restUrl + 'session', route => route.fulfill({ json: {
    settings: { minHours: 2, maxHours: 12, timezone: 'UTC', bookingPageUrl: origin + '/booking/' },
    maps: { browserConfigured: true, browserKey: 'test-browser-key' },
  } }));
  await context.route(restUrl + 'bookings', route => { control.submissions++; return route.abort(); });
  await context.route(origin + '/quick-picker-test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/quick-booking.css"><style>body{margin:0;padding:24px;background:#526074;box-sizing:border-box}button,input,select{font-family:serif}input{color:red}button{background:red}</style></head><body><div id="picker-test" data-tuxano-quick-booking data-rest-url="${restUrl}" data-booking-url="${origin}/booking/"></div><script type="module" src="/quick-booking.js"></script></body></html>` }));
});

test.afterEach(async ({ page }) => {
  expect(controls.get(page).errors).toEqual([]);
  expect(controls.get(page).submissions).toBe(0);
  expect(new URL(page.url()).pathname).toBe('/quick-picker-test/');
});

async function visit(page) {
  await page.goto('/quick-picker-test/');
  await expect(page.getByLabel('Date', { exact: true })).toBeAttached();
}
const field = (page, type) => page.getByLabel(type === 'date' ? 'Date' : 'Pickup time', { exact: true });
async function expectPopup(input) {
  await expect.poll(() => input.evaluate(element => element.matches(':open'))).toBe(true);
}
async function expectReadableEditor(input) {
  await expect(input).toBeEditable();
  await expect(input).toHaveCSS('opacity', '1');
  const box = await input.boundingBox();
  expect(box.width).toBeGreaterThan(80);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

test('desktop field-center clicks open both native pickers and accept their selections', async ({ page }) => {
  await visit(page);
  for (const type of ['date', 'time']) {
    const input = field(page, type);
    await expect(input).toHaveValue('');
    await input.click();
    await expectPopup(input);
    // Use the actual browser widget to select, without input.fill().
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(input).not.toHaveValue('');
    await expect(page.locator(`[data-quick-display="${type}"]`)).toHaveText(await input.inputValue());
  }
  expect(await page.evaluate(() => window.__quickPickerCalls)).toEqual([{ type: 'date', active: true }, { type: 'time', active: true }]);
});

test.describe('touch phone picker activation', () => {
  test.use({ viewport: { width: 393, height: 900 }, isMobile: true, hasTouch: true });
  test('tapping either field opens its native picker without submitting or losing the label', async ({ page }) => {
    await visit(page);
    for (const type of ['date', 'time']) {
      const input = field(page, type);
      await input.tap();
      await expectPopup(input);
      await page.keyboard.press('Escape');
      await expect(input).toHaveValue('');
    }
    expect(await page.evaluate(() => window.__quickPickerCalls)).toEqual([{ type: 'date', active: true }, { type: 'time', active: true }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});

test('keyboard Enter and Space open the corresponding date and time picker', async ({ page }) => {
  await visit(page);
  for (const [type, key] of [['date', 'Enter'], ['time', 'Space']]) {
    const input = field(page, type);
    await input.focus();
    await input.press(key);
    await expectPopup(input);
    await page.keyboard.press('Escape');
  }
  expect(await page.evaluate(() => window.__quickPickerCalls)).toEqual([{ type: 'date', active: true }, { type: 'time', active: true }]);
});

test('browser without showPicker retains visible editable native controls', async ({ page, context }) => {
  await context.addInitScript(() => { HTMLInputElement.prototype.showPicker = undefined; });
  await visit(page);
  for (const [type, value] of [['date', '2027-11-08'], ['time', '14:30']]) {
    const input = field(page, type);
    await expectReadableEditor(input);
    await input.fill(value);
    await input.press('Tab');
    await expect(input).toHaveValue(value);
  }
});

test('denied native picker falls back to visible editors without an unhandled exception', async ({ page, context }) => {
  await context.addInitScript(() => {
    HTMLInputElement.prototype.showPicker = function () { throw new DOMException('Picker unavailable', 'NotAllowedError'); };
  });
  await visit(page);
  for (const [type, value] of [['date', '2027-11-08'], ['time', '14:30']]) {
    const input = field(page, type);
    await input.click();
    await expectReadableEditor(input);
    await input.fill(value);
    await input.press('Tab');
    await expect(input).toHaveValue(value);
  }
});
