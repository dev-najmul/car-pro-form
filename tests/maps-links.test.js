import test from 'node:test';
import assert from 'node:assert/strict';
import { googlePlaceUrl, googleRouteLinks } from '../maps.js';

const point = (index, text = `Selected place ${index}`) => ({ placeId: `ChIJ-${index}`, text });
const linkedIds = value => {
  const params = new URL(value).searchParams;
  return [params.get('origin_place_id'), ...(params.get('waypoint_place_ids')?.split('|') || []), params.get('destination_place_id')];
};
const orderedIds = links => links.flatMap((link, index) => linkedIds(link).slice(index ? 1 : 0));

test('place and driving links preserve exact selected IDs and safely encode labels', () => {
  const pickup = { placeId: 'pickup/+?&=#é', text: 'Nathullabad & Central Terminal, Barishal' };
  const stop = { placeId: 'stop/one+?&', text: 'Padma Bridge / Rest Stop' };
  const dropoff = { placeId: 'destination/?x=1&two', text: 'Sayedabad, Dhaka, Bangladesh' };
  const place = new URL(googlePlaceUrl(pickup));
  assert.equal(place.protocol, 'https:'); assert.equal(place.hostname, 'www.google.com');
  assert.equal(place.searchParams.get('api'), '1');
  assert.equal(place.searchParams.get('query'), pickup.text);
  assert.equal(place.searchParams.get('query_place_id'), pickup.placeId);
  const links = googleRouteLinks([pickup, stop, dropoff]);
  assert.equal(links.length, 1);
  const route = new URL(links[0]);
  assert.equal(route.searchParams.get('travelmode'), 'driving');
  assert.equal(route.searchParams.get('origin'), pickup.text);
  assert.equal(route.searchParams.get('destination'), dropoff.text);
  assert.deepEqual(linkedIds(links[0]), [pickup.placeId, stop.placeId, dropoff.placeId]);
});

test('coordinate pickup links use the coordinates and no fabricated place ID', () => {
  const pickup = { latitude: 22.73125, longitude: 90.35912 };
  const place = new URL(googlePlaceUrl(pickup));
  assert.equal(place.searchParams.get('query'), '22.73125,90.35912');
  assert.equal(place.searchParams.has('query_place_id'), false);
  const route = new URL(googleRouteLinks([pickup, point(1)])[0]);
  assert.equal(route.searchParams.get('origin'), '22.73125,90.35912');
  assert.equal(route.searchParams.has('origin_place_id'), false);
  assert.equal(route.searchParams.get('destination_place_id'), point(1).placeId);
});

test('five ordered stops split into mobile-compatible parts without losing a point', () => {
  const points = Array.from({ length: 7 }, (_, index) => point(index));
  const links = googleRouteLinks(points);
  assert.equal(links.length, 2);
  assert.deepEqual(orderedIds(links), points.map(point => point.placeId));
  assert.equal(linkedIds(links[0]).at(-1), linkedIds(links[1])[0]);
  for (const link of links) assert.ok(linkedIds(link).length <= 5);
});

test('long display labels shorten within the URL limit while every exact ID survives', () => {
  const points = Array.from({ length: 7 }, (_, index) => point(index, `${index}: ${'ঢাকা & Barishal / '.repeat(400)}`));
  const links = googleRouteLinks(points);
  assert.deepEqual(orderedIds(links), points.map(point => point.placeId));
  assert.ok(links.every(link => link.length <= 2000));
  const placeLink = googlePlaceUrl(points[0]);
  assert.ok(placeLink.length > 0 && placeLink.length <= 2000);
  assert.equal(new URL(placeLink).searchParams.get('query_place_id'), points[0].placeId);
});

test('ID-heavy routes split further to respect 2000 characters without truncating IDs', () => {
  const points = Array.from({ length: 7 }, (_, index) => ({ placeId: `${'X'.repeat(400)}${index}`, text: `Place ${index}` }));
  const links = googleRouteLinks(points);
  assert.ok(links.length > 1);
  assert.ok(linkedIds(links[0]).length < 5);
  assert.ok(links.every(link => link.length <= 2000));
  assert.deepEqual(orderedIds(links), points.map(point => point.placeId));
});

test('mixed coordinate and ID stops split instead of dropping waypoint identities', () => {
  const coordinate = { latitude: 23.5, longitude: 90.25 };
  const links = googleRouteLinks([point(0), coordinate, point(1), point(2)]);
  assert.equal(links.length, 2);
  assert.equal(new URL(links[0]).searchParams.get('waypoints'), '23.5,90.25');
  assert.equal(new URL(links[0]).searchParams.has('waypoint_place_ids'), false);
  assert.equal(linkedIds(links[0]).at(-1), point(1).placeId);
  assert.deepEqual(linkedIds(links[1]), [point(1).placeId, point(2).placeId]);
});

test('control-free special IDs stay exact and delimiter IDs become part endpoints', () => {
  const selected = { placeId: 'exact ID|with/+&?special', text: 'Exact selected place' };
  assert.equal(new URL(googlePlaceUrl(selected)).searchParams.get('query_place_id'), selected.placeId);
  const links = googleRouteLinks([point(0), selected, point(1)]);
  assert.equal(links.length, 2);
  assert.equal(new URL(links[0]).searchParams.get('destination_place_id'), selected.placeId);
  assert.equal(new URL(links[1]).searchParams.get('origin_place_id'), selected.placeId);
});

test('invalid or unrepresentable points fail closed without fabricated links', () => {
  for (const invalid of [null, [], {}, { placeId: '', text: 'Missing ID' }, { placeId: '  ', text: 'Blank ID' }, { placeId: 'control\nID', text: 'Invalid ID' }, { placeId: 'id-without-label' }, { latitude: 91, longitude: 90 }, { latitude: 23, longitude: Infinity }]) {
    assert.equal(googlePlaceUrl(invalid), '');
    assert.deepEqual(googleRouteLinks([point(0), invalid]), []);
  }
  assert.deepEqual(googleRouteLinks([]), []);
  assert.deepEqual(googleRouteLinks([point(0)]), []);
  const unrepresentable = { placeId: 'ঢ'.repeat(512), text: 'Selected place' };
  assert.equal(googlePlaceUrl(unrepresentable), '');
  assert.deepEqual(googleRouteLinks([point(0), unrepresentable]), []);
});
