(function () {
  'use strict';
  const E = globalThis.ChatExport;
  const skipped = 'script,style,noscript,svg,button,input,textarea,select,nav,mat-icon,gem-icon,message-actions,ms-chat-turn-options,thinking-overlay,source-footnote,.sr-only,.cdk-visually-hidden,.turn-action-controls,[data-testid="message-actions"],.table-footer';
  const thoughts = 'ms-thought-chunk,.thought-panel,[data-testid="thinking-content"],.thinking-content,.reasoning-content';
  const normalize = s => s.replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
  const fence = s => '`'.repeat(Math.max(3, ...[...s.matchAll(/`+/g)].map(m => m[0].length + 1)));
  const escapeText = s => normalize(s).replace(/([\\`*_[\]<>])/g, '\\$1').replace(/(^|\n)(\s*)([#>]|\d+\.)/g, '$1$2\\$3');
  const mark = (s, marker) => s.trim() ? s.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, a, b, c) => a + marker + b + marker + c) : s;

  E.convert = function (node, { base = node.ownerDocument?.URL, includeThoughts = false } = {}) {
    const links = [], images = [], artifacts = [];
    function tex(el) {
      if (el.hasAttribute('data-math')) return el.getAttribute('data-math');
      if (!el.matches('.katex,.katex-display,math,ms-katex')) return null;
      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      return annotation ? annotation.textContent : null;
    }
    function render(el, depth = 0, preserve = false) {
      if (el.nodeType === 3) {
        const text = preserve ? normalize(el.textContent) : normalize(el.textContent).replace(/\s+/g, ' ');
        return { md: escapeText(text), html: E.escapeHTML(text) };
      }
      if (el.nodeType !== 1) return { md: '', html: '' };
      const tag = el.tagName.toLowerCase();
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
      if (el.matches(skipped) || el.hidden || el.getAttribute('aria-hidden') === 'true' || (!includeThoughts && el.matches(thoughts))) return { md: '', html: '' };
      if (tag === 'iframe') {
        const url = E.url(el.getAttribute('src'), base);
        const source = el.getAttribute('srcdoc') || null;
        artifacts.push({ kind: 'embedded-preview', title: el.title || 'Embedded preview', url: url || null, source, note: source ? 'Embedded source saved as inert text' : 'Preview URL only; app source may be inaccessible' });
        const text = url ? `[Embedded preview](${E.mdURL(url)})` : 'Embedded preview (no accessible URL)';
        return { md: '\n\n' + text + (source ? `\n\n${fence(source)}html\n${source}\n${fence(source)}` : '') + '\n\n', html: `<p>${url ? `<a href="${E.escapeHTML(url)}" rel="noreferrer">Embedded preview</a>` : 'Embedded preview (no accessible URL)'}</p>${source ? `<pre><code>${E.escapeHTML(source)}</code></pre>` : ''}` };
      }
      if (tag === 'pre' || tag === 'code-block' || el.matches('[data-streamdown="code-block"]')) {
        const code = el.querySelector('code') || el.querySelector('.code-block-body') || el;
        const text = normalize(code.textContent).replace(/\n$/, '');
        const lang = (code.className || '').match(/language-([\w+-]+)/)?.[1] || el.querySelector('.code-block-decoration span')?.textContent.trim().replace(/[^\w+-]/g, '') || '';
        return { md: `\n\n${fence(text)}${lang}\n${text}\n${fence(text)}\n\n`, html: `<pre><code${lang ? ` class="language-${E.escapeHTML(lang)}"` : ''}>${E.escapeHTML(text)}</code></pre>` };
      }
      if (tag === 'img') {
        // Ignore file-type icons and avatars; actual image attachments remain resources.
        if (el.matches('.luminous-file-icon,[class*="avatar"],[alt="Avatar"]') || el.closest('.favicon,.favicon-icons') || /favicon|\/s2\/favicons/i.test(el.getAttribute('src') || '') || (el.classList.contains('rounded-full') && el.parentElement?.matches('[class*="size-6"],[class*="size-4"]'))) return { md: '', html: '' };
        const url = E.url(el.getAttribute('src') || el.getAttribute('data-src'), base, true);
        if (!url) return { md: '', html: '' };
        const alt = el.alt || 'Image';
        images.push({ url, alt, ephemeral: url.startsWith('blob:') });
        return { md: `![${E.label(alt)}](${E.mdURL(url)})`, html: `<a class="image-link" href="${E.escapeHTML(url)}" rel="noreferrer">Image: ${E.escapeHTML(alt)}</a>` };
      }
      if (tag === 'table') return table(el, depth);
      if (tag === 'ul' || tag === 'ol') return list(el, depth);
      const pre = preserve || el.matches('.whitespace-pre-wrap,.query-text,.query-text-line') || (tag === 'div' && /white-space:\s*pre/.test(el.getAttribute('style') || ''));
      const children = [...el.childNodes].map(c => render(c, depth, pre));
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
        const f = '`'.repeat(Math.max(1, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)));
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
          for (let i = 0; i < rs; i++) { grid[r + i] ||= []; for (let j = 0; j < cs; j++) grid[r + i][col + j] = i || j ? '' : value; }
          const tag = cell.tagName.toLowerCase();
          h.push(`<${tag} rowspan="${rs}" colspan="${cs}">${result.html}</${tag}>`);
          col += cs;
        }
        htmlRows.push('<tr>' + h.join('') + '</tr>');
      }
      if (!grid.length) return { md: '', html: '' };
      const width = Math.max(...grid.map(r => r.length));
      const line = row => '| ' + Array.from({ length: width }, (_, i) => row[i] || '').join(' | ') + ' |';
      return { md: '\n\n' + [line(grid[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...grid.slice(1).map(line)].join('\n') + '\n\n', html: `<div class="table-wrap"><table>${htmlRows.join('')}</table></div>` };
    }
    const result = render(node);
    // Preserve blank lines inside fenced code; only trim document boundaries.
    return { markdown: E.cleanMarkdown(result.md), html: result.html, links: E.unique(links, l => l.url), images: E.unique(images, i => i.url), artifacts };
  };
})(globalThis);
