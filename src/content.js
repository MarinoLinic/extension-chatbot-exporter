(function () {
  'use strict';
  const E = globalThis.ChatExport;
  if (E.contentInstalled) return;
  E.contentInstalled = true;
  let settings = E.settings(), archive = null, controller = null, route = location.href, token = 0;
  let state = { phase: 'Ready', running: false, downloading: false, count: 0 }, buttonHost, panelHost, panel;
  const provider = () => E.provider(location.href);
  function snapshot() {
    return { ...state, provider: provider()?.name || null, settings, token, warnings: archive?.capture.warnings || [], messages: archive?.messages.map((m, i) => ({ id: m.id, role: m.role, number: i + 1, preview: E.preview(m.markdown) })) || [] };
  }
  function closePanel() { panel?.dispose(); panelHost?.remove(); panel = panelHost = null; }
  function showPanel() {
    if (panelHost) { closePanel(); return; }
    panelHost = document.createElement('div'); panelHost.setAttribute('data-chat-export-ui', 'panel'); panelHost.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647';
    document.documentElement.append(panelHost); const shadow = panelHost.attachShadow({ mode: 'closed' });
    panel = E.mountUI(shadow, handle, { onClose: closePanel });
  }
  function updateButton() {
    if (!settings.pageButton || !provider()) { buttonHost?.remove(); buttonHost = null; return; }
    if (buttonHost) return;
    buttonHost = document.createElement('div'); buttonHost.setAttribute('data-chat-export-ui', 'button'); buttonHost.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646';
    const shadow = buttonHost.attachShadow({ mode: 'closed' }), button = document.createElement('button');
    button.textContent = '↓ Export chat'; button.title = 'Open Conversation Exporter'; button.style.cssText = E.design.buttonCSS; button.onclick = showPanel; shadow.append(button); document.documentElement.append(buttonHost);
  }
  async function download(blob, filename, saveAs = settings.saveAs) {
    const url = URL.createObjectURL(blob);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'ce:download', url, filename, saveAs });
      if (!result?.ok) throw new Error(result?.error || 'Download could not start.');
      return result;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 120000); }
  }
  async function exportSelected(ids, format) {
    if (state.running || state.downloading) throw new Error('Wait for the current operation to finish.');
    if (!archive || archive.sourceURL !== location.href) throw new Error('Collect this conversation first.');
    const selected = E.selectArchive(archive, ids || []);
    if (!selected.messages.length) throw new Error('Select at least one message.');
    state.downloading = true; state.phase = 'Preparing export'; state.error = null;
    try {
      const output = E.format(selected, format);
      await download(new Blob([output.content], { type: output.mime }), output.filename);
      // Save the transcript first: cancelling Save As must not trigger image downloads.
      if (settings.downloadImages) {
        const images = E.unique(selected.messages.flatMap(m => m.images), i => i.url);
        const manifest = [];
        for (const [i, image] of images.entries()) {
          if (location.href !== selected.sourceURL) { manifest.push({ ...image, status: 'skipped', reason: 'Conversation changed' }); continue; }
          if (i >= 100) { manifest.push({ ...image, status: 'skipped', reason: '100-image safety limit' }); continue; }
          let extension = image.url.match(/\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i)?.[1] || image.url.match(/^data:image\/(png|jpeg|webp|gif|avif);/i)?.[1] || 'image';
          const filename = `${output.filename.replace(/\.[^.]+$/, '')}_image-${String(i + 1).padStart(3, '0')}.${extension}`;
          try {
            // HTTP(S) downloads go directly through the browser; blob/data are already in the page.
            const result = image.url.startsWith('blob:') ? await download(await (await fetch(image.url)).blob(), filename, false) : await chrome.runtime.sendMessage({ type: 'ce:download', media: true, url: image.url, filename, saveAs: false });
            manifest.push({ ...image, filename, status: result?.ok ? 'queued' : 'failed', downloadId: result?.id, reason: result?.error });
          } catch (error) { manifest.push({ ...image, filename, status: 'failed', reason: error.message }); }
          state.phase = `Queueing images ${i + 1}/${Math.min(100, images.length)}`;
        }
        if (images.length) {
          await download(new Blob([JSON.stringify({ sourceURL: selected.sourceURL, note: 'Queued means handed to the browser; check its Downloads page for completion. URLs may expire or require authentication. Filenames can be uniquified by the browser.', images: manifest }, null, 2)], { type: 'application/json' }), output.filename.replace(/\.[^.]+$/, '.media.json'), false);
          const queued = manifest.filter(m => m.status === 'queued').length;
          state.phase = `Export queued · ${queued}/${images.length} image downloads queued. Check browser Downloads.`;
        } else state.phase = 'Export queued · no images found in the selection';
      } else state.phase = 'Export queued · check browser Downloads';
    } finally { state.downloading = false; }
  }
  async function handle(message) {
    if (message.type === 'ce:state') return snapshot();
    if (message.type === 'ce:settings') { settings = E.settings(message.settings); await chrome.storage.local.set({ settings }); updateButton(); return snapshot(); }
    if (message.type === 'ce:cancel') { controller?.abort(); state.phase = 'Cancelling…'; return snapshot(); }
    if (message.type === 'ce:start') {
      if (state.running || state.downloading) throw new Error('An operation is already running.');
      const p = provider(); if (!p) throw new Error('Unsupported page. Open a supported chatbot conversation.');
      archive = null; token++; controller = new AbortController(); state = { phase: 'Starting capture', running: true, downloading: false, count: 0 };
      E.capture({ provider: p, settings: { ...settings }, signal: controller.signal, progress: progress => Object.assign(state, progress) }).then(result => {
        archive = result; token++; state.phase = result.capture.status === 'observed-edges' ? 'Ready to export · scan reached both edges' : 'Ready to export · inspect capture warnings'; state.count = result.messages.length; delete state.percent;
      }).catch(error => { state.error = error.message; state.phase = 'Capture stopped'; }).finally(() => { state.running = false; controller = null; });
      return snapshot();
    }
    if (message.type === 'ce:export') { await exportSelected(message.ids, message.format); return snapshot(); }
    throw new Error('Unknown exporter command');
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!message?.type?.startsWith('ce:') || message.type === 'ce:download') return;
    handle(message).then(reply, error => { state.error = error.message; reply({ error: error.message }); }); return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) { settings = E.settings(changes.settings.newValue); updateButton(); } });
  chrome.storage.local.get('settings').then(result => { settings = E.settings(result.settings); updateButton(); });
  setInterval(() => {
    if (location.href === route) return;
    route = location.href; controller?.abort(); archive = null; token++; closePanel(); updateButton(); state.error = 'Conversation changed. Collect the new chat before exporting.';
  }, 500);
})(globalThis);
