import test from 'node:test';
import assert from 'node:assert/strict';
import { TIME_PICKER_MINUTES, timePickerParts, timePickerValue } from '../time-picker.js';

test('controlled pickup choices contain exactly the twelve five-minute increments', () => {
  assert.deepEqual(TIME_PICKER_MINUTES, ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
  assert.ok(Object.isFrozen(TIME_PICKER_MINUTES));
});
test('midnight, noon and last selection convert without using the browser timezone', () => {
  assert.equal(timePickerValue('12', '00', 'AM'), '00:00');
  assert.equal(timePickerValue('12', '00', 'PM'), '12:00');
  assert.equal(timePickerValue('11', '55', 'PM'), '23:55');
  assert.deepEqual(timePickerParts('00:05'), { hour: '12', minute: '05', period: 'AM' });
  assert.deepEqual(timePickerParts('12:00'), { hour: '12', minute: '00', period: 'PM' });
  assert.deepEqual(timePickerParts('23:55'), { hour: '11', minute: '55', period: 'PM' });
});
test('irregular saved minutes are parsed intact and cannot become a new chooser selection', () => {
  assert.deepEqual(timePickerParts('14:44'), { hour: '2', minute: '44', period: 'PM' });
  assert.equal(timePickerValue('2', '44', 'PM'), '');
  assert.equal(timePickerValue('2', '45', 'PM'), '14:45');
});
test('malformed clocks and partial or out-of-range chooser values fail closed', () => {
  for (const value of ['', null, '24:00', '12:60', '1:05', '12:00:00', '<b>12:00</b>']) assert.equal(timePickerParts(value), null);
  for (const parts of [['', '00', 'AM'], ['0', '00', 'AM'], ['13', '00', 'AM'], ['01', '00', 'AM'], ['1', '5', 'AM'], ['1', '60', 'AM'], ['1', '00', 'am'], ['1', '00', '']]) assert.equal(timePickerValue(...parts), '');
});
