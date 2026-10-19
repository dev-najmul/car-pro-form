/* Only the matching same-origin booking frame may change its own height. */
(() => {
  'use strict';
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || event.data.type !== 'tuxano-booking:resize') return;
    const { frameId, height } = event.data;
    if (typeof frameId !== 'string' || typeof height !== 'number' || !Number.isFinite(height) || height < 240 || height > 30000) return;
    for (const frame of document.querySelectorAll('iframe[data-tuxano-booking-frame]')) {
      if (frame.id !== frameId || event.source !== frame.contentWindow) continue;
      const pixels = Math.ceil(height);
      if (frame.style.height !== pixels + 'px') frame.style.height = pixels + 'px';
      break;
    }
  });
})();
