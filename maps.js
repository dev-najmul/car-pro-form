const SDK_CALLBACK = '__tuxanoGoogleMapsReady';
const text = value => typeof value === 'string' ? value : value?.text || value?.toString?.() || '';

export const countryCodeOf = value => typeof value === 'string' && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : '';

// Country labels come from Google's structured address components, never from
// searching a display address for words or guessing from a map coordinate.
export function countryOfPlace(place) {
  const component = (Array.isArray(place?.addressComponents) ? place.addressComponents : []).find(item => Array.isArray(item?.types) && item.types.includes('country'));
  const countryCode = countryCodeOf(component?.shortText || component?.short_name);
  return { countryCode, countryName: countryCode ? text(component?.longText || component?.long_name) : '' };
}

export function assertSameCountry(points) {
  const countries = new Set((Array.isArray(points) ? points : []).map(point => countryCodeOf(point?.countryCode)).filter(Boolean));
  if (countries.size > 1) throw new Error('Choose your drop-off and stops in the same country as your pickup location.');
  return countries.values().next().value || '';
}

const restrictionCountry = value => {
  const raw = typeof value === 'function' ? value() : value;
  if (raw === undefined || raw === null || raw === '') return '';
  const country = countryCodeOf(raw);
  if (!country) throw new Error('Select your pickup again to set a valid location country.');
  return country;
};

export function assertLocationCountry(place, countryCode) {
  const expected = restrictionCountry(countryCode);
  if (!expected) return;
  const actual = countryCodeOf(place?.countryCode);
  if (!actual) throw new Error('The country for this location could not be verified. Choose another address.');
  if (actual !== expected) throw new Error('Choose your drop-off and stops in the same country as your pickup location.');
}

export const DEVICE_LOCATION_POLICY = Object.freeze({ maxAccuracyMeters: 100, maxAgeMs: 60000, timeoutMs: 15000 });

export function normalizeDevicePosition(position, now = Date.now()) {
  const latitude = position?.coords?.latitude, longitude = position?.coords?.longitude;
  const accuracyMeters = position?.coords?.accuracy, capturedAt = position?.timestamp;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || !Number.isFinite(capturedAt) || !Number.isFinite(now)) {
    throw new Error('Your device returned an invalid location. Please try again or enter your pickup address.');
  }
  if (now - capturedAt > DEVICE_LOCATION_POLICY.maxAgeMs || capturedAt - now > 5000) {
    throw new Error('Your device returned an old or incorrectly timed location. Please try again or enter your pickup address.');
  }
  return { latitude, longitude, accuracyMeters, capturedAt, precise: accuracyMeters <= DEVICE_LOCATION_POLICY.maxAccuracyMeters };
}

export function requestDeviceLocation(geolocation = globalThis.navigator?.geolocation) {
  return new Promise((resolve, reject) => {
    if (typeof geolocation?.getCurrentPosition !== 'function') {
      reject(new Error('Current location is unavailable on this device. Please enter your pickup address.'));
      return;
    }
    let settled = false;
    const finish = (failure, point) => {
      if (settled) return;
      settled = true; clearTimeout(watchdog);
      if (failure) reject(failure); else resolve(point);
    };
    const unavailable = () => new Error('Your device could not determine your location. Please try again or enter your pickup address.');
    const timedOut = () => new Error('Finding your location took too long. Please try again or enter your pickup address.');
    // Some browser/platform providers do not honor their own timeout reliably.
    const watchdog = setTimeout(() => finish(timedOut()), DEVICE_LOCATION_POLICY.timeoutMs + 5000);
    try {
      geolocation.getCurrentPosition(position => {
        try { finish(null, normalizeDevicePosition(position)); } catch (failure) { finish(failure); }
      }, failure => {
        finish(failure?.code === 1
          ? new Error('Location permission was denied. Please allow location access or enter your pickup address.')
          : failure?.code === 3 ? timedOut() : unavailable());
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: DEVICE_LOCATION_POLICY.timeoutMs });
    } catch { finish(unavailable()); }
  });
}

const coordinatesOf = location => {
  const latitude = typeof location?.lat === 'function' ? location.lat() : location?.lat;
  const longitude = typeof location?.lng === 'function' ? location.lng() : location?.lng;
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
};
const pointDistanceMeters = (a, b) => {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude), dLng = radians(b.longitude - a.longitude);
  const term = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, term))));
};

const MAPS_URL_LIMIT = 2000;
const mapLinkPoint = point => {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
  if (Object.hasOwn(point, 'placeId')) {
    if (typeof point.placeId !== 'string' || !point.placeId.trim() || point.placeId.length > 512 || /[\u0000-\u001f\u007f]/u.test(point.placeId)) return null;
    const label = [point.text, point.name, point.address].find(value => typeof value === 'string' && value.trim())?.trim();
    return label ? { id: point.placeId, label } : null;
  }
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
    ? { label: `${point.latitude},${point.longitude}` } : null;
};
const mapQuery = (point, limit) => point.id && limit ? Array.from(point.label).slice(0, limit).join('') : point.label;
const fitMapsUrl = build => {
  for (const limit of [null, 160, 80, 40, 20, 1]) {
    const url = build(limit);
    if (url.length <= MAPS_URL_LIMIT) return url;
  }
  return '';
};

// Place IDs fix the selected identity even when a long display label is shortened.
// Empty results mean an invalid point or an exact-ID URL that cannot fit safely.
export function googlePlaceUrl(point) {
  const selected = mapLinkPoint(point);
  if (!selected) return '';
  return fitMapsUrl(limit => {
    const url = new URL('https://www.google.com/maps/search/');
    url.searchParams.set('api', '1'); url.searchParams.set('query', mapQuery(selected, limit));
    if (selected.id) url.searchParams.set('query_place_id', selected.id);
    return url.href;
  });
}

export function googleRouteLinks(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const selected = points.map(mapLinkPoint);
  if (selected.some(point => !point)) return [];
  const links = [];
  for (let start = 0; start < selected.length - 1;) {
    let end = Math.min(start + 4, selected.length - 1), link = '';
    for (; end > start; end--) {
      const part = selected.slice(start, end + 1), stops = part.slice(1, -1);
      // Google's waypoint ID list cannot represent a mixture of IDs and coordinates.
      // Shorter consecutive parts keep every identity instead of omitting any IDs.
      if (stops.some(point => point.id?.includes('|')) || stops.some(point => point.id) && stops.some(point => !point.id)) continue;
      link = fitMapsUrl(limit => {
        const url = new URL('https://www.google.com/maps/dir/');
        url.searchParams.set('api', '1'); url.searchParams.set('travelmode', 'driving');
        url.searchParams.set('origin', mapQuery(part[0], limit)); url.searchParams.set('destination', mapQuery(part.at(-1), limit));
        if (part[0].id) url.searchParams.set('origin_place_id', part[0].id);
        if (part.at(-1).id) url.searchParams.set('destination_place_id', part.at(-1).id);
        if (stops.length) {
          url.searchParams.set('waypoints', stops.map(point => mapQuery(point, limit).replaceAll('|', ' ')).join('|'));
          if (stops[0].id) url.searchParams.set('waypoint_place_ids', stops.map(point => point.id).join('|'));
        }
        return url.href;
      });
      if (link) break;
    }
    if (!link) return [];
    links.push(link); start = end;
  }
  return links;
}

export class MapsClient {
  constructor() { this.sessions = new Map(); this.sessionCountries = new Map(); }
  async config() {
    if (!this.configuration) this.configuration = (globalThis.TuxanoBooking ? Promise.resolve({ ok: true, json: async () => ({ ...globalThis.TuxanoBooking.maps }) }) : fetch(new URL('./maps-config.json', import.meta.url), { cache: 'no-store' })).then(async response => {
      if (!response.ok) throw new Error('Location search is not configured for this website yet. Please contact the booking provider.');
      const config = await response.json();
      if (config.providerMode === 'remote') {
        let url;
        try { url = new URL(config.routeEndpoint); } catch { throw new Error('The test route service is not configured correctly.'); }
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || (!globalThis.TuxanoBooking && url.search) || url.hash || (globalThis.TuxanoBooking && url.origin !== location.origin)) throw new Error('The route service is not configured correctly.');
        if (config.previewExpiresAt) {
          const expiry = new Date(config.previewExpiresAt).getTime();
          if (!Number.isFinite(expiry)) throw new Error('The test route service expiration is invalid.');
          this.previewExpiresAt = new Date(expiry).toISOString();
        }
      }
      return config;
    }).catch(error => { this.configuration = null; throw error; });
    return this.configuration;
  }
  async ready() {
    if (!this.library) this.library = (async () => {
      const config = await this.config();
      if (!config.browserConfigured || !config.browserKey) throw new Error('Location search is not available yet. Please contact the booking provider.');
      if (!globalThis.google?.maps?.importLibrary) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const fail = () => { clearTimeout(timer); script.remove(); delete globalThis[SDK_CALLBACK]; reject(new Error('Google location search could not be loaded. Please try again.')); };
        const timer = setTimeout(fail, 15000);
        globalThis[SDK_CALLBACK] = () => { clearTimeout(timer); delete globalThis[SDK_CALLBACK]; resolve(); };
        script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({ key: config.browserKey, callback: SDK_CALLBACK, loading: 'async', v: 'weekly' });
        script.async = true; script.onerror = fail; document.head.append(script);
      });
      return globalThis.google.maps.importLibrary('places');
    })().catch(error => { this.library = null; throw error; });
    return this.library;
  }
  async suggest(query, fieldId, { countryCode } = {}) {
    const country = restrictionCountry(countryCode);
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await this.ready();
    if (this.sessionCountries.get(fieldId) !== country) {
      this.sessions.delete(fieldId);
      this.sessionCountries.set(fieldId, country);
    }
    if (!this.sessions.has(fieldId)) this.sessions.set(fieldId, new AutocompleteSessionToken());
    const request = { input: query, sessionToken: this.sessions.get(fieldId), language: 'en' };
    if (country) request.includedRegionCodes = [country.toLowerCase()];
    const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
    return (response.suggestions || []).filter(s => s.placePrediction).slice(0, 5).map(s => ({ prediction: s.placePrediction, placeId: s.placePrediction.placeId, text: text(s.placePrediction.text), main: text(s.placePrediction.mainText), secondary: text(s.placePrediction.secondaryText) }));
  }
  async select(suggestion, fieldId) {
    // Selecting ends this session. New typing must get a fresh token even if
    // this selection's details response has not arrived yet.
    this.discardSession(fieldId);
    const place = suggestion.prediction.toPlace();
    return this.details(place, suggestion.text);
  }
  async restore(placeId) {
    const { Place } = await this.ready();
    return this.details(new Place({ id: placeId }));
  }
  async details(place, fallback = '') {
    await place.fetchFields({ fields: ['id', 'displayName', 'location', 'formattedAddress', 'addressComponents', 'attributions'] });
    if (!place.id || !place.location) throw new Error('This place cannot be used for a driving route. Please choose another suggestion.');
    const name = place.displayName || '', address = place.formattedAddress || '';
    const label = name && address && !address.toLowerCase().includes(name.toLowerCase()) ? `${name}, ${address}` : address || name || fallback;
    if (!label) throw new Error('Please select this location again to restore its address.');
    const coordinates = coordinatesOf(place.location);
    if (!coordinates) throw new Error('This place has no valid map position. Please choose another suggestion.');
    return { placeId: place.id, ...coordinates, ...countryOfPlace(place), name, address, text: label, attributions: (place.attributions || []).map(a => ({ displayName: a.provider || '', uri: a.providerURI || '' })) };
  }
  async describeDeviceLocation(point) {
    if (!Number.isFinite(point?.latitude) || Math.abs(point.latitude) > 90 || !Number.isFinite(point?.longitude) || Math.abs(point.longitude) > 180) throw new Error('A valid detected position is required to find nearby landmarks.');
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const { Place, SearchNearbyRankPreference } = await this.ready();
          const result = await Place.searchNearby({
            fields: ['displayName', 'formattedAddress', 'location', 'attributions'],
            locationRestriction: { center: { lat: point.latitude, lng: point.longitude }, radius: 50 },
            rankPreference: SearchNearbyRankPreference.DISTANCE,
            maxResultCount: 3,
          });
          const closest = (result.places || []).map(place => {
            const location = coordinatesOf(place.location);
            return { place, distance: location ? pointDistanceMeters(point, location) : Infinity };
          }).filter(({ place, distance }) => distance <= 50 && text(place.displayName).trim()).sort((a, b) => a.distance - b.distance)[0]?.place;
          // A nearby business is context, never a replacement pickup or an exact address.
          return {
            nearbyName: closest ? text(closest.displayName) : '',
            nearbyAddress: closest ? text(closest.formattedAddress) : '',
            attributions: (closest?.attributions || []).map(attribution => ({ displayName: attribution.provider || '', uri: attribution.providerURI || '' })),
          };
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Nearby landmark lookup timed out.')), 7000); }),
      ]);
    } catch {
      throw new Error('Nearby landmarks could not be loaded. Please confirm the detected coordinates on the map or enter your pickup address.');
    } finally { clearTimeout(timer); }
  }
  async route(request, signal) {
    assertSameCountry([request?.origin, ...(Array.isArray(request?.stops) ? request.stops : []), request?.destination]);
    const config = await this.config();
    if (config.providerMode === 'browser') return this.browserRoute(request, signal);
    if (config.providerMode === 'remote' && config.previewExpiresAt && Date.now() >= new Date(config.previewExpiresAt).getTime()) throw new Error('This temporary test session has ended. Please restart the test session before calculating a new route.');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    let response;
    try {
      const runtime = globalThis.TuxanoBooking;
      const headers = { 'Content-Type': 'application/json' };
      if (runtime) {
        headers['X-Tuxano-Session'] = runtime.token;
        if (runtime.nonce) headers['X-WP-Nonce'] = runtime.nonce;
      }
      response = await fetch(config.providerMode === 'remote' ? config.routeEndpoint : new URL('./api/maps/route', import.meta.url), { method: 'POST', headers, credentials: runtime ? 'same-origin' : 'omit', body: JSON.stringify(request), signal: controller.signal, cache: 'no-store' });
    } catch (failure) {
      if (signal?.aborted) throw new DOMException('Route cancelled.', 'AbortError');
      throw new Error(timedOut ? 'Route calculation took too long. Please try again.' : globalThis.TuxanoBooking ? 'The route service is unavailable. Please try again.' : 'The test route service is unavailable. Please check that the test session is still running.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    let data;
    try { data = await response.json(); } catch { throw new Error('The route service is temporarily unavailable. Please try again.'); }
    if (!response.ok) throw new Error(data.message || data.error?.message || 'The route could not be calculated. Please check your locations and try again.');
    if (!Number.isFinite(data.distanceMeters) || data.distanceMeters < 0 || !Number.isFinite(data.durationSeconds) || data.durationSeconds < 0) throw new Error('The route service returned an invalid estimate. Please try again.');
    return data;
  }
  async browserRoute(request, signal) {
    if (signal?.aborted) throw new DOMException('Route cancelled.', 'AbortError');
    await this.ready();
    const [{ Route }, { Place }] = await Promise.all([google.maps.importLibrary('routes'), google.maps.importLibrary('places')]);
    if (signal?.aborted) throw new DOMException('Route cancelled.', 'AbortError');
    const point = value => value.placeId ? new Place({ id: value.placeId }) : { lat: value.latitude, lng: value.longitude };
    let timer, abort;
    try {
      const result = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Route calculation took too long. Please try again.')), 12000);
        abort = () => reject(new DOMException('Route cancelled.', 'AbortError'));
        signal?.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => Route.computeRoutes({
          origin: point(request.origin), destination: point(request.destination),
          intermediates: (request.stops || []).map(value => ({ location: point(value), via: false })),
          travelMode: 'DRIVING', routingPreference: 'TRAFFIC_UNAWARE', optimizeWaypointOrder: false,
          fields: ['distanceMeters', 'durationMillis'],
        })).then(resolve, reject);
      });
      if (signal?.aborted) throw new DOMException('Route cancelled.', 'AbortError');
      const route = result?.routes?.[0];
      if (!route) throw new Error('No driving route was found. Check the selected locations.');
      if (!Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || !Number.isFinite(route.durationMillis) || route.durationMillis < 0) throw new Error('The route provider returned incomplete route information.');
      return { distanceMeters: route.distanceMeters, durationSeconds: route.durationMillis / 1000, provider: 'google', calculatedAt: new Date().toISOString() };
    } catch (failure) {
      if (failure.name === 'AbortError') throw failure;
      if (/PERMISSION_DENIED|REQUEST_DENIED|API_KEY|not authorized|blocked/i.test(failure.message)) throw new Error('Route calculation is not available for this website yet. Please contact the booking provider.');
      throw new Error(failure.message || 'The route could not be calculated. Please try again.');
    } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
  }
  discardSession(id) { this.sessions.delete(id); this.sessionCountries.delete(id); }
}

// Suggestions are transient DOM/memory data. Every input owns its own session,
// keyboard selection, and generation guard for both predictions and details.
export function mountAutocomplete(input, { client, fieldId, onSelect, onError, countryCode, onSuggestions, onSelectStart, onCancel }) {
  let alive = true, selecting = false, generation = 0, timer, suggestions = [], active = -1, list;
  const owner = input.closest('.location-input');
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  const listId = `places-${fieldId.replace(/[^\w-]/g, '-')}`;
  input.setAttribute('aria-controls', listId);
  const close = () => { list?.remove(); list = null; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const showMessage = message => {
    close(); list = document.createElement('div'); list.className = 'places-dropdown';
    const p = document.createElement('p'); p.className = 'places-message'; p.textContent = message; list.append(p); owner.append(list);
  };
  const select = async index => {
    const suggestion = suggestions[index]; if (!suggestion) return;
    onSelectStart?.();
    const id = ++generation, query = input.value; selecting = true; close(); showMessage('Selecting location…');
    try {
      const country = restrictionCountry(countryCode);
      const place = await client.select(suggestion, fieldId);
      if (!alive || id !== generation || input.value !== query) return;
      if (restrictionCountry(countryCode) !== country) { close(); return; }
      assertLocationCountry(place, country);
      close(); onSelect(place);
    } catch (error) { if (alive && id === generation) { showMessage(error.message); onError?.(error.message); } }
    finally { if (id === generation) selecting = false; }
  };
  const highlight = () => {
    list?.querySelectorAll('[role="option"]').forEach((button, i) => button.setAttribute('aria-selected', String(i === active)));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${listId}-${active}`);
  };
  const search = () => {
    selecting = false; clearTimeout(timer); const id = ++generation, query = input.value.trim(); close();
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      showMessage('Searching Google Maps…');
      try {
        const country = restrictionCountry(countryCode);
        const result = await client.suggest(query, fieldId, { countryCode: country });
        if (!alive || id !== generation || input.value.trim() !== query) return;
        if (restrictionCountry(countryCode) !== country) { close(); return; }
        suggestions = result; close();
        if (!suggestions.length) { showMessage('No places found. Try a more specific address.'); return; }
        list = document.createElement('div'); list.className = 'places-dropdown';
        const options = document.createElement('div'); options.id = listId; options.setAttribute('role', 'listbox'); options.setAttribute('aria-label', 'Google Maps locations');
        suggestions.forEach((suggestion, index) => {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'place-option'; button.id = `${listId}-${index}`; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false');
          const main = document.createElement('strong'); main.textContent = suggestion.main || suggestion.text;
          const secondary = document.createElement('span'); secondary.textContent = suggestion.secondary || suggestion.text;
          button.append(main, secondary); button.setAttribute('aria-label', suggestion.text);
          button.addEventListener('pointerdown', event => event.preventDefault());
          button.addEventListener('click', () => select(index)); options.append(button);
        });
        const attribution = document.createElement('div'); attribution.className = 'google-attribution';
        const brand = document.createElement('span'); brand.className = 'google-maps-attribution'; brand.textContent = 'Google Maps'; brand.setAttribute('translate', 'no');
        attribution.append(brand); list.append(options, attribution); owner.append(list); input.setAttribute('aria-expanded', 'true');
        onSuggestions?.(suggestions, query);
      } catch (error) { if (alive && id === generation) { showMessage(error.message); onError?.(error.message); } }
    }, 300);
  };
  const keydown = event => {
    if (event.key === 'Escape') { selecting = false; ++generation; clearTimeout(timer); close(); onCancel?.('escape'); return; }
    if (!list || !suggestions.length || !list.querySelector('[role="option"]')) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = active < 0 ? (event.key === 'ArrowDown' ? 0 : suggestions.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      list.querySelector('.places-selection-hint')?.remove(); highlight();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (active >= 0) select(active);
      else if (!list.querySelector('.places-selection-hint')) {
        const hint = document.createElement('p'); hint.className = 'places-message places-selection-hint'; hint.setAttribute('role', 'status');
        hint.textContent = 'Choose the matching location from the suggestions, or use the arrow keys then Enter.'; list.prepend(hint);
      }
    }
  };
  const blur = () => { setTimeout(() => { if (alive && !selecting && !owner.contains(document.activeElement)) { ++generation; clearTimeout(timer); close(); onCancel?.('blur'); } }, 150); };
  input.addEventListener('input', search); input.addEventListener('keydown', keydown); input.addEventListener('blur', blur);
  // A map interaction may supersede a pending search without unmounting the
  // search box. Cancel its stale provider response and close its suggestions.
  const cancel = () => { selecting = false; ++generation; clearTimeout(timer); close(); client.discardSession(fieldId); onCancel?.(); };
  const cleanup = () => { alive = false; cancel(); input.removeEventListener('input', search); input.removeEventListener('keydown', keydown); input.removeEventListener('blur', blur); };
  cleanup.cancel = cancel;
  return cleanup;
}
