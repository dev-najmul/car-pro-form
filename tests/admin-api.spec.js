import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../wordpress/tuxano-booking/assets/admin.js', import.meta.url), 'utf8');
const saved = 'AIza' + 'A'.repeat(35), replacement = 'AIza' + 'B'.repeat(35);
async function settings(page) {
  await page.goto('/');
  await page.getByLabel('Pickup location', { exact: true }).waitFor();
  await page.setContent(`<div class="tuxano-admin"><div data-tuxano-key data-configured="1"><div data-tuxano-key-status><span class="dashicons"></span><strong>Saved and configured</strong></div><div data-tuxano-key-current><button type="button" data-tuxano-key-replace>Replace key</button><button type="button" data-tuxano-key-clear>Remove saved key</button></div><input type="password" data-tuxano-key-input hidden><input data-tuxano-key-clear-value type="hidden" value="0"><button type="button" data-tuxano-test-key="browser">Test saved key</button><p data-tuxano-key-result role="status" hidden></p></div></div>`);
  await page.evaluate(() => { globalThis.TuxanoAdmin = { restUrl: location.origin + '/wp-json/tuxano-booking/v1/', nonce: 'testnonce' }; });
  await page.route('**/wp-json/tuxano-booking/v1/admin/test-api', async route => {
    const body = route.request().postDataJSON();
    expect(route.request().headers()['x-wp-nonce']).toBe('testnonce');
    await route.fulfill({ json: { valid: null, status: 'browser_check_required', browserKey: body.key || saved } });
  });
  await page.addScriptTag({ content: source });
}
const acceptedSDK = `window.google={maps:{importLibrary:async()=>({AutocompleteSessionToken:class{},AutocompleteSuggestion:{fetchAutocompleteSuggestions:async()=>({suggestions:[]})}})}};window.__tuxanoAdminKeyReady();`;
test('browser API tests authorize the saved and replacement key in separate clean frames', async ({ page }) => {
  const keys = [], frames = [];
  await page.route('https://maps.googleapis.com/maps/api/js?*', async route => {
    keys.push(new URL(route.request().url()).searchParams.get('key')); frames.push(route.request().frame());
    await route.fulfill({ contentType: 'application/javascript', body: acceptedSDK });
  });
  await settings(page);
  await page.getByRole('button', { name: 'Test saved key' }).click();
  await expect(page.getByRole('status')).toHaveText('Google Maps JavaScript and Places search accepted this key on this website.');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Replace key' }).click();
  await page.locator('[data-tuxano-key-input]').fill(replacement);
  await page.getByRole('button', { name: 'Test saved key' }).click();
  await expect(page.getByRole('status')).toHaveText('Google Maps JavaScript and Places search accepted this key on this website.');
  expect(keys).toEqual([saved, replacement]); expect(frames[0]).not.toBe(frames[1]);
  await expect(page.locator('iframe')).toHaveCount(0);
});
test('Google browser-key rejection becomes clear feedback without echoing the supplied key', async ({ page }) => {
  await page.route('https://maps.googleapis.com/maps/api/js?*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.gm_authFailure();' }));
  await settings(page);
  await page.getByRole('button', { name: 'Test saved key' }).click();
  await expect(page.getByRole('status')).toContainText('did not authorize this key');
  await expect(page.getByRole('status')).not.toContainText(saved);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Test saved key' })).toBeEnabled();
});
test('API removal remains an explicit saved-settings action and can be undone', async ({ page }) => {
  await settings(page);
  await page.getByRole('button', { name: 'Remove saved key' }).click();
  await expect(page.locator('[data-tuxano-key-clear-value]')).toHaveValue('1');
  await expect(page.getByRole('status')).toContainText('unchanged until then');
  await page.getByRole('button', { name: 'Keep saved key' }).click();
  await expect(page.locator('[data-tuxano-key-clear-value]')).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Replace key' })).toBeVisible();
  await expect(page.locator('[data-tuxano-key-input]')).toHaveValue('');
});
