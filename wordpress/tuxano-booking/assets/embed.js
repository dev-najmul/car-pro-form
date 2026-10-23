/* Only the matching same-origin booking frame may resize or reveal itself. */
(() => {
  'use strict';
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || !['tuxano-booking:resize', 'tuxano-booking:scroll'].includes(event.data.type)) return;
    const { frameId, height } = event.data;
    if (typeof frameId !== 'string' || !frameId || frameId.length > 100) return;
    for (const frame of document.querySelectorAll('iframe[data-tuxano-booking-frame]')) {
      if (frame.id !== frameId || event.source !== frame.contentWindow) continue;
      if (event.data.type === 'tuxano-booking:resize') {
        if (typeof height !== 'number' || !Number.isFinite(height) || height < 240 || height > 30000) return;
        const pixels = Math.ceil(height);
        if (frame.style.height !== pixels + 'px') frame.style.height = pixels + 'px';
      } else {
        requestAnimationFrame(() => {
          if (!frame.isConnected || !frame.getClientRects().length) return;
          const toolbar = document.querySelector('#wpadminbar');
          const offset = toolbar && getComputedStyle(toolbar).position === 'fixed' ? toolbar.getBoundingClientRect().height : 0;
          window.scrollTo({ top: Math.max(0, frame.getBoundingClientRect().top + window.scrollY - offset - 12), behavior: 'instant' });
        });
      }
      break;
    }
  });
})();
