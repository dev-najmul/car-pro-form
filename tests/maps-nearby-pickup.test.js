import test from 'node:test';
import assert from 'node:assert/strict';
import { MapsClient } from '../maps.js';

const point = Object.freeze({ latitude: 41.8818, longitude: -87.6232, accuracyMeters: 100000 });
const unavailable = 'A nearby pickup could not be found. Choose your pickup on the map or search for an address.';
const country = [{ shortText: 'US', longText: 'United States', types: ['country'] }];
const place = (overrides = {}) => ({ id: 'ChIJ_Nearby_Safe', displayName: 'Nearby Hotel', formattedAddress: '100 Test Street, Chicago, IL, USA', location: { lat: () => 41.8820, lng: () => -87.6232 }, addressComponents: country, attributions: [{ provider: 'Fixture provider', providerURI: 'https://example.test/attribution' }], ...overrides });
const canonical = overrides => ({ placeId: 'ChIJ_Street_Fallback', latitude: 41.8821, longitude: -87.6232, countryCode: 'US', countryName: 'United States', name: '', address: '101 Test Street, Chicago, IL, USA', text: '101 Test Street, Chicago, IL, USA', attributions: [], ...overrides });
function fixture(t, { nearby = { places: [place()] }, geocoder = { results: [] }, restore = canonical() } = {}) {
  const previous = globalThis.google; const calls = [], geocodes = [], restores = [];
  const client = new MapsClient();
  client.ready = async () => ({ Place: { searchNearby: async request => { calls.push(request); return typeof nearby === 'function' ? nearby(request) : nearby; } }, SearchNearbyRankPreference: { DISTANCE: 'DISTANCE' } });
  client.restore = async id => { restores.push(id); return typeof restore === 'function' ? restore(id) : restore; };
  globalThis.google = { maps: { importLibrary: async () => ({ Geocoder: class { async geocode(request) { geocodes.push(request); return typeof geocoder === 'function' ? geocoder(request) : geocoder; } } }) } };
  t.after(() => { if (previous === undefined) delete globalThis.google; else globalThis.google = previous; });
  return { client, calls, geocodes, restores };
}
const fallbackResult = overrides => ({ place_id: 'ChIJ_Street_Fallback', formatted_address: '101 Test Street, Chicago, IL, USA', geometry: { location: { lat: () => 41.88205, lng: () => -87.6232 } }, types: ['street_address'], ...overrides });

// Only genuine provider identities and geometry may become the suggested pickup.
test('coarse detection suggests a canonical nearby place without claiming exact device coordinates', async t => {
  const { client, calls, geocodes } = fixture(t);
  const result = await client.suggestDevicePickup(point);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents', 'attributions'], locationRestriction: { center: { lat: point.latitude, lng: point.longitude }, radius: 500 }, rankPreference: 'DISTANCE', maxResultCount: 10 });
  assert.equal(result.placeId, 'ChIJ_Nearby_Safe');
  assert.equal(result.latitude, 41.8820);
  assert.equal(result.longitude, -87.6232);
  assert.notEqual(result.latitude, point.latitude);
  assert.equal(result.text, 'Nearby Hotel, 100 Test Street, Chicago, IL, USA');
  assert.equal(result.countryCode, 'US');
  assert(result.distanceFromEstimateMeters > 0 && result.distanceFromEstimateMeters < 50);
  assert.deepEqual(result.attributions, [{ displayName: 'Fixture provider', uri: 'https://example.test/attribution' }]);
  for (const key of ['source', 'accuracyMeters', 'capturedAt', 'precise']) assert.equal(Object.hasOwn(result, key), false);
  assert.deepEqual(geocodes, []);
});

test('the nearest valid result wins independently of provider array order', async t => {
  const { client } = fixture(t, { nearby: { places: [place({ id: 'ChIJ_Farther', location: { lat: 41.8840, lng: -87.6232 } }), place({ id: 'ChIJ_Closest', location: { lat: 41.88181, lng: -87.6232 } }), place({ id: 'ChIJ_Not_Closest', location: { lat: 41.8830, lng: -87.6232 } })] } });
  assert.equal((await client.suggestDevicePickup(point)).placeId, 'ChIJ_Closest');
});

test('an empty first search expands only to the bounded 1500m radius', async t => {
  const { client, calls } = fixture(t, { nearby: request => ({ places: request.locationRestriction.radius === 500 ? [] : [place({ location: { lat: 41.8900, lng: -87.6232 } })] }) });
  const result = await client.suggestDevicePickup(point);
  assert(result.distanceFromEstimateMeters > 500 && result.distanceFromEstimateMeters < 1500);
  assert.deepEqual(calls.map(r => r.locationRestriction.radius), [500, 1500]);
  assert(calls.every(r => r.locationRestriction.radius < point.accuracyMeters));
});

test('malformed identities, names, addresses, countries and distant places never populate pickup', async t => {
  const bad = [null, {}, place({ id: '' }), place({ id: 'bad?identifier' }), place({ displayName: {} }), place({ displayName: '' }), place({ formattedAddress: '' }), place({ formattedAddress: 'Bad\naddress' }), place({ formattedAddress: 'a'.repeat(1025) }), place({ addressComponents: [] }), place({ addressComponents: [{ shortText: 'USA', longText: 'United States', types: ['country'] }] }), place({ location: { lat: 40.7128, lng: -74.006 } }), place({ location: { lat: 91, lng: 0 } }), place({ location: { lat: '41.8818', lng: -87.6232 } })];
  const { client, calls } = fixture(t, { nearby: { places: bad } });
  await assert.rejects(client.suggestDevicePickup(point), { message: unavailable });
  assert.equal(calls.length, 2);
});

test('reverse-geocoded fallback restores the real place identity and canonical geometry', async t => {
  const { client, calls, restores, geocodes } = fixture(t, { nearby: { places: [] }, geocoder: { results: [fallbackResult()] } });
  const result = await client.suggestDevicePickup(point);
  assert.equal(result.placeId, 'ChIJ_Street_Fallback');
  assert.equal(result.latitude, 41.8821);
  assert.notEqual(result.latitude, point.latitude);
  assert.notEqual(result.latitude, 41.88205);
  assert.deepEqual(restores, ['ChIJ_Street_Fallback']);
  assert.equal(calls.length, 2); assert.equal(geocodes.length, 1);
});

test('a denied Nearby service can use genuine address fallback without another denied radius request', async t => {
  const { client, calls } = fixture(t, { nearby: () => { throw new Error('REQUEST_DENIED: private account diagnostic'); }, geocoder: { results: [fallbackResult()] } });
  assert.equal((await client.suggestDevicePickup(point)).placeId, 'ChIJ_Street_Fallback');
  assert.equal(calls.length, 1);
});

test('broad geocodes, missing IDs and mismatched distant restored geometry do not fabricate a suggestion', async t => {
  const { client, restores } = fixture(t, { nearby: { places: [] }, geocoder: { results: [fallbackResult({ place_id: undefined }), fallbackResult({ types: ['locality', 'political'] }), fallbackResult({ geometry: { location: { lat: 23.81, lng: 90.41 } } }), fallbackResult()] }, restore: canonical({ latitude: 40.7128, longitude: -74.006 }) });
  await assert.rejects(client.suggestDevicePickup(point), { message: unavailable });
  assert.deepEqual(restores, ['ChIJ_Street_Fallback']);
});

test('invalid coordinates fail before SDK loading or provider requests', async t => {
  const { client, calls } = fixture(t); let loaded = 0; client.ready = async () => { ++loaded; };
  for (const p of [null, {}, { latitude: '41', longitude: -87 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: Infinity }]) await assert.rejects(client.suggestDevicePickup(p), /valid detected position/);
  assert.equal(loaded, 0); assert.equal(calls.length, 0);
});

test('permission and provider diagnostics remain private when every suggestion service fails', async t => {
  const { client } = fixture(t, { nearby: () => { throw new Error('private-key'); }, geocoder: () => { throw new Error('private-billing-account'); } });
  await assert.rejects(client.suggestDevicePickup(point), { message: unavailable });
  client.ready = async () => { throw new Error('SDK private-key'); };
  await assert.rejects(client.suggestDevicePickup(point), { message: unavailable });
});

test('a stalled SDK is bounded and its late readiness cannot start provider requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { client, calls } = fixture(t); let release;
  client.ready = () => new Promise(resolve => { release = resolve; });
  const pending = client.suggestDevicePickup(point); const rejected = assert.rejects(pending, { message: unavailable });
  t.mock.timers.tick(10000); await rejected;
  release({ Place: { searchNearby: async () => { calls.push('late'); return {}; } } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length, 0);
});

test('a stalled Nearby request times out without starting a wider search or a geocoder later', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release; const { client, calls, geocodes } = fixture(t, { nearby: () => new Promise(resolve => { release = resolve; }) });
  const pending = client.suggestDevicePickup(point); const rejected = assert.rejects(pending, { message: unavailable });
  await Promise.resolve(); assert.equal(calls.length, 1);
  t.mock.timers.tick(10000); await rejected;
  release({ places: [] }); await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length, 1); assert.equal(geocodes.length, 0);
});

test('aborting a pending suggestion prevents late results and follow-up calls', async t => {
  const controller = new AbortController(); let release;
  const { client, calls, geocodes } = fixture(t, { nearby: () => new Promise(resolve => { release = resolve; }) });
  const pending = client.suggestDevicePickup(point, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await Promise.resolve(); controller.abort(); await rejected;
  release({ places: [place()] }); await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length, 1); assert.equal(geocodes.length, 0);
});

test('an already-aborted signal performs no provider lookup', async t => {
  const controller = new AbortController(); controller.abort(); const { client, calls } = fixture(t);
  await assert.rejects(client.suggestDevicePickup(point, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});

test('provider attribution URLs are bounded and unsafe links become plain names', async t => {
  const { client } = fixture(t, { nearby: { places: [place({ attributions: [{ provider: 'Good', providerURI: 'https://example.test/provider' }, { provider: 'Unsafe', providerURI: 'javascript:alert(1)' }, { provider: 'Credentials', providerURI: 'https://user:pass@example.test/' }, { provider: 'Broken\nname', providerURI: 'https://example.test/' }] })] } });
  assert.deepEqual((await client.suggestDevicePickup(point)).attributions, [{ displayName: 'Good', uri: 'https://example.test/provider' }, { displayName: 'Unsafe', uri: '' }, { displayName: 'Credentials', uri: '' }]);
});
