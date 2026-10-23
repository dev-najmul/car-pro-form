import { mountAutocomplete, assertLocationCountry, countryCodeOf } from './maps.js';

// A map choice is a user's explicit position, not a device/GPS accuracy claim.
// The initial center and programmatic idle events never select a pickup.
export function mountPickupMap(container, { client, initial, onPick, onError, fieldId = 'pickup', label = 'pickup', countryCode }) {
  let alive = true, map, cleanupSearch, listeners = [], generation = 0, userPan = false;
  let typingTimer, typingGeneration = 0, lastArea, areaLookup, areaAttribution, areaShown = false;
  const canvas = container.querySelector('[data-location-map], [data-pickup-map]');
  const input = container.querySelector('[data-map-search]');
  const message = container.querySelector('[data-map-status]');
  // A first SDK/map import may take a moment. Do not lose text entered before
  // the autocomplete listeners exist or imply that a still-loading map moved.
  input.readOnly = true;
  input.setAttribute('aria-busy', 'true');
  const current = () => alive && container.isConnected;
  const say = text => { if (current()) message.textContent = text; };
  const cancelTypingPreview = () => {
    ++typingGeneration; clearTimeout(typingTimer);
    areaAttribution?.remove(); areaAttribution = null;
    if (areaShown) { areaShown = false; say(`Choose a search result or map point to select your ${target}.`); }
  };
  const clearChoice = () => { cancelTypingPreview(); if (current()) { ++generation; userPan = false; onPick(null); } };
  const target = typeof label === 'string' && label.trim() ? label.trim().toLowerCase() : 'location';
  const currentCountry = () => countryCodeOf(typeof countryCode === 'function' ? countryCode() : countryCode);
  const showAreaAttributions = entries => {
    areaAttribution?.remove(); areaAttribution = null;
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (typeof entry?.displayName !== 'string' || !entry.displayName.trim()) continue;
      if (!areaAttribution) {
        areaAttribution = document.createElement('div'); areaAttribution.className = 'place-providers';
        areaAttribution.dataset.mapPreviewAttribution = ''; message.after(areaAttribution);
      } else areaAttribution.append(document.createTextNode(' · '));
      let url; try { url = new URL(entry.uri); } catch { /* Plain provider text remains safe. */ }
      if (url?.protocol === 'https:') {
        const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = entry.displayName; areaAttribution.append(link);
      } else areaAttribution.append(document.createTextNode(entry.displayName));
    }
  };
  const reportError = error => {
    if (!current()) return;
    say(error.message || 'The location could not be selected. Please choose another place.');
    onError?.(error.message);
  };
  const previewPlace = place => {
    if (!current()) return;
    cancelTypingPreview();
    assertLocationCountry(place, countryCode);
    ++generation;
    userPan = false;
    input.value = place.text;
    map.setZoom(17); map.panTo({ lat: place.latitude, lng: place.longitude });
    // Search moves the real map so the visitor can inspect the surroundings.
    // Retain this exact identity until they move the pin or confirm the choice.
    onPick({ ...place, source: 'map-place' });
    say(`Showing ${place.text} on the map. Check the area or move the pin, then confirm your ${target}.`);
  };
  const previewArea = (suggestions, query) => {
    cancelTypingPreview();
    const placeId = suggestions[0]?.placeId;
    if (query.length < 3 || typeof placeId !== 'string' || !placeId || placeId.length > 512) return;
    const preview = typingGeneration, choice = generation, country = currentCountry();
    // Predictions still appear immediately. A second debounce bounds details
    // lookups while typing, and only one transient result is reused in memory.
    typingTimer = setTimeout(async () => {
      try {
        if (lastArea?.placeId !== placeId || lastArea.country !== country) {
          if (areaLookup?.placeId !== placeId || areaLookup.country !== country) areaLookup = { placeId, country, promise: client.restore(placeId) };
        }
        const place = lastArea?.placeId === placeId && lastArea.country === country ? lastArea.place : await areaLookup.promise;
        if (!current() || preview !== typingGeneration || choice !== generation || input.value.trim() !== query || currentCountry() !== country) return;
        assertLocationCountry(place, country);
        lastArea = { placeId, country, place };
        userPan = false;
        map.setZoom(15); map.panTo({ lat: place.latitude, lng: place.longitude });
        // An area preview is deliberately not an onPick candidate. No typed
        // prediction may become an address or an enabled confirmation button.
        say(`Area preview: ${place.text}. Choose a search result or click the map to select your ${target}.`);
        areaShown = true; showAreaAttributions(place.attributions);
      } catch {
        if (areaLookup?.placeId === placeId && areaLookup.country === country) areaLookup = null;
        if (current() && preview === typingGeneration && choice === generation) say(`Choose a search result or map point to select your ${target}.`);
      }
    }, 350);
  };
  const selectPoi = async placeId => {
    if (!current() || typeof placeId !== 'string' || !placeId || placeId.length > 512) return;
    const choice = ++generation, country = currentCountry();
    onPick(null); say('Loading the selected Google place…');
    try {
      const place = await client.restore(placeId);
      if (!current() || choice !== generation || currentCountry() !== country) return;
      previewPlace(place);
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
      const hasInitial = Number.isFinite(initial?.latitude) && Number.isFinite(initial?.longitude);
      const center = hasInitial ? { lat: initial.latitude, lng: initial.longitude } : { lat: 39.8283, lng: -98.5795 };
      map = new GoogleMap(canvas, { center, zoom: hasInitial ? initial?.precise || initial?.placeId || initial?.source === 'map' ? 17 : 7 : 4, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: true, gestureHandling: 'cooperative', keyboardShortcuts: true });
      listeners.push(map.addListener('click', event => {
        cleanupSearch?.cancel?.();
        userPan = false;
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
      listeners.push(map.addListener('dragstart', () => { cleanupSearch?.cancel?.(); clearChoice(); }));
      listeners.push(map.addListener('dragend', () => { userPan = true; }));
      // Native map arrow keys pan on idle. Only explicit arrow-key input arms it.
      const onKey = event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { cleanupSearch?.cancel?.(); clearChoice(); userPan = true; } };
      canvas.addEventListener('keydown', onKey);
      listeners.push({ remove: () => canvas.removeEventListener('keydown', onKey) });
      listeners.push(map.addListener('idle', () => { if (userPan) { userPan = false; choose(coordinate(map.getCenter())); } }));
      cleanupSearch = mountAutocomplete(input, { client, fieldId: `${fieldId}-map-search`, countryCode, onSuggestions: previewArea, onSelectStart: cancelTypingPreview, onCancel: cancelTypingPreview, onSelect: place => {
        if (!current()) return;
        try { previewPlace(place); } catch (error) { reportError(error); }
      }, onError: say });
      input.readOnly = false;
      input.removeAttribute('aria-busy');
      say(`Type to preview an area, then choose a search result or map point and confirm your ${target}.`);
      input.focus({ preventScroll: true });
    } catch {
      if (current()) { input.removeAttribute('aria-busy'); say(`The map could not load. Retry the map or choose your ${target} from the main address suggestions.`); onError?.(); }
    }
  })();
  return () => {
    alive = false; ++generation; cancelTypingPreview(); lastArea = null; areaLookup = null; cleanupSearch?.();
    listeners.forEach(listener => listener.remove()); listeners = [];
    input.removeEventListener('keydown', preventSubmit);
    input.removeEventListener('input', clearChoice);
    if (map) globalThis.google?.maps?.event?.clearInstanceListeners?.(map);
  };
}
