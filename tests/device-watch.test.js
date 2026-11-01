import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_LOCATION_POLICY, requestDeviceLocation } from '../maps.js';

const epoch = 1800000000000;
const reading = (accuracy = 20, latitude = 22.714, capturedAt = Date.now()) => ({ coords: { latitude, longitude: 90.35, accuracy }, timestamp: capturedAt });
function platform() {
  const api = { clears: [], calls: 0, watchPosition(success, failure, options) { this.calls++; this.success = success; this.failure = failure; this.options = options; return 0; }, clearWatch(id) { this.clears.push(id); } };
  return api;
}
function clock(t) { t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: epoch }); }

test('a coarse first network estimate improves to precise GPS before any location is returned', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  assert.deepEqual(api.options, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  let done = false; pending.then(() => { done = true; });
  api.success(reading(100000, 23.7891));
  t.mock.timers.tick(5000); await Promise.resolve(); assert.equal(done, false);
  api.success(reading(35, 22.7413));
  const point = await pending;
  assert.equal(point.latitude, 22.7413); assert.equal(point.accuracyMeters, 35); assert.equal(point.precise, true);
  assert.deepEqual(api.clears, [0]);
  t.mock.timers.tick(20000); assert.deepEqual(api.clears, [0]);
});

test('the best coarse reading is retained and later readings cannot extend the six-second refinement window', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  api.success(reading(100000, 23.7891));
  t.mock.timers.tick(5000); api.success(reading(1000, 22.7413)); api.success(reading(5000, 23.1));
  let done = false; pending.then(() => { done = true; });
  t.mock.timers.tick(DEVICE_LOCATION_POLICY.coarseRefinementMs - 5001); await Promise.resolve(); assert.equal(done, false);
  t.mock.timers.tick(1);
  const point = await pending;
  assert.equal(point.latitude, 22.7413); assert.equal(point.accuracyMeters, 1000); assert.equal(point.precise, false);
  assert.deepEqual(api.clears, [0]);
});

test('equal-quality fixes prefer the newer reading without accepting an imprecise position automatically', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  api.success(reading(1000, 22.7)); t.mock.timers.tick(1000); api.success(reading(1000, 22.74));
  t.mock.timers.tick(5000); const point = await pending;
  assert.equal(point.latitude, 22.74); assert.equal(point.capturedAt, epoch + 1000); assert.equal(point.precise, false);
});

test('malformed and stale watch readings may recover to a fresh valid fix', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  api.success({ coords: { latitude: 200, longitude: 90, accuracy: 20 }, timestamp: Date.now() });
  api.success(reading(20, 22.7, epoch - 60001));
  api.success(reading(20, 22.74, epoch + 5001));
  api.success(reading(80, 22.7413));
  assert.equal((await pending).latitude, 22.7413); assert.deepEqual(api.clears, [0]);
});

test('a coarse reading that expires during refinement is rejected before it reaches the form', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  const rejected = assert.rejects(pending, /old or incorrectly timed/);
  api.success(reading(1000, 22.7, epoch - 59000)); t.mock.timers.tick(6000);
  await rejected; assert.deepEqual(api.clears, [0]);
});

test('watch permission denial rejects even after an initial estimate and clears all tracking', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  const rejected = assert.rejects(pending, /permission was denied/);
  api.success(reading(100000)); api.failure({ code: 1, message: 'private provider diagnostics' });
  await rejected; t.mock.timers.tick(20000); assert.deepEqual(api.clears, [0]);
});

test('temporary position unavailability can recover while a provider timeout returns only the best reviewed estimate', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  api.failure({ code: 2 }); api.success(reading(100000, 22.7)); api.success(reading(1000, 22.74)); api.failure({ code: 3 });
  const point = await pending; assert.equal(point.accuracyMeters, 1000); assert.equal(point.precise, false); assert.deepEqual(api.clears, [0]);
});

test('a silent watch is bounded by the hard deadline and late callbacks cannot revive it', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  const rejected = assert.rejects(pending, /took too long/);
  t.mock.timers.tick(DEVICE_LOCATION_POLICY.timeoutMs + 5000); await rejected;
  api.success(reading(10)); api.failure({ code: 1 }); assert.deepEqual(api.clears, [0]);
});

test('an invalid-only watch reports a safe validation error and clears its handle', async t => {
  clock(t); const api = platform(); const pending = requestDeviceLocation(api);
  const rejected = assert.rejects(pending, /invalid location/);
  api.success({}); t.mock.timers.tick(20000); await rejected; assert.deepEqual(api.clears, [0]);
});

test('synchronous precise callbacks and permission failures still clear the returned zero watch handle exactly once', async () => {
  const successClears = [], failureClears = [];
  const success = await requestDeviceLocation({ watchPosition(callback) { callback(reading()); return 0; }, clearWatch(id) { successClears.push(id); } });
  assert.equal(success.precise, true); assert.deepEqual(successClears, [0]);
  await assert.rejects(requestDeviceLocation({ watchPosition(_callback, fail) { fail({ code: 1 }); return 0; }, clearWatch(id) { failureClears.push(id); } }), /permission was denied/);
  assert.deepEqual(failureClears, [0]);
});

test('AbortSignal stops an active watch immediately and prevents callbacks or timers from changing the result', async t => {
  clock(t); const controller = new AbortController(); const api = platform();
  const pending = requestDeviceLocation(api, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  api.success(reading(100000)); controller.abort(); await rejected;
  api.success(reading(10)); t.mock.timers.tick(20000); assert.deepEqual(api.clears, [0]);
});

test('an already-aborted request never starts tracking and an abort after success does not clear twice', async () => {
  const before = new AbortController(); before.abort(); const never = platform();
  await assert.rejects(requestDeviceLocation(never, { signal: before.signal }), { name: 'AbortError' }); assert.equal(never.calls, 0);
  const after = new AbortController(); const api = platform(); const pending = requestDeviceLocation(api, { signal: after.signal });
  api.success(reading()); await pending; after.abort(); assert.deepEqual(api.clears, [0]);
});

test('API-only geolocation preserves immediate coarse results and an uncleareable watch is never started', async () => {
  let watches = 0, currentCalls = 0;
  const result = await requestDeviceLocation({ watchPosition() { watches++; }, getCurrentPosition(success) { currentCalls++; success(reading(100000)); } });
  assert.equal(watches, 0); assert.equal(currentCalls, 1); assert.equal(result.precise, false); assert.equal(result.accuracyMeters, 100000);
});

test('a thrown watch failure and a provider timeout expose no private error details', async () => {
  await assert.rejects(requestDeviceLocation({ watchPosition() { throw new Error('sensitive platform details'); }, clearWatch() {} }), { message: 'Your device could not determine your location. Please try again or enter your pickup address.' });
  await assert.rejects(requestDeviceLocation({ watchPosition(_callback, failure) { failure({ code: 3, message: 'sensitive platform details' }); return 7; }, clearWatch() {} }), /took too long/);
});
