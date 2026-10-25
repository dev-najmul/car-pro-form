import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickHandoff, consumeQuickHandoff, normalizeQuickTrip, quickDestination, quickWebsiteClock, validateQuickPickupTime, QUICK_HANDOFF_PREFIX, QUICK_HANDOFF_TTL } from '../quick-handoff.js';

const base = 'https://example.test/carbook/';
const destination = base + 'booking/?language=en';
const now = Date.UTC(2026, 9, 25, 12, 0);
const trip = () => ({ service: 'transfer', hours: 3, date: '2026-11-03', time: '14:30', pickup: { placeId: 'ChIJPickup123', query: 'My pickup query' }, dropoff: { placeId: 'ChIJDestination123', query: 'My destination query' } });
const storage = () => {
  const entries = new Map();
  return { get length() { return entries.size; }, key(index) { return [...entries.keys()][index] ?? null; }, getItem(key) { return entries.get(key) ?? null; }, setItem(key, value) { entries.set(key, String(value)); }, removeItem(key) { entries.delete(key); } };
};
const write = (store, value = trip(), options = {}) => createQuickHandoff(store, value, destination, { base, now, ...options });
const read = (store, url, options = {}) => consumeQuickHandoff(store, new URL(url).hash.slice('#tuxano-trip='.length), url, { now, ...options });

test('quick trip transfers only minimal intent with an opaque fragment and consumes once', () => {
  const store = storage(), value = trip();
  value.quoteToken = 'private-quote'; value.price = 0; value.completed = 4; value.consent = true; value.billing = { email: 'private@example.test' };
  value.pickup.text = 'Google formatted text'; value.pickup.countryCode = 'US';
  const url = write(store, value);
  assert.match(new URL(url).hash, /^#tuxano-trip=[a-f0-9]{32}$/);
  assert.equal(new URL(url).pathname, '/carbook/booking/');
  assert.equal(new URL(url).search, '?language=en');
  assert.ok(!url.includes('pickup') && !url.includes('private'));
  const record = store.getItem(store.key(0));
  assert.ok(!record.includes('quoteToken') && !record.includes('billing') && !record.includes('Google formatted text') && !record.includes('countryCode'));
  assert.deepEqual(read(store, url), trip());
  assert.equal(store.length, 0);
  assert.throws(() => read(store, url), /unavailable or already used/);
});

test('hourly service preserves selected hours, date and clock time', () => {
  const value = { ...trip(), service: 'hourly', hours: 7 };
  const store = storage();
  assert.deepEqual(read(store, write(store, value)), value);
});

test('handoff cannot redirect to another origin, credentials or executable schemes', () => {
  for (const url of ['https://evil.test/booking/', '//evil.test/booking/', 'javascript:alert(1)', 'https://user:pass@example.test/booking/', 'http://example.test/booking/', destination + '#other']) {
    assert.throws(() => quickDestination(url, base));
  }
});

test('recipient path and query are bound without consuming another page intent', () => {
  const store = storage(), url = write(store), ref = new URL(url).hash.slice('#tuxano-trip='.length);
  for (const page of [base + 'another/', base + 'booking/?language=fr']) assert.throws(() => consumeQuickHandoff(store, ref, page, { now }), /different booking page/);
  assert.equal(store.length, 1);
  assert.deepEqual(read(store, url), trip());
});

test('expired and future-dated handoffs cannot import or replay', () => {
  const store = storage(), url = write(store);
  assert.throws(() => read(store, url, { now: now + QUICK_HANDOFF_TTL }), /expired/);
  assert.equal(store.length, 0);
  const second = storage(), otherUrl = write(second, trip(), { now: now + 10000 });
  assert.throws(() => read(second, otherUrl), /expired/);
  assert.equal(second.length, 0);
});

test('altered expiry and malformed JSON are consumed and rejected', () => {
  for (const malformed of ['{broken', JSON.stringify({ version: 1, created: now, expires: now + QUICK_HANDOFF_TTL * 100, destination, trip: trip() })]) {
    const store = storage(), reference = 'a'.repeat(32);
    store.setItem(QUICK_HANDOFF_PREFIX + reference, malformed);
    assert.throws(() => consumeQuickHandoff(store, reference, destination, { now }));
    assert.equal(store.length, 0);
  }
});

test('invalid references, oversized records and absent data do not import', () => {
  const store = storage();
  for (const reference of ['x', '../secret', 'a'.repeat(33), 'A'.repeat(32)]) assert.throws(() => consumeQuickHandoff(store, reference, destination, { now }), /invalid/);
  store.setItem(QUICK_HANDOFF_PREFIX + 'b'.repeat(32), 'x'.repeat(8193));
  assert.throws(() => consumeQuickHandoff(store, 'b'.repeat(32), destination, { now }), /unavailable/);
  assert.throws(() => consumeQuickHandoff(store, 'c'.repeat(32), destination, { now }), /unavailable/);
});

test('invalid dates, times, service, hours and ambiguous points cannot be imported', () => {
  for (const patch of [{ date: '2026-02-30' }, { time: '25:30' }, { service: 'free' }, { hours: 0 }, { hours: 25 }, { hours: 3.5 }, { pickup: { placeId: 'abc', latitude: 1, query: 'mixed' } }, { dropoff: { placeId: '<script>', query: 'bad' } }, { pickup: { placeId: 'abc', query: '\nmalformed' } }]) {
    assert.throws(() => normalizeQuickTrip({ ...trip(), ...patch }, now));
  }
});

test('only a fresh accurate explicitly confirmed device pickup can transfer raw coordinates', () => {
  const device = { source: 'device', query: 'Device pickup (40.7, -74.0)', latitude: 40.7, longitude: -74, accuracyMeters: 20, capturedAt: now - 1000, confirmedAt: now };
  const value = { ...trip(), pickup: device };
  assert.deepEqual(normalizeQuickTrip(value, now), value);
  for (const patch of [{ accuracyMeters: 101 }, { capturedAt: now - 60001 }, { confirmedAt: now + 6000 }, { source: 'map' }, { longitude: 181 }]) assert.throws(() => normalizeQuickTrip({ ...value, pickup: { ...device, ...patch } }, now));
  assert.throws(() => normalizeQuickTrip({ ...trip(), dropoff: device }, now));
});

test('storage failure blocks navigation with a recoverable message', () => {
  const store = { get length() { throw new Error('denied'); }, getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.throws(() => write(store), /Allow website storage/);
  assert.throws(() => consumeQuickHandoff(store, 'a'.repeat(32), destination, { now }), /prevented access/);
});

test('stale quick records are pruned without deleting another feature data', () => {
  const store = storage();
  store.setItem('unrelated-draft', 'keep');
  store.setItem(QUICK_HANDOFF_PREFIX + 'a'.repeat(32), JSON.stringify({ expires: now - 1 }));
  write(store);
  assert.equal(store.getItem('unrelated-draft'), 'keep');
  assert.equal(store.getItem(QUICK_HANDOFF_PREFIX + 'a'.repeat(32)), null);
});

test('pickup date/time uses the WordPress timezone including numeric offsets', () => {
  assert.equal(quickWebsiteClock('+06:00', now), '2026-10-25T18:00');
  assert.equal(quickWebsiteClock('America/New_York', now), '2026-10-25T08:00');
  assert.throws(() => validateQuickPickupTime({ date: '2026-10-25', time: '17:59' }, '+06:00', now), /future/);
  assert.doesNotThrow(() => validateQuickPickupTime({ date: '2026-10-25', time: '18:01' }, '+06:00', now));
});
