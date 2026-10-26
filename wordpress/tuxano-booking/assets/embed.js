/* Only the matching same-origin booking frame may resize or reveal itself. */
(() => {
  'use strict';
  const editorTails = new WeakMap();
  const restoreTail = frame => {
    for (const { node, display, priority } of editorTails.get(frame) || []) {
      if (node.style.getPropertyValue('display') !== 'none' || node.style.getPropertyPriority('display') !== 'important') continue;
      if (display) node.style.setProperty('display', display, priority); else node.style.removeProperty('display');
    }
    editorTails.delete(frame);
  };
  const emptyEditorParagraph = node => node.tagName === 'P' && !node.id && !node.hasAttribute('role') && !node.hasAttribute('tabindex') && !node.hasAttribute('aria-label') && [...node.childNodes].every(child =>
    child.nodeType === Node.COMMENT_NODE || child.nodeType === Node.TEXT_NODE && !child.textContent.trim() || child.nodeType === Node.ELEMENT_NODE && child.tagName === 'BR'
  );
  const hideEditorTail = frame => {
    if (editorTails.has(frame)) return;
    const wrapper = frame.parentElement;
    if (!wrapper?.matches('.tuxano-booking-embed') || !wrapper.closest('.elementor-widget-text-editor')) return;
    const paragraphs = [];
    // Elementor's Text Editor can leave an empty WordPress paragraph after a
    // shortcode. Only a wholly empty trailing run belongs to this layout fix;
    // real text, links, media and other widgets must keep their normal layout.
    for (let node = wrapper.nextSibling; node; node = node.nextSibling) {
      if (node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
      if (node.nodeType !== Node.ELEMENT_NODE || !emptyEditorParagraph(node)) return;
      paragraphs.push(node);
    }
    const saved = paragraphs.map(node => ({ node, display: node.style.getPropertyValue('display'), priority: node.style.getPropertyPriority('display') }));
    for (const { node } of saved) node.style.setProperty('display', 'none', 'important');
    editorTails.set(frame, saved);
  };
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
        if (event.data.view === 'thank-you') hideEditorTail(frame);
        else if (event.data.view === 'form') restoreTail(frame);
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
  for (const frame of document.querySelectorAll('iframe[data-tuxano-booking-frame]')) {
    const ready = () => {
      if (frame.id && frame.id.length <= 100) frame.contentWindow?.postMessage({ type: 'tuxano-booking:ready', frameId: frame.id }, location.origin);
    };
    frame.addEventListener('load', ready);
    ready();
  }
})();
