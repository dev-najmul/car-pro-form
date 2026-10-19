/* Private frame bootstrap: fetch a fresh session before loading the shared form. */
const boot = globalThis.TuxanoBookingBoot;
const app = document.querySelector('#app');
let previousHeight = 0;
let pendingResize = false;

function reportSize() {
  if (pendingResize || window.parent === window || !boot?.frameId || !app) return;
  pendingResize = true;
  requestAnimationFrame(() => {
    pendingResize = false;
    // Measure content rather than the viewport, so reducing the iframe height
    // cannot create a resize loop or prevent a shorter form step from shrinking.
    const height = Math.max(240, Math.min(30000, Math.ceil(app.getBoundingClientRect().height)));
    if (height === previousHeight) return;
    previousHeight = height;
    window.parent.postMessage({ type: 'tuxano-booking:resize', frameId: boot.frameId, height }, location.origin);
  });
}

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
    document.fonts?.ready.then(reportSize);
  }
  const headers = { 'Content-Type': 'application/json' };
  if (boot.nonce) headers['X-WP-Nonce'] = boot.nonce;
  const response = await fetch(endpoint, { method: 'POST', headers, credentials: 'same-origin', cache: 'no-store', body: '{}', signal: AbortSignal.timeout(20000) });
  let session;
  try { session = await response.json(); } catch { throw new Error('The booking service is temporarily unavailable. Please try again.'); }
  if (!response.ok) throw new Error(session.message || 'The booking service is temporarily unavailable. Please try again.');
  if (!session || typeof session.token !== 'string' || !session.token || !Array.isArray(session.vehicles) || !session.settings || !session.maps) throw new Error('The booking service returned an incomplete configuration. Please try again.');
  globalThis.TuxanoBooking = Object.freeze({ ...session, restUrl: boot.restUrl, assetUrl: assets.href, nonce: boot.nonce || '' });
  await import(new URL('app.js', assets));
  reportSize();
} catch (failure) {
  showError(failure.name === 'TimeoutError' || failure.name === 'TypeError' ? 'The booking service could not be reached. Please check your connection and try again.' : failure.message);
}
