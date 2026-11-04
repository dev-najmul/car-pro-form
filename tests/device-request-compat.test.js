import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_LOCATION_POLICY, requestDeviceLocation } from '../maps.js';

const epoch = 1800000000000;
const reading = (accuracy = 25, latitude = 41.8818, capturedAt = Date.now()) => ({ coords: { latitude, longitude: -87.6232, accuracy }, timestamp: capturedAt });
function clock(t) { t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: epoch }); }
function platform() {
  return {
    calls: [], clears: [], current: null, watched: null,
    getCurrentPosition(success, failure, options) { this.calls.push({ method: 'current', options }); this.current = { success, failure }; },
    watchPosition(success, failure, options) { this.calls.push({ method: 'watch', options }); this.watched = { success, failure }; return 0; },
    clearWatch(id) { this.clears.push(id); },
  };
}

test('dual-API providers receive an immediate one-shot request and a precise fix needs no watch', async () => {
  const api = platform();
  const pending = requestDeviceLocation(api);
  // This assertion runs before awaiting the promise: the call must stay in
  // the click's activation task instead of waiting on another browser API.
  assert.deepEqual(api.calls, [{ method: 'current', options: { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 } }]);
  api.current.success(reading());
  const point = await pending;
  assert.equal(point.precise, true); assert.equal(point.latitude, 41.8818);
  assert.equal(api.calls.length, 1); assert.deepEqual(api.clears, []);
});

test('a coarse one-shot starts a bounded watch which can improve the actual device fix', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  api.current.success(reading(100000, 41.8));
  assert.deepEqual(api.calls.map(call => call.method), ['current', 'watch']);
  t.mock.timers.tick(5000); api.watched.success(reading(40, 41.8819));
  const point = await pending;
  assert.equal(point.latitude, 41.8819); assert.equal(point.accuracyMeters, 40); assert.equal(point.precise, true);
  assert.deepEqual(api.clears, [0]);
});

test('watch refinements cannot extend the initial coarse six-second window', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  api.current.success(reading(100000, 41.8));
  t.mock.timers.tick(5000); api.watched.success(reading(500, 41.8819));
  t.mock.timers.tick(1000);
  const point = await pending;
  assert.equal(point.latitude, 41.8819); assert.equal(point.precise, false); assert.deepEqual(api.clears, [0]);
});

test('a real one-shot permission denial never falls through to a watch or automatic repeated prompt', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  const rejected = assert.rejects(pending, failure => /permission|location access/i.test(failure.message) && !failure.message.includes('private provider diagnostic'));
  api.current.failure({ code: 1, message: 'private provider diagnostic' });
  await rejected;
  t.mock.timers.tick(30000);
  assert.deepEqual(api.calls.map(call => call.method), ['current']); assert.deepEqual(api.clears, []);
  const retry = requestDeviceLocation(api); api.current.success(reading());
  assert.equal((await retry).precise, true);
  assert.deepEqual(api.calls.map(call => call.method), ['current', 'current']);
});

for (const code of [2, 3]) {
  test(`a recoverable one-shot error ${code} can obtain a fresh reading through the bounded watch`, async t => {
    clock(t); const api = platform(); const pending = requestDeviceLocation(api);
    api.current.failure({ code });
    assert.deepEqual(api.calls.map(call => call.method), ['current', 'watch']);
    api.watched.success(reading());
    assert.equal((await pending).precise, true); assert.deepEqual(api.clears, [0]);
  });
}

test('an invalid initial reading can recover without returning the invalid sensor point', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  api.current.success({ coords: { latitude: 200, longitude: 0, accuracy: 20 }, timestamp: Date.now() });
  assert.deepEqual(api.calls.map(call => call.method), ['current', 'watch']);
  api.watched.success(reading());
  assert.equal((await pending).latitude, 41.8818); assert.deepEqual(api.clears, [0]);
});

test('cancelling a held one-shot prevents its late callback from starting a watch or affecting a retry', async t => {
  clock(t); const api = platform(); const controller = new AbortController();
  const pending = requestDeviceLocation(api, { signal: controller.signal }); const earlier = api.current;
  const rejected = assert.rejects(pending, { name: 'AbortError' }); controller.abort(); await rejected;
  const retry = requestDeviceLocation(api); api.current.success(reading(30, 41.8819));
  assert.equal((await retry).latitude, 41.8819);
  earlier.success(reading(100000, 40)); earlier.failure({ code: 1 }); t.mock.timers.tick(30000);
  assert.deepEqual(api.calls.map(call => call.method), ['current', 'current']); assert.deepEqual(api.clears, []);
});

test('a late initial callback cannot replace a later active watch reading', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  api.current.success(reading(100000, 40)); api.watched.success(reading(800, 41.8819));
  api.current.success(reading(1, 30));
  t.mock.timers.tick(6000);
  const point = await pending;
  assert.equal(point.latitude, 41.8819); assert.equal(point.accuracyMeters, 800); assert.deepEqual(api.clears, [0]);
});

test('one-shot time and watch refinement share the original hard request deadline', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  t.mock.timers.tick(18000); api.current.success(reading(100000, 41.8));
  api.watched.success(reading(600, 41.8819));
  t.mock.timers.tick(DEVICE_LOCATION_POLICY.timeoutMs + 5000 - 18000);
  const point = await pending;
  assert.equal(point.latitude, 41.8819); assert.equal(point.precise, false); assert.deepEqual(api.clears, [0]);
});
