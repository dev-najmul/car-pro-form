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
    const minimum = Number.isInteger(session.settings.minHours) ? Math.max(3, Math.min(24, session.settings.minHours)) : 3;
    const maximum = Number.isInteger(session.settings.maxHours) ? Math.max(minimum, Math.min(24, session.settings.maxHours)) : 24;
    const initialHours = Math.min(maximum, Math.max(minimum, 3));
    const timezoneEnabled = session.settings.pickupTimezones === true;
    const defaultTimezone = timezoneEnabled ? 'America/New_York' : session.settings.timezone;
    const today = quickWebsiteClock(defaultTimezone).slice(0, 10);
    const locationField = (key, title, locate = false) => `<label class="tuxano-quick-booking-field" for="${id}-${key}"><span class="tuxano-quick-booking-label">${title}</span><span class="tuxano-quick-booking-control location-input">${icon('pin')}<input id="${id}-${key}" class="input" type="text" data-quick-place="${key}" aria-label="${title}" placeholder="${title}" autocomplete="off" maxlength="256" required>${locate ? `<button type="button" class="tuxano-quick-booking-locate" data-quick-locate aria-label="Use current location">${icon('target')}</button>` : ''}</span></label>`;
    const picker = (key, title, type, symbol) => `<label class="tuxano-quick-booking-field" data-quick-picker for="${id}-${key}"><span class="tuxano-quick-booking-label">${title}</span><span class="tuxano-quick-booking-control">${icon(symbol)}<span data-quick-display="${key}" aria-hidden="true">${title}</span><input id="${id}-${key}" class="input tuxano-quick-booking-native-picker" data-quick-field="${key}" aria-label="${key === 'time' ? 'Pickup time' : title}" type="${type}" ${key === 'date' ? `min="${today}"` : ''} required></span></label>`;
    container.innerHTML = `<form class="tuxano-quick-booking-form" novalidate><h2 class="tuxano-quick-booking-title">PLAN YOUR RIDE</h2><div class="tuxano-quick-booking-segments" role="group" aria-label="Service type"><button type="button" data-quick-service="transfer" aria-pressed="true">TRANSFER</button><button type="button" data-quick-service="hourly" aria-pressed="false">HOURLY</button></div>${locationField('pickup', 'Pickup Location', true)}<div class="tuxano-quick-booking-device" data-quick-device hidden></div>${locationField('dropoff', 'Drop-off Location')}<div class="tuxano-quick-booking-field tuxano-quick-booking-hours" data-quick-hours hidden><div class="tuxano-quick-booking-control">${icon('clock')}<label class="tuxano-quick-booking-hours-title" for="${id}-hours">Number of hours</label><div class="tuxano-quick-booking-stepper"><button type="button" data-quick-hours-change="-1" aria-label="Decrease hours" disabled>−</button><span class="tuxano-quick-booking-hours-editor"><input id="${id}-hours" class="input" type="number" inputmode="numeric" min="${minimum}" max="${maximum}" step="1" value="${initialHours}" aria-label="Hours" aria-describedby="${id}-hours-help ${id}-hours-error" data-quick-field="hours" disabled required><span aria-hidden="true">hours</span></span><button type="button" data-quick-hours-change="1" aria-label="Increase hours">+</button></div></div><p id="${id}-hours-help" class="tuxano-quick-booking-hours-limit">${minimum}-hour minimum (max ${maximum} hours)</p><p id="${id}-hours-error" class="tuxano-quick-booking-hours-error" data-quick-hours-error role="alert" hidden></p><div class="tuxano-quick-booking-hours-help"><strong>Need less or more than 24 hours or multiple day service?</strong><span>Please add this in your Trip Notes section when completing your reservation.</span></div></div><div class="tuxano-quick-booking-date-time">${picker('date', 'Date', 'date', 'calendar')}${picker('time', 'Time', 'time', 'clock')}</div><p class="tuxano-quick-booking-timezone" data-quick-timezone ${timezoneEnabled ? '' : 'hidden'}>Pickup time: Eastern Time. Choose your pickup to confirm its time zone.</p><p class="tuxano-quick-booking-error" role="alert" hidden></p><button type="submit" class="tuxano-quick-booking-submit">CHECK PRICE</button><p class="tuxano-quick-booking-note">${icon('shield')}<span>Estimated pricing shown before reservation request.</span></p></form>`;
    const form = container.querySelector('form');
    const fields = Object.fromEntries(['pickup', 'dropoff'].map(key => [key, form.querySelector(`[data-quick-place="${key}"]`)]));
    const points = { pickup: null, dropoff: null }, queries = { pickup: '', dropoff: '' };
    const output = form.querySelector('.tuxano-quick-booking-error');
    const deviceBox = form.querySelector('[data-quick-device]');
    let service = 'transfer', locating = 0, deviceCandidate = null, navigating = false;
    let pickupTimezone = null, timezoneGeneration = 0, timezoneController = null, timezonePromise = null;
    const timezoneOutput = form.querySelector('[data-quick-timezone]');
    const showError = message => { output.textContent = message; output.hidden = !message; };
    const syncField = input => input.closest('.tuxano-quick-booking-field')?.classList.toggle('has-value', Boolean(input.value));
    const clearPickupTimezone = () => {
      ++timezoneGeneration; timezoneController?.abort(); timezoneController = null; timezonePromise = null; pickupTimezone = null;
      if (timezoneEnabled) {
        timezoneOutput.textContent = 'Pickup time: Eastern Time. Choose your pickup to confirm its time zone.';
        form.querySelector('[data-quick-field="date"]').min = quickWebsiteClock(defaultTimezone).slice(0, 10);
      }
    };
    const resolvePickupTimezone = () => {
      if (!timezoneEnabled) return Promise.resolve(defaultTimezone);
      if (pickupTimezone) return Promise.resolve(pickupTimezone);
      if (timezonePromise) return timezonePromise;
      const point = points.pickup;
      if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return Promise.reject(new Error('Choose your pickup address again so its time zone can be checked.'));
      const generation = timezoneGeneration;
      const controller = timezoneController = new AbortController();
      const watchdog = setTimeout(() => controller.abort(), 15000);
      timezoneOutput.textContent = 'Checking the pickup time zone…';
      form.querySelector('[data-quick-field="date"]').min = ''; // The selected pickup, rather than the Eastern preview, sets the final bound.
      timezonePromise = (async () => {
        const response = await fetch(new URL((container.dataset.restUrl || '') + 'timezone', location.href), { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Tuxano-Session': session.token }, body: JSON.stringify({ latitude: point.latitude, longitude: point.longitude }), signal: controller.signal });
        let result;
        try { result = await response.json(); } catch { throw new Error('The pickup time zone could not be checked. Please try checking prices again.'); }
        if (!response.ok || typeof result.timezone !== 'string' || result.timezone.length > 100 || typeof result.label !== 'string' || !result.label.trim() || result.label.length > 100 || /[\u0000-\u001f\u007f]/u.test(result.label)) throw new Error('The pickup time zone could not be checked. Please try checking prices again.');
        try { new Intl.DateTimeFormat('en-US', { timeZone: result.timezone }).format(); } catch { throw new Error('The pickup time zone could not be checked. Please try checking prices again.'); }
        if (!alive() || generation !== timezoneGeneration || points.pickup !== point) throw new Error('Your pickup changed. Check prices again to confirm its time zone.');
        pickupTimezone = result.timezone;
        timezoneOutput.textContent = `Pickup time: ${result.label}.`;
        form.querySelector('[data-quick-field="date"]').min = quickWebsiteClock(pickupTimezone).slice(0, 10);
        return pickupTimezone;
      })().catch(failure => {
        if (alive() && generation === timezoneGeneration) {
          timezoneOutput.textContent = 'Pickup time zone unavailable. Check prices to try again, or choose your pickup address again.';
          if (failure.name === 'AbortError') throw new Error('The pickup time zone could not be checked. Please try checking prices again.');
        }
        throw failure;
      }).finally(() => {
        clearTimeout(watchdog);
        if (generation === timezoneGeneration) { timezonePromise = null; timezoneController = null; }
      });
      return timezonePromise;
    };
    const refreshPickupTimezone = () => { clearPickupTimezone(); if (timezoneEnabled) resolvePickupTimezone().catch(() => {}); };

    const hoursInput = form.querySelector('[data-quick-field="hours"]');
    const hoursError = form.querySelector('[data-quick-hours-error]');
    const syncHours = (commit = false) => {
      const raw = hoursInput.value.trim();
      const value = Number(raw);
      const valid = raw !== '' && Number.isInteger(value) && value >= minimum && value <= maximum;
      let message = valid ? '' : `Choose a whole number from ${minimum} to ${maximum} hours.`;
      if (!valid && commit) {
        const bounded = raw !== '' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.trunc(value))) : minimum;
        hoursInput.value = String(bounded);
        message += ` Your selection has been set to ${bounded} hours.`;
      }
      hoursInput.setCustomValidity(valid || commit ? '' : message);
      hoursInput.toggleAttribute('aria-invalid', !valid && !commit);
      if (!valid && !commit) hoursInput.setAttribute('aria-invalid', 'true');
      hoursError.textContent = message; hoursError.hidden = !message;
      const current = Number(hoursInput.value);
      form.querySelector('[data-quick-hours-change="-1"]').disabled = service !== 'hourly' || !Number.isFinite(current) || current <= minimum;
      form.querySelector('[data-quick-hours-change="1"]').disabled = service !== 'hourly' || !Number.isFinite(current) || current >= maximum;
    };
    hoursInput.addEventListener('input', () => syncHours());
    hoursInput.addEventListener('change', () => syncHours(true));
    hoursInput.addEventListener('blur', () => { if (!hoursInput.validity.valid || !hoursInput.value) syncHours(true); });
    hoursInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault(); syncHours(true);
    });
    syncHours();
    const clearDevice = () => { ++locating; deviceCandidate = null; deviceBox.replaceChildren(); deviceBox.hidden = true; };
    const restoreNavigation = () => {
      if (!alive()) return;
      navigating = false; clearDevice();
      const submit = form.querySelector('[type="submit"]'); submit.disabled = false; submit.textContent = 'CHECK PRICE';
      const locate = form.querySelector('[data-quick-locate]'); locate.disabled = false; locate.removeAttribute('aria-busy');
    };
    window.addEventListener('pageshow', event => { if (event.persisted) restoreNavigation(); });
    for (const input of form.querySelectorAll('[data-quick-picker] input')) {
      const field = input.closest('[data-quick-picker]');
      if (typeof input.showPicker !== 'function') continue;
      field.classList.add('has-native-picker');
      const openPicker = event => {
        if (navigating || input.disabled || input.readOnly || !field.classList.contains('has-native-picker')) return;
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
        // Keep the trusted click/tap/keyboard activation: awaiting anything here
        // prevents native pickers from opening in browsers that require it.
        input.focus({ preventScroll: true });
        try {
          input.showPicker();
          event.preventDefault();
        } catch {
          // Unsupported/embedded browsers still get an editable native field.
          field.classList.remove('has-native-picker');
        }
      };
      input.addEventListener('click', openPicker);
      input.addEventListener('keydown', openPicker);
    }
    for (const [key, input] of Object.entries(fields)) {
      input.addEventListener('input', () => {
        points[key] = null; queries[key] = input.value;
        syncField(input);
        input.setCustomValidity(''); input.removeAttribute('aria-invalid');
        if (key === 'pickup') { clearDevice(); clearPickupTimezone(); }
        showError('');
      });
      mountAutocomplete(input, { client, fieldId: `${id}-${key}`, countryCode: key === 'pickup' ? '' : () => countryCodeOf(points.pickup?.countryCode), onSelect: place => {
        if (!alive() || navigating) return;
        if (key === 'pickup') clearDevice();
        points[key] = { ...place, query: queries[key] || input.value };
        input.value = place.text; syncField(input); input.setCustomValidity(''); input.removeAttribute('aria-invalid'); showError('');
        if (key === 'pickup') refreshPickupTimezone();
      }, onError: showError });
    }
    form.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || navigating) return;
      if (button.dataset.quickService) {
        service = button.dataset.quickService;
        form.querySelectorAll('[data-quick-service]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.quickService === service)));
        form.querySelector('[data-quick-hours]').hidden = service !== 'hourly';
        hoursInput.disabled = service !== 'hourly';
        syncHours();
        return;
      }
      if (button.hasAttribute('data-quick-hours-change')) {
        syncHours(true);
        hoursInput.value = String(Math.min(maximum, Math.max(minimum, Number(hoursInput.value) + Number(button.dataset.quickHoursChange))));
        syncHours();
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
          clearDevice(); refreshPickupTimezone(); showError('');
        } catch (failure) { clearDevice(); showError(failure.message); }
        return;
      }
      if (!button.hasAttribute('data-quick-locate')) return;
      clearDevice(); const generation = locating;
      button.disabled = true; button.setAttribute('aria-busy', 'true');
      showError('Finding your current pickup address…');
      try {
        const point = await requestDeviceLocation();
        if (!alive() || navigating || generation !== locating) return;
        if (!point.precise) throw new Error('Your device returned an approximate position. Search for your exact pickup address instead.');
        deviceCandidate = point;
        try {
          const address = await client.reverseGeocode(point);
          if (!alive() || navigating || generation !== locating) return;
          const fresh = normalizeDevicePosition({ coords: { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracyMeters }, timestamp: point.capturedAt });
          if (!fresh.precise) throw new Error('Your location is approximate. Search for your pickup address instead.');
          // Reverse geocoding supplies a readable label, never a replacement
          // destination. Routing keeps the exact device point and provenance.
          const query = address.text.slice(0, 256).replace(/[\uD800-\uDBFF]$/u, '').trim();
          points.pickup = { ...address, ...fresh, source: 'device', text: address.text, query, confirmedAt: Date.now() };
          fields.pickup.value = address.text; queries.pickup = query;
          syncField(fields.pickup); fields.pickup.setCustomValidity(''); fields.pickup.removeAttribute('aria-invalid');
          clearDevice(); refreshPickupTimezone(); showError('');
        } catch (failure) {
          if (!alive() || navigating || generation !== locating) return;
          deviceBox.innerHTML = `<p>Your device found a precise location, but its address could not be loaded. Check this point before using it: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} (accuracy within ${Math.ceil(point.accuracyMeters)}m).</p><button type="button" data-quick-use-device>Use this pickup location</button>`;
          deviceBox.hidden = false;
          showError(failure.message || 'The pickup address could not be loaded. Search for the address or check the detected point below.');
        }
      } catch (failure) { if (alive() && generation === locating) showError(failure.message || 'Your location could not be detected. Search for your pickup address.'); }
      finally { if (alive()) { button.disabled = false; button.removeAttribute('aria-busy'); } }
    });
    const syncPicker = event => {
      const key = event.target.dataset.quickField;
      if (!['date', 'time'].includes(key)) return;
      const output = form.querySelector(`[data-quick-display="${key}"]`);
      const value = event.target.value;
      if (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        output.textContent = `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${day}, ${year}`;
      } else if (key === 'time' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        const [hour, minute] = value.split(':').map(Number);
        output.textContent = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
      } else output.textContent = key === 'date' ? 'Date' : 'Time';
      syncField(event.target);
      event.target.removeAttribute('aria-invalid'); showError('');
    };
    form.addEventListener('input', syncPicker);
    form.addEventListener('change', syncPicker);
    form.addEventListener('submit', async event => {
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
      const submitTimezoneGeneration = timezoneGeneration;
      try {
        const selectedPoint = key => points[key].placeId ? { placeId: points[key].placeId, query: points[key].query } : points[key];
        const selectedPickup = points.pickup, selectedDropoff = points.dropoff;
        const trip = { service, hours: Number(form.querySelector('[data-quick-field="hours"]').value), date: form.querySelector('[data-quick-field="date"]').value, time: form.querySelector('[data-quick-field="time"]').value, pickup: selectedPoint('pickup'), dropoff: selectedPoint('dropoff') };
        const selectedTimezone = timezoneEnabled ? await resolvePickupTimezone() : defaultTimezone;
        if (!alive() || navigating || points.pickup !== selectedPickup || points.dropoff !== selectedDropoff || service !== trip.service || Number(hoursInput.value) !== trip.hours || trip.date !== form.querySelector('[data-quick-field="date"]').value || trip.time !== form.querySelector('[data-quick-field="time"]').value) return;
        validateQuickPickupTime(trip, selectedTimezone);
        const url = createQuickHandoff(sessionStorage, trip, destination.href);
        navigating = true; clearDevice();
        const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'OPENING BOOKING…';
        location.assign(url);
        setTimeout(() => { if (navigating && alive()) { restoreNavigation(); showError('The booking page did not open. Please try again.'); } }, 12000);
      } catch (failure) {
        if (!alive() || timezoneEnabled && submitTimezoneGeneration !== timezoneGeneration) return;
        restoreNavigation(); showError(failure.message || 'Your trip could not be transferred. Please try again.');
      }
    });
  } catch (failure) {
    if (!alive()) return;
    container.innerHTML = `<div class="tuxano-quick-booking-form"><h2 class="tuxano-quick-booking-title">PLAN YOUR RIDE</h2><p class="tuxano-quick-booking-error" role="alert">${escape(failure.name === 'TimeoutError' ? 'The booking service took too long. Please reload this page and try again.' : failure.message || 'Online booking is temporarily unavailable. Please contact us.')}</p><button type="button" class="tuxano-quick-booking-submit" data-quick-retry>TRY AGAIN</button></div>`;
    container.querySelector('[data-quick-retry]').addEventListener('click', () => { delete container.dataset.quickInitialized; initialize(container); });
  }
}

document.querySelectorAll('[data-tuxano-quick-booking]').forEach(initialize);
