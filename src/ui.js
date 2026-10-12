(function () {
  'use strict';
  const E = globalThis.ChatExport;
  E.uiCSS = E.design.uiCSS;
  E.mountUI = function (container, bridge, { popup = false, onClose = null } = {}) {
    const doc = container.ownerDocument;
    const el = (tag, text = '', cls = '') => { const n = doc.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
    const style = el('style', E.uiCSS), panel = el('div', '', popup ? 'ce ce-popup' : 'ce');
    const head = el('header', '', 'head'), title = el('h1', 'Export chat'), badge = el('span', '', 'provider-badge');
    const refresh = el('button', '↻', 'icon-button'), settingsButton = el('button', '⚙', 'icon-button');
    refresh.title = 'Refresh messages'; refresh.setAttribute('aria-label', 'Refresh messages');
    settingsButton.title = 'Export settings'; settingsButton.setAttribute('aria-label', 'Export settings');
    head.append(title, badge, refresh, settingsButton);
    if (onClose) { const close = el('button', '×', 'icon-button'); close.setAttribute('aria-label', 'Close exporter'); close.onclick = onClose; head.append(close); }
    const body = el('div', '', 'body'), messagesView = el('div', '', 'messages-view'), settingsView = el('div', '', 'settings-view'); settingsView.hidden = true;
    const selectionBar = el('div', '', 'selection-bar'), filters = el('div', '', 'filters'), selection = el('span', '', 'selection');
    const status = el('div', '', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;
    const notice = el('div', '', 'notice'); notice.setAttribute('role', 'alert'); notice.hidden = true;
    const warningButton = el('button', '', 'warning-button'); warningButton.hidden = true;
    warningButton.onclick = () => { notice.hidden = !notice.hidden; };
    const list = el('div', '', 'list'); list.setAttribute('aria-label', 'Select messages');
    const empty = el('div', 'No messages on this page yet.', 'empty');
    const pageControls = el('div', '', 'page'), prev = el('button', 'Previous'), pageLabel = el('span'), next = el('button', 'Next'); pageControls.append(prev, pageLabel, next); pageControls.hidden = true;
    selectionBar.append(filters, selection); messagesView.append(selectionBar, status, warningButton, notice, list, empty, pageControls);
    const settingsTop = el('div', '', 'settings-top'), back = el('button', '← Messages', 'back-button'); settingsTop.append(back, el('h2', 'Export settings')); settingsView.append(settingsTop);
    const fields = {}, opts = el('div', '', 'options');
    const checkbox = (name, label) => { const line = el('label'), input = el('input'); input.type = 'checkbox'; fields[name] = input; line.append(input, el('span', label)); opts.append(line); };
    checkbox('scan', 'Verify full history when exporting all messages');
    checkbox('pageButton', 'Show the export button on chatbot pages');
    checkbox('includeThoughts', 'Include reasoning present in the page');
    checkbox('downloadImages', 'Download images too');
    checkbox('saveAs', 'Ask where to save');
    for (const [name, label, min, max] of [['maxSeconds', 'History loading limit (seconds)', 15, 900], ['waitMs', 'Maximum render wait (milliseconds)', 300, 3000]]) {
      const line = el('label'), input = el('input'); input.type = 'number'; input.min = min; input.max = max; fields[name] = input; line.append(el('span', label), input); opts.append(line);
    }
    settingsView.append(opts); body.append(messagesView, settingsView);
    const bottom = el('div', '', 'bottom'), format = el('select'), load = el('button', 'Load all', 'load-button'), cancel = el('button', 'Cancel', 'cancel-button'), exportButton = el('button', 'Export selected', 'primary');
    cancel.hidden = true; format.setAttribute('aria-label', 'Export format');
    for (const [value, label] of [['md', 'Markdown'], ['json', 'JSON'], ['html', 'HTML / PDF'], ['txt', 'Text'], ['csv', 'CSV']]) { const option = el('option', label); option.value = value; format.append(option); }
    bottom.append(format, load, cancel, exportButton); panel.append(head, body, bottom); container.append(style, panel);
    let state = { messages: [] }, picked = new Set(), mode = 'all', token = null, revision = null, page = 0, disposed = false, pollBusy = false, settingsReady = false, actionBusy = false;
    const filterButtons = [];
    function selectByMode() {
      if (mode === 'all') picked = new Set(state.messages.map(m => m.id));
      else if (mode === 'user' || mode === 'assistant') picked = new Set(state.messages.filter(m => m.role === mode).map(m => m.id));
      else if (mode === 'none') picked.clear();
      else { const available = new Set(state.messages.map(m => m.id)); picked = new Set([...picked].filter(id => available.has(id))); }
    }
    function selectionText() {
      selection.textContent = `${picked.size} / ${state.messages.length}`;
      selection.title = `${picked.size} of ${state.messages.length} messages selected`;
      exportButton.disabled = !picked.size || state.running || state.downloading || state.generating || state.pageBusy || actionBusy;
      const active = !picked.size ? 'None' : mode === 'all' ? 'All' : mode === 'user' ? 'Human' : mode === 'assistant' ? 'Assistant' : null;
      filterButtons.forEach(b => b.setAttribute('aria-pressed', String(b.textContent === active)));
    }
    function drawList() {
      const scrollTop = list.scrollTop;
      list.replaceChildren(); page = Math.min(page, Math.max(0, Math.ceil(state.messages.length / 80) - 1));
      for (const message of state.messages.slice(page * 80, (page + 1) * 80)) {
        const line = el('label', '', 'item'), input = el('input'), content = el('span'); input.type = 'checkbox'; input.checked = picked.has(message.id); line.dataset.role = message.role;
        input.setAttribute('aria-label', `Select ${message.role} message ${message.number}`);
        input.onchange = () => { mode = 'custom'; if (input.checked) picked.add(message.id); else picked.delete(message.id); selectionText(); };
        const label = message.role === 'assistant' ? state.provider || 'Assistant' : message.role === 'user' ? 'User' : message.role;
        content.append(el('span', `${message.number} · ${label}`, 'role'), el('span', message.preview || 'Image or attachment', 'preview')); content.title = message.preview || '';
        line.append(input, content); list.append(line);
      }
      list.scrollTop = scrollTop; empty.hidden = !!state.messages.length; list.hidden = !state.messages.length;
      pageControls.hidden = state.messages.length <= 80; pageLabel.textContent = `${page + 1} / ${Math.max(1, Math.ceil(state.messages.length / 80))}`; prev.disabled = !page; next.disabled = (page + 1) * 80 >= state.messages.length;
      selectionText();
    }
    for (const [label, value] of [['All', 'all'], ['Human', 'user'], ['Assistant', 'assistant'], ['None', 'none'], ['Invert', 'custom']]) {
      const b = el('button', label);
      b.onclick = () => { if (label === 'Invert') picked = new Set(state.messages.filter(m => !picked.has(m.id)).map(m => m.id)); mode = value; selectByMode(); drawList(); };
      filters.append(b); if (label !== 'Invert') filterButtons.push(b);
    }
    prev.onclick = () => { page--; list.scrollTop = 0; drawList(); }; next.onclick = () => { page++; list.scrollTop = 0; drawList(); };
    function showSettings(show) { settingsView.hidden = !show; messagesView.hidden = show; settingsButton.setAttribute('aria-pressed', String(show)); }
    settingsButton.onclick = () => showSettings(settingsView.hidden); back.onclick = () => showSettings(false);
    function render(value) {
      state = { messages: [], ...value };
      panel.dataset.provider = state.providerID || '';
      badge.textContent = state.provider || ''; badge.hidden = !state.provider;
      if (!settingsReady && state.settings) {
        for (const [key, input] of Object.entries(fields)) { if (input.type === 'checkbox') input.checked = state.settings[key]; else input.value = state.settings[key]; }
        format.value = state.settings.format; settingsReady = true;
      }
      status.hidden = !state.running && !state.downloading && !state.generating && !state.pageBusy;
      status.textContent = state.generating && !state.running ? 'Response is still generating' : state.pageBusy && !state.running ? 'Waiting for the page' : `${state.phase || 'Loading'}${state.percent === undefined ? '' : ` · ${state.percent}%`}`;
      const warnings = state.warnings || [];
      warningButton.hidden = !warnings.length; warningButton.textContent = `${warnings.length === 1 ? 'Capture warning' : warnings.length + ' capture warnings'}`;
      notice.textContent = state.error || warnings.join('\n'); if (state.error) notice.hidden = false; else if (!warnings.length) notice.hidden = true;
      load.hidden = !!state.running; cancel.hidden = !state.running;
      load.disabled = state.downloading || !state.provider || actionBusy; refresh.disabled = state.running || state.downloading;
      load.textContent = ['observed-edges', 'reported-total'].includes(state.coverage) ? 'Check again' : 'Load all';
      if (state.token !== token) { token = state.token; mode = 'all'; picked.clear(); page = 0; revision = null; }
      const incoming = state.revision ?? state.messages.map(m => m.id + m.preview).join('|');
      if (incoming !== revision) { revision = incoming; selectByMode(); drawList(); }
      else selectionText();
    }
    async function poll() {
      if (disposed || pollBusy) return; pollBusy = true;
      try { render(await bridge({ type: 'ce:state' })); } catch (error) { notice.textContent = error.message; notice.hidden = false; exportButton.disabled = true; }
      finally { pollBusy = false; }
    }
    let settingsChain = Promise.resolve();
    function saveSettings() {
      const value = { format: format.value };
      for (const [key, input] of Object.entries(fields)) value[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
      settingsChain = settingsChain.catch(() => {}).then(() => bridge({ type: 'ce:settings', settings: value }));
      settingsChain.catch(error => { notice.textContent = error.message; notice.hidden = false; }); return settingsChain;
    }
    for (const input of Object.values(fields)) input.onchange = saveSettings; format.onchange = saveSettings;
    async function action(message) {
      actionBusy = true; render(state);
      try { if (message.type !== 'ce:cancel') await saveSettings(); const result = await bridge(message); if (result?.error) throw new Error(result.error); await poll(); }
      catch (error) { state.error = error.message; notice.textContent = error.message; notice.hidden = false; }
      finally { actionBusy = false; render(state); }
    }
    load.onclick = () => action({ type: 'ce:start', token }); cancel.onclick = () => action({ type: 'ce:cancel' }); refresh.onclick = () => action({ type: 'ce:refresh' });
    exportButton.onclick = () => action({ type: 'ce:export', ids: [...picked], selection: mode, token, format: format.value });
    poll(); const timer = setInterval(poll, popup ? 800 : 1000);
    return { dispose() { disposed = true; clearInterval(timer); panel.remove(); style.remove(); } };
  };
})(globalThis);
