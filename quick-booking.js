import { MapsClient, mountAutocomplete, assertSameCountry, countryCodeOf, requestDeviceLocation, normalizeDevicePosition } from './maps.js';
import { createQuickHandoff, quickDestination, quickWebsiteClock, validateQuickPickupTime } from './quick-handoff.js';

const sessions = new Map();
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const paths = {
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M7 2v6m10-6v6M3 11h18m-13 4h1m3 0h1m3 0h1"/>',
  shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
};
const icon = name => `<span class="tuxano-quick-booking-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg></span>`;

async function configuration(restUrl) {
  const endpoint = new URL(restUrl + 'session', location.href);
  if (endpoint.origin !== location.origin || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) throw new Error('The booking service is unavailable. Please contact us.');
  if (!sessions.has(endpoint.href)) {
    const pending = (async () => {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20000) });
      let session;
      try { session = await response.json(); } catch { throw new Error('The booking service is temporarily unavailable. Please try again.'); }
      if (!response.ok) throw new Error(session.message || 'The booking service is temporarily unavailable. Please try again.');
      if (!session?.settings || !session.maps || typeof session.maps.browserKey !== 'string' || !session.maps.browserConfigured || session.maps.browserKey.length > 200) throw new Error('Location search is currently unavailable. Please contact us.');
      const destination = quickDestination(session.settings.bookingPageUrl, location.href);
      const client = new MapsClient();
      // Quick forms share one SDK-loading promise, but retain unique field IDs
      // and independent Places sessions. No global WordPress runtime is changed.
      client.configuration = Promise.resolve({ ...session.maps });
      return { session, client, destination };
    })().catch(failure => { sessions.delete(endpoint.href); throw failure; });
    sessions.set(endpoint.href, pending);
  }
  return sessions.get(endpoint.href);
}

let sequence = 0;
async function initialize(container) {
  if (container.dataset.quickInitialized) return;
  container.dataset.quickInitialized = 'true';
  container.classList.add('tuxano-quick-booking');
  const id = /^[A-Za-z][A-Za-z0-9_-]{0,100}$/.test(container.id) ? container.id : `tuxano-quick-${++sequence}`;
  container.id = id;
  const alive = () => container.isConnected;
  try {
    const { session, client, destination } = await configuration(container.dataset.restUrl || '');
    if (!alive()) return;
    const minimum = Number.isInteger(session.settings.minHours) ? Math.max(1, Math.min(24, session.settings.minHours)) : 2;
    const maximum = Number.isInteger(session.settings.maxHours) ? Math.max(minimum, Math.min(24, session.settings.maxHours)) : 12;
    const initialHours = Math.min(maximum, Math.max(minimum, 3));
    const today = quickWebsiteClock(session.settings.timezone).slice(0, 10);
    const locationField = (key, title, locate = false) => `<label class="tuxano-quick-booking-field" for="${id}-${key}"><span class="tuxano-quick-booking-label">${title}</span><span class="tuxano-quick-booking-control location-input">${icon('pin')}<input id="${id}-${key}" class="input" type="text" data-quick-place="${key}" aria-label="${title}" placeholder="${title}" autocomplete="off" maxlength="256" required>${locate ? `<button type="button" class="tuxano-quick-booking-locate" data-quick-locate aria-label="Use current location">${icon('target')}</button>` : ''}</span></label>`;
    const picker = (key, title, type, symbol) => `<label class="tuxano-quick-booking-field" for="${id}-${key}"><span class="tuxano-quick-booking-label">${title}</span><span class="tuxano-quick-booking-control">${icon(symbol)}<span data-quick-display="${key}">${title}</span><input id="${id}-${key}" class="input tuxano-quick-booking-native-picker" data-quick-field="${key}" aria-label="${key === 'time' ? 'Pickup time' : title}" type="${type}" ${key === 'date' ? `min="${today}"` : ''} required></span></label>`;
    container.innerHTML = `<form class="tuxano-quick-booking-form" novalidate><h2 class="tuxano-quick-booking-title">PLAN YOUR RIDE</h2><div class="tuxano-quick-booking-segments" role="group" aria-label="Service type"><button type="button" data-quick-service="transfer" aria-pressed="true">TRANSFER</button><button type="button" data-quick-service="hourly" aria-pressed="false">HOURLY</button></div>${locationField('pickup', 'Pickup Location', true)}<div class="tuxano-quick-booking-device" data-quick-device hidden></div>${locationField('dropoff', 'Drop-off Location')}<label class="tuxano-quick-booking-field tuxano-quick-booking-hours" data-quick-hours hidden for="${id}-hours"><span class="tuxano-quick-booking-label">Number of hours</span><span class="tuxano-quick-booking-control">${icon('clock')}<select id="${id}-hours" class="input" aria-label="Hours" data-quick-field="hours" disabled>${Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index).map(hours => `<option value="${hours}" ${hours === initialHours ? 'selected' : ''}>${hours} ${hours === 1 ? 'hour' : 'hours'}</option>`).join('')}</select></span></label><div class="tuxano-quick-booking-date-time">${picker('date', 'Date', 'date', 'calendar')}${picker('time', 'Time', 'time', 'clock')}</div><p class="tuxano-quick-booking-error" role="alert" hidden></p><button type="submit" class="tuxano-quick-booking-submit">CHECK PRICE</button><p class="tuxano-quick-booking-note">${icon('shield')}<span>Estimated pricing shown before reservation request.</span></p></form>`;
    const form = container.querySelector('form');
    const fields = Object.fromEntries(['pickup', 'dropoff'].map(key => [key, form.querySelector(`[data-quick-place="${key}"]`)]));
    const points = { pickup: null, dropoff: null }, queries = { pickup: '', dropoff: '' };
    const output = form.querySelector('[role="alert"]');
    const deviceBox = form.querySelector('[data-quick-device]');
    let service = 'transfer', locating = 0, deviceCandidate = null, navigating = false;
    const showError = message => { output.textContent = message; output.hidden = !message; };
    const syncField = input => input.closest('.tuxano-quick-booking-field')?.classList.toggle('has-value', Boolean(input.value));
    syncField(form.querySelector('[data-quick-field="hours"]'));
    const clearDevice = () => { ++locating; deviceCandidate = null; deviceBox.replaceChildren(); deviceBox.hidden = true; };
    const restoreNavigation = () => {
      if (!alive()) return;
      navigating = false; clearDevice();
      const submit = form.querySelector('[type="submit"]'); submit.disabled = false; submit.textContent = 'CHECK PRICE';
      const locate = form.querySelector('[data-quick-locate]'); locate.disabled = false; locate.removeAttribute('aria-busy');
    };
    window.addEventListener('pageshow', event => { if (event.persisted) restoreNavigation(); });
    for (const [key, input] of Object.entries(fields)) {
      input.addEventListener('input', () => {
        points[key] = null; queries[key] = input.value;
        syncField(input);
        input.setCustomValidity(''); input.removeAttribute('aria-invalid');
        if (key === 'pickup') clearDevice();
        showError('');
      });
      mountAutocomplete(input, { client, fieldId: `${id}-${key}`, countryCode: key === 'pickup' ? '' : () => countryCodeOf(points.pickup?.countryCode), onSelect: place => {
        if (!alive() || navigating) return;
        if (key === 'pickup') clearDevice();
        points[key] = { ...place, query: queries[key] || input.value };
        input.value = place.text; syncField(input); input.setCustomValidity(''); input.removeAttribute('aria-invalid'); showError('');
      }, onError: showError });
    }
    form.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || navigating) return;
      if (button.dataset.quickService) {
        service = button.dataset.quickService;
        form.querySelectorAll('[data-quick-service]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.quickService === service)));
        form.querySelector('[data-quick-hours]').hidden = service !== 'hourly';
        form.querySelector('[data-quick-field="hours"]').disabled = service !== 'hourly';
        return;
      }
      if (button.hasAttribute('data-quick-use-device')) {
        try {
          if (!deviceCandidate) return;
          const fresh = normalizeDevicePosition({ coords: { latitude: deviceCandidate.latitude, longitude: deviceCandidate.longitude, accuracy: deviceCandidate.accuracyMeters }, timestamp: deviceCandidate.capturedAt });
          if (!fresh.precise) throw new Error('Your location is approximate. Search for your pickup address instead.');
          const query = `Device pickup (${fresh.latitude.toFixed(5)}, ${fresh.longitude.toFixed(5)})`;
          points.pickup = { ...fresh, source: 'device', text: query, query, confirmedAt: Date.now() };
          fields.pickup.value = query; syncField(fields.pickup); fields.pickup.setCustomValidity(''); fields.pickup.removeAttribute('aria-invalid'); queries.pickup = query;
          clearDevice(); showError('');
        } catch (failure) { clearDevice(); showError(failure.message); }
        return;
      }
      if (!button.hasAttribute('data-quick-locate')) return;
      clearDevice(); const generation = locating;
      button.disabled = true; button.setAttribute('aria-busy', 'true');
      showError('Checking your device location. Your pickup stays unchanged until you confirm.');
      try {
        const point = await requestDeviceLocation();
        if (!alive() || navigating || generation !== locating) return;
        if (!point.precise) throw new Error('Your device returned an approximate position. Search for your exact pickup address instead.');
        deviceCandidate = point;
        deviceBox.innerHTML = `<p>Check this pickup: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} (accuracy within ${Math.ceil(point.accuracyMeters)}m).</p><button type="button" data-quick-use-device>Use this pickup location</button>`;
        deviceBox.hidden = false; showError('');
      } catch (failure) { if (alive() && generation === locating) showError(failure.message || 'Your location could not be detected. Search for your pickup address.'); }
      finally { if (alive()) { button.disabled = false; button.removeAttribute('aria-busy'); } }
    });
    form.addEventListener('change', event => {
      const key = event.target.dataset.quickField;
      if (!['date', 'time'].includes(key)) return;
      const output = form.querySelector(`[data-quick-display="${key}"]`);
      output.textContent = event.target.value || (key === 'date' ? 'Date' : 'Time');
      syncField(event.target);
      event.target.removeAttribute('aria-invalid'); showError('');
    });
    form.addEventListener('submit', event => {
      event.preventDefault(); if (navigating) return;
      showError('');
      for (const [key, input] of Object.entries(fields)) {
        input.setCustomValidity(!points[key] || input.value !== points[key].text ? 'Choose this location from the Google Maps suggestions.' : '');
      }
      try { assertSameCountry([points.pickup, points.dropoff]); }
      catch (failure) { fields.dropoff.setCustomValidity(failure.message); }
      const invalid = [...form.querySelectorAll('input,select')].filter(input => input.willValidate && !input.validity.valid);
      invalid.forEach(input => input.setAttribute('aria-invalid', 'true'));
      if (invalid.length) { showError(invalid[0].validationMessage || 'Complete your trip details before checking prices.'); invalid[0].focus(); return; }
      try {
        const selectedPoint = key => points[key].placeId ? { placeId: points[key].placeId, query: points[key].query } : points[key];
        const trip = { service, hours: Number(form.querySelector('[data-quick-field="hours"]').value), date: form.querySelector('[data-quick-field="date"]').value, time: form.querySelector('[data-quick-field="time"]').value, pickup: selectedPoint('pickup'), dropoff: selectedPoint('dropoff') };
        validateQuickPickupTime(trip, session.settings.timezone);
        const url = createQuickHandoff(sessionStorage, trip, destination.href);
        navigating = true; clearDevice();
        const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'OPENING BOOKING…';
        location.assign(url);
        setTimeout(() => { if (navigating && alive()) { restoreNavigation(); showError('The booking page did not open. Please try again.'); } }, 12000);
      } catch (failure) { restoreNavigation(); showError(failure.message || 'Your trip could not be transferred. Please try again.'); }
    });
  } catch (failure) {
    if (!alive()) return;
    container.innerHTML = `<div class="tuxano-quick-booking-form"><h2 class="tuxano-quick-booking-title">PLAN YOUR RIDE</h2><p class="tuxano-quick-booking-error" role="alert">${escape(failure.name === 'TimeoutError' ? 'The booking service took too long. Please reload this page and try again.' : failure.message || 'Online booking is temporarily unavailable. Please contact us.')}</p><button type="button" class="tuxano-quick-booking-submit" data-quick-retry>TRY AGAIN</button></div>`;
    container.querySelector('[data-quick-retry]').addEventListener('click', () => { delete container.dataset.quickInitialized; initialize(container); });
  }
}

document.querySelectorAll('[data-tuxano-quick-booking]').forEach(initialize);
