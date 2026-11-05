/* Public booking credentials stay in memory; form drafts never enter this module. */
const sessions = new WeakMap();
const publicPaths = new Set(['route', 'timezone', 'availability', 'bookings']);
const retryMessage = 'We could not reconnect to the booking service. Your details are still here. Please try again.';
const aborted = () => new DOMException('Booking request cancelled.', 'AbortError');
const failure = (message, code = 'tuxano_session_retry') => Object.assign(new Error(message), { code });

function restBase(restUrl) {
  const page = globalThis.location?.href || restUrl;
  let base;
  try { base = new URL(restUrl, page); } catch { throw failure('The booking service configuration is invalid.'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.hash || globalThis.location?.origin && base.origin !== globalThis.location.origin) throw failure('The booking service configuration is invalid.');
  return base;
}

function endpoint(restUrl, path) {
  const base = restBase(restUrl);
  const url = new URL(restUrl + path, globalThis.location?.href || base.href);
  if (url.origin !== base.origin || url.username || url.password || url.hash) throw failure('The booking service configuration is invalid.');
  return url;
}

function protectedEndpoint(runtime, input) {
  const base = restBase(runtime?.restUrl);
  let url;
  try { url = new URL(input, globalThis.location?.href || base.href); } catch { throw failure('The booking request URL is invalid.'); }
  if (url.origin !== base.origin || url.username || url.password || url.hash) throw failure('The booking request URL is invalid.');
  const plain = base.searchParams.get('rest_route');
  const route = plain ? url.searchParams.get('rest_route') : url.pathname;
  const prefix = plain || base.pathname;
  if (typeof route !== 'string' || !route.startsWith(prefix) || !publicPaths.has(route.slice(prefix.length).replace(/\/$/, ''))) throw failure('The booking request URL is invalid.');
  return url;
}

function stateFor(runtime) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) throw failure('The booking session is unavailable.');
  if (!sessions.has(runtime)) sessions.set(runtime, {
    token: typeof runtime.token === 'string' ? runtime.token : '',
    recovery: typeof runtime.sessionRecovery === 'string' ? runtime.sessionRecovery : '',
    expiresAt: Number.isFinite(runtime.sessionExpiresAt) ? runtime.sessionExpiresAt : 0,
    revision: 0, renewal: null, configuration: null,
  });
  return sessions.get(runtime);
}

function waitFor(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(aborted()); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

async function sessionRequest(restUrl, headers, signal) {
  const url = endpoint(restUrl, 'session');
  if (signal?.aborted) throw aborted();
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 20000);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers, body: '{}', signal: controller.signal });
    let data;
    try { data = await response.json(); } catch { throw failure('The booking service returned an invalid response. Please try again.'); }
    if (!response.ok) throw failure(typeof data?.message === 'string' ? data.message : retryMessage, typeof data?.code === 'string' ? data.code : 'tuxano_session_retry');
    if (!data || typeof data.token !== 'string' || !data.token || data.token.length > 256 || /[\u0000-\u0020\u007f]/u.test(data.token)) throw failure('The booking service returned an incomplete session. Please try again.');
    return data;
  } catch (error) {
    if (signal?.aborted) throw aborted();
    if (controller.signal.aborted) throw failure('The booking service took too long to respond. Please try again.');
    if (error.code) throw error;
    throw failure('The booking service could not be reached. Please try again.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

/** Initial public sessions deliberately omit WordPress login nonces. */
export function fetchBookingSession(restUrl, { signal } = {}) {
  return sessionRequest(restUrl, { 'Content-Type': 'application/json' }, signal);
}

export const currentSessionToken = runtime => stateFor(runtime).token;
export const sessionRevision = runtime => stateFor(runtime).revision;

/** Resume the same anonymous booking identity; never silently rotate it. */
export async function renewBookingSession(runtime, { signal, expectedRevision } = {}) {
  if (signal?.aborted) throw aborted();
  const state = stateFor(runtime);
  if (Number.isInteger(expectedRevision) && state.revision !== expectedRevision) return { revision: state.revision, tokenChanged: false, configuration: state.configuration };
  if (!state.renewal) {
    const token = state.token;
    const headers = { 'Content-Type': 'application/json', 'X-Tuxano-Session': token };
    if (state.recovery && state.recovery.length <= 2048 && !/[\u0000-\u0020\u007f]/u.test(state.recovery)) headers['X-Tuxano-Recovery'] = state.recovery;
    state.renewal = sessionRequest(runtime.restUrl, headers).then(data => {
      if (data.token !== token) throw failure('Your booking connection changed. Your details are still here; please check your trip again.', 'tuxano_session_changed');
      if (typeof data.sessionRecovery === 'string') state.recovery = data.sessionRecovery;
      if (Number.isFinite(data.sessionExpiresAt)) state.expiresAt = data.sessionExpiresAt;
      state.configuration = {
        settings: data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : null,
        vehicles: Array.isArray(data.vehicles) ? data.vehicles : null,
        pricingRevision: typeof data.pricingRevision === 'string' && /^[a-f0-9]{64}$/.test(data.pricingRevision) ? data.pricingRevision : '',
      };
      state.revision++;
      return { revision: state.revision, tokenChanged: false, configuration: state.configuration };
    }).catch(error => {
      if (error.code === 'tuxano_session_changed') throw error;
      throw failure(retryMessage);
    }).finally(() => { state.renewal = null; });
  }
  // Cancelling one lookup does not cancel a renewal shared by another lookup.
  return waitFor(state.renewal, signal);
}

/** Retry an explicit expired session once, retaining JSON and idempotency keys. */
export async function bookingFetch(runtime, input, init = {}) {
  const url = protectedEndpoint(runtime, input);
  if ((init.method || 'POST').toUpperCase() !== 'POST') throw failure('The booking request method is invalid.');
  if (init.signal?.aborted) throw aborted();
  const state = stateFor(runtime);
  if (state.renewal) await waitFor(state.renewal, init.signal);
  if (state.recovery && state.expiresAt > 0 && Date.now() / 1000 >= state.expiresAt - 60) await renewBookingSession(runtime, { signal: init.signal, expectedRevision: state.revision });
  const attempt = async () => {
    const headers = new Headers(init.headers || {});
    headers.set('Content-Type', 'application/json');
    headers.set('X-Tuxano-Session', state.token);
    // These endpoints authenticate an anonymous booking, not a WordPress user.
    headers.delete('X-WP-Nonce');
    headers.delete('X-Tuxano-Recovery');
    if (state.recovery && state.recovery.length <= 2048 && !/[\u0000-\u0020\u007f]/u.test(state.recovery)) headers.set('X-Tuxano-Recovery', state.recovery);
    return fetch(url, { ...init, method: 'POST', headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  };
  const revision = state.revision;
  const response = await attempt();
  if (response.status !== 403) return response;
  let error;
  try { error = await response.clone().json(); } catch { return response; }
  if (error?.code !== 'tuxano_session' && error?.code !== 'rest_cookie_invalid_nonce') return response;
  if (error.code === 'tuxano_session') await renewBookingSession(runtime, { signal: init.signal, expectedRevision: revision });
  if (init.signal?.aborted) throw aborted();
  const retried = await attempt();
  if (retried.status === 403) {
    try { if ((await retried.clone().json())?.code === 'tuxano_session') throw failure(retryMessage); }
    catch (error) { if (error.code === 'tuxano_session_retry') throw error; }
  }
  return retried;
}
