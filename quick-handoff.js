import { DEVICE_LOCATION_POLICY, normalizeDevicePosition } from './maps.js';

export const QUICK_HANDOFF_PREFIX = 'tuxano-quick-trip-v1:';
export const QUICK_HANDOFF_TTL = 10 * 60 * 1000;
const MAX_RECORD = 8192;
const referencePattern = /^[a-f0-9]{32}$/;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const queryOf = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Choose valid pickup and drop-off locations again.');
  return value.trim();
};

export function quickDestination(value, base = globalThis.location?.href) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('Online booking is temporarily unavailable. Please contact us.');
  let destination, source;
  try { destination = new URL(value, base); source = new URL(base); } catch { throw new Error('The booking destination is unavailable. Please contact us.'); }
  if (!['https:', 'http:'].includes(destination.protocol) || destination.origin !== source.origin || destination.username || destination.password || destination.hash) throw new Error('The booking destination must be a page on this website.');
  return destination;
}

function pointOf(point, pickup, now) {
  if (!plain(point)) throw new Error('Choose pickup and drop-off from the location suggestions.');
  const query = queryOf(point.query);
  if (Object.hasOwn(point, 'placeId')) {
    if (typeof point.placeId !== 'string' || !/^[A-Za-z0-9_-]{3,512}$/.test(point.placeId) || Object.hasOwn(point, 'latitude') || Object.hasOwn(point, 'longitude')) throw new Error('Choose a valid Google location.');
    // Only the user query and Place identity travel between pages. Canonical
    // Google labels, country components, route metrics and prices are restored.
    return { placeId: point.placeId, query };
  }
  if (!pickup || point.source !== 'device') throw new Error('Choose a valid pickup or drop-off location.');
  const fresh = normalizeDevicePosition({ coords: { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracyMeters }, timestamp: point.capturedAt }, now);
  if (!fresh.precise || !Number.isFinite(point.confirmedAt) || point.confirmedAt < point.capturedAt - 5000 || point.confirmedAt > now + 5000 || now - point.confirmedAt > DEVICE_LOCATION_POLICY.maxAgeMs) throw new Error('Your current location needs a fresh confirmation. Detect it again or search for an address.');
  return { source: 'device', query, latitude: fresh.latitude, longitude: fresh.longitude, accuracyMeters: fresh.accuracyMeters, capturedAt: fresh.capturedAt, confirmedAt: point.confirmedAt };
}

export function normalizeQuickTrip(value, now = Date.now()) {
  if (!plain(value) || !['transfer', 'hourly'].includes(value.service)) throw new Error('Choose a valid service type.');
  if (!Number.isInteger(value.hours) || value.hours < 1 || value.hours > 24) throw new Error('Choose a valid number of service hours.');
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error('Choose a valid pickup date.');
  const date = new Date(value.date + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.date) throw new Error('Choose a valid pickup date.');
  if (typeof value.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) throw new Error('Choose a valid pickup time.');
  return { service: value.service, hours: value.hours, date: value.date, time: value.time, pickup: pointOf(value.pickup, true, now), dropoff: pointOf(value.dropoff, false, now) };
}

export function quickWebsiteClock(timezone = 'UTC', now = Date.now()) {
  if (typeof timezone === 'string' && /^[+-]\d{2}:\d{2}$/.test(timezone)) {
    const sign = timezone[0] === '-' ? -1 : 1;
    const offset = sign * (Number(timezone.slice(1, 3)) * 60 + Number(timezone.slice(4)));
    return new Date(now + offset * 60000).toISOString().slice(0, 16);
  }
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch { return new Date(now).toISOString().slice(0, 16); }
}

export function validateQuickPickupTime(trip, timezone = 'UTC', now = Date.now()) {
  const wall = `${trip.date}T${trip.time}`;
  const naive = Date.parse(wall + ':00Z');
  if (!Number.isFinite(naive) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(wall)) throw new Error('Choose a valid pickup date and time.');
  const offsets = new Set();
  if (typeof timezone === 'string' && /^[+-]\d{2}:\d{2}$/.test(timezone)) {
    offsets.add((timezone[0] === '-' ? -1 : 1) * (Number(timezone.slice(1, 3)) * 60 + Number(timezone.slice(4))));
  } else {
    let formatter;
    try { formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
    catch { throw new Error('Your pickup time zone could not be verified. Select your pickup again.'); }
    // Offsets on either side of the requested day distinguish a missing or
    // repeated wall time. Never parse the pickup in the browser's own zone.
    for (const days of [-2, -1, 0, 1, 2]) {
      const stamp = naive + days * 86400000;
      const parts = Object.fromEntries(formatter.formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
      offsets.add((Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)) - stamp) / 60000);
    }
  }
  const matches = [...offsets].map(offset => naive - offset * 60000).filter(stamp => quickWebsiteClock(timezone, stamp) === wall);
  if (!matches.length) throw new Error('This pickup time does not exist when daylight saving time changes. Choose another time.');
  if (matches.length > 1) throw new Error('This pickup time occurs twice when daylight saving time ends. Choose a time outside the repeated hour, or contact the booking team.');
  if (matches[0] <= now) throw new Error('Choose a pickup date and time in the future.');
}

function prune(storage, now) {
  // Remove only this feature's bounded stale records, never another plugin's
  // data or an unrelated booking draft.
  const keys = [];
  for (let i = 0; i < Math.min(storage.length || 0, 256); i++) {
    const key = storage.key(i);
    if (key?.startsWith(QUICK_HANDOFF_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const raw = storage.getItem(key);
      const record = typeof raw === 'string' && raw.length <= MAX_RECORD ? JSON.parse(raw) : null;
      if (!plain(record) || !Number.isFinite(record.expires) || record.expires <= now) storage.removeItem(key);
    } catch { storage.removeItem(key); }
  }
}

export function createQuickHandoff(storage, trip, destination, { base = globalThis.location?.href, now = Date.now(), crypto = globalThis.crypto } = {}) {
  const url = quickDestination(destination, base);
  const clean = normalizeQuickTrip(trip, now);
  if (!crypto?.getRandomValues) throw new Error('Your browser could not start a secure booking transfer. Please use the full booking form.');
  const random = crypto.getRandomValues(new Uint8Array(16));
  const reference = [...random].map(value => value.toString(16).padStart(2, '0')).join('');
  const record = JSON.stringify({ version: 1, destination: url.href, created: now, expires: now + QUICK_HANDOFF_TTL, trip: clean });
  if (record.length > MAX_RECORD) throw new Error('Your trip details are too long. Please use the full booking form.');
  try {
    prune(storage, now);
    storage.setItem(QUICK_HANDOFF_PREFIX + reference, record);
    if (storage.getItem(QUICK_HANDOFF_PREFIX + reference) !== record) throw new Error('Storage unavailable');
  } catch { throw new Error('Your browser prevented the trip transfer. Allow website storage or use the full booking form.'); }
  url.hash = 'tuxano-trip=' + reference;
  return url.href;
}

export function consumeQuickHandoff(storage, reference, actualPage, { base = actualPage, now = Date.now() } = {}) {
  if (typeof reference !== 'string' || !referencePattern.test(reference)) throw new Error('The quick booking link is invalid. Please enter your trip again.');
  const page = quickDestination(actualPage.split('#')[0], base);
  const key = QUICK_HANDOFF_PREFIX + reference;
  let raw;
  try { raw = storage.getItem(key); } catch { throw new Error('Your browser prevented access to the quick booking details. Please enter your trip again.'); }
  if (typeof raw !== 'string' || !raw || raw.length > MAX_RECORD) throw new Error('The quick booking details are unavailable or already used. Please enter your trip again.');
  let record;
  try { record = JSON.parse(raw); } catch { storage.removeItem(key); throw new Error('The quick booking details are invalid. Please enter your trip again.'); }
  if (!plain(record) || record.version !== 1 || !Number.isFinite(record.created) || !Number.isFinite(record.expires) || record.created > now + 5000 || record.expires !== record.created + QUICK_HANDOFF_TTL || record.expires <= now) {
    storage.removeItem(key); throw new Error('The quick booking details have expired. Please enter your trip again.');
  }
  if (record.destination !== page.href) throw new Error('The quick booking details belong to a different booking page. Please enter your trip again.');
  // Consume before validation/import. A malformed or replayed intent never
  // becomes authority for fare, completed steps, consent or a saved request.
  storage.removeItem(key);
  return normalizeQuickTrip(record.trip, now);
}
