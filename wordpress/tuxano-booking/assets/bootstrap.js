/* Private frame bootstrap: fetch a fresh session before loading the shared form. */
const boot = globalThis.TuxanoBookingBoot;
const app = document.querySelector('#app');
let previousHeight = 0;
let previousView = '';
let pendingResize = false;

function reportSize() {
  if (pendingResize || window.parent === window || !boot?.frameId || !app) return;
  pendingResize = true;
  requestAnimationFrame(() => {
    pendingResize = false;
    // Measure content rather than the viewport, so reducing the iframe height
    // cannot create a resize loop or prevent a shorter form step from shrinking.
    const height = Math.max(240, Math.min(30000, Math.ceil(app.getBoundingClientRect().height)));
    const view = document.body.classList.contains('thank-page') ? 'thank-you' : 'form';
    if (height === previousHeight && view === previousView) return;
    previousHeight = height; previousView = view;
    window.parent.postMessage({ type: 'tuxano-booking:resize', frameId: boot.frameId, height, view }, location.origin);
  });
}

// The iframe may finish before a footer-loaded parent bridge is listening.
// Answer a trusted readiness handshake even when its size has not changed.
window.addEventListener('message', event => {
  if (window.parent === window || event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'tuxano-booking:ready' || event.data.frameId !== boot?.frameId) return;
  previousHeight = 0;
  reportSize();
});

function showError(message) {
  if (!app) return;
  app.replaceChildren();
  const box = document.createElement('div');
  box.className = 'panel';
  box.style.cssText = 'max-width:760px;margin:32px auto;padding:32px';
  box.setAttribute('role', 'alert');
  const heading = document.createElement('h1');
  heading.textContent = 'Booking form could not be loaded';
  const text = document.createElement('p');
  text.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn primary';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => location.reload());
  box.append(heading, text, retry);
  app.append(box);
  reportSize();
}

try {
  if (!boot || typeof boot.restUrl !== 'string' || typeof boot.assetUrl !== 'string') throw new Error('The booking form configuration is missing. Please contact the website administrator.');
  const endpoint = new URL(boot.restUrl + 'session', location.href);
  const assets = new URL(boot.assetUrl, location.href);
  if (endpoint.origin !== location.origin || assets.origin !== location.origin || !['https:', 'http:'].includes(endpoint.protocol)) throw new Error('The booking form configuration is invalid. Please contact the website administrator.');
  if (app) {
    app.style.display = 'flow-root';
    document.body.style.minHeight = '0';
    new ResizeObserver(reportSize).observe(app);
    new MutationObserver(reportSize).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.fonts?.ready.then(reportSize);
  }
  const headers = { 'Content-Type': 'application/json' };
  if (boot.nonce) headers['X-WP-Nonce'] = boot.nonce;
  const response = await fetch(endpoint, { method: 'POST', headers, credentials: 'same-origin', cache: 'no-store', body: '{}', signal: AbortSignal.timeout(20000) });
  let session;
  try { session = await response.json(); } catch { throw new Error('The booking service is temporarily unavailable. Please try again.'); }
  if (!response.ok) throw new Error(session.message || 'The booking service is temporarily unavailable. Please try again.');
  if (!session || typeof session.token !== 'string' || !session.token || !Array.isArray(session.vehicles) || !session.settings || !session.maps) throw new Error('The booking service returned an incomplete configuration. Please try again.');
  let quickTrip = null, quickTripError = '';
  // The fragment carries only an opaque reference. Same-origin sessionStorage
  // holds a bounded, short-lived trip intent, never a price or booking token.
  // Reading the parent directly keeps this compatible with cached embed HTML.
  try {
    const host = window.parent === window ? window : window.parent;
    if (host.location.origin === location.origin && host.location.hash.startsWith('#tuxano-trip=')) {
      const reference = host.location.hash.slice('#tuxano-trip='.length);
      try {
        const { consumeQuickHandoff } = await import(new URL('quick-handoff.js', assets));
        quickTrip = consumeQuickHandoff(sessionStorage, reference, host.location.href);
      } catch (failure) { quickTripError = failure.message || 'Your quick booking details could not be restored. Please enter your trip again.'; }
      host.history.replaceState(host.history.state, '', host.location.pathname + host.location.search);
    }
  } catch { /* Cross-origin parents cannot transfer a quick booking intent. */ }
  globalThis.TuxanoBooking = Object.freeze({ ...session, restUrl: boot.restUrl, assetUrl: assets.href, nonce: boot.nonce || '', quickTrip, quickTripError });
  await import(new URL('app.js', assets));
  reportSize();
} catch (failure) {
  showError(failure.name === 'TimeoutError' || failure.name === 'TypeError' ? 'The booking service could not be reached. Please check your connection and try again.' : failure.message);
}
