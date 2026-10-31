import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuickPickupTime } from '../quick-handoff.js';

const clock = Date.parse('2026-11-18T17:00:00Z');
test('pickup-local future validation distinguishes Eastern and Central wall clocks', () => {
  const trip = { date: '2026-11-18', time: '11:30' };
  assert.doesNotThrow(() => validateQuickPickupTime(trip, 'America/Chicago', clock));
  assert.throws(() => validateQuickPickupTime(trip, 'America/Indiana/Indianapolis', clock), /future/);
});
test('spring-forward gaps are rejected before vehicle selection in both US zones', () => {
  for (const zone of ['America/Chicago', 'America/Indiana/Indianapolis']) assert.throws(() => validateQuickPickupTime({ date: '2027-03-14', time: '02:30' }, zone, clock), /does not exist/);
});
test('fall-back repeated hours require an unambiguous alternative', () => {
  for (const zone of ['America/Chicago', 'America/Indiana/Indianapolis']) assert.throws(() => validateQuickPickupTime({ date: '2027-11-07', time: '01:30' }, zone, clock), /occurs twice/);
});
test('valid wall times either side of DST and in Arizona are accepted', () => {
  for (const time of ['00:30', '02:30', '03:30']) assert.doesNotThrow(() => validateQuickPickupTime({ date: '2027-11-07', time }, 'America/Chicago', clock));
  assert.doesNotThrow(() => validateQuickPickupTime({ date: '2027-03-14', time: '02:30' }, 'America/Phoenix', clock));
});
test('pickup validation supports fixed-offset historical configuration without browser-zone parsing', () => {
  assert.throws(() => validateQuickPickupTime({ date: '2026-11-18', time: '22:59' }, '+06:00', clock), /future/);
  assert.doesNotThrow(() => validateQuickPickupTime({ date: '2026-11-18', time: '23:01' }, '+06:00', clock));
});
test('unknown pickup time zones and malformed wall clocks fail closed', () => {
  assert.throws(() => validateQuickPickupTime({ date: '2027-01-01', time: '12:00' }, 'Unknown/Nowhere', clock), /could not be verified/);
  assert.throws(() => validateQuickPickupTime({ date: '2027-01-01', time: '25:00' }, 'America/Chicago', clock), /valid pickup/);
});
