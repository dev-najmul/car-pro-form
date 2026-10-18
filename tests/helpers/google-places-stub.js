export function installPlacesStub() {
  const control = window.__mapsMock;
  const wait = async (kind, key) => {
    if (!control[kind === 'suggest' ? 'holdSuggestions' : kind === 'route' ? 'holdRoutes' : 'holdDetails'].includes(key)) return;
    await new Promise(resolve => control.pending.push({ kind, key, resolve }));
  };
  let token = 0;
  const latLng = value => {
    const lat = typeof value?.lat === 'function' ? value.lat() : value?.lat ?? value?.latitude;
    const lng = typeof value?.lng === 'function' ? value.lng() : value?.lng ?? value?.longitude;
    return { lat: () => lat, lng: () => lng };
  };
  const picker = window.__mapPickerMock = {
    maps: [], choices: [],
    click(lat, lng) {
      this.choices.push({ kind: 'click', latitude: lat, longitude: lng });
      this.maps.at(-1)?.emit('click', { latLng: latLng({ lat, lng }) });
    },
    drag(lat, lng) {
      this.choices.push({ kind: 'drag', latitude: lat, longitude: lng });
      const map = this.maps.at(-1);
      if (!map) return;
      map.emit('dragstart');
      map.center = latLng({ lat, lng });
      map.emit('dragend');
      map.emit('idle');
    },
  };
  class MockMap {
    constructor(element, options) {
      this.element = element; this.options = options; this.center = latLng(options.center);
      this.zoom = options.zoom; this.listeners = new Map();
      const canvas = document.createElement('div');
      canvas.dataset.testid = 'google-map-mock-canvas';
      canvas.textContent = 'Google Maps test map';
      Object.assign(canvas.style, { width: '100%', height: '100%', minHeight: '280px', background: '#e2e8df', display: 'grid', placeItems: 'center' });
      element.append(canvas); picker.maps.push(this);
    }
    getCenter() { return this.center; }
    getDiv() { return this.element; }
    panTo(center) {
      this.center = latLng(center);
      queueMicrotask(() => this.emit('idle'));
    }
    setCenter(center) { this.panTo(center); }
    setZoom(zoom) { this.zoom = zoom; }
    addListener(name, listener) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(listener);
      return { remove: () => this.listeners.get(name)?.delete(listener) };
    }
    emit(name, event) { for (const listener of this.listeners.get(name) || []) listener(event); }
    unbindAll() { this.listeners.clear(); }
  }
  const makePlace = (id, kind) => {
    const query = id.startsWith('test-') ? decodeURIComponent(id.slice(5)) : id;
    return {
      id, displayName: window.__placeDisplayNames?.[id] || '', formattedAddress: window.__placeCanonicalLabels?.[id] || query,
      location: latLng(control.locations?.[id] || { lat: 41, lng: -87 }),
      attributions: [{ provider: 'Demo Places Provider', providerURI: 'https://example.com/maps-attribution' }],
      fetchFields: async function(request) {
        control.calls.push({ kind, query, id, fields: request.fields }); await wait('details', query);
        if (control.locations?.[id]) this.location = latLng(control.locations[id]);
      },
    };
  };
  class Place {
    constructor({ id }) { Object.assign(this, makePlace(id, 'restore')); }
    static async searchNearby(request) {
      control.calls.push({ kind: 'nearby', request });
      const nearby = window.__nearbyMock || {};
      if (nearby.hold) await new Promise(resolve => control.pending.push({ kind: 'nearby', key: 'nearby', resolve }));
      if (nearby.fail) throw new Error('Nearby place lookup is unavailable.');
      return { places: nearby.places || [] };
    }
  }
  const point = value => value instanceof Place ? { kind: 'place', placeId: value.id } : { kind: 'coordinates', lat: value.lat, lng: value.lng };
  window.google = { maps: { importLibrary: async name => {
    control.libraries.push(name);
    if (name === 'maps') return { Map: MockMap };
    if (name === 'routes') return { Route: { computeRoutes: async request => {
      const key = request.destination.id || 'coordinates';
      control.calls.push({ kind: 'route', key, request: {
        origin: point(request.origin), destination: point(request.destination),
        intermediates: (request.intermediates || []).map(stop => ({ location: point(stop.location), via: stop.via })),
        travelMode: request.travelMode, routingPreference: request.routingPreference,
        optimizeWaypointOrder: request.optimizeWaypointOrder, fields: request.fields,
      } });
      await wait('route', key);
      if (control.failRoutes.includes(key)) throw Object.assign(new Error('PERMISSION_DENIED: Routes API is not enabled for this browser key.'), { code: 'PERMISSION_DENIED' });
      const metrics = control.routeResults[key] || { distanceMeters: 32186.88, durationMillis: 1800000 };
      return { routes: [metrics] };
    } } };
    return {
      Place,
      SearchNearbyRankPreference: { DISTANCE: 'DISTANCE' },
      AutocompleteSessionToken: class { constructor() { this.token = ++token; } },
      AutocompleteSuggestion: { fetchAutocompleteSuggestions: async request => {
        const query = request.input;
        control.calls.push({ kind: 'suggest', query, token: request.sessionToken?.token, region: request.region });
        await wait('suggest', query);
        if (control.failSuggestions.includes(query)) throw new Error('Google location search is temporarily unavailable.');
        if (control.emptySuggestions.includes(query)) return { suggestions: [] };
        return { suggestions: (control.suggestionsByQuery?.[query] || [query]).map(label => ({ placePrediction: {
          placeId: 'test-' + encodeURIComponent(label), text: { text: label }, mainText: { text: label }, secondaryText: { text: 'Test location' },
          toPlace: () => makePlace('test-' + encodeURIComponent(label), 'details'),
        } })) };
      } },
    };
  }, event: { clearInstanceListeners: map => map.listeners?.clear() } } };
}
