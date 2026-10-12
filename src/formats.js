(function () {
  'use strict';
  const E = globalThis.ChatExport;
  const h = E.escapeHTML;
  E.selectArchive = (archive, ids) => {
    const selected = new Set(ids);
    return { ...archive, exportedAt: new Date().toISOString(), selection: { captured: archive.messages.length, exported: archive.messages.filter(m => selected.has(m.id)).length }, messages: archive.messages.filter(m => selected.has(m.id)) };
  };
  function resources(m) {
    const parts = [];
    m.attachments.forEach(a => parts.push(`> ${a.kind === 'artifact' ? 'Artifact' : 'Attachment'}: ${E.label(a.name)}${a.url ? ` — [file](${E.mdURL(a.url)})` : ' (no downloadable URL exposed)'}`));
    const missingImages = m.images.filter(i => !m.markdown.includes(E.mdURL(i.url)));
    missingImages.forEach(i => parts.push(`![${E.label(i.alt)}](${E.mdURL(i.url)})`));
    if (m.images.some(i => i.ephemeral)) parts.push('> Some image URLs are temporary browser blobs. Download those images before leaving this tab.');
    const extraLinks = m.links.filter(l => !m.markdown.includes(E.mdURL(l.url)));
    if (extraLinks.length) parts.push('### Sources and links\n\n' + extraLinks.map(l => `- [${E.label(l.title)}](${E.mdURL(l.url)})`).join('\n'));
    if (m.toolNotes.length) parts.push('### Visible tool activity\n\n' + m.toolNotes.map(E.label).join('\n\n'));
    return parts.join('\n\n');
  }
  E.format = function (archive, type) {
    const mime = { md: 'text/markdown', json: 'application/json', html: 'text/html', txt: 'text/plain', csv: 'text/csv' }[type];
    if (!mime) throw new Error('Unsupported format');
    let content;
    if (type === 'json') content = JSON.stringify(archive, null, 2) + '\n';
    else if (type === 'md' || type === 'txt') {
      const out = [`# ${E.label(archive.title)}`, `**Chatbot:** ${archive.provider.name}  \n**Source:** [Conversation](${E.mdURL(archive.sourceURL)})  \n**Exported:** ${archive.exportedAt}  \n**Messages:** ${archive.messages.length}  \n**Capture:** ${archive.capture.status}`, `> ${archive.capture.note}`];
      archive.capture.warnings.forEach(w => out.push('> Capture warning: ' + w));
      archive.messages.forEach((m, i) => out.push(`## ${i + 1}. ${m.role === 'user' ? 'User' : m.role === 'assistant' ? archive.provider.name : m.role}`, [m.markdown, resources(m)].filter(Boolean).join('\n\n')));
      content = out.join('\n\n') + '\n';
      // Plain text deliberately retains URLs, code fences, and TeX for fidelity.
      if (type === 'txt') content = content.replace(/^#{1,6} /gm, '').replace(/\*\*([^*]+)\*\*/g, '$1');
    } else if (type === 'csv') {
      // Neutralize spreadsheet formula injection in every field.
      const cell = v => { let s = typeof v === 'string' ? v : JSON.stringify(v); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const rows = [['number', 'role', 'markdown', 'links_json', 'images_json', 'attachments_json', 'artifacts_json', 'tool_activity_json', 'source_url', 'capture_status', 'capture_warnings_json']];
      archive.messages.forEach((m, i) => rows.push([String(i + 1), m.role, m.markdown, m.links, m.images, m.attachments, m.artifacts, m.toolNotes, archive.sourceURL, archive.capture.status, archive.capture.warnings]));
      content = '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
    } else {
      content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${h(archive.title)}</title><style>
        *{box-sizing:border-box}body{margin:0;background:#f5f3ee;color:#272b2a;font:17px/1.7 system-ui,sans-serif}main{max-width:900px;margin:48px auto;padding:0 24px}header{border-bottom:2px solid #2b6154;padding-bottom:24px;margin-bottom:32px}h1{font-size:2.2rem;line-height:1.15;overflow-wrap:anywhere}h2{font-size:1.2rem}a{color:#246351;overflow-wrap:anywhere}article{background:#fff;border:1px solid #dfdfd7;border-radius:14px;padding:24px 28px;margin:20px 0;overflow-wrap:anywhere}.role{font:700 12px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#326c5d}pre{background:#182a25;color:#eff4ed;padding:18px;border-radius:8px;overflow:auto;white-space:pre-wrap}code{font-family:ui-monospace,monospace}blockquote{border-left:3px solid #bbcfc4;margin-left:0;padding-left:16px;color:#505852}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d2d9d5;padding:8px;text-align:left}.math{font-family:ui-monospace,monospace;white-space:pre-wrap}.meta,.resource{font-size:13px;color:#58625d}.warning{background:#fff3d9;padding:12px;border-radius:8px}.image-link{display:block;margin:10px 0}@media print{body{background:white}main{margin:0;max-width:none}article{border:0;padding:8px 0;break-inside:auto}pre{background:#f4f4f4;color:#111}a{color:#111}header{border-color:#111}}
      </style></head><body><main><header><div class="role">Conversation archive · ${h(archive.provider.name)}</div><h1>${h(archive.title)}</h1><p class="meta"><a href="${h(archive.sourceURL)}" rel="noreferrer">Original conversation</a> · ${h(archive.exportedAt)} · ${archive.messages.length} messages · ${h(archive.capture.status)}</p><p class="meta">${h(archive.capture.note)} Images are links; opening this file makes no remote requests. Print from your browser to save a PDF.</p>${archive.capture.warnings.map(w => `<p class="warning">${h(w)}</p>`).join('')}</header>${archive.messages.map((m, i) => `<article><div class="role">${i + 1} · ${h(m.role === 'assistant' ? archive.provider.name : m.role)}</div>${m.html}${m.attachments.map(a => `<p class="resource">${h(a.kind)}: ${h(a.name)}${a.url ? ` · <a href="${h(a.url)}" rel="noreferrer">File</a>` : ' · no downloadable URL exposed'}</p>`).join('')}${m.images.filter(im => !m.html.includes(h(im.url))).map(im => `<a class="image-link" href="${h(im.url)}" rel="noreferrer">Image: ${h(im.alt)}</a>`).join('')}${m.links.length ? '<details><summary>Sources and links</summary><ul>' + m.links.map(l => `<li><a href="${h(l.url)}" rel="noreferrer">${h(l.title)}</a></li>`).join('') + '</ul></details>' : ''}${m.toolNotes.length ? `<details><summary>Visible tool activity</summary>${m.toolNotes.map(t => `<p>${h(t)}</p>`).join('')}</details>` : ''}</article>`).join('')}</main></body></html>`;
    }
    return { content, mime: mime + ';charset=utf-8', filename: `${archive.exportedAt.slice(0, 10)}_${E.filename(archive.provider.name)}_${E.filename(archive.title)}.${type}` };
  };
})(globalThis);
