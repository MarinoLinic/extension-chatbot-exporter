(function () {
  'use strict';
  const E = globalThis.ChatExport;
  if (E.contentInstalled) return;
  E.contentInstalled = true;
  let settings = E.settings(), archive = null, store = new E.MessageStore(), controller = null, route = location.href, token = 0, dirty = true, checkedRevision = -1, observer, observerRoot, observerScope, operation = 0;
  let state = { phase: 'Ready', running: false, downloading: false, count: 0 }, buttonHost, panelHost, panel;
  const provider = () => E.provider(location.href);
  const settingsReady = chrome.storage.local.get('settings').catch(() => ({})).then(result => { settings = E.settings(result.settings); updateButton(); });
  function routeCheck() {
    if (location.href === route) return;
    route = location.href; operation++; controller?.abort(); controller = null; archive = null; store = new E.MessageStore(); checkedRevision = -1; token++; dirty = true; observer?.disconnect(); observerRoot = observerScope = null;
    closePanel(); updateButton(); state = { phase: 'Ready', running: false, downloading: false, count: 0 };
  }
  function watch() {
    const p = provider(); if (!p) return;
    if (observerRoot?.isConnected) return;
    const node = document.querySelector(p.selector) || (p.fallback && document.querySelector(p.fallback));
    const scope = E.scroller(document, p, node ? [{ node }] : []);
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
    const busy = observerScope && E.transcriptBusy(document, observerScope);
    if (busy && previous?.capture.status !== 'partial') checkedRevision = -1;
    if (checkedRevision === store.revision && previous && !fresh.capture.warnings.some(w => !previous.capture.warnings.includes(w))) fresh.capture = previous.capture;
    else checkedRevision = fresh.capture.status === 'reported-total' ? store.revision : -1;
    archive = fresh; dirty = false; state.count = archive.messages.length;
    if (!['Cancelled', 'Stopped'].includes(state.phase)) state.phase = state.count ? 'Ready' : 'No messages yet';
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
    if (archive && checkedRevision === store.revision && ['observed-edges', 'reported-total'].includes(archive.capture.status) && !(observerScope && E.transcriptBusy(document, observerScope))) return archive;
    const p = provider(); if (!p) throw new Error('Open a supported chatbot conversation.');
    const generation = operation, captureStore = store, abort = new AbortController(); controller = abort;
    state.running = true; state.phase = 'Checking history'; state.error = null;
    try {
      const result = await E.capture({ provider: p, settings: { ...settings, scan: true }, store: captureStore, signal: abort.signal, progress: progress => { if (operation === generation) Object.assign(state, progress); } });
      if (generation !== operation || result.sourceURL !== location.href) throw new Error('Conversation changed.');
      if (captureStore !== store) return null;
      archive = result; checkedRevision = store.revision;
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
    if (settings.scan && !E.generating(document) && ['all', 'user', 'assistant'].includes(mode)) {
      const result = await verify(); if (!result) return { cancelled: true };
    }
    if (archive?.sourceURL !== location.href) throw new Error('Conversation changed. Refresh the selection.');
    const chosen = mode === 'all' ? archive.messages.map(m => m.id) : mode === 'user' || mode === 'assistant' ? archive.messages.filter(m => m.role === mode).map(m => m.id) : [...initialIDs];
    const selected = E.selectArchive(archive, chosen);
    if (!selected.messages.length) throw new Error('Select at least one available message.');
    if (E.generating(document)) {
      selected.capture = { ...selected.capture, status: 'partial', warnings: [...new Set([...selected.capture.warnings, 'The last response is still generating.'])] };
    }
    const generation = operation, downloadImages = settings.downloadImages;
    state.downloading = true; state.phase = copy ? 'Preparing copy' : 'Preparing download'; state.error = null;
    try {
      const output = E.formatAvailable(selected, format);
      const warnings = [...output.warnings];
      if (copy) { state.phase = 'Copy ready'; return { copyText: output.content, exportWarnings: warnings }; }
      try { await download(new Blob([output.content], { type: output.mime }), output.filename); }
      catch (error) { throw new Error(`Download could not start. ${error.message} You can still copy the selected messages.`); }
      if (downloadImages) {
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
          if (operation === generation) state.phase = `Images ${i + 1}/${Math.min(100, images.length)}`;
        }
        if (manifest.some(image => image.status !== 'queued')) warnings.push('Some images were skipped or could not be downloaded.');
        if (images.length && generation === operation) {
          try {
            await download(new Blob([JSON.stringify({ sourceURL: selected.sourceURL, note: 'Queued means handed to the browser. Check Downloads for completion. URLs may expire; filenames can be uniquified.', images: manifest }, null, 2)], { type: 'application/json' }), output.filename.replace(/\.[^.]+$/, '.media.json'), false);
          } catch { warnings.push('The image download report could not be saved.'); }
        }
      }
      if (operation === generation) state.phase = 'Download started';
      return { exportWarnings: warnings };
    } finally { if (operation === generation) state.downloading = false; }
  }
  async function handle(message) {
    await settingsReady; routeCheck();
    if (message.type === 'ce:state') return snapshot();
    if (message.type === 'ce:settings') {
      const next = E.settings(message.settings);
      applySettings(next); await chrome.storage.local.set({ settings }); return snapshot();
    }
    if (message.type === 'ce:cancel') { controller?.abort(); return snapshot(); }
    if (message.type === 'ce:refresh') { dirty = true; checkedRevision = -1; state.error = null; return snapshot(); }
    if (message.type === 'ce:start') {
      if (state.running || state.downloading) throw new Error('An operation is already running.');
      if (message.token !== undefined && message.token !== token) throw new Error('Conversation changed. Refresh the selection.');
      checkedRevision = -1;
      const generation = operation;
      verify().catch(error => { if (generation === operation) { state.error = error.message; state.phase = 'Stopped'; } }); return snapshot();
    }
    if (message.type === 'ce:export' || message.type === 'ce:copy') {
      if (message.token !== undefined && message.token !== token) throw new Error('Conversation changed. Refresh the selection.');
      const result = await exportSelected(message.ids, message.format, message.selection, message.type === 'ce:copy');
      return result ? { ...snapshot(), ...result } : snapshot();
    }
    throw new Error('Unknown exporter command');
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!message?.type?.startsWith('ce:') || message.type === 'ce:download') return;
    handle(message).then(reply, error => { state.error = error.message; reply({ error: error.message }); }); return true;
  });
  function applySettings(next) {
    if (next.includeThoughts !== settings.includeThoughts) {
      // Retained, unmounted messages were converted with the previous setting.
      controller?.abort(); archive = null; token++; store = new E.MessageStore(); checkedRevision = -1; dirty = true;
    }
    settings = next; updateButton();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) applySettings(E.settings(changes.settings.newValue));
  });
  setInterval(routeCheck, 400);
})(globalThis);
