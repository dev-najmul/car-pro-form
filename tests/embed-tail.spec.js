import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const bootstrap = readFileSync(new URL('../wordpress/tuxano-booking/assets/bootstrap.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../wordpress/tuxano-booking/assets/embed.js', import.meta.url), 'utf8');

async function embedded(page, { editorClass = 'elementor-widget-text-editor', extra = '' } = {}) {
  await page.route('**/embed-tail-child', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}#app{display:flow-root}.fixture-content{height:620px;background:white}.thank-footer{height:80px;background:#0b1220}</style></head><body class="form-page"><div id="app"></div><script>window.TuxanoBookingBoot={restUrl:location.origin+'/embed-tail-api/',assetUrl:location.origin+'/embed-tail-assets/',frameId:'booking-tail'};</script><script type="module" src="/embed-tail-bootstrap.js"></script></body></html>` }));
  await page.route('**/embed-tail-bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: bootstrap }));
  await page.route('**/embed-tail-api/session', route => route.fulfill({ json: { token: 'synthetic-embed-test', vehicles: [], settings: {}, maps: {} } }));
  await page.route('**/embed-tail-assets/app.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.setFixtureView=view=>{document.body.className=view==='thank-you'?'thank-page':'form-page';document.querySelector('#app').innerHTML='<main class="fixture-content">'+view+'</main><footer class="thank-footer">Receipt footer</footer>'};window.setFixtureView('form');` }));
  await page.goto('/');
  await page.setContent(`<style>html,body{margin:0;padding:0}.editor-section{display:flex;flex-direction:column;background:linear-gradient(#4b3930,#738a57)}iframe{display:block;width:100%;height:1300px;border:0}.editor-section p,.unrelated-widget p{line-height:24px;margin:0 0 14.4px}</style><section class="editor-section"><div class="${editorClass}"><div class="tuxano-booking-embed"><iframe data-tuxano-booking-frame id="booking-tail" src="/embed-tail-child"></iframe></div><p class="wp-block-paragraph" id="" style="display:block">&nbsp;</p>${extra}</div></section><aside class="unrelated-widget"><p class="wp-block-paragraph">&nbsp;</p></aside>`);
  await page.addScriptTag({ content: bridge });
  const child = page.frameLocator('#booking-tail');
  await expect(child.locator('.fixture-content')).toHaveText('form');
  await expect(page.locator('#booking-tail')).toHaveCSS('height', '700px');
  return child;
}

async function tailHeight(page) {
  return page.locator('#booking-tail').evaluate(frame => frame.closest('.editor-section').getBoundingClientRect().bottom - frame.getBoundingClientRect().bottom);
}

test('thank-you ends at its footer despite an Elementor empty shortcode paragraph and restores form spacing', async ({ page }) => {
  const child = await embedded(page);
  const empty = page.locator('.elementor-widget-text-editor > p');
  expect(await tailHeight(page)).toBeCloseTo(38.4, 1);
  await child.locator('body').evaluate(() => window.setFixtureView('thank-you'));
  await expect(empty).toHaveCSS('display', 'none');
  expect(await tailHeight(page)).toBeCloseTo(0, 1);
  await expect(child.locator('.thank-footer')).toBeVisible();
  await expect(page.locator('.unrelated-widget > p')).toHaveCSS('display', 'block');
  await child.locator('body').evaluate(() => window.setFixtureView('form'));
  await expect(empty).toHaveCSS('display', 'block');
  expect(await tailHeight(page)).toBeCloseTo(38.4, 1);
  await expect(empty).toHaveAttribute('style', 'display: block;');
});

test('real editor content after the booking and paragraphs outside a text editor remain intact', async ({ page }) => {
  const child = await embedded(page, { extra: '<p><a href="#policy">Real booking instructions</a></p>' });
  await child.locator('body').evaluate(() => window.setFixtureView('thank-you'));
  await expect(page.getByRole('link', { name: 'Real booking instructions' })).toBeVisible();
  await expect(page.locator('.elementor-widget-text-editor > p').first()).toHaveCSS('display', 'block');
  const plain = await embedded(page, { editorClass: 'plain-editor' });
  await plain.locator('body').evaluate(() => window.setFixtureView('thank-you'));
  await expect(page.locator('.plain-editor > p')).toHaveCSS('display', 'block');
});

test('wrong-source, wrong-origin, wrong-frame and invalid resize messages cannot hide the editor tail', async ({ page }) => {
  const child = await embedded(page);
  const empty = page.locator('.elementor-widget-text-editor > p');
  await page.evaluate(() => {
    const frame = document.querySelector('#booking-tail');
    const data = { type: 'tuxano-booking:resize', frameId: frame.id, height: 700, view: 'thank-you' };
    window.postMessage(data, location.origin);
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://wrong.example', source: frame.contentWindow, data }));
  });
  await child.locator('body').evaluate(() => {
    parent.postMessage({ type: 'tuxano-booking:resize', frameId: 'wrong-frame', height: 700, view: 'thank-you' }, location.origin);
    parent.postMessage({ type: 'tuxano-booking:resize', frameId: 'booking-tail', height: 239, view: 'thank-you' }, location.origin);
  });
  await page.waitForTimeout(50);
  await expect(empty).toHaveCSS('display', 'block');
  expect(await tailHeight(page)).toBeCloseTo(38.4, 1);
});
