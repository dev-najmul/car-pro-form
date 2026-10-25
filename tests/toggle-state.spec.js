import { test, expect } from '@playwright/test';

async function visualState(control) {
  return control.evaluate(input => {
    const track = input.parentElement.querySelector('span');
    const transform = getComputedStyle(track, '::after').transform;
    return {
      checked: input.checked,
      color: getComputedStyle(track).backgroundColor,
      position: transform === 'none' ? 0 : Number(transform.match(/^matrix\((.+)\)$/)[1].split(',')[4]),
      feedbackBetweenTrack: input.nextElementSibling?.classList.contains('field-error'),
    };
  });
}

for (const [device, width, touch, position] of [['desktop', 1440, false, 20], ['phone', 390, true, 14]]) {
  test.describe(`${device} extras switches`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });

    test('track and knob match the selected extra after inline feedback and rerenders', async ({ page }) => {
      await page.goto('/?demo=1#passengers');
      for (const name of ['Meet & Greet', 'Child Seats']) {
        const control = page.getByRole('checkbox', { name, exact: true });
        await expect(control).toBeChecked();
        if (touch) await control.tap(); else await control.click();
        await expect(control).not.toBeChecked();
        await expect.poll(async () => (await visualState(control)).color).toBe('rgb(150, 154, 165)');
        await expect.poll(async () => (await visualState(control)).position).toBe(0);
        if (name === 'Child Seats') await expect(page.locator('.seat-area')).toHaveCount(0);
        if (touch) await control.tap(); else await control.click();
        await expect(control).toBeChecked();
        // Inline validation inserts feedback between input and its visual
        // track. The switch must still follow native checked state.
        expect((await visualState(control)).feedbackBetweenTrack).toBe(true);
        await expect.poll(async () => (await visualState(control)).color).toBe('rgb(11, 18, 32)');
        await expect.poll(async () => (await visualState(control)).position).toBe(position);
        if (name === 'Child Seats') await expect(page.locator('.seat-area')).toBeVisible();
      }
      await page.getByRole('button', { name: '20%', exact: true }).click();
      for (const name of ['Meet & Greet', 'Child Seats']) {
        const control = page.getByRole('checkbox', { name, exact: true });
        await expect(control).toBeChecked();
        await expect.poll(async () => (await visualState(control)).position).toBe(position);
      }
    });
  });
}

test('keyboard switches retain a visible focus ring and update the extra state', async ({ page }) => {
  await page.goto('/?demo=1#passengers');
  const control = page.getByRole('checkbox', { name: 'Child Seats', exact: true });
  await control.focus();
  await page.keyboard.press('Space');
  await expect(control).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(control).toBeChecked();
  await expect(page.locator('.seat-area')).toBeVisible();
  await expect.poll(() => control.evaluate(input => getComputedStyle(input.parentElement.querySelector('span')).outlineWidth)).toBe('3px');
  await expect.poll(async () => (await visualState(control)).position).toBe(20);
});
