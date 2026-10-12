(function (root) {
  'use strict';
  const E = root.ChatExport = root.ChatExport || {};
  E.defaults = { pageButton: true, format: 'md', scan: true, waitMs: 650, maxSeconds: 180, includeThoughts: false, downloadImages: false, saveAs: true };
  E.settings = (value = {}) => ({
    ...E.defaults,
    pageButton: value.pageButton !== false,
    format: ['md', 'json', 'html', 'txt', 'csv'].includes(value.format) ? value.format : 'md',
    scan: value.scan !== false,
    waitMs: Math.min(3000, Math.max(300, Number(value.waitMs) || 650)),
    maxSeconds: Math.min(900, Math.max(15, Number(value.maxSeconds) || 180)),
    includeThoughts: value.includeThoughts === true,
    downloadImages: value.downloadImages === true,
    saveAs: value.saveAs !== false
  });
  E.url = (raw, base, media = false) => {
    if (!raw || typeof raw !== 'string' || !raw.trim()) return '';
    try {
      const u = new URL(raw, base);
      return (['https:', 'http:'].includes(u.protocol) || (media && /^(blob:|data:image\/(png|jpeg|gif|webp|avif);)/i.test(raw))) ? u.href : '';
    } catch { return ''; }
  };
  E.escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  E.label = value => String(value).replace(/[\[\]\\]/g, '\\$&').replace(/\r?\n/g, ' ');
  E.mdURL = value => String(value).replace(/[<>\s()\\]/g, c => encodeURIComponent(c));
  E.filename = value => String(value).normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '').replace(/[ .]+$/g, '').replace(/\s+/g, ' ').slice(0, 80).trim() || 'Conversation';
  E.hash = value => { let h = 2166136261; for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
  E.preview = value => value.replace(/!\[([^\]]*)\]\([^)]*\)/g, 'Image: $1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^`{3,}[\w+-]*$/gm, '').replace(/[#*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  E.sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  E.cleanMarkdown = value => {
    let fence = null, blanks = 0;
    const lines = [];
    for (const line of value.trim().split('\n')) {
      const match = line.match(/^\s*(`{3,}|~{3,})/);
      if (match) {
        if (!fence) fence = { character: match[1][0], length: match[1].length };
        else if (match[1][0] === fence.character && match[1].length >= fence.length && /^\s*[`~]+\s*$/.test(line)) fence = null;
      }
      if (fence || line.trim()) { lines.push(line); blanks = 0; }
      else if (++blanks <= 1) lines.push(line);
    }
    return lines.join('\n').trim();
  };
  E.generating = doc => [...doc.querySelectorAll('[data-testid="stop-button"],[data-testid="stop-response-button"],button[aria-label="Stop generating"],button[aria-label="Stop response"]')].some(el => !el.hidden && el.getClientRects().length);
  E.unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()];
  // Some Gemini chips expose their source URLs only in DOM metadata. Decode the
  // chip's JSON, never page-wide scripts, application state, cookies or tokens.
  E.sourceLinks = (element, base) => {
    const urls = [];
    const visit = value => {
      if (typeof value === 'string' && /^https?:\/\//.test(value)) { const url = E.url(value, base); if (url) urls.push(url); }
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    for (const node of [element, ...element.querySelectorAll('[jslog],[data-url],[data-href],a[href]')]) {
      for (const attr of ['href', 'data-url', 'data-href']) { const raw = node.getAttribute(attr); if (raw) { const url = E.url(raw, base); if (url) urls.push(url); } }
      const encoded = node.getAttribute('jslog')?.match(/BardVeMetadataKey:([A-Za-z0-9_=-]+)/)?.[1];
      if (encoded && encoded.length < 100000) {
        try { const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); visit(JSON.parse(new TextDecoder().decode(bytes))); } catch { /* Metadata format can change; visible labels remain. */ }
      }
    }
    return [...new Set(urls)];
  };
})(globalThis);
