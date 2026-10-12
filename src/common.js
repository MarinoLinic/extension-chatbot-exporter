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
  E.filename = value => {
    let name = String(value).normalize('NFC').replace(/[\x00-\x1f\x7f]/g, '').replace(/[/\\|:•]+/g, ' - ').replace(/[<>"?*]/g, '').replace(/\s*-\s*(?:-\s*)+/g, ' - ').replace(/\s+/g, ' ').replace(/^[ .-]+|[ .-]+$/g, '');
    if (name.length > 90) { name = name.slice(0, 90); if (/\s/.test(name.slice(-15))) name = name.replace(/\s+\S*$/, ''); }
    name = name.replace(/[ .-]+$/g, '');
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? 'Conversation - ' + name : name || 'Conversation';
  };
  E.titleText = value => String(value).replace(/([\\`*_[\]<>])/g, '\\$1').replace(/[\r\n]+/g, ' ');
  E.exportDate = iso => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? String(iso).slice(0, 10) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  E.mapMarkdownLines = (value, transform) => {
    let fence = null, math = false;
    return value.split('\n').map(line => {
      const match = line.match(/^\s*(?:(?:[-+*]|\d+[.)])\s+)?(`{3,}|~{3,})(.*)$/);
      if (fence) { if (match && match[1][0] === fence.character && match[1].length >= fence.length && !match[2].trim()) fence = null; return line; }
      if (math) { if (/^\s*\$\$\s*$/.test(line)) math = false; return line; }
      if (match) { fence = { character: match[1][0], length: match[1].length }; return line; }
      if (/^\s*\$\$\s*$/.test(line)) { math = true; return line; }
      return transform(line);
    }).join('\n');
  };
  E.nestMarkdownHeadings = value => {
    let minimum = 6, found = false;
    E.mapMarkdownLines(value, line => { const match = line.match(/^ {0,3}(#{1,6})\s/); if (match) { minimum = Math.min(minimum, match[1].length); found = true; } return line; });
    return found ? E.mapMarkdownLines(value, line => line.replace(/^( {0,3})(#{1,6})(\s)/, (_, indent, level, space) => indent + '#'.repeat(Math.min(6, level.length + 3 - minimum)) + space)) : value;
  };
  E.nestHTMLHeadings = value => {
    const levels = [...value.matchAll(/<h([1-6])>/g)].map(match => Number(match[1]));
    if (!levels.length) return value;
    const offset = 3 - Math.min(...levels);
    return value.replace(/<(\/?)h([1-6])>/g, (_, close, level) => '<' + close + 'h' + Math.min(6, Number(level) + offset) + '>');
  };
  E.plainMarkdown = value => E.mapMarkdownLines(value, line => line.replace(/^ {0,3}#{1,6}\s/, '').split(/(`+[^`]*`+|\$[^$\n]+\$)/g).map((part, index) => index % 2 ? part : part.replace(/(?<!\\)\*\*([^*]+)(?<!\\)\*\*/g, '$1').replace(/(?<![\\*])\*([^*\n]+)(?<!\\)\*(?!\*)/g, '$1').replace(/\\([\\`*_[\]<>#>.()|])/g, '$1')).join(''));
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
