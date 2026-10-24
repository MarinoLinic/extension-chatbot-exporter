(function () {
  'use strict';
  const E = globalThis.ChatExport;
  if (E.contentInstalled) return;
  E.contentInstalled = true;
  let settings = E.settings(), archive = null, store = new E.MessageStore(), controller = null, route = location.href, token = 0, dirty = true, verifiedRevision = -1, observer, observerRoot, observerScope, operation = 0;
  let state = { phase: 'Ready', running: false, downloading: false, count: 0 }, buttonHost, panelHost, panel;
  const provider = () => E.provider(location.href);
  const settingsReady = chrome.storage.local.get('settings').then(result => { settings = E.settings(result.settings); updateButton(); });
  function routeCheck() {
    if (location.href === route) return;
    route = location.href; operation++; controller?.abort(); controller = null; archive = null; store = new E.MessageStore(); verifiedRevision = -1; token++; dirty = true; observer?.disconnect(); observerRoot = observerScope = null;
    closePanel(); updateButton(); state = { phase: 'Ready', running: false, downloading: false, count: 0 };
  }
  function watch() {
    const p = provider(); if (!p) return;
    if (observerRoot?.isConnected) return;
    const scope = E.scroller(document, p, E.read(document, p, settings));
    observerScope = scope;
    const root = scope === document.scrollingElement ? document.body : scope;
    if (observerRoot === root) return;
    observer?.disconnect(); observerRoot = root;
    observer = new MutationObserver(records => {
      if (records.some(record => {
        if (record.target.nodeType === 1 && record.target.closest('[data-chat-export-ui]')) return false;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        return !nodes.length || !nodes.every(n => n.nodeType === 1 && n.matches('[data-chat-export-ui]'));
      })) dirty = true;
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  }
  function refreshLoaded() {
    routeCheck();
    if (state.running || state.downloading || (!dirty && archive && observerRoot?.isConnected)) return;
    const p = provider(); if (!p) return;
    const previous = archive;
    const fresh = E.loadedArchive({ provider: p, settings, store, retain: previous?.capture.strategy === 'virtual-scan' });
    if (observerScope && E.transcriptBusy(document, observerScope)) verifiedRevision = -1;
    if (verifiedRevision === store.revision && previous) fresh.capture = previous.capture;
    else {
      verifiedRevision = fresh.capture.status === 'reported-total' ? store.revision : -1;
      if (previous?.capture.status === 'partial' && verifiedRevision === -1) fresh.capture = { ...previous.capture, expectedTotal: fresh.capture.expectedTotal || previous.capture.expectedTotal };
    }
    archive = fresh; dirty = false; state.count = archive.messages.length; state.error = null; state.phase = state.count ? 'Ready' : 'No messages yet';
    watch();
  }
  function snapshot() {
    refreshLoaded();
    const p = provider();
    return { ...state, provider: p?.name || null, providerID: p?.id || null, generating: E.generating(document), pageBusy: observerScope ? E.transcriptBusy(document, observerScope) : false, settings, token, revision: store.revision, coverage: archive?.capture.status || 'visible-only', expectedTotal: archive?.capture.expectedTotal || null, warnings: archive?.capture.warnings || [], messages: archive?.messages.map((m, i) => ({ id: m.id, role: m.role, number: i + 1, preview: E.preview(m.markdown) })) || [] };
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
  async function verify() {
    refreshLoaded();
    if (archive && verifiedRevision === store.revision && !(observerScope && E.transcriptBusy(document, observerScope))) return archive;
    const p = provider(); if (!p) throw new Error('Open a supported chatbot conversation.');
    const generation = operation, abort = new AbortController(); controller = abort;
    state.running = true; state.phase = 'Checking history'; state.error = null;
    try {
      const result = await E.capture({ provider: p, settings: { ...settings }, store, signal: abort.signal, progress: progress => { if (operation === generation) Object.assign(state, progress); } });
      if (generation !== operation || result.sourceURL !== location.href) throw new Error('Conversation changed.');
      archive = result; verifiedRevision = result.capture.status === 'observed-edges' || result.capture.status === 'reported-total' ? store.revision : -1;
      state.count = result.messages.length; state.phase = abort.signal.aborted ? 'Cancelled' : 'Ready'; dirty = true; delete state.percent;
      return abort.signal.aborted ? null : result;
    } finally { if (operation === generation) { state.running = false; controller = null; } }
  }
  async function exportSelected(ids, format, selection, copy = false) {
    if (state.running || state.downloading) throw new Error('An operation is already running.');
    refreshLoaded();
    if (!archive?.messages.length || archive.sourceURL !== location.href) throw new Error('No messages available yet.');
    const initialIDs = new Set(ids || []);
    const mode = selection || (initialIDs.size === archive.messages.length ? 'all' : 'custom');
    if (settings.scan && ['all', 'user', 'assistant'].includes(mode)) {
      const result = await verify(); if (!result) return;
      if (result.capture.status === 'partial') { state.error = 'History is incomplete. Review the capture warning before exporting.'; return; }
    }
    if (E.generating(document)) throw new Error('Wait for the response to finish.');
    const chosen = mode === 'all' ? archive.messages.map(m => m.id) : mode === 'user' || mode === 'assistant' ? archive.messages.filter(m => m.role === mode).map(m => m.id) : [...initialIDs];
    const selected = E.selectArchive(archive, chosen);
    if (!selected.messages.length) throw new Error('Select at least one available message.');
    const generation = operation;
    state.downloading = true; state.phase = copy ? 'Preparing copy' : 'Preparing download'; state.error = null;
    try {
      const output = E.format(selected, format);
      if (copy) { await navigator.clipboard.writeText(output.content); state.phase = 'Copied to clipboard'; return; }
      await download(new Blob([output.content], { type: output.mime }), output.filename);
      if (settings.downloadImages) {
        const images = E.unique(selected.messages.flatMap(m => m.images), i => i.url), manifest = [];
        for (const [i, image] of images.entries()) {
          if (operation !== generation || location.href !== selected.sourceURL) { manifest.push({ ...image, status: 'skipped', reason: 'Conversation changed' }); continue; }
          if (i >= 100) { manifest.push({ ...image, status: 'skipped', reason: '100-image safety limit' }); continue; }
          const extension = image.url.match(/\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i)?.[1] || image.url.match(/^data:image\/(png|jpeg|webp|gif|avif);/i)?.[1] || 'image';
          const filename = `${output.filename.replace(/\.[^.]+$/, '')}_image-${String(i + 1).padStart(3, '0')}.${extension}`;
          try {
            const result = image.url.startsWith('blob:') ? await download(await (await fetch(image.url)).blob(), filename, false) : await chrome.runtime.sendMessage({ type: 'ce:download', media: true, url: image.url, filename, saveAs: false });
            manifest.push({ ...image, filename, status: result?.ok ? 'queued' : 'failed', downloadId: result?.id, reason: result?.error });
          } catch (error) { manifest.push({ ...image, filename, status: 'failed', reason: error.message }); }
          state.phase = `Images ${i + 1}/${Math.min(100, images.length)}`;
        }
        if (images.length && generation === operation) await download(new Blob([JSON.stringify({ sourceURL: selected.sourceURL, note: 'Queued means handed to the browser. Check Downloads for completion. URLs may expire; filenames can be uniquified.', images: manifest }, null, 2)], { type: 'application/json' }), output.filename.replace(/\.[^.]+$/, '.media.json'), false);
      }
      state.phase = 'Download started';
    } finally { if (operation === generation) state.downloading = false; }
  }
  async function handle(message) {
    await settingsReady; routeCheck();
    if (message.type === 'ce:state') return snapshot();
    if (message.type === 'ce:settings') {
      const next = E.settings(message.settings);
      if (next.includeThoughts !== settings.includeThoughts) { dirty = true; verifiedRevision = -1; }
      settings = next; await chrome.storage.local.set({ settings }); updateButton(); return snapshot();
    }
    if (message.type === 'ce:cancel') { controller?.abort(); return snapshot(); }
    if (message.type === 'ce:refresh') { dirty = true; return snapshot(); }
    if (message.type === 'ce:start') {
      if (state.running || state.downloading) throw new Error('An operation is already running.');
      if (message.token !== undefined && message.token !== token) throw new Error('Conversation changed. Refresh the selection.');
      verifiedRevision = -1;
      const generation = operation;
      verify().catch(error => { if (generation === operation) { state.error = error.message; state.phase = 'Stopped'; } }); return snapshot();
    }
    if (message.type === 'ce:export' || message.type === 'ce:copy') {
      if (message.token !== undefined && message.token !== token) throw new Error('Conversation changed. Refresh the selection.');
      await exportSelected(message.ids, message.format, message.selection, message.type === 'ce:copy'); return snapshot();
    }
    throw new Error('Unknown exporter command');
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!message?.type?.startsWith('ce:') || message.type === 'ce:download') return;
    handle(message).then(reply, error => { state.error = error.message; reply({ error: error.message }); }); return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) { const next = E.settings(changes.settings.newValue); if (next.includeThoughts !== settings.includeThoughts) { dirty = true; verifiedRevision = -1; } settings = next; updateButton(); }
  });
  setInterval(routeCheck, 400);
})(globalThis);
