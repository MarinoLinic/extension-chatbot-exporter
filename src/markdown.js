(function () {
  'use strict';
  const E = globalThis.ChatExport;
  const skipped = 'script,style,noscript,svg,button,input,textarea,select,nav,mat-icon,gem-icon,message-actions,ms-chat-turn-options,thinking-overlay,source-footnote,.sr-only,.cdk-visually-hidden,.turn-action-controls,[data-testid="message-actions"],.table-footer,.author-label,.turn-information,.model-error';
  const thoughts = 'ms-thought-chunk,.thought-panel,[data-testid="thinking-content"],.thinking-content,.reasoning-content';
  const normalize = s => s.replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
  const fence = (s, minimum = 3) => {
    let length = minimum;
    for (const match of s.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
    return '`'.repeat(length);
  };
  const escapeText = (s, heading) => {
    const escaped = normalize(s).replace(/([\\`*_[\]<>])/g, '\\$1');
    return heading ? escaped : escaped.replace(/(^|\n)([ \t]*)([#>])/g, '$1$2\\$3').replace(/(^|\n)([ \t]*)(\d+)([.)])(?=[ \t])/g, '$1$2$3\\$4');
  };
  const mark = (s, marker) => s.trim() ? s.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, a, b, c) => a + marker + b + marker + c) : s;
  const svgTags = new Set('svg g path rect circle ellipse line polyline polygon text tspan title desc defs linearGradient radialGradient stop clipPath'.split(' '));
  const svgAttributes = new Set('viewBox preserveAspectRatio width height x y x1 x2 y1 y2 cx cy r rx ry d points transform fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color font-family font-size font-weight font-style text-anchor dominant-baseline dx dy textLength lengthAdjust id clip-path clipPathUnits gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity'.split(' '));
  const svgStyles = new Set('color fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset opacity font-family font-size font-weight font-style text-anchor dominant-baseline'.split(' '));
  function svgImage(raw) {
    if (raw.length > 1500000) throw new Error('Chart exceeds conversion limit.');
    let source = raw;
    if (/^data:/i.test(raw)) {
      const comma = raw.indexOf(','), metadata = raw.slice(0, comma);
      const payload = decodeURIComponent(raw.slice(comma + 1));
      source = /;base64$/i.test(metadata) ? new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0))) : payload;
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Unsupported chart document.');
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg' || parsed.querySelectorAll('*').length > 5000) throw new Error('Unsupported chart document.');
    const clean = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg');
    const prefix = 'ce-chart-' + E.hash(source) + '-';
    let changed = false;
    const safeValue = value => {
      if (/[\\<>\x00-\x1f]|\/\*|@|expression\s*\(|(?:https?|data|javascript):/i.test(value)) return null;
      const local = value.replace(/url\(\s*#([\w.-]+)\s*\)/g, (_, id) => `url(#${prefix}${id})`);
      return /url\s*\(/i.test(local.replace(/url\(#[\w.-]+\)/g, '')) ? null : local;
    };
    function copy(from, to, depth) {
      if (depth > 64) throw new Error('Chart exceeds conversion limit.');
      for (const attr of from.attributes) {
        if (attr.name === 'style') {
          const styles = [];
          for (const declaration of attr.value.split(';')) {
            const colon = declaration.indexOf(':'), name = declaration.slice(0, colon).trim(), value = safeValue(declaration.slice(colon + 1).trim());
            if (colon > 0 && svgStyles.has(name) && value) styles.push(name + ':' + value);
            else if (declaration.trim()) changed = true;
          }
          if (styles.length) to.setAttribute('style', styles.join(';'));
        } else if (svgAttributes.has(attr.name)) {
          const value = safeValue(attr.value);
          if (value !== null) to.setAttribute(attr.name, attr.name === 'id' ? prefix + value : value);
          else changed = true;
        } else if (!/^(xmlns$|data-|aria-)/.test(attr.name) && attr.name !== 'role') changed = true;
      }
      for (const child of from.childNodes) {
        if (child.nodeType === 3 && /^(text|tspan|title|desc)$/.test(from.localName)) to.append(clean.createTextNode(child.textContent));
        else if (child.nodeType === 1) {
          if (!svgTags.has(child.localName) || child.namespaceURI !== 'http://www.w3.org/2000/svg') { changed = true; continue; }
          const element = clean.createElementNS('http://www.w3.org/2000/svg', child.localName);
          copy(child, element, depth + 1); to.append(element);
        }
      }
    }
    copy(parsed.documentElement, clean.documentElement, 0);
    const svg = new XMLSerializer().serializeToString(clean);
    const labels = [...clean.querySelectorAll('text,title,desc')].map(el => el.textContent.trim()).filter(Boolean);
    return { svg, labels, changed, url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) };
  }

  E.convert = function (node, { base = node.ownerDocument?.URL, includeThoughts = false } = {}) {
    const links = [], images = [], artifacts = [];
    let degraded = false;
    const hidden = el => el.hidden || el.getAttribute('aria-hidden') === 'true' || (!includeThoughts && el.matches(thoughts));
    function tex(el) {
      if (el.hasAttribute('data-math')) return el.getAttribute('data-math');
      if (!el.matches('.katex,.katex-display,math,ms-katex')) return null;
      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      return annotation ? annotation.textContent : null;
    }
    function render(el, depth = 0, preserve = false, heading = false) {
      if (el.nodeType === 3) {
        const text = preserve ? normalize(el.textContent) : normalize(el.textContent).replace(/\s+/g, ' ');
        return { md: escapeText(text, heading), html: E.escapeHTML(text) };
      }
      if (el.nodeType !== 1) return { md: '', html: '' };
      const tag = el.tagName.toLowerCase();
      if (hidden(el)) return { md: '', html: '' };
      const latex = tex(el);
      if (latex !== null) {
        const display = el.matches('.katex-display,.math-block,math[display="block"]') || el.closest('.katex-display') === el;
        return { md: display ? '\n\n$$\n' + latex + '\n$$\n\n' : '$' + latex + '$', html: `<${display ? 'div' : 'span'} class="math">${E.escapeHTML((display ? '$$' : '$') + latex + (display ? '$$' : '$'))}</${display ? 'div' : 'span'}>` };
      }
      // Source chips and map buttons carry information, even when styled as controls.
      if (tag === 'source-inline-chip') {
        const title = el.querySelector('.source-title')?.textContent.trim() || el.querySelector('button')?.getAttribute('aria-label') || 'Source';
        const urls = E.sourceLinks(el, base);
        urls.forEach(url => links.push({ url, title, via: 'dom-source-chip' }));
        return { md: ' ' + (urls.length ? urls.map(url => `[${E.label(title)}](${E.mdURL(url)})`).join(', ') : `[Source: ${E.label(title)}; URL not exposed]`) + ' ', html: urls.length ? urls.map(url => `<a href="${E.escapeHTML(url)}" rel="noreferrer">${E.escapeHTML(title)}</a>`).join(', ') : `<span class="resource">Source: ${E.escapeHTML(title)} (URL not exposed)</span>` };
      }
      if (el.matches('map-location-reference-link-block')) {
        const name = el.querySelector('button span')?.textContent.trim() || el.textContent.trim();
        const link = E.url(el.querySelector('a')?.getAttribute('href'), base);
        artifacts.push({ kind: 'map-location', title: name, url: link || null, note: link ? 'Visible map link' : 'Location label only; no URL exposed in DOM' });
        return { md: name ? `\n\n> Map location: ${E.label(name)}${link ? ` (${E.mdURL(link)})` : ''}\n\n` : '', html: `<p class="resource">Map location: ${E.escapeHTML(name)}</p>` };
      }
      if (tag === 'button' && el.querySelector('img')) {
        const content = [...el.querySelectorAll('img')].map(img => render(img, depth));
        return { md: content.map(c => c.md).join('\n'), html: content.map(c => c.html).join('') };
      }
      if (tag === 'img' && (el.matches('.luminous-file-icon,[class*="avatar"],[alt="Avatar"]') || el.closest('.favicon,.favicon-icons,[data-d-component="favicon"],[data-d-component="icon"]') || /favicon|\/s2\/favicons/i.test(el.getAttribute('src') || '') || (el.classList.contains('rounded-full') && el.parentElement?.matches('[class*="size-6"],[class*="size-4"]')))) return { md: '', html: '' };
      const vectorImage = tag === 'img' && /^data:image\/svg\+xml(?:[;,])/i.test(el.getAttribute('src') || el.getAttribute('data-src') || '');
      const vectorChart = tag === 'svg' && !el.matches('[data-d-component="icon"]') && !!el.querySelector('text,title,desc');
      if (vectorImage || vectorChart) {
        try {
          const chart = svgImage(vectorImage ? el.getAttribute('src') || el.getAttribute('data-src') : el.outerHTML);
          const alt = el.getAttribute('alt') || el.getAttribute('aria-label') || 'Chart';
          const description = chart.labels.length ? alt + ' · ' + chart.labels.join(' · ') : alt;
          images.push({ url: chart.url, alt: description, ephemeral: false, kind: 'chart', mime: 'image/svg+xml' });
          degraded ||= chart.changed;
          return { md: `\n\n![${E.label(description)}](${E.mdURL(chart.url)})\n\n`, html: `<figure class="chart">${chart.svg}<figcaption>${E.escapeHTML(description)}</figcaption><a class="image-link" href="${E.escapeHTML(chart.url)}" rel="noreferrer">Chart image</a></figure>` };
        } catch {
          degraded = true;
          const label = el.getAttribute('alt') || el.getAttribute('aria-label') || 'Chart';
          artifacts.push({ kind: 'chart', title: label, url: null, note: 'Chart could not be converted' });
          return { md: `\n\n> ${E.label(label)} (chart unavailable)\n\n`, html: `<p>${E.escapeHTML(label)} (chart unavailable)</p>` };
        }
      }
      if (el.matches(skipped)) return { md: '', html: '' };
      if (tag === 'immersive-entry-chip' && !el.querySelector('iframe')) {
        const button = el.querySelector('button');
        const title = el.querySelector('.chip-title,.title')?.textContent.trim() || button?.getAttribute('aria-label') || 'Canvas';
        artifacts.push({ kind: 'embedded-preview', title, url: null, note: 'Content is behind a page control' });
        degraded = true;
        return { md: `\n\n> ${E.label(title)} (preview content unavailable)\n\n`, html: `<p>${E.escapeHTML(title)} (preview content unavailable)</p>` };
      }
      if (tag === 'iframe') {
        const url = E.url(el.getAttribute('src'), base);
        const source = el.getAttribute('srcdoc') || null;
        artifacts.push({ kind: 'embedded-preview', title: el.title || 'Embedded preview', url: url || null, source, note: source ? 'Embedded source saved as inert text' : 'Preview URL only; app source may be inaccessible' });
        const text = url ? `[Embedded preview](${E.mdURL(url)})` : 'Embedded preview (no accessible URL)';
        return { md: '\n\n' + text + (source ? `\n\n${fence(source)}html\n${source}\n${fence(source)}` : '') + '\n\n', html: `<p>${url ? `<a href="${E.escapeHTML(url)}" rel="noreferrer">Embedded preview</a>` : 'Embedded preview (no accessible URL)'}</p>${source ? `<pre><code>${E.escapeHTML(source)}</code></pre>` : ''}` };
      }
      if (tag === 'pre' || tag === 'code-block' || el.matches('[data-streamdown="code-block"]')) {
        const code = el.querySelector('code:not(.code-result-container),pre,.code-block-body') || el;
        const text = normalize(code.textContent).replace(/\n$/, '');
        const lang = (code.getAttribute('class') || '').match(/language-([\w+-]+)/)?.[1] || code.querySelector('code')?.getAttribute('class')?.match(/language-([\w+-]+)/)?.[1] || el.querySelector('.code-block-decoration span')?.textContent.trim().replace(/[^\w+-]/g, '') || '';
        const delimiter = fence(text);
        const result = { md: `\n\n${delimiter}${lang}\n${text}\n${delimiter}\n\n`, html: `<pre><code${lang ? ` class="language-${E.escapeHTML(lang)}"` : ''}>${E.escapeHTML(text)}</code></pre>` };
        const output = tag === 'code-block' && el.querySelector('.code-result-container')?.closest('pre');
        if (output && output.textContent.trim()) {
          const rendered = render(output, depth);
          result.md += '**Code output**' + rendered.md;
          result.html += '<p><strong>Code output</strong></p>' + rendered.html;
        }
        return result;
      }
      if (/^(audio|video|object|embed|canvas)$/.test(tag)) {
        const url = E.url(el.getAttribute('src') || el.getAttribute('data') || el.querySelector('source[src]')?.getAttribute('src'), base);
        const label = el.getAttribute('aria-label') || el.title || ({ audio: 'Audio', video: 'Video', canvas: 'Canvas' })[tag] || 'Embedded content';
        artifacts.push({ kind: tag, title: label, url: url || null, note: url ? 'Link to media' : 'No accessible URL' });
        if (!url) degraded = true;
        return { md: url ? `\n\n[${E.label(label)}](${E.mdURL(url)})\n\n` : `\n\n> ${E.label(label)} (no accessible URL)\n\n`, html: url ? `<p><a href="${E.escapeHTML(url)}" rel="noreferrer">${E.escapeHTML(label)}</a></p>` : `<p>${E.escapeHTML(label)} (no accessible URL)</p>` };
      }
      if (tag === 'img') {
        const url = E.url(el.getAttribute('src') || el.getAttribute('data-src'), base, true);
        if (!url) return { md: '', html: '' };
        const alt = el.alt || 'Image';
        images.push({ url, alt, ephemeral: url.startsWith('blob:') });
        return { md: `![${E.label(alt)}](${E.mdURL(url)})`, html: `<a class="image-link" href="${E.escapeHTML(url)}" rel="noreferrer">Image: ${E.escapeHTML(alt)}</a>` };
      }
      if (tag === 'table') return table(el, depth);
      if (tag === 'ul' || tag === 'ol') return list(el, depth);
      const pre = preserve || el.matches('.whitespace-pre-wrap,.query-text,.query-text-line') || (tag === 'div' && /white-space:\s*pre/.test(el.getAttribute('style') || ''));
      const children = [...el.childNodes].map(c => render(c, depth, pre, heading || /^h[1-6]$/.test(tag)));
      let md = children.map(c => c.md).join(''), html = children.map(c => c.html).join('');
      if (tag === 'a') {
        const url = E.url(el.getAttribute('href'), base);
        if (url) {
          const title = el.textContent.trim() || el.getAttribute('aria-label') || url;
          links.push({ url, title });
          md = `[${md.trim() || E.label(title)}](${E.mdURL(url)})`;
          html = `<a href="${E.escapeHTML(url)}" rel="noreferrer">${html || E.escapeHTML(title)}</a>`;
        }
      } else if (tag === 'strong' || tag === 'b') { md = mark(md, '**'); html = `<strong>${html}</strong>`; }
      else if (tag === 'em' || tag === 'i') { md = mark(md, '*'); html = `<em>${html}</em>`; }
      else if (tag === 'del' || tag === 's') { md = mark(md, '~~'); html = `<del>${html}</del>`; }
      else if (tag === 'code') {
        const text = normalize(el.textContent);
        const f = fence(text, 1);
        md = f + (text.includes('`') ? ' ' : '') + text + (text.includes('`') ? ' ' : '') + f;
        html = `<code>${E.escapeHTML(text)}</code>`;
      } else if (tag === 'br') { md = '  \n'; html = '<br>'; }
      else if (tag === 'hr') { md = '\n\n---\n\n'; html = '<hr>'; }
      else if (/^h[1-6]$/.test(tag)) { md = '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + md.trim() + '\n\n'; html = `<${tag}>${html}</${tag}>`; }
      else if (tag === 'blockquote') { md = '\n\n' + md.trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n'; html = `<blockquote>${html}</blockquote>`; }
      else if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
        md = md.trim() ? '\n\n' + md.trim() + '\n\n' : '';
        html = html ? `<${tag === 'p' ? 'p' : 'div'}>${html}</${tag === 'p' ? 'p' : 'div'}>` : '';
      }
      return { md, html };
    }
    function list(el, depth) {
      let number = Number(el.getAttribute('start')) || 1;
      const ordered = el.tagName === 'OL', lines = [], html = [];
      for (const li of [...el.children].filter(c => c.tagName === 'LI')) {
        number = li.hasAttribute('value') ? Number(li.getAttribute('value')) : number;
        const nested = [], own = [];
        for (const c of li.childNodes) {
          if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) nested.push(render(c, depth + 1));
          else own.push(render(c, depth));
        }
        const text = own.map(c => c.md).join('').trim();
        const marker = ordered ? `${number++}. ` : '- ';
        const indent = '    '.repeat(depth);
        lines.push(indent + marker + text.replace(/\n/g, '\n' + indent + ' '.repeat(marker.length)));
        nested.forEach(c => lines.push(c.md.trimEnd()));
        html.push(`<li${li.hasAttribute('value') ? ` value="${Number(li.getAttribute('value'))}"` : ''}>${own.map(c => c.html).join('')}${nested.map(c => c.html).join('')}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      return { md: (depth ? '\n' : '\n\n') + lines.join('\n') + '\n\n', html: `<${tag}${ordered ? ` start="${Number(el.getAttribute('start')) || 1}"` : ''}>${html.join('')}</${tag}>` };
    }
    function table(el, depth) {
      const grid = [], htmlRows = [];
      for (const [r, row] of [...el.rows].entries()) {
        grid[r] ||= [];
        let col = 0;
        const h = [];
        for (const cell of row.cells) {
          while (grid[r][col] !== undefined) col++;
          const result = render(cell, depth);
          const value = result.md.trim().replace(/\n+/g, '<br>').replace(/(?<!\\)\|/g, '\\|');
          // Bound malicious/malformed spans to prevent unbounded expansion.
          const rs = Math.min(100, Math.max(1, cell.rowSpan || 1)), cs = Math.min(100, Math.max(1, cell.colSpan || 1));
          if ((col + cs) * Math.max(el.rows.length, r + rs) > 100000) throw new Error('Table exceeds conversion limit.');
          for (let i = 0; i < rs; i++) { grid[r + i] ||= []; for (let j = 0; j < cs; j++) grid[r + i][col + j] = i || j ? '' : value; }
          const tag = cell.tagName.toLowerCase();
          h.push(`<${tag} rowspan="${rs}" colspan="${cs}">${result.html}</${tag}>`);
          col += cs;
        }
        htmlRows.push('<tr>' + h.join('') + '</tr>');
      }
      if (!grid.length) return { md: '', html: '' };
      const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
      if (width * grid.length > 100000) throw new Error('Table exceeds conversion limit.');
      const line = row => '| ' + Array.from({ length: width }, (_, i) => row[i] || '').join(' | ') + ' |';
      return { md: '\n\n' + [line(grid[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...grid.slice(1).map(line)].join('\n') + '\n\n', html: `<div class="table-wrap"><table>${htmlRows.join('')}</table></div>` };
    }
    try {
      const result = render(node);
      return { markdown: E.cleanMarkdown(result.md), html: result.html, links: E.unique(links, l => l.url), images: E.unique(images, i => i.url), artifacts, degraded };
    } catch {
      // Keep readable text if this message's structure cannot be converted.
      const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: el => el.nodeType === 1 && (hidden(el) || el.matches(skipped)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      });
      const parts = [];
      for (let el = walker.nextNode(); el; el = walker.nextNode()) {
        if (el.nodeType === 3) parts.push(normalize(el.textContent));
        else if (el.matches('p,div,br,li,pre,tr,h1,h2,h3,h4,h5,h6')) parts.push('\n');
        else if (el.matches('td,th')) parts.push(' ');
      }
      const plain = parts.join('').trim();
      return { markdown: escapeText(plain), html: plain ? `<pre>${E.escapeHTML(plain)}</pre>` : '', links: E.unique(links, l => l.url), images: E.unique(images, i => i.url), artifacts, degraded: true };
    }
  };
})(globalThis);
