import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../wordpress/tuxano-booking/assets/admin.js', import.meta.url), 'utf8');
const rate = (field, value, hourly = false) => `<div class="tuxano-rate-field"><input type="number" aria-label="${hourly ? 'Hourly ' : 'Transfer '}${field}" data-tuxano-${hourly ? 'hourly-rate' : 'rate'}="${field}" value="${value}"><input type="checkbox" data-tuxano-${hourly ? 'hourly-toggle' : 'rate-toggle'}="${field}" ${value === 0 ? 'checked' : ''}></div>`;
const rules = { pickupFreeMinutes: 30, returnFreeMinutes: 30, roundingMinutes: 15, minimumMinutes: 60, pickupFreeMiles: 20, returnFreeMiles: 20 };

test.beforeEach(async ({ page }) => {
  await page.setContent(`<section class="tuxano-vehicle-pricing" data-tuxano-currency="USD">
    <label>Transfer method<select data-tuxano-transfer-mode><option value="mileage">Mileage</option><option value="time">Time</option></select></label>
    <section data-tuxano-method-section="mileage"><span data-tuxano-method-status></span></section>
    <section data-tuxano-method-section="time"><span data-tuxano-method-status></span></section>
    ${Object.entries({ base: 0, perMile: 3, perDrivingMinute: 2.5, minimum: 150, perWaitingMinute: 2.5, hourly: 150 }).map(([key, value]) => rate(key, value)).join('')}
    ${Object.entries({ hourly: 150, perMile: 2, perWaitingMinute: 1 }).map(([key, value]) => rate(key, value, true)).join('')}
    ${Object.entries(rules).map(([key, value]) => `<input type="number" min="${key === 'roundingMinutes' || key === 'minimumMinutes' ? 1 : 0}" data-tuxano-transfer-rule="${key}" value="${value}">`).join('')}
    <span data-tuxano-example-total></span><span data-tuxano-example-long></span>
    <span data-tuxano-example-detail></span><span data-tuxano-example-long-detail></span>
    <span data-tuxano-hourly-example></span>
  </section>`);
  await page.addScriptTag({ content: script });
});

test('the method selector immediately switches document examples and active method without losing rates', async ({ page }) => {
  const method = page.getByLabel('Transfer method');
  await expect(page.locator('[data-tuxano-example-total]')).toHaveText('$150.00');
  await expect(page.locator('[data-tuxano-example-long]')).toHaveText('$643.20');
  await method.selectOption('time');
  await expect(page.locator('[data-tuxano-example-long]')).toHaveText('$525.00');
  await expect(page.locator('[data-tuxano-method-section="time"]')).not.toHaveClass(/is-inactive/);
  await expect(page.locator('[data-tuxano-method-section="mileage"]')).toHaveClass(/is-inactive/);
  await expect(page.locator('[data-tuxano-method-section="time"] [data-tuxano-method-status]')).toHaveText('Active method');
  await method.selectOption('mileage');
  await expect(page.locator('[data-tuxano-example-long]')).toHaveText('$643.20');
  await expect(page.getByLabel('Transfer perMile', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Transfer hourly', { exact: true })).toHaveValue('150');
});

test('editing Hourly rates changes only the Hourly preview', async ({ page }) => {
  await expect(page.locator('[data-tuxano-hourly-example]')).toHaveText('$505.00');
  await page.getByLabel('Hourly hourly', { exact: true }).fill('175');
  await expect(page.locator('[data-tuxano-hourly-example]')).toHaveText('$580.00');
  await expect(page.locator('[data-tuxano-example-long]')).toHaveText('$643.20');
  await expect(page.getByLabel('Transfer hourly', { exact: true })).toHaveValue('150');
  await expect(page.getByLabel('Hourly perMile', { exact: true })).toHaveValue('2');
});
