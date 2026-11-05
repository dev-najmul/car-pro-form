import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingFetch, currentSessionToken, fetchBookingSession, renewBookingSession, sessionRevision } from '../session-client.js';

const base = 'https://booking.example/wp-json/tuxano-booking/v1/';
const token = 'a'.repeat(64);
const proof = suffix => `v1.1800000000.1800604800.${suffix.repeat(64)}`;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const expired = () => json({ code: 'tuxano_session', message: 'Your booking session has expired. Refresh this page.' }, 403);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const runtime = extra => Object.freeze({ restUrl: base, token, sessionRecovery: proof('b'), sessionExpiresAt: Date.now() / 1000 + 7200, nonce: 'old-wordpress-nonce', ...extra });
function fixture(t, handle) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const call = { url: String(url), ...options, headers: new Headers(options.headers) }; calls.push(call);
    return handle(call, calls);
  };
  t.after(() => { globalThis.fetch = previous; });
  return calls;
}
const fresh = () => json({ token, sessionRecovery: proof('c'), sessionExpiresAt: Date.now() / 1000 + 7200, settings: {}, maps: {}, vehicles: [], pricingRevision: 'd'.repeat(64) });

test('a public initial session omits WordPress nonces and is never cached', async t => {
  const calls = fixture(t, () => fresh());
  const session = await fetchBookingSession(base);
  assert.equal(session.token, token);
  assert.equal(calls[0].url, base + 'session');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].credentials, 'same-origin');
  assert.equal(calls[0].cache, 'no-store');
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[0].headers.has('X-WP-Nonce'), false);
  assert.equal(calls[0].headers.has('X-Tuxano-Session'), false);
});

test('public calls use bounded in-memory credentials and preserve the JSON request key', async t => {
  const calls = fixture(t, () => json({ ok: true }));
  const session = runtime();
  const body = JSON.stringify({ requestKey: 'original-idempotency-key', booking: { consent: true } });
  await bookingFetch(session, base + 'bookings', { method: 'POST', body, headers: { 'X-WP-Nonce': 'stale', 'X-Tuxano-Session': 'wrong', 'X-Tuxano-Recovery': 'wrong' } });
  assert.equal(calls[0].body, body);
  assert.equal(calls[0].headers.get('X-Tuxano-Session'), token);
  assert.equal(calls[0].headers.get('X-Tuxano-Recovery'), proof('b'));
  assert.equal(calls[0].headers.has('X-WP-Nonce'), false);
  assert.equal(Object.isFrozen(session), true);
  assert.equal(sessionRevision(session), 0);
});

test('explicit session expiry resumes the same token and retries the exact request once', async t => {
  let requests = 0;
  const calls = fixture(t, call => call.url.endsWith('/session') ? fresh() : ++requests === 1 ? expired() : json({ requestId: 'TUX-RECOVERED' }));
  const session = runtime();
  const body = JSON.stringify({ requestKey: 'never-change-this-key', quoteToken: 'same-quote', booking: { billing: { first: 'Kept' } } });
  const result = await bookingFetch(session, base + 'bookings', { body });
  assert.equal((await result.json()).requestId, 'TUX-RECOVERED');
  assert.deepEqual(calls.map(call => call.url), [base + 'bookings', base + 'session', base + 'bookings']);
  assert.equal(calls[0].body, calls[2].body);
  assert.equal(calls[1].headers.get('X-Tuxano-Session'), token);
  assert.equal(calls[1].headers.get('X-Tuxano-Recovery'), proof('b'));
  assert.equal(calls[2].headers.get('X-Tuxano-Recovery'), proof('c'));
  assert.equal(currentSessionToken(session), token);
  assert.equal(session.token, token);
  assert.equal(session.sessionRecovery, proof('b')); // Frozen caller snapshot is not mutated.
  assert.equal(sessionRevision(session), 1);
});

test('a genuine origin/permission failure is returned without renewing or retrying', async t => {
  const calls = fixture(t, () => json({ code: 'tuxano_origin', message: 'Wrong origin' }, 403));
  const response = await bookingFetch(runtime(), base + 'timezone', { body: '{}' });
  assert.equal((await response.json()).code, 'tuxano_origin');
  assert.equal(calls.length, 1);
});

test('an unexpected rotated session cannot replay a booking or expose another quote', async t => {
  const calls = fixture(t, call => call.url.endsWith('/session') ? json({ token: 'd'.repeat(64) }) : expired());
  const session = runtime();
  await assert.rejects(bookingFetch(session, base + 'bookings', { body: '{}' }), { code: 'tuxano_session_changed' });
  assert.equal(calls.length, 2);
  assert.equal(currentSessionToken(session), token);
});

test('concurrent expiry uses one renewal and a late old denial reuses completed recovery', async t => {
  const held = deferred(), late = deferred(); let renewed = false, renewals = 0, routeCalls = 0, timezoneCalls = 0;
  const calls = fixture(t, async call => {
    if (call.url.endsWith('/session')) { renewals++; await held.promise; renewed = true; return fresh(); }
    if (call.url.endsWith('/route')) return ++routeCalls === 1 ? expired() : json({ route: true });
    if (++timezoneCalls === 1) { await late.promise; return expired(); }
    return json({ timezone: true });
  });
  const session = runtime();
  const route = bookingFetch(session, base + 'route', { body: '{}' });
  const timezone = bookingFetch(session, base + 'timezone', { body: '{}' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(renewals, 1); held.resolve();
  assert.equal((await (await route).json()).route, true);
  assert.equal(renewed, true); late.resolve();
  assert.equal((await (await timezone).json()).timezone, true);
  assert.equal(renewals, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/session')).length, 1);
});

test('cancelling one lookup does not cancel another caller sharing renewal', async t => {
  const held = deferred(); let renewed = false;
  fixture(t, async call => {
    if (call.url.endsWith('/session')) { await held.promise; renewed = true; return fresh(); }
    return renewed ? json({ ok: true }) : expired();
  });
  const session = runtime(); const controller = new AbortController();
  const first = bookingFetch(session, base + 'timezone', { body: '{}', signal: controller.signal });
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = bookingFetch(session, base + 'route', { body: '{}' });
  await new Promise(resolve => setImmediate(resolve)); controller.abort(); await rejected;
  held.resolve(); assert.equal((await (await second).json()).ok, true);
  assert.equal(sessionRevision(session), 1);
});

test('a repeated expiry is bounded and never displays the stale refresh-page instruction', async t => {
  const calls = fixture(t, call => call.url.endsWith('/session') ? fresh() : expired());
  await assert.rejects(bookingFetch(runtime(), base + 'route', { body: '{}' }), error => error.code === 'tuxano_session_retry' && !/expired|refresh this page/i.test(error.message));
  assert.equal(calls.length, 3);
});

test('known expiry refreshes credentials before protected work without changing quote ownership', async t => {
  const calls = fixture(t, call => call.url.endsWith('/session') ? fresh() : json({ ok: true }));
  const session = runtime({ sessionExpiresAt: Date.now() / 1000 - 10 });
  await bookingFetch(session, base + 'availability', { body: JSON.stringify({ quoteToken: 'still-bound-to-same-token' }) });
  assert.deepEqual(calls.map(call => call.url), [base + 'session', base + 'availability']);
  assert.equal(calls[1].headers.get('X-Tuxano-Session'), token);
});

test('renewal network failures preserve the caller and provide retry guidance', async t => {
  const calls = fixture(t, call => { if (call.url.endsWith('/session')) throw new TypeError('Private network diagnostic'); return expired(); });
  const session = runtime();
  await assert.rejects(bookingFetch(session, base + 'bookings', { body: '{}' }), error => error.code === 'tuxano_session_retry' && /details are still here/.test(error.message) && !error.message.includes('Private network'));
  assert.equal(calls.length, 2);
  assert.equal(currentSessionToken(session), token);
});

test('credentials cannot be sent to an external or administrator endpoint', async t => {
  const calls = fixture(t, () => json({ ok: true })); const session = runtime();
  for (const url of ['https://other.example/wp-json/tuxano-booking/v1/route', base + 'admin/route', 'https://user:secret@booking.example/wp-json/tuxano-booking/v1/route', base + 'route#fragment']) {
    await assert.rejects(bookingFetch(session, url, { body: '{}' }));
  }
  assert.equal(calls.length, 0);
});

test('plain-permalink WordPress endpoints preserve the rest_route query', async t => {
  const plain = 'https://booking.example/?rest_route=%2Ftuxano-booking%2Fv1%2F';
  const calls = fixture(t, () => json({ ok: true }));
  await bookingFetch(runtime({ restUrl: plain }), plain + 'timezone', { body: '{}' });
  assert.equal(new URL(calls[0].url).searchParams.get('rest_route'), '/tuxano-booking/v1/timezone');
});

test('a legacy fixture can resume without proof only when the server validates it', async t => {
  const calls = fixture(t, call => call.url.endsWith('/session') ? fresh() : calls.length === 1 ? expired() : json({ ok: true }));
  const session = runtime({ sessionRecovery: '', sessionExpiresAt: 0 });
  assert.equal((await (await bookingFetch(session, base + 'route', { body: '{}' })).json()).ok, true);
  assert.equal(calls[1].headers.has('X-Tuxano-Recovery'), false);
  assert.equal(calls[2].headers.get('X-Tuxano-Recovery'), proof('c'));
});

test('an already aborted renewal performs no HTTP request', async t => {
  const calls = fixture(t, () => fresh()); const controller = new AbortController(); controller.abort();
  await assert.rejects(renewBookingSession(runtime(), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});

test('fresh pricing metadata is returned for caller review without overwriting its runtime snapshot', async t => {
  fixture(t, () => json({ token, sessionRecovery: proof('c'), sessionExpiresAt: Date.now() / 1000 + 7200, settings: { meetPrice: 90 }, vehicles: [{ id: '42', tariff: { base: 100 } }], pricingRevision: 'd'.repeat(64) }));
  const originalSettings = Object.freeze({ meetPrice: 50 });
  const session = runtime({ settings: originalSettings });
  const result = await renewBookingSession(session);
  assert.deepEqual(result.configuration, { settings: { meetPrice: 90 }, vehicles: [{ id: '42', tariff: { base: 100 } }], pricingRevision: 'd'.repeat(64) });
  assert.equal(session.settings, originalSettings);
  assert.equal(session.settings.meetPrice, 50);
  assert.equal(sessionRevision(session), 1);
});
