import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_LOCATION_POLICY, normalizeDevicePosition, requestDeviceLocation, MapsClient } from '../maps.js';

const now = 1800000000000;
const position = (overrides = {}) => ({ coords: { latitude: 22.714, longitude: 90.35, accuracy: 20 }, timestamp: now, ...overrides });

test('device positions preserve exact coordinates and classify reported accuracy without guessing', () => {
  const precise = normalizeDevicePosition(position(), now);
  assert.deepEqual(precise, { latitude: 22.714, longitude: 90.35, accuracyMeters: 20, capturedAt: now, precise: true });
  assert.equal(normalizeDevicePosition(position({ coords: { latitude: 23.7891, longitude: 90.4126, accuracy: 20000 } }), now).precise, false);
  assert.equal(normalizeDevicePosition(position({ coords: { latitude: 0, longitude: 0, accuracy: 100 } }), now).precise, true);
  assert.equal(normalizeDevicePosition(position({ coords: { latitude: -90, longitude: -180, accuracy: 0 } }), now).precise, true);
  assert.equal(DEVICE_LOCATION_POLICY.maxAccuracyMeters, 100);
});

test('invalid or stale device readings cannot become a pickup', () => {
  for (const invalid of [undefined, {}, position({ coords: { latitude: 91, longitude: 90, accuracy: 10 } }), position({ coords: { latitude: 23, longitude: -181, accuracy: 10 } }), position({ coords: { latitude: '23', longitude: 90, accuracy: 10 } }), position({ coords: { latitude: 23, longitude: 90, accuracy: undefined } }), position({ coords: { latitude: 23, longitude: 90, accuracy: -1 } }), position({ coords: { latitude: NaN, longitude: 90, accuracy: 10 } }), position({ coords: { latitude: 23, longitude: Infinity, accuracy: 10 } }), position({ timestamp: undefined })]) {
    assert.throws(() => normalizeDevicePosition(invalid, now), /invalid location/);
  }
  assert.throws(() => normalizeDevicePosition(position({ timestamp: now - 60001 }), now), /old or incorrectly timed/);
  assert.throws(() => normalizeDevicePosition(position({ timestamp: now + 5001 }), now), /old or incorrectly timed/);
  assert.equal(normalizeDevicePosition(position({ timestamp: now - 60000 }), now).capturedAt, now - 60000);
  assert.equal(normalizeDevicePosition(position({ timestamp: now + 5000 }), now).capturedAt, now + 5000);
});

test('device requests ask the platform for a fresh high-accuracy reading', async () => {
  let options;
  const result = await requestDeviceLocation({ getCurrentPosition(success, _failure, value) { options = value; success(position({ timestamp: Date.now() })); } });
  assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  assert.equal(result.latitude, 22.714);
  assert.equal(result.precise, true);
});

test('permission, timeout, unsupported, and malformed results return safe actionable errors', async () => {
  await assert.rejects(requestDeviceLocation(null), /unavailable on this device/);
  await assert.rejects(requestDeviceLocation({ getCurrentPosition(_success, failure) { failure({ code: 1, message: 'private platform detail' }); } }), /permission was denied/);
  await assert.rejects(requestDeviceLocation({ getCurrentPosition(_success, failure) { failure({ code: 2, message: 'private platform detail' }); } }), /could not determine/);
  await assert.rejects(requestDeviceLocation({ getCurrentPosition(_success, failure) { failure({ code: 3 }); } }), /took too long/);
  await assert.rejects(requestDeviceLocation({ getCurrentPosition() { throw new Error('private platform detail'); } }), /could not determine/);
  await assert.rejects(requestDeviceLocation({ getCurrentPosition(success) { success(position({ timestamp: 0 })); } }), /old or incorrectly timed/);
});

test('a silent platform is bounded and late callbacks cannot replace the result', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let success;
  const result = requestDeviceLocation({ getCurrentPosition(callback) { success = callback; } });
  const rejected = assert.rejects(result, /took too long/);
  t.mock.timers.tick(20000);
  await rejected;
  success(position({ timestamp: Date.now() }));
  await assert.rejects(result, /took too long/);
});

test('nearby labels name the closest landmark without snapping or exposing a place ID', async () => {
  const client = new MapsClient();
  let request;
  client.ready = async () => ({
    SearchNearbyRankPreference: { DISTANCE: 'distance-fixture' },
    Place: { async searchNearby(value) {
      request = value;
      return { places: [
        { id: 'further-id', displayName: 'Further hotel', formattedAddress: 'Further street', location: { lat: () => 22.7143, lng: () => 90.35 } },
        { id: 'near-id', displayName: 'Nearby ATM', formattedAddress: 'Nearby street, Barishal', location: { lat: () => 22.71401, lng: () => 90.35 }, attributions: [{ provider: 'Fixture provider', providerURI: 'https://example.com/' }] },
        { id: 'outside-id', displayName: 'Outside landmark', location: { lat: () => 23, lng: () => 90.35 } },
      ] };
    } },
  });
  const point = Object.freeze({ latitude: 22.714, longitude: 90.35, accuracyMeters: 20 });
  const context = await client.describeDeviceLocation(point);
  assert.deepEqual(request, { fields: ['displayName', 'formattedAddress', 'location', 'attributions'], locationRestriction: { center: { lat: 22.714, lng: 90.35 }, radius: 50 }, rankPreference: 'distance-fixture', maxResultCount: 3 });
  assert.deepEqual(context, { nearbyName: 'Nearby ATM', nearbyAddress: 'Nearby street, Barishal', attributions: [{ displayName: 'Fixture provider', uri: 'https://example.com/' }] });
  assert.equal(Object.hasOwn(context, 'placeId'), false);
  assert.equal(Object.hasOwn(context, 'latitude'), false);
  assert.deepEqual(point, { latitude: 22.714, longitude: 90.35, accuracyMeters: 20 });
});

test('missing, unnamed, or distant landmarks provide no fabricated address', async () => {
  const client = new MapsClient();
  client.ready = async () => ({ SearchNearbyRankPreference: { DISTANCE: 'distance' }, Place: { async searchNearby() { return { places: [
    { displayName: 'Far away', formattedAddress: 'Wrong exact address', location: { lat: 23, lng: 90 } },
    { displayName: '', formattedAddress: 'Unnamed premise', location: { lat: 22.714, lng: 90.35 } },
    { displayName: 'Missing coordinates', formattedAddress: 'Unknown' },
  ] }; } } });
  assert.deepEqual(await client.describeDeviceLocation({ latitude: 22.714, longitude: 90.35 }), { nearbyName: '', nearbyAddress: '', attributions: [] });
  await assert.rejects(client.describeDeviceLocation({ latitude: '22.7', longitude: 90.35 }), /valid detected position/);
});

test('landmark failures and stalled providers expose only a bounded safe error', async t => {
  const client = new MapsClient();
  client.ready = async () => { throw new Error('sensitive provider debug'); };
  await assert.rejects(client.describeDeviceLocation({ latitude: 22.714, longitude: 90.35 }), { message: 'Nearby landmarks could not be loaded. Please confirm the detected coordinates on the map or enter your pickup address.' });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  client.ready = () => new Promise(() => {});
  const pending = client.describeDeviceLocation({ latitude: 22.714, longitude: 90.35 });
  const rejected = assert.rejects(pending, /Nearby landmarks could not be loaded/);
  t.mock.timers.tick(7000);
  await rejected;
});
