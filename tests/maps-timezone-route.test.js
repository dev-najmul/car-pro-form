import test from 'node:test';
import assert from 'node:assert/strict';
import { MapsClient } from '../maps.js';

const route = { origin: { placeId: 'canonical-pickup' }, destination: { placeId: 'canonical-dropoff' }, stops: [] };
const metrics = { distanceMeters: 12000, durationSeconds: 1800, provider: 'google', quoteToken: 'a'.repeat(64) };

function fixture(t, response, capability = true) {
  const oldFetch = globalThis.fetch, oldRuntime = globalThis.TuxanoBooking;
  const requests = [];
  globalThis.TuxanoBooking = { token: 'session-token', settings: { pickupTimezones: capability } };
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => response }; };
  t.after(() => { globalThis.fetch = oldFetch; if (oldRuntime === undefined) delete globalThis.TuxanoBooking; else globalThis.TuxanoBooking = oldRuntime; });
  const client = new MapsClient();
  client.config = async () => ({ providerMode: 'remote', routeEndpoint: 'https://example.test/route' });
  return { client, requests };
}

test('route preserves validated pickup zone and full label without changing its canonical request', async t => {
  const data = { ...metrics, pickupTimezone: 'America/Indiana/Indianapolis', pickupTimezoneLabel: 'Eastern Time' };
  const { client, requests } = fixture(t, data);
  assert.deepEqual(await client.route(route), data);
  assert.equal(JSON.parse(requests[0].options.body).origin.placeId, route.origin.placeId);
  assert.deepEqual(JSON.parse(requests[0].options.body), route);
  assert.equal(requests[0].options.headers['X-Tuxano-Session'], 'session-token');
});

test('older static and WordPress route contracts remain compatible without the pickup timezone capability', async t => {
  const { client } = fixture(t, metrics, false);
  assert.deepEqual(await client.route(route), metrics);
});

test('a timezone-aware route must return both authoritative zone and label', async t => {
  const { client } = fixture(t, metrics);
  await assert.rejects(client.route(route), /pickup time zone could not be verified/);
});

test('malformed or unknown pickup timezone data cannot enter trip summaries', async t => {
  const { client } = fixture(t, metrics);
  for (const patch of [
    { pickupTimezone: 'America/Chicago' },
    { pickupTimezoneLabel: 'Central Time' },
    { pickupTimezone: '<script>', pickupTimezoneLabel: 'Central Time' },
    { pickupTimezone: 'Unknown/Imaginary', pickupTimezoneLabel: 'Central Time' },
    { pickupTimezone: '+06:00', pickupTimezoneLabel: 'Central Time' },
    { pickupTimezone: 'America/Chicago', pickupTimezoneLabel: '<b>Central Time</b>' },
    { pickupTimezone: 'America/Chicago', pickupTimezoneLabel: 'Central\nTime' },
    { pickupTimezone: 'America/Chicago', pickupTimezoneLabel: ' Central Time' },
    { pickupTimezone: 'America/Chicago', pickupTimezoneLabel: 'C'.repeat(121) },
  ]) {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...metrics, ...patch }) });
    await assert.rejects(client.route(route), /pickup time zone could not be verified/);
  }
});

test('optional timezone metadata is validated even when an older caller lacks the capability flag', async t => {
  const { client } = fixture(t, { ...metrics, pickupTimezone: 'America/Chicago', pickupTimezoneLabel: '' }, false);
  await assert.rejects(client.route(route), /pickup time zone could not be verified/);
});

test('malformed route bodies retain the normal actionable route validation error', async t => {
  const { client } = fixture(t, null);
  await assert.rejects(client.route(route), /invalid estimate/);
});
