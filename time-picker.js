// A controlled clock chooser keeps iOS's device-level 24-hour preference out
// of the booking UI. The canonical field still stores the existing HH:mm.
export const TIME_PICKER_MINUTES = Object.freeze(Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0')));

export function timePickerParts(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':');
  return { hour: String(Number(hour) % 12 || 12), minute, period: Number(hour) >= 12 ? 'PM' : 'AM' };
}

export function timePickerValue(hour, minute, period) {
  if (!/^(?:[1-9]|1[0-2])$/.test(String(hour)) || !TIME_PICKER_MINUTES.includes(minute) || !['AM', 'PM'].includes(period)) return '';
  return `${String(Number(hour) % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}`;
}

const mounted = new WeakMap();
let nextId = 0;

function loadStyles(document) {
  const href = new URL('./time-picker.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href;
  document.head.append(link);
}

export function mountTimePicker(input, { label = 'Pickup time', onChange } = {}) {
  if (!input || input.tagName !== 'INPUT') throw new TypeError('A canonical time input is required.');
  if (mounted.has(input)) return mounted.get(input);
  const document = input.ownerDocument, window = document.defaultView;
  loadStyles(document);
  const original = Object.fromEntries(['aria-haspopup', 'aria-expanded', 'aria-controls', 'inputmode'].map(key => [key, input.getAttribute(key)]));
  const wasReadOnly = input.readOnly;
  let dialog = null, restoreTimer = null, disposed = false;
  input.dataset.customTimePicker = '';
  input.setAttribute('aria-haspopup', 'dialog');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('inputmode', 'none');

  function close(restoreFocus = true) {
    if (!dialog) return;
    const old = dialog; dialog = null;
    if (old.open && typeof old.close === 'function') old.close();
    old.remove(); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-controls');
    // Returning focus to a native time input during a trusted tap must not
    // summon the device's own time wheel. Restore editability after that tap.
    if (restoreFocus && input.isConnected && !disposed) {
      input.readOnly = true;
      input.focus({ preventScroll: true });
      restoreTimer = window.setTimeout(() => { restoreTimer = null; input.readOnly = wasReadOnly; }, 0);
    } else input.readOnly = wasReadOnly;
  }

  function open() {
    if (disposed || input.disabled || wasReadOnly || dialog) return;
    if (restoreTimer !== null) { window.clearTimeout(restoreTimer); restoreTimer = null; }
    // Set this before focus/default activation: Safari cannot open its native
    // clock while our real touch handler is opening the controlled chooser.
    input.readOnly = true;
    dialog = document.createElement('dialog');
    dialog.className = 'tuxano-time-picker';
    dialog.id = `tuxano-time-picker-${++nextId}`;
    dialog.setAttribute('aria-labelledby', `${dialog.id}-title`);
    dialog.style.fontFamily = window.getComputedStyle(input).fontFamily;
    const title = document.createElement('h2'); title.id = `${dialog.id}-title`; title.textContent = `Choose ${label.toLowerCase()}`;
    const fields = document.createElement('div'); fields.className = 'tuxano-time-picker-fields';
    const select = (name, values) => {
      const wrapper = document.createElement('label'), caption = document.createElement('span'), control = document.createElement('select');
      caption.textContent = name; control.setAttribute('aria-label', name);
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '—'; control.append(placeholder);
      for (const value of values) { const option = document.createElement('option'); option.value = value; option.textContent = value; control.append(option); }
      wrapper.append(caption, control); fields.append(wrapper); return control;
    };
    const hours = select('Hour', Array.from({ length: 12 }, (_, index) => String(index + 1)));
    const minutes = select('Minutes', TIME_PICKER_MINUTES);
    const period = select('AM / PM', ['AM', 'PM']);
    const parts = timePickerParts(input.value);
    hours.value = parts?.hour || '12';
    minutes.value = parts && TIME_PICKER_MINUTES.includes(parts.minute) ? parts.minute : parts ? '' : '00';
    period.value = parts?.period || 'AM';
    const note = document.createElement('p'); note.className = 'tuxano-time-picker-note'; note.textContent = 'Select a time in 5-minute increments.';
    const actions = document.createElement('div'); actions.className = 'tuxano-time-picker-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'tuxano-time-picker-cancel'; cancel.textContent = 'CANCEL';
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'tuxano-time-picker-confirm'; confirm.textContent = 'SET TIME';
    const update = () => { confirm.disabled = !timePickerValue(hours.value, minutes.value, period.value); };
    for (const field of [hours, minutes, period]) field.addEventListener('change', update);
    cancel.addEventListener('click', () => close());
    confirm.addEventListener('click', () => {
      const value = timePickerValue(hours.value, minutes.value, period.value);
      if (!value) return;
      input.value = value;
      close();
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      if (typeof onChange === 'function') onChange(value);
    });
    actions.append(cancel, confirm); dialog.append(title, fields, note, actions);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [hours, minutes, period, cancel, confirm].filter(control => !control.disabled);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.body.append(dialog); update();
    input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', dialog.id);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); }
    hours.focus({ preventScroll: true });
  }

  function activate(event) {
    if (event.type === 'pointerdown' && event.button !== 0) return;
    if (input.disabled || wasReadOnly) return;
    event.preventDefault(); event.stopImmediatePropagation();
    // Suppress native focus before it happens, but open after the completed
    // tap so its trailing click cannot immediately hit our new backdrop.
    if (event.type === 'pointerdown') { input.readOnly = true; return; }
    open();
  }
  const releasePointer = () => {
    window.setTimeout(() => { if (!dialog && !disposed) input.readOnly = wasReadOnly; }, 0);
  };
  function keyboard(event) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) activate(event);
    else if (!event.ctrlKey && !event.metaKey && (event.key.length === 1 || ['Backspace', 'Delete'].includes(event.key))) event.preventDefault();
  }
  input.addEventListener('pointerdown', activate, true);
  input.addEventListener('pointerup', releasePointer, true);
  input.addEventListener('pointercancel', releasePointer, true);
  input.addEventListener('click', activate, true);
  input.addEventListener('keydown', keyboard, true);
  const cleanup = () => {
    disposed = true; close(false);
    if (restoreTimer !== null) window.clearTimeout(restoreTimer);
    input.readOnly = wasReadOnly;
    input.removeEventListener('pointerdown', activate, true);
    input.removeEventListener('pointerup', releasePointer, true);
    input.removeEventListener('pointercancel', releasePointer, true);
    input.removeEventListener('click', activate, true);
    input.removeEventListener('keydown', keyboard, true);
    delete input.dataset.customTimePicker;
    for (const [key, value] of Object.entries(original)) { if (value === null) input.removeAttribute(key); else input.setAttribute(key, value); }
    mounted.delete(input);
  };
  mounted.set(input, cleanup); return cleanup;
}
