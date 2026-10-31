import test from 'node:test';
import assert from 'node:assert/strict';
import { MapsClient } from '../maps.js';

const point = Object.freeze({ latitude: 41.881832123, longitude: -87.623177456, accuracyMeters: 12, capturedAt: 1800000000000, precise: true });
const unavailable = 'Your current address could not be loaded. Choose pickup on map or enter your pickup address.';
const result = (overrides = {}) => ({
  formatted_address: '201 E Randolph St, Chicago, IL 60602, USA',
  place_id: 'geocoded-rooftop-must-not-be-used',
  geometry: { location: { lat: () => 41.8819, lng: () => -87.6232 } },
  types: ['street_address'],
  address_components: [{ short_name: 'US', long_name: 'United States', types: ['country', 'political'] }],
  ...overrides,
});

function fixture(t, response = { results: [result()] }) {
  const previous = globalThis.google;
  const requests = [], libraries = [];
  globalThis.google = { maps: { importLibrary: async name => {
    libraries.push(name);
    return { Geocoder: class {
      async geocode(request) { requests.push(request); return typeof response === 'function' ? response(request) : response; }
    } };
  } } };
  t.after(() => { if (previous === undefined) delete globalThis.google; else globalThis.google = previous; });
  const client = new MapsClient();
  client.ready = async () => ({});
  return { client, requests, libraries };
}

test('device address lookup uses Google reverse geocoding and preserves exact routing coordinates', async t => {
  const { client, requests, libraries } = fixture(t);
  const address = await client.reverseGeocode(point);
  assert.deepEqual(requests, [{ location: { lat: point.latitude, lng: point.longitude } }]);
  assert.deepEqual(libraries, ['geocoding']);
  assert.deepEqual(address, { latitude: point.latitude, longitude: point.longitude, text: '201 E Randolph St, Chicago, IL 60602, USA', address: '201 E Randolph St, Chicago, IL 60602, USA', countryCode: 'US', countryName: 'United States', attributions: [] });
  assert.equal(Object.hasOwn(address, 'placeId'), false);
  assert.equal(Object.hasOwn(address, 'capturedAt'), false);
  assert.equal(Object.isFrozen(point), true);
});

test('broad or distant results cannot hide a later usable nearby address', async t => {
  const { client } = fixture(t, { results: [
    result({ types: ['locality', 'political'], formatted_address: 'Chicago, IL, USA' }),
    result({ geometry: { location: { lat: 40.7128, lng: -74.006 } }, formatted_address: 'Wrong city, USA' }),
    result(),
  ] });
  assert.equal((await client.reverseGeocode(point)).text, '201 E Randolph St, Chicago, IL 60602, USA');
});

test('a nearby plus-code address remains usable without a provider place ID', async t => {
  const { client } = fixture(t, request => ({ results: [result({ types: ['plus_code'], place_id: undefined, geometry: { location: request.location }, formatted_address: 'VHJF+PP Chicago, IL, USA' })] }));
  assert.equal((await client.reverseGeocode(point)).text, 'VHJF+PP Chicago, IL, USA');
});

test('invalid input coordinates fail before loading the SDK or contacting Google', async t => {
  const { client, requests, libraries } = fixture(t);
  let calls = 0;
  client.ready = async () => { ++calls; return {}; };
  for (const value of [null, {}, { latitude: '41', longitude: -87 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: NaN, longitude: 0 }, { latitude: 0, longitude: Infinity }]) {
    await assert.rejects(client.reverseGeocode(value), /valid detected position/);
  }
  assert.equal(calls, 0);
  assert.deepEqual(requests, []);
  assert.deepEqual(libraries, []);
});

test('empty or malformed reverse geocoding cannot fabricate an address or country', async t => {
  const { client } = fixture(t);
  for (const response of [null, {}, { results: {} }, { results: [] }, { results: [null] }, { results: [result({ formatted_address: '' })] }, { results: [result({ formatted_address: 'a'.repeat(1025) })] }, { results: [result({ formatted_address: 'Malformed\naddress' })] }, { results: [result({ address_components: [] })] }, { results: [result({ address_components: [{ short_name: 'USA', long_name: 'United States', types: ['country'] }] })] }, { results: [result({ geometry: {} })] }, { results: [result({ types: ['country', 'political'] })] }]) {
    globalThis.google.maps.importLibrary = async () => ({ Geocoder: class { async geocode() { return response; } } });
    await assert.rejects(client.reverseGeocode(point), { message: unavailable });
  }
});

test('provider authorization and SDK failures return an actionable message without leaking diagnostics', async t => {
  const { client } = fixture(t, () => { throw new Error('REQUEST_DENIED: secret-key and account detail'); });
  await assert.rejects(client.reverseGeocode(point), { message: unavailable });
  client.ready = async () => { throw new Error('SDK boot credential diagnostic'); };
  await assert.rejects(client.reverseGeocode(point), { message: unavailable });
});

test('a stalled SDK load is bounded by the same address lookup timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { client, requests } = fixture(t);
  client.ready = () => new Promise(() => {});
  const pending = client.reverseGeocode(point);
  const rejected = assert.rejects(pending, { message: unavailable });
  t.mock.timers.tick(8000);
  await rejected;
  assert.deepEqual(requests, []);
});

test('a stalled geocoder times out and its late success cannot replace the rejected result', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  const { client, requests } = fixture(t, () => new Promise(resolve => { release = resolve; }));
  const pending = client.reverseGeocode(point);
  const rejected = assert.rejects(pending, { message: unavailable });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(requests.length, 1);
  t.mock.timers.tick(8000);
  await rejected;
  release({ results: [result()] });
  await assert.rejects(pending, { message: unavailable });
});
