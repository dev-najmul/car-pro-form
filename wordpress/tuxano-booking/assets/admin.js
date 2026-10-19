/* Deliberate confirmation for destructive administrator actions. */
(() => {
  'use strict';
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.closest('.tuxano-admin')) return;
    const prompt = form.dataset.confirm;
    if (prompt && !window.confirm(prompt)) event.preventDefault();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-tuxano-select-image]') || !window.wp?.media) return;
    event.preventDefault();
    const input = document.querySelector('#tuxano-image');
    if (!input) return;
    const picker = window.wp.media({ title: 'Choose vehicle photo', library: { type: 'image' }, button: { text: 'Use this photo' }, multiple: false });
    picker.on('select', () => {
      const photo = picker.state().get('selection').first()?.toJSON();
      if (typeof photo?.url !== 'string') return;
      input.value = photo.url; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    picker.open();
  });
})();
