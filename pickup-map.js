import { mountAutocomplete, assertLocationCountry, countryCodeOf } from './maps.js';

// A map choice is a user's explicit position, not a device/GPS accuracy claim.
// The initial center and programmatic idle events never select a pickup.
export function mountPickupMap(container, { client, initial, onPick, onPreview, onError, fieldId = 'pickup', label = 'pickup', countryCode }) {
  let alive = true, map, cleanupSearch, listeners = [], generation = 0, userPan = false;
  let typingTimer, typingGeneration = 0, lastArea, areaLookup, areaAttribution, areaShown = false, areaChoice;
  let selectedChoice = ['map', 'map-place'].includes(initial?.source) ? initial : null, selectionCountry, selectionQuery = '';
  let cameraMoving = true, cameraCommand = false, cameraChanges = 0, dragging = false, wheelUntil = 0, pinchUntil = 0, pinOverlay;
  const pointers = new Set();
  const canvas = container.querySelector('[data-location-map], [data-pickup-map]');
  const pin = container.querySelector('.pickup-map-pin');
  const input = container.querySelector('[data-map-search]');
  const message = container.querySelector('[data-map-status]');
  // A first SDK/map import may take a moment. Do not lose text entered before
  // the autocomplete listeners exist or imply that a still-loading map moved.
  input.readOnly = true;
  input.setAttribute('aria-busy', 'true');
  const current = () => alive && container.isConnected;
  const say = text => { if (current()) message.textContent = text; };
  const cancelTypingPreview = reason => {
    // Dismissing a phone keyboard or scrolling out of the input closes its
    // predictions, but the visitor can still deliberately use the shown point.
    if (reason === 'blur') return;
    ++typingGeneration; clearTimeout(typingTimer);
    areaChoice = null;
    if (current()) onPreview?.(null);
    areaAttribution?.remove(); areaAttribution = null;
    if (areaShown) { areaShown = false; say(`Choose a search result or map point to select your ${target}.`); }
  };
  const pick = place => {
    selectedChoice = place; selectionCountry = currentCountry(); selectionQuery = input.value.trim();
    onPick(cameraMoving ? null : place); updatePin();
  };
  const clearChoice = () => { cancelTypingPreview(); if (current()) { ++generation; userPan = false; pick(null); } };
  const target = typeof label === 'string' && label.trim() ? label.trim().toLowerCase() : 'location';
  const currentCountry = () => countryCodeOf(typeof countryCode === 'function' ? countryCode() : countryCode);
  selectionCountry = currentCountry();
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
    moveCamera(place, 17);
    // Search moves the real map so the visitor can inspect the surroundings.
    // Retain this exact identity until they move the pin or confirm the choice.
    pick({ ...place, source: 'map-place' });
    showCurrentChoice();
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
        areaChoice = { place: { ...place, source: 'map-place' }, country, query, preview, choice };
        moveCamera(place, 15);
        // An area preview remains separate from an explicit map selection and
        // never changes the booking address. The visitor may confirm the exact
        // displayed provider point after the map settles there.
        showCurrentArea();
      } catch {
        if (areaLookup?.placeId === placeId && areaLookup.country === country) areaLookup = null;
        if (current() && preview === typingGeneration && choice === generation) say(`Choose a search result or map point to select your ${target}.`);
      }
    }, 350);
  };
  const selectPoi = async placeId => {
    if (!current() || typeof placeId !== 'string' || !placeId || placeId.length > 512) return;
    const choice = ++generation, country = currentCountry();
    pick(null); say('Loading the selected Google place…');
    try {
      const place = await client.restore(placeId);
      if (!current() || choice !== generation || currentCountry() !== country) return;
      previewPlace(place);
    } catch (error) { if (current() && choice === generation) reportError(error); }
  };
  const coordinate = location => {
    const latitude = typeof location?.lat === 'function' ? location.lat() : location?.lat;
    const rawLongitude = typeof location?.lng === 'function' ? location.lng() : location?.lng;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(rawLongitude)) return null;
    // Google may use an adjacent world copy after crossing from the US default
    // to Asia: -269.6° is the same physical longitude as 90.4°. Canonicalize SDK
    // coordinates only; selected provider/stored place data is validated below.
    const longitude = Math.abs(rawLongitude) <= 180 ? rawLongitude : ((rawLongitude + 180) % 360 + 360) % 360 - 180;
    return { latitude, longitude };
  };
  const validArea = () => areaChoice && areaChoice.preview === typingGeneration && areaChoice.choice === generation && areaChoice.query === input.value.trim() && areaChoice.country === currentCountry();
  const pointVisible = point => {
    if (typeof map?.getBounds !== 'function') return true;
    const bounds = map.getBounds();
    return Boolean(bounds?.contains({ lat: point.latitude, lng: point.longitude }));
  };
  const updatePin = () => { if (current()) pinOverlay?.draw(); };
  const pendingCamera = () => {
    if (!current()) return;
    onPick(null); onPreview?.(null);
    if (selectedChoice || validArea()) say('Moving the map. You can confirm this location when it stops.');
  };
  const cameraStamp = () => {
    const center = coordinate(map.getCenter());
    return JSON.stringify([center?.latitude, center?.longitude, map.getZoom?.(), map.getHeading?.(), map.getTilt?.()]);
  };
  const moveCamera = (point, zoom) => {
    const wasIdle = !cameraMoving, before = cameraStamp(), changes = cameraChanges;
    // A new explicit address supersedes an earlier wheel/pinch gesture. The
    // SDK may deliver the command's camera events after this function returns.
    wheelUntil = 0; pinchUntil = 0;
    cameraMoving = true; pendingCamera(); cameraCommand = true;
    const instant = typeof map.moveCamera === 'function' || typeof map.setCenter === 'function';
    try {
      const center = { lat: point.latitude, lng: point.longitude };
      // Immediate framing avoids an animated camera passing through a different
      // pickup while its address has already been selected. Readiness still
      // comes from provider idle, not equality with a rounded camera center.
      if (typeof map.moveCamera === 'function') map.moveCamera({ center, ...(zoom === undefined ? {} : { zoom }) });
      else {
        if (zoom !== undefined) map.setZoom(zoom);
        if (typeof map.setCenter === 'function') map.setCenter(center); else map.panTo(center);
      }
    } finally { cameraCommand = false; }
    // A no-op immediate command need not produce another idle event.
    if (instant && wasIdle && changes === cameraChanges && before === cameraStamp()) cameraMoving = false;
    updatePin();
  };
  const showCurrentArea = () => {
    if (!current() || !validArea()) return;
    if (cameraMoving || dragging || userPan) {
      onPreview?.(null);
      say('Moving the map to your preview. Wait for it to settle before confirming.');
      return;
    }
    const place = areaChoice.place;
    if (!pointVisible(place)) { onPreview?.(null); say('The preview is outside the map view. Search again or choose a point on the map.'); return; }
    onPreview?.(place);
    say(`Area preview: ${place.text}. Check the map, then use this map point or choose another result.`);
    areaShown = true; showAreaAttributions(place.attributions); updatePin();
  };
  const showCurrentChoice = () => {
    if (!current()) return;
    if (cameraMoving || dragging || userPan) { pendingCamera(); return; }
    if (selectedChoice) {
      if (!pointVisible(selectedChoice)) { onPick(null); say('The selected location is outside the map view. Choose a point or search again.'); return; }
      onPick(selectedChoice); updatePin();
      if (selectedChoice.placeId) say(`Showing ${selectedChoice.text} on the map. Check the area or move the pin, then confirm your ${target}.`);
    } else showCurrentArea();
  };
  const choose = async (point, recenter = false) => {
    if (!current() || !point) return;
    const choice = ++generation, country = currentCountry(), query = input.value.trim();
    const candidate = { ...point, source: 'map', text: `Map-selected ${target} (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`, attributions: [] };
    if (recenter) moveCamera(candidate);
    pick(candidate);
    say(`${target[0].toUpperCase() + target.slice(1)} pin selected. Check the map before confirming. Finding nearby context…`);
    try {
      const description = await client.describeDeviceLocation(point);
      if (!current() || choice !== generation || country !== currentCountry() || query !== input.value.trim()) return;
      if (description.nearbyName) {
        candidate.nearbyName = description.nearbyName;
        candidate.text = `Map pin near ${description.nearbyName}${description.nearbyAddress ? `, ${description.nearbyAddress}` : ''}`;
        candidate.attributions = description.attributions;
        pick(candidate);
      }
      say('Check the selected pin, then use this map point. Nearby landmarks are approximate context.');
    } catch {
      if (current() && choice === generation && country === currentCountry()) say('Pin selected; a nearby address is unavailable. Check the coordinates and map, then confirm.');
    }
  };
  const preventSubmit = event => { if (event.key === 'Enter') event.preventDefault(); };
  input.addEventListener('keydown', preventSubmit);
  input.addEventListener('input', clearChoice);
  (async () => {
    try {
      await client.ready();
      const { Map: GoogleMap, OverlayView } = await globalThis.google.maps.importLibrary('maps');
      if (!current()) return;
      const hasInitial = Number.isFinite(initial?.latitude) && Number.isFinite(initial?.longitude);
      const center = hasInitial ? { lat: initial.latitude, lng: initial.longitude } : { lat: 39.8283, lng: -98.5795 };
      map = new GoogleMap(canvas, { center, zoom: hasInitial ? initial?.precise || initial?.placeId || initial?.source === 'map' ? 17 : 7 : 4, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: true, gestureHandling: 'cooperative', keyboardShortcuts: true });
      if (pin && typeof OverlayView === 'function' && typeof globalThis.google.maps.LatLng === 'function') {
        const parent = pin.parentNode, next = pin.nextSibling, style = pin.getAttribute('style');
        // A named place's coordinates and the camera's rounded center are
        // separate. Project its actual point through the SDK so the pin cannot
        // misleadingly move to a neighboring coordinate when framing changes.
        pinOverlay = new class extends OverlayView {
          onAdd() { this.getPanes().overlayLayer.append(pin); }
          draw() {
            if (!current()) return;
            const anchor = selectedChoice || (validArea() ? areaChoice.place : null) || coordinate(map.getCenter());
            if (!anchor) return;
            const center = map.getCenter(), cameraLongitude = typeof center?.lng === 'function' ? center.lng() : center?.lng;
            const renderedLongitude = Number.isFinite(cameraLongitude) ? anchor.longitude + 360 * Math.round((cameraLongitude - anchor.longitude) / 360) : anchor.longitude;
            const pixel = this.getProjection()?.fromLatLngToDivPixel(new globalThis.google.maps.LatLng(anchor.latitude, renderedLongitude, true));
            if (!pixel || !Number.isFinite(pixel.x) || !Number.isFinite(pixel.y)) return;
            pin.style.left = `${pixel.x}px`; pin.style.top = `${pixel.y}px`;
            pin.dataset.mapPin = ''; pin.dataset.mapPinLatitude = String(anchor.latitude); pin.dataset.mapPinLongitude = String(anchor.longitude);
            pin.dataset.mapPinSource = anchor.source || 'center';
          }
          onRemove() {
            pin.remove(); if (next?.parentNode === parent) parent.insertBefore(pin, next); else parent.append(pin);
            if (style === null) pin.removeAttribute('style'); else pin.setAttribute('style', style);
            for (const key of ['mapPin', 'mapPinLatitude', 'mapPinLongitude', 'mapPinSource']) delete pin.dataset[key];
          }
        }();
        pinOverlay.setMap(map);
      }
      const markManualMove = () => {
        if (userPan || dragging) return;
        cleanupSearch?.cancel?.(); clearChoice(); userPan = true;
      };
      const cameraChanged = centerChanged => {
        if (!current()) return;
        ++cameraChanges;
        // Pinch/trackpad zoom can move the center without a native drag event.
        // Only a real gesture may replace a named place with camera coordinates.
        if (centerChanged && !cameraCommand && (pointers.size > 1 || performance.now() < wheelUntil || performance.now() < pinchUntil)) markManualMove();
        cameraMoving = true; pendingCamera(); updatePin();
      };
      for (const event of ['center_changed', 'zoom_changed', 'bounds_changed']) listeners.push(map.addListener(event, () => cameraChanged(event === 'center_changed')));
      const settled = () => {
        if (!current() || cameraCommand) return;
        cameraMoving = false;
        if (dragging || userPan && pointers.size) return;
        if (userPan) { userPan = false; choose(coordinate(map.getCenter())); }
        else showCurrentChoice();
      };
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
        choose(point, true);
      }));
      // Wait for inertia to settle so the chosen coordinates match the center pin.
      listeners.push(map.addListener('dragstart', () => { cleanupSearch?.cancel?.(); clearChoice(); dragging = true; cameraMoving = true; }));
      listeners.push(map.addListener('dragend', () => { dragging = false; userPan = true; if (!cameraMoving) settled(); }));
      // Native map arrow keys pan on idle. Only explicit arrow-key input arms it.
      const onKey = event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { cleanupSearch?.cancel?.(); clearChoice(); userPan = true; cameraMoving = true; } };
      canvas.addEventListener('keydown', onKey);
      listeners.push({ remove: () => canvas.removeEventListener('keydown', onKey) });
      const pointerDown = event => { pointers.add(event.pointerId); if (pointers.size > 1) pinchUntil = performance.now() + 500; };
      const pointerUp = event => { if (pointers.size > 1) pinchUntil = performance.now() + 500; pointers.delete(event.pointerId); if (!pointers.size && !cameraMoving && userPan) settled(); };
      const wheel = () => { wheelUntil = performance.now() + 500; };
      for (const [target, event, handler] of [[canvas, 'pointerdown', pointerDown], [globalThis, 'pointerup', pointerUp], [globalThis, 'pointercancel', pointerUp], [canvas, 'wheel', wheel]]) {
        target.addEventListener(event, handler, { capture: true, passive: true });
        listeners.push({ remove: () => target.removeEventListener(event, handler, true) });
      }
      listeners.push(map.addListener('idle', settled));
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
  const cleanup = () => {
    alive = false; ++generation; cancelTypingPreview(); lastArea = null; areaLookup = null; cleanupSearch?.();
    listeners.forEach(listener => listener.remove()); listeners = [];
    input.removeEventListener('keydown', preventSubmit);
    input.removeEventListener('input', clearChoice);
    pinOverlay?.setMap(null); pinOverlay = null; pointers.clear();
    if (map) globalThis.google?.maps?.event?.clearInstanceListeners?.(map);
  };
  cleanup.confirmSelection = () => {
    if (!current() || !map) return null;
    if (!selectedChoice && areaChoice && !validArea()) {
      cancelTypingPreview();
      say('The search or trip country changed. Search for this location again before confirming.');
      return null;
    }
    const choice = selectedChoice || (validArea() ? areaChoice.place : null);
    if (!choice || !Number.isFinite(choice.latitude) || Math.abs(choice.latitude) > 90 || !Number.isFinite(choice.longitude) || Math.abs(choice.longitude) > 180) return null;
    if (cameraMoving || dragging || userPan) { pendingCamera(); return null; }
    try {
      if (selectedChoice && selectionCountry !== currentCountry()) throw new Error('The trip country changed. Choose this location again before confirming.');
      if (selectedChoice && selectionQuery !== input.value.trim()) throw new Error('The search changed. Choose this location again before confirming.');
      // An explicit raw pin has no independently verified country. Preserve its
      // coordinates and context rather than inventing a country or snapping it
      // to a nearby business; named provider places still require a match.
      if (choice.placeId) assertLocationCountry(choice, countryCode);
    } catch (error) { clearChoice(); reportError(error); return null; }
    if (!pointVisible(choice)) {
      onPick(null); onPreview?.(null);
      say('The selected location is outside the map view. Choose a point or search again.');
      return null;
    }
    return { ...choice };
  };
  return cleanup;
}
