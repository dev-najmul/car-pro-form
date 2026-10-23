import { mountAutocomplete, assertLocationCountry, countryCodeOf } from './maps.js';

// A map choice is a user's explicit position, not a device/GPS accuracy claim.
// The initial center and programmatic idle events never select a pickup.
export function mountPickupMap(container, { client, initial, onPick, onError, onCommit, fieldId = 'pickup', label = 'pickup', countryCode }) {
  let alive = true, map, cleanupSearch, listeners = [], generation = 0;
  const canvas = container.querySelector('[data-location-map], [data-pickup-map]');
  const input = container.querySelector('[data-map-search]');
  const message = container.querySelector('[data-map-status]');
  const current = () => alive && container.isConnected;
  const say = text => { if (current()) message.textContent = text; };
  const clearChoice = () => { if (current()) { ++generation; onPick(null); } };
  const target = typeof label === 'string' && label.trim() ? label.trim().toLowerCase() : 'location';
  const currentCountry = () => countryCodeOf(typeof countryCode === 'function' ? countryCode() : countryCode);
  const reportError = error => {
    if (!current()) return;
    say(error.message || 'The location could not be selected. Please choose another place.');
    onError?.(error.message);
  };
  const commitPlace = place => {
    if (!current()) return;
    assertLocationCountry(place, countryCode);
    ++generation;
    input.value = place.text;
    map.setZoom(17); map.panTo({ lat: place.latitude, lng: place.longitude });
    say(`Selected ${target}: ${place.text}`);
    // An explicitly chosen Google address/POI retains its actual Place ID.
    // Arbitrary pins below remain coordinates and still need confirmation.
    const selected = { ...place, source: 'map-place' };
    if (onCommit) onCommit(selected); else onPick(selected);
  };
  const selectPoi = async placeId => {
    if (!current() || typeof placeId !== 'string' || !placeId || placeId.length > 512) return;
    const choice = ++generation, country = currentCountry();
    onPick(null); say('Loading the selected Google place…');
    try {
      const place = await client.restore(placeId);
      if (!current() || choice !== generation || currentCountry() !== country) return;
      commitPlace(place);
    } catch (error) { if (current() && choice === generation) reportError(error); }
  };
  const coordinate = location => {
    const latitude = typeof location?.lat === 'function' ? location.lat() : location?.lat;
    const longitude = typeof location?.lng === 'function' ? location.lng() : location?.lng;
    return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
  };
  const choose = async point => {
    if (!current() || !point) return;
    const choice = ++generation;
    const candidate = { ...point, source: 'map', text: `Map-selected ${target} (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`, attributions: [] };
    onPick(candidate);
    say(`${target[0].toUpperCase() + target.slice(1)} pin selected. Check the map before confirming. Finding nearby context…`);
    try {
      const description = await client.describeDeviceLocation(point);
      if (!current() || choice !== generation) return;
      if (description.nearbyName) {
        candidate.nearbyName = description.nearbyName;
        candidate.text = `Map pin near ${description.nearbyName}${description.nearbyAddress ? `, ${description.nearbyAddress}` : ''}`;
        candidate.attributions = description.attributions;
        onPick(candidate);
      }
      say('Check the selected pin, then use this map point. Nearby landmarks are approximate context.');
    } catch {
      if (current() && choice === generation) say('Pin selected; a nearby address is unavailable. Check the coordinates and map, then confirm.');
    }
  };
  const preventSubmit = event => { if (event.key === 'Enter') event.preventDefault(); };
  input.addEventListener('keydown', preventSubmit);
  input.addEventListener('input', clearChoice);
  (async () => {
    try {
      await client.ready();
      const { Map: GoogleMap } = await globalThis.google.maps.importLibrary('maps');
      if (!current()) return;
      const center = Number.isFinite(initial?.latitude) && Number.isFinite(initial?.longitude) ? { lat: initial.latitude, lng: initial.longitude } : { lat: 20, lng: 0 };
      map = new GoogleMap(canvas, { center, zoom: initial?.precise || initial?.placeId || initial?.source === 'map' ? 17 : initial ? 7 : 2, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: true, gestureHandling: 'cooperative', keyboardShortcuts: true });
      listeners.push(map.addListener('click', event => {
        if (event?.placeId) {
          event.stop?.();
          selectPoi(event.placeId);
          return;
        }
        const point = coordinate(event.latLng);
        if (!point || !current()) return;
        map.panTo({ lat: point.latitude, lng: point.longitude });
        choose(point);
      }));
      // Wait for inertia to settle so the chosen coordinates match the center pin.
      let userPan = false;
      listeners.push(map.addListener('dragstart', clearChoice));
      listeners.push(map.addListener('dragend', () => { userPan = true; }));
      // Native map arrow keys pan on idle. Only explicit arrow-key input arms it.
      const onKey = event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { clearChoice(); userPan = true; } };
      canvas.addEventListener('keydown', onKey);
      listeners.push({ remove: () => canvas.removeEventListener('keydown', onKey) });
      listeners.push(map.addListener('idle', () => { if (userPan) { userPan = false; choose(coordinate(map.getCenter())); } }));
      cleanupSearch = mountAutocomplete(input, { client, fieldId: `${fieldId}-map-search`, countryCode, onSelect: place => {
        if (!current()) return;
        try { commitPlace(place); } catch (error) { reportError(error); }
      }, onError: say });
      say(`Search an address or click a named place to select your ${target}. For another map point, position the center pin and confirm.`);
      input.focus({ preventScroll: true });
    } catch {
      if (current()) { say(`The map could not load. Retry the map or choose your ${target} from the main address suggestions.`); onError?.(); }
    }
  })();
  return () => {
    alive = false; ++generation; cleanupSearch?.();
    listeners.forEach(listener => listener.remove()); listeners = [];
    input.removeEventListener('keydown', preventSubmit);
    input.removeEventListener('input', clearChoice);
    if (map) globalThis.google?.maps?.event?.clearInstanceListeners?.(map);
  };
}
