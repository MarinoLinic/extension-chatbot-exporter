(function () {
  'use strict';
  const E = globalThis.ChatExport;
  E.uiCSS = E.design.uiCSS;
  E.mountUI = function (container, bridge, { popup = false, onClose = null } = {}) {
    const doc = container.ownerDocument;
    const el = (tag, text, cls) => { const n = doc.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
    const style = el('style', E.uiCSS); container.appendChild(style);
    const panel = el('div', '', popup ? 'ce ce-popup' : 'ce'), head = el('header', '', 'head');
    if (onClose) { const close = el('button', '×', 'close'); close.title = 'Close exporter'; close.setAttribute('aria-label', 'Close exporter'); close.onclick = onClose; head.appendChild(close); }
    E.design.addWire(doc, head);
    head.append(el('div', 'CONVERSATION / ARCHIVE', 'kicker'), el('h1', 'Conversation Exporter'), el('p', 'Select messages. Save a clean copy.', 'subtitle'));
    const body = el('div', '', 'body'), status = el('div', 'Connecting…', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const notice = el('div', '', 'notice'), controls = el('div', '', 'controls');
    const capture = el('button', 'Collect conversation', 'primary'), cancel = el('button', 'Cancel', 'danger');
    controls.append(capture, cancel);
    const settings = el('details', '', 'settings'); settings.append(el('summary', 'Export settings'));
    const opts = el('div', '', 'options'), fields = {};
    const checkbox = (name, label) => { const line = el('label'), input = el('input'); input.type = 'checkbox'; fields[name] = input; line.append(input, el('span', label)); opts.append(line); };
    checkbox('scan', 'Scan from the beginning (recommended)');
    checkbox('pageButton', 'Show the export button on chatbot pages');
    checkbox('includeThoughts', 'Include reasoning already present in the page');
    checkbox('downloadImages', 'Also download selected messages’ images');
    checkbox('saveAs', 'Ask where to save the conversation');
    for (const [name, label, min, max] of [['maxSeconds', 'Scan time limit (seconds)', 15, 900], ['waitMs', 'Wait after each scroll (milliseconds)', 300, 3000]]) {
      const line = el('label'), input = el('input'); input.type = 'number'; input.min = min; input.max = max; fields[name] = input; line.append(el('span', label), input); opts.append(line);
    }
    opts.append(el('div', 'Scanning moves the chat temporarily. Keep its tab selected. Image downloads contact the image hosts and may use your browser session.', 'notice')); settings.append(opts);
    const selection = el('div', '', 'selection'), pick = el('div', '', 'controls filters'), list = el('div', '', 'list');
    list.setAttribute('aria-label', 'Select messages');
    const pagination = el('div', '', 'page'), prev = el('button', 'Previous'), pageLabel = el('span'), next = el('button', 'Next'); pagination.append(prev, pageLabel, next);
    const exportRow = el('div', '', 'export-row'), format = el('select'), exportButton = el('button', 'Export selected', 'primary');
    format.setAttribute('aria-label', 'Export format');
    for (const [value, label] of [['md', 'Markdown'], ['json', 'JSON'], ['html', 'HTML / print PDF'], ['txt', 'Text'], ['csv', 'CSV']]) { const option = el('option', label); option.value = value; format.append(option); }
    exportRow.append(format, exportButton);
    body.append(status, notice, controls, settings, selection, pick, list, pagination);
    const bottom = el('div', '', 'bottom');
    bottom.append(exportRow, el('div', 'Local only · No telemetry\nCapture stays in this tab until you leave.', 'footer'));
    panel.append(head, body, bottom); container.append(panel);
    let state = { messages: [] }, picked = new Set(), token = null, page = 0, disposed = false, pollBusy = false, settingsReady = false, actionBusy = false;
    const filterButtons = [];
    const selectionText = () => { selection.textContent = `${picked.size} of ${state.messages.length} messages selected`; exportButton.disabled = !picked.size || state.running || state.downloading || actionBusy; const active = !picked.size ? 'None' : picked.size === state.messages.length ? 'All' : ['Human', 'Assistant'].find(label => { const role = label === 'Human' ? 'user' : 'assistant'; const matches = state.messages.filter(m => m.role === role); return matches.length === picked.size && matches.every(m => picked.has(m.id)); }); filterButtons.forEach(b => b.setAttribute('aria-pressed', String(b.textContent === active))); };
    const drawList = () => {
      list.replaceChildren(); page = Math.min(page, Math.max(0, Math.ceil(state.messages.length / 80) - 1));
      for (const message of state.messages.slice(page * 80, (page + 1) * 80)) {
        const line = el('label', '', 'item'), input = el('input'), content = el('span'); input.type = 'checkbox'; input.checked = picked.has(message.id);
        input.setAttribute('aria-label', `Select ${message.role} message ${message.number}`);
        input.onchange = () => { if (input.checked) picked.add(message.id); else picked.delete(message.id); selectionText(); };
        content.append(el('span', `${message.number} · ${message.role}`, 'role'), el('span', message.preview || 'Image or attachment', 'preview')); line.append(input, content); list.append(line);
      }
      pagination.hidden = state.messages.length <= 80; pageLabel.textContent = `${page + 1} / ${Math.max(1, Math.ceil(state.messages.length / 80))}`; prev.disabled = !page; next.disabled = (page + 1) * 80 >= state.messages.length;
      selectionText();
    };
    for (const [label, predicate] of [['All', () => true], ['Human', m => m.role === 'user'], ['Assistant', m => m.role === 'assistant'], ['None', () => false], ['Invert', m => !picked.has(m.id)]]) {
      const b = el('button', label, 'secondary'); b.onclick = () => { picked = new Set(state.messages.filter(predicate).map(m => m.id)); drawList(); }; pick.append(b); if (label !== 'Invert') filterButtons.push(b);
    }
    prev.onclick = () => { page--; drawList(); }; next.onclick = () => { page++; drawList(); };
    function render(value) {
      state = value;
      if (!settingsReady && state.settings) {
        for (const [key, input] of Object.entries(fields)) { if (input.type === 'checkbox') input.checked = state.settings[key]; else input.value = state.settings[key]; }
        format.value = state.settings.format; settingsReady = true;
      }
      status.textContent = `${state.provider || 'Open a supported chatbot'}\n${state.phase || 'Ready'}${state.count ? ` · ${state.count} messages` : ''}${state.percent !== undefined ? ` · ${state.percent}%` : ''}`;
      notice.textContent = state.error || (state.warnings || []).join('\n');
      capture.disabled = state.running || state.downloading || !state.provider || actionBusy;
      cancel.disabled = !state.running;
      if (state.token !== token) { token = state.token; picked = new Set(state.messages.map(m => m.id)); page = 0; drawList(); }
      else selectionText();
    }
    const poll = async () => { if (disposed || pollBusy) return; pollBusy = true; try { render(await bridge({ type: 'ce:state' })); } catch (error) { status.textContent = error.message; capture.disabled = true; } finally { pollBusy = false; } };
    let settingsChain = Promise.resolve();
    const saveSettings = () => {
      const value = { format: format.value };
      for (const [key, input] of Object.entries(fields)) value[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
      settingsChain = settingsChain.catch(() => {}).then(() => bridge({ type: 'ce:settings', settings: value }));
      settingsChain.catch(error => { notice.textContent = error.message; });
      return settingsChain;
    };
    for (const input of Object.values(fields)) input.onchange = saveSettings;
    format.onchange = saveSettings;
    const action = async message => { actionBusy = true; render(state); try { await saveSettings(); await bridge(message); await poll(); } catch (error) { notice.textContent = error.message; } finally { actionBusy = false; render(state); } };
    capture.onclick = () => action({ type: 'ce:start' });
    cancel.onclick = () => action({ type: 'ce:cancel' });
    exportButton.onclick = () => action({ type: 'ce:export', ids: [...picked], format: format.value });
    poll(); const timer = setInterval(poll, popup ? 800 : 1000);
    return { dispose() { disposed = true; clearInterval(timer); panel.remove(); style.remove(); } };
  };
})(globalThis);
