(function () {
  'use strict';
  const E = globalThis.ChatExport;
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
      const out = [`# ${E.titleText(archive.title)}`, `**Chatbot:** ${archive.provider.name}  \n**Source:** [Conversation](${E.mdURL(archive.sourceURL)})  \n**Exported:** ${archive.exportedAt}  \n**Messages:** ${archive.messages.length}  \n**Capture:** ${archive.capture.status}`, `> ${archive.capture.note}`];
      archive.capture.warnings.forEach(w => out.push('> Capture warning: ' + w));
      archive.messages.forEach((m, i) => out.push(`---\n\n## ${i + 1}. ${m.role === 'user' ? 'User' : m.role === 'assistant' ? archive.provider.name : m.role}`, [E.nestMarkdownHeadings(m.markdown), resources(m)].filter(Boolean).join('\n\n')));
      content = out.join('\n\n') + '\n';
      // Plain text deliberately retains URLs, code fences, and TeX for fidelity.
      if (type === 'txt') content = E.plainMarkdown(content);
    } else if (type === 'csv') {
      // Neutralize spreadsheet formula injection in every field.
      const cell = v => { let s = typeof v === 'string' ? v : JSON.stringify(v); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const rows = [['number', 'role', 'markdown', 'links_json', 'images_json', 'attachments_json', 'artifacts_json', 'tool_activity_json', 'source_url', 'capture_status', 'capture_warnings_json']];
      archive.messages.forEach((m, i) => rows.push([String(i + 1), m.role, m.markdown, m.links, m.images, m.attachments, m.artifacts, m.toolNotes, archive.sourceURL, archive.capture.status, archive.capture.warnings]));
      content = '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
    } else {
      content = E.reader(archive);
    }
    return { content, mime: mime + ';charset=utf-8', filename: `${E.exportDate(archive.exportedAt)} - ${E.filename(archive.provider.name)} - ${E.filename(archive.title)}.${type}` };
  };
})(globalThis);
