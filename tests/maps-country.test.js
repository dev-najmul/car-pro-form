import test from 'node:test';
import assert from 'node:assert/strict';
import { MapsClient, countryCodeOf, countryOfPlace, assertSameCountry, assertLocationCountry } from '../maps.js';

const country = (code, name = code) => ({ shortText: code, longText: name, types: ['country', 'political'] });

test('Google structured country components supply ISO country metadata without reading address prose', () => {
  assert.deepEqual(countryOfPlace({ addressComponents: [
    { shortText: 'US', longText: 'A business called US', types: ['point_of_interest'] },
    country('BD', 'Bangladesh'),
  ] }), { countryCode: 'BD', countryName: 'Bangladesh' });
  assert.deepEqual(countryOfPlace({ addressComponents: [{ short_name: 'gb', long_name: 'United Kingdom', types: ['country'] }] }), { countryCode: 'GB', countryName: 'United Kingdom' });
  for (const place of [null, {}, { formattedAddress: 'Bangladesh business, USA' }, { addressComponents: {} }, { addressComponents: [country('', 'Bangladesh')] }]) {
    assert.deepEqual(countryOfPlace(place), { countryCode: '', countryName: '' });
  }
});

test('country codes are canonical two-letter codes and unsupported restrictions fail closed', () => {
  assert.equal(countryCodeOf('bd'), 'BD');
  assert.equal(countryCodeOf('US'), 'US');
  for (const value of ['USA', ' GB ', 'BD,US', '', 12, null, {}]) assert.equal(countryCodeOf(value), '');
  assert.throws(() => assertLocationCountry({ countryCode: 'US' }, 'USA'), /valid location country/);
});

test('same-country guard considers every known stop without inventing a country for coordinates', () => {
  assert.equal(assertSameCountry([{ countryCode: 'bd' }, { countryCode: 'BD' }, { latitude: 22, longitude: 90 }]), 'BD');
  assert.equal(assertSameCountry([{ latitude: 22, longitude: 90 }]), '');
  assert.equal(assertSameCountry([]), '');
  assert.throws(() => assertSameCountry([{ countryCode: 'BD' }, { countryCode: 'US' }]), /same country/);
  assert.throws(() => assertSameCountry([{ latitude: 22, longitude: 90 }, { countryCode: 'BD' }, { countryCode: 'GB' }]), /same country/);
  assert.equal(assertSameCountry([{ countryName: 'Bangladesh' }, { text: 'United States' }]), '');
});

test('a restricted location must have a matching structured country before selection', () => {
  assert.doesNotThrow(() => assertLocationCountry({ countryCode: 'bd' }, () => 'BD'));
  assert.doesNotThrow(() => assertLocationCountry({}, ''));
  assert.throws(() => assertLocationCountry({ countryCode: 'US' }, 'BD'), /same country/);
  assert.throws(() => assertLocationCountry({ text: 'Bangladesh' }, 'BD'), /could not be verified/);
});

function suggestionsClient() {
  const requests = [];
  let token = 0;
  const client = new MapsClient();
  client.ready = async () => ({
    AutocompleteSessionToken: class { constructor() { this.id = ++token; } },
    AutocompleteSuggestion: { async fetchAutocompleteSuggestions(request) { requests.push(request); return { suggestions: [] }; } },
  });
  return { client, requests };
}

test('pickup autocomplete searches worldwide while destination restrictions use Google includedRegionCodes', async () => {
  const { client, requests } = suggestionsClient();
  await client.suggest('Dhaka', 'pickup');
  await client.suggest('Sayedabad', 'dropoff', { countryCode: 'BD' });
  assert.deepEqual(Object.keys(requests[0]).sort(), ['input', 'language', 'sessionToken']);
  assert.equal(requests[0].language, 'en');
  assert.equal(Object.hasOwn(requests[0], 'region'), false);
  assert.deepEqual(requests[1].includedRegionCodes, ['bd']);
  assert.equal(Object.hasOwn(requests[1], 'locationBias'), false);
});

test('country changes reset only the affected autocomplete session and removing a restriction also resets it', async () => {
  const { client, requests } = suggestionsClient();
  await client.suggest('Dhaka', 'dropoff', { countryCode: 'BD' });
  await client.suggest('Barishal', 'dropoff', { countryCode: 'bd' });
  await client.suggest('Stop', 'stop:one', { countryCode: 'BD' });
  await client.suggest('Chicago', 'dropoff', { countryCode: 'US' });
  await client.suggest('London', 'dropoff');
  assert.equal(requests[0].sessionToken, requests[1].sessionToken);
  assert.notEqual(requests[1].sessionToken, requests[3].sessionToken);
  assert.notEqual(requests[3].sessionToken, requests[4].sessionToken);
  assert.deepEqual(requests[3].includedRegionCodes, ['us']);
  assert.equal(Object.hasOwn(requests[4], 'includedRegionCodes'), false);
  assert.equal(client.sessions.get('stop:one'), requests[2].sessionToken);
  client.discardSession('dropoff');
  assert.equal(client.sessions.has('dropoff'), false);
  assert.equal(client.sessionCountries.has('dropoff'), false);
});

test('malformed autocomplete restriction is rejected before the provider is loaded', async () => {
  const client = new MapsClient();
  let ready = false;
  client.ready = async () => { ready = true; };
  await assert.rejects(client.suggest('Location', 'dropoff', { countryCode: ['BD'] }), /valid location country/);
  assert.equal(ready, false);
});

test('selected place requests structured countries and keeps exact identity and coordinates', async () => {
  const client = new MapsClient();
  let fields;
  const place = {
    id: 'chosen-identity', displayName: 'Terminal', formattedAddress: 'Barishal, Bangladesh',
    location: { lat: () => 22.7, lng: () => 90.3 }, addressComponents: [country('BD', 'Bangladesh')],
    attributions: [{ provider: 'Provider', providerURI: 'https://example.com/maps' }],
    async fetchFields(request) { fields = request.fields; },
  };
  const selected = await client.details(place);
  assert.ok(fields.includes('addressComponents'));
  assert.equal(selected.placeId, 'chosen-identity');
  assert.equal(selected.latitude, 22.7); assert.equal(selected.longitude, 90.3);
  assert.equal(selected.countryCode, 'BD'); assert.equal(selected.countryName, 'Bangladesh');
  assert.equal(selected.text, 'Terminal, Barishal, Bangladesh');
  assert.deepEqual(selected.attributions, [{ displayName: 'Provider', uri: 'https://example.com/maps' }]);
});

test('a known cross-country route fails before config, SDK or route-provider work', async () => {
  const client = new MapsClient();
  let configCalls = 0;
  client.config = async () => { configCalls++; throw new Error('Unexpected provider request'); };
  await assert.rejects(client.route({ origin: { countryCode: 'BD' }, destination: { countryCode: 'US' }, stops: [] }), /same country/);
  assert.equal(configCalls, 0);
});

test('unknown coordinate countries do not become fabricated country labels or alter canonical route points', async () => {
  const client = new MapsClient();
  client.config = async () => ({ providerMode: 'browser' });
  let sent;
  client.browserRoute = async request => { sent = request; return { distanceMeters: 100, durationSeconds: 30 }; };
  const request = Object.freeze({ origin: Object.freeze({ latitude: 22.7, longitude: 90.3 }), destination: Object.freeze({ placeId: 'actual-place' }), stops: [] });
  assert.deepEqual(await client.route(request), { distanceMeters: 100, durationSeconds: 30 });
  assert.equal(sent, request);
  assert.equal(Object.hasOwn(sent.origin, 'countryCode'), false);
});
