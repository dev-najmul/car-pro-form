import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../wordpress/tuxano-booking/assets/admin.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../wordpress/tuxano-booking/assets/admin.css', import.meta.url), 'utf8');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=', 'base64');
const desktop = 'http://127.0.0.1:4173/background-desktop.png';
const mobile = 'http://127.0.0.1:4173/background-mobile.png';

const group = (page, kind) => page.locator(`[data-tuxano-background-group="${kind}"]`);
const slot = (page, kind, device) => group(page, kind).locator(`[data-tuxano-background-image][data-background-device="${device}"]`);
const input = (page, kind, device) => slot(page, kind, device).locator('[data-tuxano-background-url]');
const mode = (page, kind) => group(page, kind).locator('[data-tuxano-background-mode]');

function backgroundGroup(kind, defaultMode) {
  const title = kind === 'form' ? 'Main booking' : 'Thank-you';
  const fieldPrefix = kind === 'form' ? 'form' : 'thank_you';
  const options = kind === 'form'
    ? '<option value="inherit">Use page background</option><option value="custom">Custom image</option>'
    : '<option value="default">Use original images</option><option value="custom">Custom image</option><option value="none">No image</option>';
  const images = ['desktop', 'mobile'].map(device => `<div class="tuxano-background-image" data-tuxano-background-image data-background-device="${device}"><label for="${kind}-${device}">${title} ${device} background</label><div class="tuxano-background-preview"><img alt="${title} ${device} preview" data-tuxano-background-preview hidden></div><input class="regular-text" id="${kind}-${device}" name="${fieldPrefix}_background_${device}_url" type="url" maxlength="2048" data-tuxano-background-url><div class="tuxano-background-actions"><button type="button" class="button" data-tuxano-background-select>Choose image</button><button type="button" class="button" data-tuxano-background-clear>Clear image</button></div><p class="description" role="status" aria-live="polite" data-tuxano-background-status></p></div>`).join('');
  return `<section class="tuxano-background-group" data-tuxano-background-group="${kind}" data-default-mode="${defaultMode}"><h3>${title}</h3><label for="${kind}-mode">${title} background mode</label><select id="${kind}-mode" name="${fieldPrefix}_background_mode" data-tuxano-background-mode>${options}</select><div class="tuxano-background-images">${images}</div></section>`;
}

async function settings(page, { media = true } = {}) {
  await page.route('**/background-*.png', route => route.fulfill({ contentType: 'image/png', body: image }));
  await page.goto('/');
  await page.setContent(`<div class="tuxano-admin"><form><section class="tuxano-card"><h2>Background images</h2>${backgroundGroup('form', 'inherit')}${backgroundGroup('thankYou', 'default')}<button type="submit">Save settings</button></section></form></div>`);
  await page.evaluate(({ media, desktop }) => {
    window.__backgroundSubmits = 0;
    document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); window.__backgroundSubmits++; });
    if (!media) { delete window.wp; return; }
    window.__nextBackgroundImage = desktop;
    window.__backgroundMediaOptions = [];
    window.wp = { media: options => {
      window.__backgroundMediaOptions.push(options);
      let choose;
      return { on: (_name, callback) => { choose = callback; }, open: () => choose(), state: () => ({ get: () => ({ first: () => ({ toJSON: () => ({ url: window.__nextBackgroundImage }) }) }) }) };
    } };
  }, { media, desktop });
  await page.addStyleTag({ content: stylesheet });
  await page.addScriptTag({ content: script });
}

test('existing default modes do not require or activate a custom background', async ({ page }) => {
  await settings(page);
  await expect(mode(page, 'form')).toHaveValue('inherit');
  await expect(mode(page, 'thankYou')).toHaveValue('default');
  for (const kind of ['form', 'thankYou']) for (const device of ['desktop', 'mobile']) {
    await expect(input(page, kind, device)).toBeDisabled();
    await expect(slot(page, kind, device).locator('[data-tuxano-background-select]')).toBeDisabled();
    expect(await input(page, kind, device).evaluate(element => element.required)).toBe(false);
  }
  expect(await page.locator('form').evaluate(element => element.checkValidity())).toBe(true);
});

test('custom mode requires a desktop image while phone images stay optional', async ({ page }) => {
  await settings(page);
  await mode(page, 'form').selectOption('custom');
  await expect(input(page, 'form', 'desktop')).toBeEnabled();
  expect(await input(page, 'form', 'desktop').evaluate(element => element.required && !element.checkValidity())).toBe(true);
  expect(await input(page, 'form', 'mobile').evaluate(element => !element.required && element.checkValidity())).toBe(true);
  await input(page, 'form', 'desktop').fill(desktop);
  expect(await page.locator('form').evaluate(element => element.checkValidity())).toBe(true);
  await expect(slot(page, 'form', 'mobile').locator('[data-tuxano-background-status]')).toContainText(/desktop|same|fallback/i);
  await expect(input(page, 'thankYou', 'desktop')).toBeDisabled();
});

test('switching off custom backgrounds preserves saved choices without hidden validation errors', async ({ page }) => {
  await settings(page);
  await mode(page, 'thankYou').selectOption('custom');
  await input(page, 'thankYou', 'desktop').fill(desktop);
  await input(page, 'thankYou', 'mobile').fill(mobile);
  await mode(page, 'thankYou').selectOption('none');
  await expect(input(page, 'thankYou', 'desktop')).toHaveValue(desktop);
  await expect(input(page, 'thankYou', 'mobile')).toHaveValue(mobile);
  await expect(input(page, 'thankYou', 'desktop')).toBeDisabled();
  expect(await page.locator('form').evaluate(element => element.checkValidity())).toBe(true);
  await mode(page, 'thankYou').selectOption('custom');
  await expect(input(page, 'thankYou', 'desktop')).toBeEnabled();
  await expect(input(page, 'thankYou', 'desktop')).toHaveValue(desktop);
  await input(page, 'thankYou', 'desktop').fill('javascript:alert(1)');
  expect(await input(page, 'thankYou', 'desktop').evaluate(element => element.checkValidity())).toBe(false);
  await mode(page, 'thankYou').selectOption('default');
  expect(await page.locator('form').evaluate(element => element.checkValidity())).toBe(true);
});

test('Media Library selection previews the targeted image and keeps the other group unchanged', async ({ page }) => {
  await settings(page);
  await mode(page, 'form').selectOption('custom');
  await slot(page, 'form', 'desktop').getByRole('button', { name: 'Choose image', exact: true }).click();
  await expect(input(page, 'form', 'desktop')).toHaveValue(desktop);
  await expect(slot(page, 'form', 'desktop').locator('[data-tuxano-background-preview]')).toHaveAttribute('src', desktop);
  await expect(slot(page, 'form', 'desktop').locator('[data-tuxano-background-preview]')).toBeVisible();
  expect(await page.evaluate(() => window.__backgroundMediaOptions.at(-1))).toMatchObject({ library: { type: 'image' }, multiple: false });
  await page.evaluate(mobile => { window.__nextBackgroundImage = mobile; }, mobile);
  await slot(page, 'form', 'mobile').getByRole('button', { name: 'Choose image', exact: true }).click();
  await expect(input(page, 'form', 'mobile')).toHaveValue(mobile);
  await expect(input(page, 'thankYou', 'desktop')).toHaveValue('');
  await expect(mode(page, 'thankYou')).toHaveValue('default');
  expect(await page.evaluate(() => window.__backgroundSubmits)).toBe(0);
});

test('clearing a phone image returns to desktop fallback and clearing desktop requires a replacement', async ({ page }) => {
  await settings(page);
  await mode(page, 'form').selectOption('custom');
  await input(page, 'form', 'desktop').fill(desktop); await input(page, 'form', 'mobile').fill(mobile);
  await slot(page, 'form', 'mobile').getByRole('button', { name: 'Clear image', exact: true }).click();
  await expect(input(page, 'form', 'mobile')).toHaveValue('');
  await expect(slot(page, 'form', 'mobile').locator('[data-tuxano-background-status]')).toContainText(/desktop|same|fallback/i);
  expect(await page.locator('form').evaluate(element => element.checkValidity())).toBe(true);
  await slot(page, 'form', 'desktop').getByRole('button', { name: 'Clear image', exact: true }).click();
  await expect(input(page, 'form', 'desktop')).toHaveValue('');
  expect(await input(page, 'form', 'desktop').evaluate(element => element.checkValidity())).toBe(false);
});

test('unsafe image URLs cannot preview or pass validation and a valid URL recovers', async ({ page }) => {
  await settings(page);
  await mode(page, 'form').selectOption('custom');
  const field = input(page, 'form', 'desktop');
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//example.test/image.png', 'https://user:pass@example.test/image.png', 'https://example.test/image.png#fragment', 'https://example.test/image name.png']) {
    await field.fill(value);
    expect(await field.evaluate(element => element.checkValidity())).toBe(false);
    await expect(slot(page, 'form', 'desktop').locator('[data-tuxano-background-preview]')).toBeHidden();
  }
  await field.fill(desktop);
  expect(await field.evaluate(element => element.checkValidity())).toBe(true);
  await expect(slot(page, 'form', 'desktop').locator('[data-tuxano-background-preview]')).toHaveAttribute('src', desktop);
  await expect(slot(page, 'form', 'desktop').locator('[data-tuxano-background-preview]')).toBeVisible();
});

test('unavailable Media Library retains a manual image URL path', async ({ page }) => {
  await settings(page, { media: false });
  await mode(page, 'form').selectOption('custom');
  await slot(page, 'form', 'desktop').getByRole('button', { name: 'Choose image', exact: true }).click();
  await expect(slot(page, 'form', 'desktop').locator('[data-tuxano-background-status]')).toContainText(/paste.*URL/i);
  await expect(input(page, 'form', 'desktop')).toBeEditable();
  await input(page, 'form', 'desktop').fill(desktop);
  expect(await page.locator('form').evaluate(element => element.checkValidity())).toBe(true);
});

test('the background settings remain usable on a narrow phone without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await settings(page);
  await mode(page, 'form').selectOption('custom');
  await input(page, 'form', 'desktop').fill(desktop);
  await expect(input(page, 'form', 'desktop')).toBeEditable();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
