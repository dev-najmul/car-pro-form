import { test, expect } from '@playwright/test';

const controls = new WeakMap();

test.beforeEach(async ({ page }) => {
  const control = { errors: [], bookings: 0 }; controls.set(page, control);
  page.on('pageerror', error => control.errors.push(error.message));
  await page.addInitScript(() => {
    window.TuxanoBooking = {
      token: 'a'.repeat(64), restUrl: 'http://127.0.0.1:4173/wp-json/tuxano-booking/v1/',
      maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: 'http://127.0.0.1:4173/wp-json/tuxano-booking/v1/route' },
      settings: { maxStops: 5, minHours: 3, maxHours: 24, typography: { titleLetterSpacing: 1, labelLetterSpacing: 1, buttonLetterSpacing: 2 } },
      vehicles: [{ id: '41', name: 'CITY SEDAN', display: 'City Sedan', capacity: 4, luggageCapacity: 4, tariff: { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 } }],
    };
  });
  await page.route('**/wp-json/tuxano-booking/v1/bookings', route => { control.bookings++; return route.abort(); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'CHECK PRICE', exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(controls.get(page)?.errors || []).toEqual([]);
  expect(controls.get(page)?.bookings || 0).toBe(0);
});

for (const width of [1440, 390, 320]) {
  test(`Step 1 keeps matching map icons and full-width waiting/hour controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.getByRole('button', { name: 'Add stop', exact: true }).click();
    const links = page.locator('.location-map-open');
    await expect(links).toHaveCount(3);
    const families = [];
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('aria-label', /^Choose (?:pickup|drop-off|stop 1) on map$/);
      await expect(link).toHaveText('');
      await expect(link.locator('svg')).toHaveCount(1);
      await expect(link).toHaveCSS('letter-spacing', 'normal');
      await expect(link).toHaveCSS('text-decoration-line', 'none');
      families.push(await link.evaluate(el => getComputedStyle(el).fontFamily));
    }
    expect(new Set(families).size).toBe(1);

    const waiting = page.getByLabel('Stop 1 wait time', { exact: true });
    await waiting.selectOption('15');
    await expect(waiting).toHaveValue('15');
    await expect(waiting).toHaveCSS('letter-spacing', 'normal');
    const row = await page.locator('.stop-wait-label').boundingBox();
    const select = await waiting.boundingBox();
    expect(Math.abs(select.x + select.width - row.x - row.width), 'Waiting select fills the right edge of its row').toBeLessThanOrEqual(1);
    expect(select.width).toBeGreaterThanOrEqual(row.width * (width >= 640 ? .7 : .99));

    const stop = page.getByLabel('Stop 1', { exact: true });
    await stop.focus(); await stop.blur();
    const error = page.locator('.stop-row > .field-error');
    await expect(error).toBeVisible();
    const stopRow = await page.locator('.stop-row').boundingBox();
    const input = await page.locator('.stop-row .location-input').boundingBox();
    const remove = await page.getByRole('button', { name: 'Remove stop 1', exact: true }).boundingBox();
    const message = await error.boundingBox();
    expect(Math.abs(input.y - remove.y)).toBeLessThanOrEqual(1);
    expect(input.width + remove.width + 8).toBeGreaterThanOrEqual(stopRow.width - 1);
    expect(message.y).toBeGreaterThanOrEqual(input.y + input.height);
    expect(message.width).toBeGreaterThanOrEqual(stopRow.width - 1);

    await page.getByRole('button', { name: 'HOURLY', exact: true }).click();
    await expect(waiting).toHaveCount(0);
    const quantity = page.locator('.hour-quantity');
    await expect(quantity).toBeVisible();
    const sizing = await quantity.evaluate(el => ({ control: el.getBoundingClientRect().width, parent: el.parentElement.getBoundingClientRect().width }));
    expect(Math.abs(sizing.control - sizing.parent), 'The existing hour stepper fills its field width').toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Decrease hours', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Increase hours', exact: true }).click();
    await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('4');
    await expect(page.getByLabel('Hours', { exact: true })).toHaveCSS('letter-spacing', 'normal');
    await expect(quantity.locator('label > span')).toHaveCount(0);
    await expect(page.locator('.hours-limits')).toHaveText('3-hour minimum · 24-hour maximum');
    await expect(page.locator('.picker-time-24h, [data-time24]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    if (width === 1440 || width === 390) await page.locator('.trip-panel').screenshot({ path: `/tmp/tuxano-246-step1-${width}.png` });
  });
}
