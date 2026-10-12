(function () {
  'use strict';
  const E = globalThis.ChatExport;
  E.uiCSS = `
    :host{all:initial;color-scheme:light;font-family:system-ui,sans-serif;color:#283b34}*{box-sizing:border-box}button,input,select{font:inherit}button,select,input{outline-offset:3px}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #ad641f}button{cursor:pointer}button:disabled{opacity:.48;cursor:default}.ce{width:420px;max-width:calc(100vw - 24px);background:#f7f6f1;border:1px solid #d7ded6;border-radius:18px;box-shadow:0 14px 60px #15312930;overflow:hidden;font:13px/1.5 system-ui;color:#283b34}.head{padding:20px 22px 16px;background:#e8efe6}.kicker{text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:.16em;color:#527160}.head h1{font:600 23px/1.2 Georgia,serif;margin:8px 0 6px}.subtitle{margin:0;color:#596d62}.close{float:right;background:transparent;border:0;font-size:22px;color:#385246}.body{padding:16px 20px;max-height:calc(100vh - 145px);overflow:auto}.status{background:white;border:1px solid #dce2d9;padding:12px;border-radius:10px;white-space:pre-wrap;margin-bottom:12px}.status strong{display:block}.notice{color:#785423;font-size:12px;margin:8px 0;white-space:pre-wrap}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}button{border:1px solid #c8d4c9;background:white;color:#2e4c3c;border-radius:8px;padding:8px 12px}.primary{background:#2f624b;color:white;border-color:#2f624b;font-weight:600}.danger{color:#944735}.secondary{font-size:12px;padding:5px 9px}.options{display:grid;gap:9px;margin:12px 0}label{display:flex;align-items:center;gap:8px}input[type=checkbox]{accent-color:#2f624b}input[type=number]{width:82px;padding:5px;border:1px solid #c8d4c9;border-radius:5px}select{padding:8px;border:1px solid #c8d4c9;border-radius:8px;background:white}.list{border:1px solid #dce2d9;border-radius:10px;background:white;max-height:220px;overflow:auto}.item{padding:9px 10px;align-items:flex-start;border-bottom:1px solid #e6ebe3}.item:last-child{border:0}.item input{margin-top:4px;flex-shrink:0}.preview{display:block;font-size:12px;overflow-wrap:anywhere;color:#55665b}.role{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#345640}.selection{font-size:12px;color:#53705c}.footer{font-size:11px;color:#718074;margin-top:14px;border-top:1px solid #dce2d9;padding-top:10px}.settings summary{cursor:pointer;color:#46654e;padding:6px 0}.page{display:flex;justify-content:space-between;align-items:center;margin:7px 0}.page button{padding:3px 8px}.export-row{display:flex;gap:8px;margin-top:12px}.export-row .primary{flex:1}
    [hidden]{display:none!important}
  `;
  E.mountUI = function (container, bridge, { popup = false, onClose = null } = {}) {
    const doc = container.ownerDocument;
    const el = (tag, text, cls) => { const n = doc.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
    const style = el('style', E.uiCSS); container.appendChild(style);
    const panel = el('div', '', 'ce'), head = el('header', '', 'head');
    if (onClose) { const close = el('button', '×', 'close'); close.title = 'Close exporter'; close.setAttribute('aria-label', 'Close exporter'); close.onclick = onClose; head.appendChild(close); }
    head.append(el('div', 'SAVE YOUR CONVERSATIONS', 'kicker'), el('h1', 'Conversation Exporter'), el('p', 'Choose what to keep. Take it with you.', 'subtitle'));
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
    const selection = el('div', '', 'selection'), pick = el('div', '', 'controls'), list = el('div', '', 'list');
    list.setAttribute('aria-label', 'Select messages');
    const pagination = el('div', '', 'page'), prev = el('button', 'Previous'), pageLabel = el('span'), next = el('button', 'Next'); pagination.append(prev, pageLabel, next);
    const exportRow = el('div', '', 'export-row'), format = el('select'), exportButton = el('button', 'Export selected', 'primary');
    format.setAttribute('aria-label', 'Export format');
    for (const [value, label] of [['md', 'Markdown'], ['json', 'JSON'], ['html', 'HTML / print PDF'], ['txt', 'Text'], ['csv', 'CSV']]) { const option = el('option', label); option.value = value; format.append(option); }
    exportRow.append(format, exportButton);
    body.append(status, notice, controls, settings, selection, pick, list, pagination, exportRow, el('div', 'Local only · No telemetry · No chatbot API keys\nCaptured messages stay in this tab until you save or leave it.', 'footer'));
    panel.append(head, body); container.append(panel);
    let state = { messages: [] }, picked = new Set(), token = null, page = 0, disposed = false, pollBusy = false, settingsReady = false, actionBusy = false;
    const selectionText = () => { selection.textContent = `${picked.size} of ${state.messages.length} messages selected`; exportButton.disabled = !picked.size || state.running || actionBusy; };
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
      const b = el('button', label, 'secondary'); b.onclick = () => { picked = new Set(state.messages.filter(predicate).map(m => m.id)); drawList(); }; pick.append(b);
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
