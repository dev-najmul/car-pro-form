import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../wordpress/tuxano-booking/assets/admin.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../wordpress/tuxano-booking/assets/admin.css', import.meta.url), 'utf8');
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=';
const bundled = 'http://127.0.0.1:4173/email-brand-default.png';
const selected = 'http://127.0.0.1:4173/email-brand-selected.png';

async function settings(page, media = true) {
  await page.route('**/email-brand-*.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(image.split(',')[1], 'base64') }));
  await page.goto('/');
  await page.setContent(`<div class="tuxano-admin"><form><div data-tuxano-email-logo data-default-logo="${bundled}"><div class="tuxano-email-logo-preview"><img src="${bundled}" alt="Email logo preview" data-tuxano-email-logo-preview></div><label for="email-logo-url">Email logo</label><input id="email-logo-url" type="url" name="email_logo_url" data-tuxano-email-logo-input><button type="button" data-tuxano-email-logo-select>Choose image</button><button type="button" data-tuxano-email-logo-reset>Use default logo</button><p role="status" data-tuxano-email-logo-status></p></div></form></div>`);
  if (media) await page.evaluate(selected => {
    window.__mediaOpened = 0;
    window.wp = { media: options => {
      window.__mediaOptions = options;
      let choose;
      return { on: (name, callback) => { choose = callback; }, open: () => { window.__mediaOpened++; choose(); }, state: () => ({ get: () => ({ first: () => ({ toJSON: () => ({ url: selected }) }) }) }) };
    } };
  }, selected);
  await page.addStyleTag({ content: stylesheet });
  await page.addScriptTag({ content: script });
}

test('Media Library selection previews the selected image and reset retains the bundled default', async ({ page }) => {
  await settings(page);
  await expect(page.getByRole('status')).toContainText('bundled TUXANO logo');
  await expect(page.locator('.tuxano-email-logo-preview')).toHaveCSS('background-color', 'rgb(10, 18, 31)');
  await page.getByRole('button', { name: 'Choose image', exact: true }).click();
  expect(await page.evaluate(() => window.__mediaOptions)).toMatchObject({ title: 'Choose email logo', library: { type: 'image' }, multiple: false });
  await expect(page.getByLabel('Email logo', { exact: true })).toHaveValue(selected);
  await expect(page.getByAltText('Email logo preview')).toHaveAttribute('src', selected);
  await page.getByRole('button', { name: 'Use default logo', exact: true }).click();
  await expect(page.getByLabel('Email logo', { exact: true })).toHaveValue('');
  await expect(page.getByAltText('Email logo preview')).toHaveAttribute('src', bundled);
});

test('manual URL entry rejects unsafe schemes and recovers without silently saving', async ({ page }) => {
  await settings(page);
  const input = page.getByLabel('Email logo', { exact: true });
  await input.fill('javascript:alert(1)');
  expect(await input.evaluate(input => input.validity.valid)).toBe(false);
  await expect(page.getByRole('status')).toContainText('valid HTTP/HTTPS');
  await input.fill(selected);
  expect(await input.evaluate(input => input.validity.valid)).toBe(true);
  await expect(page.getByAltText('Email logo preview')).toHaveAttribute('src', selected);
  await expect(page.getByRole('status')).toContainText('Save settings');
});

test('unavailable Media Library preserves a usable manual image URL field', async ({ page }) => {
  await settings(page, false);
  await page.getByRole('button', { name: 'Choose image', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Paste a public image URL');
  await expect(page.getByLabel('Email logo', { exact: true })).toBeEditable();
});
