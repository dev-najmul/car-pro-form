export function installPlacesStub() {
  const control = window.__mapsMock;
  const wait = async (kind, key) => {
    if (!control[kind === 'suggest' ? 'holdSuggestions' : kind === 'route' ? 'holdRoutes' : 'holdDetails'].includes(key)) return;
    await new Promise(resolve => control.pending.push({ kind, key, resolve }));
  };
  let token = 0;
  const makePlace = (id, kind) => {
    const query = id.startsWith('test-') ? decodeURIComponent(id.slice(5)) : id;
    return {
      id, displayName: window.__placeDisplayNames?.[id] || '', formattedAddress: window.__placeCanonicalLabels?.[id] || query,
      location: { lat: () => 41, lng: () => -87 },
      attributions: [{ provider: 'Demo Places Provider', providerURI: 'https://example.com/maps-attribution' }],
      fetchFields: async request => { control.calls.push({ kind, query, id, fields: request.fields }); await wait('details', query); },
    };
  };
  class Place { constructor({ id }) { Object.assign(this, makePlace(id, 'restore')); } }
  const point = value => value instanceof Place ? { kind: 'place', placeId: value.id } : { kind: 'coordinates', lat: value.lat, lng: value.lng };
  window.google = { maps: { importLibrary: async name => {
    control.libraries.push(name);
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
      AutocompleteSessionToken: class { constructor() { this.token = ++token; } },
      AutocompleteSuggestion: { fetchAutocompleteSuggestions: async request => {
        const query = request.input;
        control.calls.push({ kind: 'suggest', query, token: request.sessionToken?.token });
        await wait('suggest', query);
        if (control.failSuggestions.includes(query)) throw new Error('Google location search is temporarily unavailable.');
        if (control.emptySuggestions.includes(query)) return { suggestions: [] };
        return { suggestions: [{ placePrediction: {
          placeId: 'test-' + encodeURIComponent(query), text: { text: query }, mainText: { text: query }, secondaryText: { text: 'Test location' },
          toPlace: () => makePlace('test-' + encodeURIComponent(query), 'details'),
        } }] };
      } },
    };
  } } };
}
