import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

const origin = 'http://127.0.0.1:4173';
const restUrl = `${origin}/wp-json/tuxano-booking/v1/`;

async function review(page, termsUrl) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ origin, restUrl, termsUrl }) => {
    window.__mapsMock = { calls: [], libraries: [], pending: [], holdSuggestions: [], holdDetails: [], holdRoutes: [], failRoutes: [], routeResults: {}, failSuggestions: [], emptySuggestions: [] };
    window.TuxanoBooking = {
      token: 'a'.repeat(64), assetUrl: `${origin}/`, restUrl,
      maps: { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'remote', routeEndpoint: `${restUrl}route` },
      settings: { termsUrl, privacyUrl: `${origin}/privacy-fixture/`, timezone: 'America/Chicago' },
      vehicles: [{ id: '41', name: 'CITY SEDAN', display: 'City Sedan', category: 'CITY COLLECTION', capacity: 4, luggageCapacity: 4, models: ['Private sedan'], features: ['Private service'], tariff: { base: 50, perMile: 2, perDrivingMinute: 1, minimum: 75, perWaitingMinute: 3, hourly: 80 } }],
    };
  }, { origin, restUrl, termsUrl });
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ contentType: 'text/javascript', body: `(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();` });
  });
  await page.route(`${restUrl}route`, route => route.fulfill({ json: { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', quoteToken: 'b'.repeat(64) } }));
  await page.route(`${restUrl}bookings`, route => { throw new Error('Terms checks must never submit a booking.'); });
  await page.goto('/');
  for (const [label, query] of [['Pickup location', 'Pickup'], ['Drop-off location', 'Destination']]) {
    await page.getByLabel(label, { exact: true }).fill(query);
    await page.getByRole('option', { name: query, exact: true }).click();
  }
  await page.getByLabel('Date', { exact: true }).fill('2030-11-18');
  await page.getByLabel('Pickup time', { exact: true }).fill('14:30');
  await page.getByRole('button', { name: 'CHECK PRICE', exact: true }).click();
  await page.getByRole('button', { name: 'Select & continue with City Sedan', exact: true }).click();
  await page.getByRole('button', { name: /continue to contact/i }).click();
  for (const [label, value] of Object.entries({
    'Billing first name': 'Alex', 'Billing last name': 'Smith', 'Billing email': 'alex@example.com',
    'Billing phone': '+1 3125550199', 'Street address': '123 Main Street', 'City': 'Chicago', 'ZIP / Postal Code': '60601',
  })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Country', { exact: true }).selectOption({ label: 'United States' });
  await page.getByLabel('State / Province', { exact: true }).fill('Illinois');
  await page.getByLabel('Same as billing contact', { exact: true }).check();
  await page.getByRole('button', { name: /continue to review/i }).click();
  await expect(page).toHaveURL(/#review$/);
  expect(errors).toEqual([]);
}

test('configured Terms open in a new tab without accepting consent or changing the booking', async ({ page, context }) => {
  await context.route(`${origin}/terms-fixture/`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Operator terms</title><h1>Operator terms</h1>' }));
  await review(page, `${origin}/terms-fixture/`);
  const checkbox = page.getByRole('checkbox', { name: 'I agree to the Terms & Conditions.', exact: true });
  await expect(checkbox).not.toBeChecked();
  await expect(page.locator('.consent')).not.toContainText('Privacy');
  const link = page.getByRole('link', { name: 'View Terms', exact: true });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await expect(popup).toHaveURL(`${origin}/terms-fixture/`);
  await expect(popup.getByRole('heading', { name: 'Operator terms' })).toBeVisible();
  await expect(page).toHaveURL(/#review$/);
  await expect(checkbox).not.toBeChecked();
  await popup.close();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
});

for (const [name, url] of [['unset', ''], ['unsafe', 'javascript:alert(1)']]) {
  test(`${name} Terms URL does not create a fake link or prevent consent`, async ({ page }) => {
    await review(page, url);
    await expect(page.getByRole('link', { name: 'View Terms', exact: true })).toHaveCount(0);
    const checkbox = page.getByRole('checkbox', { name: 'I agree to the Terms & Conditions.', exact: true });
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole('button', { name: 'SUBMIT RESERVATION REQUEST', exact: true })).toBeEnabled();
  });
}
