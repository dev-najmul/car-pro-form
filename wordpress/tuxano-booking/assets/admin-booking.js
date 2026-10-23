/* Full private booking editor. Maps identifies points; PHP owns route and price. */
(async () => {
  'use strict';
  const form = document.querySelector('form[data-tuxano-editor]');
  const boot = globalThis.TuxanoEditor;
  if (!form || !boot) return;
  const mounted = new Map();
  let maps, helpers;
  const readPoint = target => {
    try {
      const point = JSON.parse(form.querySelector(`[data-tuxano-point="${target}"]`)?.value || 'null');
      return point && typeof point === 'object' && !Array.isArray(point) ? point : null;
    } catch { return null; }
  };
  const errorFor = (input, message = '') => {
    const wrapper = input.closest('.tuxano-editor-field');
    if (!wrapper) return;
    const error = wrapper.querySelector('.tuxano-field-error');
    wrapper.classList.toggle('is-invalid', Boolean(message));
    if (error) { error.textContent = message; error.hidden = !message; }
    if (message) { input.setAttribute('aria-invalid', 'true'); if (error) input.setAttribute('aria-describedby', error.id); }
    else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
  };
  const updateSummary = message => {
    const box = form.querySelector('.tuxano-editor-summary-error'); if (!box) return;
    box.textContent = message; box.hidden = !message;
  };
  const sameContact = () => {
    const same = form.querySelector('[data-booking-path="same"]')?.checked;
    for (const [passenger, billing] of [['first', 'first'], ['last', 'last'], ['email', 'email'], ['mobile', 'phone']]) {
      const input = form.querySelector(`[data-booking-path="passenger.${passenger}"]`);
      const source = form.querySelector(`[data-booking-path="billing.${billing}"]`);
      if (!input) continue;
      input.readOnly = Boolean(same);
      if (same && source) { input.value = source.value; errorFor(input); }
    }
  };
  function validate(input) {
    if (input.type === 'checkbox' || input.type === 'hidden') return '';
    const value = input.value.trim();
    if (input.required && !value) return 'This field is required.';
    if (value && input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.';
    if (value && input.type === 'tel') { const digits = value.replace(/\D/g, ''); if (digits.length < 7 || digits.length > 15) return 'Enter a phone number with 7 to 15 digits.'; }
    if (input.type === 'number' && value) {
      const number = Number(value);
      if (!Number.isFinite(number) || input.validity.rangeUnderflow || input.validity.rangeOverflow || input.validity.stepMismatch) return `Enter a valid number${input.min !== '' && input.max !== '' ? ` from ${input.min} to ${input.max}` : ''}.`;
    }
    if (input.maxLength > 0 && value.length > input.maxLength) return `Use at most ${input.maxLength} characters.`;
    if (input.dataset.tuxanoPlace && !readPoint(input.dataset.tuxanoPlace)) return 'Choose this location from the Google Maps suggestions.';
    return '';
  }
  form.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return;
    if (input.dataset.bookingPath?.startsWith('billing.') || input.dataset.bookingPath === 'same') sameContact();
    if (input.hasAttribute('aria-invalid')) errorFor(input, validate(input));
  });
  form.addEventListener('change', event => { if (event.target?.dataset?.bookingPath === 'same') sameContact(); });
  form.addEventListener('focusout', event => {
    const input = event.target;
    if (input.matches?.('[data-booking-path]') && !input.dataset.tuxanoPlace) errorFor(input, validate(input));
  });
  form.addEventListener('submit', event => {
    sameContact(); let first;
    for (const input of form.querySelectorAll('[data-booking-path]')) { const message = validate(input); errorFor(input, message); if (message && !first) first = input; }
    const points = [...form.querySelectorAll('[data-tuxano-point]')].map(input => readPoint(input.dataset.tuxanoPoint)).filter(Boolean);
    try { helpers?.assertSameCountry(points); } catch (failure) { event.preventDefault(); updateSummary(failure.message); form.querySelector('[data-tuxano-place="dropoff"]')?.focus(); return; }
    if (first) { event.preventDefault(); updateSummary('Check the highlighted fields before saving.'); first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    updateSummary(''); form.setAttribute('aria-busy', 'true');
    const submit = form.querySelector('input[type="submit"],button[type="submit"]');
    if (submit) { submit.disabled = true; if (submit instanceof HTMLInputElement) submit.value = 'Saving changes…'; else submit.textContent = 'Saving changes…'; }
  });
  async function mountLocations() {
    for (const cleanup of mounted.values()) cleanup(); mounted.clear();
    if (!maps || !helpers) return;
    for (const input of form.querySelectorAll('[data-tuxano-place]')) {
      const target = input.dataset.tuxanoPlace;
      const clear = () => { const point = form.querySelector(`[data-tuxano-point="${target}"]`); if (point) point.value = 'null'; errorFor(input); };
      input.addEventListener('input', clear);
      const stop = helpers.mountAutocomplete(input, {
        client: maps, fieldId: 'admin-' + target,
        countryCode: () => target === 'pickup' ? '' : readPoint('pickup')?.countryCode || '',
        onSelect(place) {
          const hidden = form.querySelector(`[data-tuxano-point="${target}"]`);
          if (!hidden) return;
          input.value = place.text || place.address || place.name || '';
          hidden.value = JSON.stringify(place); errorFor(input);
          if (target === 'pickup') {
            for (const other of form.querySelectorAll('[data-tuxano-place]:not([data-tuxano-place="pickup"])')) {
              const selected = readPoint(other.dataset.tuxanoPlace);
              if (selected?.countryCode && place.countryCode && selected.countryCode !== place.countryCode) errorFor(other, 'Choose a location in the same country as your pickup.');
            }
          }
        },
        onError(message) { errorFor(input, message); },
      });
      mounted.set(input, () => { input.removeEventListener('input', clear); stop(); });
      input.readOnly = false; input.removeAttribute('aria-busy');
    }
  }
  const renumber = () => {
    const rows = [...form.querySelectorAll('[data-tuxano-stops] [data-tuxano-stop]')];
    rows.forEach((row, index) => {
      row.querySelector('[data-tuxano-stop-title]').textContent = `Stop ${index + 1}`;
      for (const node of row.querySelectorAll('*')) {
        for (const attr of ['id', 'for', 'name', 'data-booking-path', 'data-tuxano-place', 'data-tuxano-point', 'aria-describedby']) {
          if (!node.hasAttribute(attr)) continue;
          node.setAttribute(attr, node.getAttribute(attr).replace(/booking\[trip\]\[stops\]\[\d+\]/g, `booking[trip][stops][${index}]`).replace(/trip\.stops\.\d+\./g, `trip.stops.${index}.`).replace(/trip-stops-\d+-/g, `trip-stops-${index}-`).replace(/stop-\d+/g, `stop-${index}`));
        }
      }
    });
    const add = form.querySelector('[data-tuxano-add-stop]'); if (add) add.disabled = rows.length >= Number(boot.maxStops || 0);
    mountLocations();
  };
  form.addEventListener('click', event => {
    const remove = event.target.closest('[data-tuxano-remove-stop]');
    if (remove) { event.preventDefault(); remove.closest('[data-tuxano-stop]').remove(); renumber(); return; }
    if (!event.target.closest('[data-tuxano-add-stop]')) return;
    event.preventDefault(); const wrapper = form.querySelector('[data-tuxano-stops]');
    const count = wrapper.querySelectorAll('[data-tuxano-stop]').length;
    if (count >= Number(boot.maxStops || 0)) return;
    const template = form.querySelector('[data-tuxano-stop-template]');
    const node = document.createElement('template'); node.innerHTML = template.innerHTML.replaceAll('__index__', String(count));
    wrapper.append(node.content.cloneNode(true)); renumber(); wrapper.lastElementChild?.querySelector('input')?.focus();
  });
  window.addEventListener('pagehide', () => { for (const cleanup of mounted.values()) cleanup(); mounted.clear(); }, { once: true });
  sameContact();
  try {
    const asset = new URL(boot.assetUrl, location.href);
    if (asset.origin !== location.origin) throw new Error('The address search configuration is invalid.');
    helpers = await import(new URL('maps.js', asset)); maps = new helpers.MapsClient();
    maps.configuration = Promise.resolve({ browserKey: boot.browserKey, browserConfigured: Boolean(boot.browserKey), routesConfigured: true, providerMode: 'remote', routeEndpoint: new URL(boot.restUrl + 'admin/route', location.href).href });
  } catch (failure) { updateSummary('Address search could not be loaded. Existing locations and contact edits can still be saved.'); }
  renumber();
})();
