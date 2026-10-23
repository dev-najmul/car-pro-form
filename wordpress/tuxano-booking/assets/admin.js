/* Accessible administration interactions; saved server keys are never exposed. */
(() => {
  'use strict';
  const boot = globalThis.TuxanoAdmin;
  const showKeyResult = (card, message, state = 'info') => {
    const result = card.querySelector('[data-tuxano-key-result]');
    if (!result) return;
    result.hidden = false; result.textContent = message; result.dataset.state = state;
  };
  const keyStatus = (card, message, configured = false) => {
    const status = card.querySelector('[data-tuxano-key-status]');
    if (!status) return;
    status.classList.toggle('is-configured', configured); status.classList.toggle('is-missing', !configured);
    status.querySelector('strong').textContent = message;
    status.querySelector('.dashicons').className = 'dashicons ' + (configured ? 'dashicons-yes-alt' : 'dashicons-edit');
  };
  // Test each browser key in a fresh window so an already-loaded SDK cannot
  // accidentally validate a different saved or replacement key.
  const testBrowserKey = key => new Promise(resolve => {
    if (!/^AIza[A-Za-z0-9_-]{35}$/.test(key)) { resolve({ ok: false, reason: 'format' }); return; }
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const frame = document.createElement('iframe');
    frame.hidden = true; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    let done = false;
    const finish = result => {
      if (done) return; done = true; clearTimeout(timer);
      window.removeEventListener('message', receive); frame.remove(); resolve(result);
    };
    const receive = event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || event.data.type !== 'tuxano:browser-key-test' || event.data.id !== id || typeof event.data.ok !== 'boolean') return;
      finish({ ok: event.data.ok, reason: event.data.reason });
    };
    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), 20000);
    window.addEventListener('message', receive);
    const params = JSON.stringify({ id, key, origin: location.origin }).replaceAll('<', String.fromCharCode(92) + 'u003c');
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>(' + function (config) {
      let complete = false;
      const send = (ok, reason) => {
        if (complete) return; complete = true;
        parent.postMessage({ type: 'tuxano:browser-key-test', id: config.id, ok, reason }, config.origin);
      };
      window.gm_authFailure = () => send(false, 'authorization');
      window.__tuxanoAdminKeyReady = async () => {
        try {
          const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places');
          const result = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'New York', language: 'en', sessionToken: new AutocompleteSessionToken() });
          send(Boolean(result && Array.isArray(result.suggestions)), 'provider');
        } catch { send(false, 'authorization'); }
      };
      const script = document.createElement('script'); script.async = true;
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(config.key) + '&callback=__tuxanoAdminKeyReady&loading=async&v=weekly';
      script.onerror = () => send(false, 'network'); document.head.append(script);
    }.toString() + ')(' + params + ');<\/script></body></html>';
    document.body.append(frame);
  });
  const selection = form => {
    const rows = [...form.querySelectorAll('[data-tuxano-row]')];
    const checked = rows.filter(row => row.checked).length;
    const master = form.querySelector('[data-tuxano-select-all]');
    if (master) { master.checked = rows.length > 0 && checked === rows.length; master.indeterminate = checked > 0 && checked < rows.length; }
    const count = form.querySelector('[data-tuxano-selected]');
    if (count) count.textContent = `${checked} selected`;
    return checked;
  };
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.closest('.tuxano-admin')) return;
    if (form.matches('.tuxano-bulk-form')) {
      const action = form.querySelector('[name="bulk_action"]');
      if (!selection(form) || action?.value !== 'delete') {
        event.preventDefault();
        let feedback = form.querySelector('[data-tuxano-bulk-feedback]');
        if (!feedback) { feedback = document.createElement('p'); feedback.dataset.tuxanoBulkFeedback = ''; feedback.className = 'tuxano-field-error'; feedback.setAttribute('role', 'alert'); form.prepend(feedback); }
        feedback.textContent = 'Choose Delete selected and select at least one submission.';
        action?.focus(); return;
      }
    }
    const prompt = form.dataset.confirm;
    if (prompt && !window.confirm(prompt)) event.preventDefault();
  });
  document.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.matches('[data-tuxano-select-all]')) {
      const form = target.closest('form'); if (!form) return;
      form.querySelectorAll('[data-tuxano-row]').forEach(row => { row.checked = target.checked; }); selection(form);
    } else if (target.matches('[data-tuxano-row]')) { selection(target.closest('form')); }
    if (target.matches('[data-tuxano-rate-toggle]')) updateRates(target.closest('.tuxano-vehicle-pricing'));
  });
  document.addEventListener('input', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.matches('[data-tuxano-rate]')) updateRates(target.closest('.tuxano-vehicle-pricing'));
    if (target.matches('[data-tuxano-key-input]')) {
      const card = target.closest('[data-tuxano-key]'); if (!card) return;
      card.querySelector('[data-tuxano-key-clear-value]').value = '0';
      if (target.value.trim()) keyStatus(card, card.dataset.configured === '1' ? 'Replacement not saved' : 'New key not saved');
      else keyStatus(card, card.dataset.configured === '1' ? 'Saved and configured' : 'Not configured', card.dataset.configured === '1');
      const result = card.querySelector('[data-tuxano-key-result]'); if (result) result.hidden = true;
    }
  });
  document.addEventListener('invalid', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-tuxano-key-input]')) return;
    event.preventDefault(); input.hidden = false; input.focus();
    showKeyResult(input.closest('[data-tuxano-key]'), 'Enter a valid Google API key beginning with AIza, followed by its complete key value.', 'error');
  }, true);
  document.addEventListener('click', async event => {
    const button = event.target.closest('button, a');
    if (!button) return;
    const card = button.closest('[data-tuxano-key]');
    if (card && button.matches('[data-tuxano-key-replace]')) {
      event.preventDefault(); const input = card.querySelector('[data-tuxano-key-input]');
      card.querySelector('[data-tuxano-key-clear-value]').value = '0'; input.hidden = false; input.focus();
      showKeyResult(card, 'Paste the replacement key, test it, then save settings. The current key stays active until you save.'); return;
    }
    if (card && button.matches('[data-tuxano-key-clear]')) {
      event.preventDefault(); const input = card.querySelector('[data-tuxano-key-input]');
      input.value = ''; input.hidden = true; card.querySelector('[data-tuxano-key-clear-value]').value = '1';
      const current = card.querySelector('[data-tuxano-key-current]'); if (current) current.hidden = true;
      keyStatus(card, 'Removal scheduled');
      showKeyResult(card, 'Save settings to remove this key. The saved value is unchanged until then.');
      let undo = card.querySelector('[data-tuxano-key-undo]');
      if (!undo) { undo = document.createElement('button'); undo.type = 'button'; undo.className = 'button button-small'; undo.dataset.tuxanoKeyUndo = ''; undo.textContent = 'Keep saved key'; card.append(undo); }
      undo.hidden = false; return;
    }
    if (card && button.matches('[data-tuxano-key-undo]')) {
      event.preventDefault(); card.querySelector('[data-tuxano-key-clear-value]').value = '0';
      const current = card.querySelector('[data-tuxano-key-current]'); if (current) current.hidden = false;
      button.hidden = true; keyStatus(card, 'Saved and configured', true); showKeyResult(card, 'The saved key will be kept.'); return;
    }
    if (card && button.matches('[data-tuxano-test-key]')) {
      event.preventDefault(); const input = card.querySelector('[data-tuxano-key-input]'); const value = input.value.trim();
      if (card.querySelector('[data-tuxano-key-clear-value]').value === '1') { showKeyResult(card, 'Keep or replace this key before testing it.', 'error'); return; }
      if (value && !/^AIza[A-Za-z0-9_-]{35}$/.test(value)) { input.hidden = false; input.focus(); showKeyResult(card, 'This key has an invalid format. Copy the complete Google API key without spaces.', 'error'); return; }
      if (!value && card.dataset.configured !== '1') { input.hidden = false; input.focus(); showKeyResult(card, 'Paste a key before running this check.', 'error'); return; }
      if (!boot?.restUrl || !boot.nonce) { showKeyResult(card, 'Refresh this settings page before testing a key.', 'error'); return; }
      button.disabled = true; button.setAttribute('aria-busy', 'true'); showKeyResult(card, 'Checking key configuration…');
      try {
        const url = new URL(boot.restUrl + 'admin/test-api', location.href);
        if (url.origin !== location.origin) throw new Error('The API test configuration is invalid.');
        const payload = { kind: button.dataset.tuxanoTestKey }; if (value) payload.key = value;
        const response = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': boot.nonce }, body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) });
        let data; try { data = await response.json(); } catch { throw new Error('The test could not be completed. Please try again.'); }
        if (!response.ok) throw new Error(data.message || 'This key could not be verified.');
        if (button.dataset.tuxanoTestKey === 'browser') {
          showKeyResult(card, 'Checking Maps JavaScript and Places authorization for this website…');
          const checked = await testBrowserKey(value || data.browserKey || '');
          if (!checked.ok) {
            if (checked.reason === 'timeout' || checked.reason === 'network') throw new Error('The browser API check could not reach Google. Please try again and check your connection.');
            throw new Error('Google Maps or Places did not authorize this key on this website. Check the key, enabled APIs, billing and allowed website domains.');
          }
          showKeyResult(card, 'Google Maps JavaScript and Places search accepted this key on this website.', 'success');
          return;
        }
        const connected = data.valid === true || data.verified === true || data.status === 'verified';
        showKeyResult(card, data.message || (connected ? 'The API connection succeeded.' : 'The key format is valid. Test location search in your booking form to check browser domain restrictions.'), connected ? 'success' : 'info');
      } catch (failure) { showKeyResult(card, failure.name === 'TimeoutError' ? 'The API check timed out. Please try again.' : failure.message, 'error'); }
      finally { button.disabled = false; button.removeAttribute('aria-busy'); }
      return;
    }
    if (!button.matches('[data-tuxano-select-image]') || !window.wp?.media) return;
    event.preventDefault(); const input = document.querySelector('#tuxano-image'); if (!input) return;
    const picker = window.wp.media({ title: 'Choose vehicle photo', library: { type: 'image' }, button: { text: 'Use this photo' }, multiple: false });
    picker.on('select', () => { const photo = picker.state().get('selection').first()?.toJSON(); if (typeof photo?.url !== 'string') return; input.value = photo.url; input.dispatchEvent(new Event('input', { bubbles: true })); });
    picker.open();
  });
  function updateRates(wrapper) {
    if (!wrapper) return; const values = {};
    wrapper.querySelectorAll('[data-tuxano-rate]').forEach(input => {
      const key = input.dataset.tuxanoRate;
      const toggle = wrapper.querySelector(`[data-tuxano-rate-toggle="${key}"]`);
      const disabled = Boolean(toggle?.checked); input.disabled = disabled; input.setAttribute('aria-disabled', String(disabled));
      input.closest('.tuxano-rate-field')?.classList.toggle('is-disabled', disabled);
      const number = Number(input.value); values[key] = disabled || !Number.isFinite(number) || number < 0 ? 0 : number;
    });
    const total = Math.max(values.minimum || 0, (values.base || 0) + 20 * (values.perMile || 0) + 30 * (values.perDrivingMinute || 0)) + 15 * (values.perWaitingMinute || 0);
    const output = wrapper.querySelector('[data-tuxano-example-total]');
    if (output) {
      const currency = wrapper.dataset.tuxanoCurrency || 'USD';
      try { output.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(total); }
      catch { output.textContent = `${currency} ${total.toFixed(2)}`; }
    }
  }
  document.querySelectorAll('.tuxano-bulk-form').forEach(selection);
  document.querySelectorAll('.tuxano-vehicle-pricing').forEach(updateRates);
})();
