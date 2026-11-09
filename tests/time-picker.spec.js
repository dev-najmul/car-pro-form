import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/controlled-clock-fixture/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;margin:24px}.shell{position:relative;display:block;width:240px;height:52px;border:1px solid #cbd5e4}.shell input{position:absolute;inset:0;width:100%;height:100%;opacity:0}</style></head><body><span class="shell">Pickup time<input type="time" aria-label="Pickup time"></span><button id="other">Other control</button><script type="module">import {mountTimePicker} from '/time-picker.js';window.changes=[];const input=document.querySelector('input');input.addEventListener('input',()=>changes.push(['input',input.value]));input.addEventListener('change',()=>changes.push(['change',input.value]));window.cleanup=mountTimePicker(input,{onChange:value=>changes.push(['callback',value])});window.mounted=true;</script></body></html>` }));
  await page.goto('/controlled-clock-fixture/');
  await expect.poll(() => page.evaluate(() => window.mounted)).toBe(true);
});

const clock = page => page.getByLabel('Pickup time', { exact: true });
const dialog = page => page.getByRole('dialog', { name: 'Choose pickup time' });

test('real clicks open the controlled AM/PM clock without opening the native picker', async ({ page }) => {
  await clock(page).click();
  await expect(dialog(page)).toBeVisible();
  expect(await clock(page).evaluate(input => input.matches(':open'))).toBe(false);
  await expect(dialog(page).getByLabel('Minutes', { exact: true }).locator('option:not([value=""])')).toHaveText(['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
  await dialog(page).getByLabel('Hour', { exact: true }).selectOption('11');
  await dialog(page).getByLabel('Minutes', { exact: true }).selectOption('55');
  await dialog(page).getByLabel('AM / PM', { exact: true }).selectOption('PM');
  await dialog(page).getByRole('button', { name: 'SET TIME', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(clock(page)).toHaveValue('23:55');
  expect(await page.evaluate(() => window.changes)).toEqual([['input', '23:55'], ['change', '23:55'], ['callback', '23:55']]);
  await expect(clock(page)).toBeFocused();
  await expect(clock(page)).toBeEditable();
});

test('cancel and Escape leave an irregular saved time unchanged without implicit rounding', async ({ page }) => {
  await clock(page).fill('14:44');
  await clock(page).click();
  await expect(dialog(page).getByLabel('Minutes', { exact: true })).toHaveValue('');
  await expect(dialog(page).getByRole('button', { name: 'SET TIME', exact: true })).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'CANCEL', exact: true }).click();
  await expect(clock(page)).toHaveValue('14:44');
  await clock(page).press('Enter');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(clock(page)).toHaveValue('14:44');
});

test('keyboard activation and focus wrap remain inside the chooser', async ({ page }) => {
  await clock(page).focus(); await clock(page).press('Space');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel('Hour', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog(page).getByRole('button', { name: 'SET TIME', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog(page).getByLabel('Hour', { exact: true })).toBeFocused();
});

test('backdrop dismissal and cleanup preserve the canonical field and restore attributes', async ({ page }) => {
  await clock(page).fill('12:05'); await clock(page).click();
  await page.mouse.click(2, 2);
  await expect(dialog(page)).toHaveCount(0);
  await expect(clock(page)).toHaveValue('12:05');
  await clock(page).click(); await page.evaluate(() => window.cleanup());
  await expect(dialog(page)).toHaveCount(0);
  await expect(clock(page)).not.toHaveAttribute('data-custom-time-picker');
  await expect(clock(page)).not.toHaveAttribute('aria-haspopup');
  await expect(clock(page)).toBeEditable();
});

test.describe('phone with a 24-hour locale', () => {
  test.use({ viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true, locale: 'en-GB' });
  test('completed touch taps show AM/PM and fit without native activation or overflow', async ({ page }) => {
    await clock(page).tap();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByLabel('AM / PM', { exact: true })).toHaveValue('AM');
    expect(await clock(page).evaluate(input => input.matches(':open'))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await dialog(page).getByLabel('Hour', { exact: true }).selectOption('12');
    await dialog(page).getByLabel('Minutes', { exact: true }).selectOption('05');
    await dialog(page).getByRole('button', { name: 'SET TIME', exact: true }).tap();
    await expect(clock(page)).toHaveValue('00:05');
    await expect(clock(page)).toBeEditable();
  });
});
