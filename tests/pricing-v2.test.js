import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { quoteTransportation } from '../pricing.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/pricing-v2.json', import.meta.url), 'utf8'));
const tariffFor = sample => sample.legacyTariff || {
  ...fixture.baseTariff, ...sample.tariff,
  transfer: { ...fixture.baseTariff.transfer, ...sample.tariff?.transfer },
  hourlyBooking: { ...fixture.baseTariff.hourlyBooking, ...sample.tariff?.hourlyBooking },
};
const quote = (sample, tariff = tariffFor(sample), route = sample.route) => quoteTransportation(
  'fixture-vehicle', route, sample.booking.trip.stops.reduce((sum, stop) => sum + stop.waitMinutes, 0),
  sample.booking.trip.service, sample.booking.trip.hours, tariff,
);

for (const sample of fixture.cases) {
  test(`service pricing: ${sample.name}`, () => {
    const tariff = tariffFor(sample), originalTariff = structuredClone(tariff), originalRoute = structuredClone(sample.route);
    const result = quote(sample, tariff);
    for (const [field, expected] of Object.entries(sample.expectedFare)) {
      if (typeof expected === 'number') assert.ok(Math.abs(result[field] - expected) < 1e-8, `${field}: ${result[field]} != ${expected}`);
      else assert.equal(result[field], expected, field);
    }
    assert.deepEqual(tariff, originalTariff, 'Pricing must not mutate a vehicle snapshot');
    assert.deepEqual(sample.route, originalRoute, 'Pricing must not mutate the accepted route');
    assert.equal(result.totalDurationSeconds, sample.route.durationSeconds + result.waitingMinutes * 60, 'Customer journey duration excludes deadhead and includes waiting once');
  });
}

test('incomplete or invalid modern profiles cannot fall back to legacy charges', () => {
  const sample = fixture.cases.find(item => item.name === 'client_mileage_short_local');
  const invalid = [
    tariff => { delete tariff.hourlyBooking; },
    tariff => { delete tariff.transfer; },
    tariff => { tariff.transfer = null; },
    tariff => { tariff.transfer.version = 3; },
    tariff => { tariff.transfer.mode = 'combined'; },
    tariff => { tariff.hourlyBooking = []; },
    tariff => { tariff.hourlyBooking.perMile = -1; },
    tariff => { tariff.hourlyBooking.hourly = 1000001; },
    tariff => { tariff.transfer.pickupFreeMinutes = -1; },
    tariff => { tariff.transfer.returnFreeMinutes = 1441; },
    tariff => { tariff.transfer.pickupFreeMiles = Infinity; },
    tariff => { tariff.transfer.returnFreeMiles = 100001; },
    tariff => { tariff.transfer.roundingMinutes = 0; },
    tariff => { tariff.transfer.roundingMinutes = 1.5; },
    tariff => { tariff.transfer.minimumMinutes = 0; },
    tariff => { tariff.transfer.minimumMinutes = 1441; },
  ];
  for (const mutate of invalid) {
    const tariff = structuredClone(tariffFor(sample)); mutate(tariff);
    assert.throws(() => quote(sample, tariff), TypeError);
  }
});

test('new transfers require both verified service-base legs even when allowances cover their charges', () => {
  const sample = fixture.cases.find(item => item.name === 'client_mileage_short_local');
  for (const mode of ['mileage', 'time']) {
    const tariff = structuredClone(tariffFor(sample)); tariff.transfer.mode = mode;
    for (const mutate of [
      route => { delete route.transferLegs; },
      route => { delete route.transferLegs.return; },
      route => { route.transferLegs.pickup = null; },
      route => { route.transferLegs.return.durationSeconds = -1; },
      route => { route.transferLegs.pickup.distanceMeters = Infinity; },
      route => { route.transferLegs.pickup.durationSeconds = 60000001; },
      route => { route.transferLegs.return.distanceMeters = 1000000001; },
    ]) {
      const route = structuredClone(sample.route); mutate(route);
      assert.throws(() => quote(sample, tariff, route), TypeError);
    }
  }
});

test('switching transfer modes never blends time and mileage formulas', () => {
  const sample = fixture.cases.find(item => item.name === 'client_mileage_notre_dame');
  const tariff = structuredClone(tariffFor(sample));
  assert.equal(quote(sample, tariff).drivingCharge, 643.2);
  tariff.transfer.mode = 'time';
  assert.equal(quote(sample, tariff).drivingCharge, 150, 'Only time metrics and its configured minimum apply');
  tariff.base = 999999; tariff.perMile = 999999; tariff.perDrivingMinute = 999999; tariff.minimum = 999999;
  assert.equal(quote(sample, tariff).drivingCharge, 150, 'Inactive legacy/mileage fields are retained, never charged in Time mode');
});

test('Hourly uses its independent rates and ignores service-base metrics and Transfer rate changes', () => {
  const sample = fixture.cases.find(item => item.name === 'hourly_uses_independent_booked_rates');
  const tariff = structuredClone(tariffFor(sample));
  const original = quote(sample, tariff);
  tariff.hourly = 999; tariff.perMile = 888; tariff.perWaitingMinute = 777; tariff.minimum = 666;
  const route = { ...sample.route, transferLegs: { pickup: null, return: null } };
  assert.deepEqual(quote(sample, tariff, route), original);
});

test('unrepresentable modern fares are rejected before they can appear as estimates', () => {
  const sample = fixture.cases.find(item => item.name === 'client_mileage_short_local');
  const tariff = structuredClone(tariffFor(sample)); tariff.perMile = 1000000;
  const route = { ...sample.route, distanceMeters: 1000000000 };
  assert.throws(() => quote(sample, tariff, route), TypeError);
});
