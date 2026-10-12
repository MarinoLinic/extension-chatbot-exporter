'use strict';
(async () => {
  const E = globalThis.ChatExport, app = document.getElementById('app');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !E.provider(tab.url)) throw new Error('Open a ChatGPT, Claude, Gemini, AI Studio, Grok, DeepSeek, Z.ai or Kimi conversation, then click the exporter.');
    try { await chrome.tabs.sendMessage(tab.id, { type: 'ce:state' }); }
    catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/common.js', 'src/markdown.js', 'src/adapters.js', 'src/collector.js', 'src/formats.js', 'src/ui.js', 'src/content.js'] }); }
    const bridge = async message => { const result = await chrome.tabs.sendMessage(tab.id, message); if (result?.error && !result.phase) throw new Error(result.error); return result; };
    E.mountUI(app, bridge, { popup: true });
  } catch (error) { app.style.cssText = 'padding:24px;font:14px/1.6 system-ui;color:#385246'; app.textContent = error.message; }
})();
