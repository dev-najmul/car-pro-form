const SDK_CALLBACK = '__tuxanoGoogleMapsReady';
const text = value => typeof value === 'string' ? value : value?.text || value?.toString?.() || '';
export class MapsClient {
  constructor() { this.sessions = new Map(); }
  async config() {
    if (!this.configuration) this.configuration = fetch('/api/maps/config', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Location search is temporarily unavailable. Please try again.');
      return response.json();
    }).catch(error => { this.configuration = null; throw error; });
    return this.configuration;
  }
  async ready() {
    if (!this.library) this.library = (async () => {
      const config = await this.config();
      if (!config.browserConfigured || !config.browserKey) throw new Error('Location search is not available yet. Please contact TUXANO.');
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
  async suggest(query, fieldId) {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await this.ready();
    if (!this.sessions.has(fieldId)) this.sessions.set(fieldId, new AutocompleteSessionToken());
    const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query, sessionToken: this.sessions.get(fieldId), language: 'en', region: 'us' });
    return (response.suggestions || []).filter(s => s.placePrediction).slice(0, 5).map(s => ({ prediction: s.placePrediction, placeId: s.placePrediction.placeId, text: text(s.placePrediction.text), main: text(s.placePrediction.mainText), secondary: text(s.placePrediction.secondaryText) }));
  }
  async select(suggestion, fieldId) {
    // Selecting ends this session. New typing must get a fresh token even if
    // this selection's details response has not arrived yet.
    this.sessions.delete(fieldId);
    const place = suggestion.prediction.toPlace();
    return this.details(place, suggestion.text);
  }
  async restore(placeId) {
    const { Place } = await this.ready();
    return this.details(new Place({ id: placeId }));
  }
  async details(place, fallback = '') {
    await place.fetchFields({ fields: ['id', 'displayName', 'location', 'formattedAddress', 'attributions'] });
    if (!place.id || !place.location) throw new Error('This place cannot be used for a driving route. Please choose another suggestion.');
    const name = place.displayName || '', address = place.formattedAddress || '';
    const label = name && address && !address.toLowerCase().includes(name.toLowerCase()) ? `${name}, ${address}` : address || name || fallback;
    if (!label) throw new Error('Please select this location again to restore its address.');
    return { placeId: place.id, text: label, attributions: (place.attributions || []).map(a => ({ displayName: a.provider || '', uri: a.providerURI || '' })) };
  }
  async route(request, signal) {
    const response = await fetch('/api/maps/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal, cache: 'no-store' });
    let data;
    try { data = await response.json(); } catch { throw new Error('The route service is temporarily unavailable. Please try again.'); }
    if (!response.ok) throw new Error(data.error?.message || 'The route could not be calculated. Please check your locations and try again.');
    if (!Number.isFinite(data.distanceMeters) || data.distanceMeters < 0 || !Number.isFinite(data.durationSeconds) || data.durationSeconds < 0) throw new Error('The route service returned an invalid estimate. Please try again.');
    return data;
  }
  discardSession(id) { this.sessions.delete(id); }
}

// Suggestions are transient DOM/memory data. Every input owns its own session,
// keyboard selection, and generation guard for both predictions and details.
export function mountAutocomplete(input, { client, fieldId, onSelect, onError }) {
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
    const id = ++generation, query = input.value; selecting = true; close(); showMessage('Selecting location…');
    try {
      const place = await client.select(suggestion, fieldId);
      if (!alive || id !== generation || input.value !== query) return;
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
        const result = await client.suggest(query, fieldId);
        if (!alive || id !== generation || input.value.trim() !== query) return;
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
      } catch (error) { if (alive && id === generation) { showMessage(error.message); onError?.(error.message); } }
    }, 300);
  };
  const keydown = event => {
    if (event.key === 'Escape') { selecting = false; ++generation; clearTimeout(timer); close(); return; }
    if (!list || !suggestions.length || !list.querySelector('[role="option"]')) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1) + suggestions.length) % suggestions.length; highlight(); }
    if (event.key === 'Enter') { event.preventDefault(); select(active < 0 ? 0 : active); }
  };
  const blur = () => { setTimeout(() => { if (alive && !selecting && !owner.contains(document.activeElement)) { ++generation; clearTimeout(timer); close(); } }, 150); };
  input.addEventListener('input', search); input.addEventListener('keydown', keydown); input.addEventListener('blur', blur);
  return () => { alive = false; ++generation; clearTimeout(timer); close(); client.discardSession(fieldId); input.removeEventListener('input', search); input.removeEventListener('keydown', keydown); input.removeEventListener('blur', blur); };
}
