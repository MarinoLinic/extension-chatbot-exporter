'use strict';
(async () => {
  const E = globalThis.ChatExport, app = document.getElementById('app');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Open a supported chatbot conversation.');
    let initial;
    try { initial = await chrome.tabs.sendMessage(tab.id, { type: 'ce:state' }); }
    catch {
      if (!E.provider(tab.url)) throw new Error('Open a ChatGPT, Claude, Gemini, AI Studio, Grok, DeepSeek, Z.ai or Kimi conversation.');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/common.js', 'src/design.js', 'src/markdown.js', 'src/adapters.js', 'src/collector.js', 'src/formats.js', 'src/ui.js', 'src/content.js'] });
      initial = await chrome.tabs.sendMessage(tab.id, { type: 'ce:state' });
    }
    if (!initial?.provider) throw new Error('Open a supported chatbot conversation.');
    const bridge = async message => {
      if (message.type === 'ce:state' && initial) { const result = initial; initial = null; return result; }
      const result = await chrome.tabs.sendMessage(tab.id, message);
      if (result?.error && !result.messages) throw new Error(result.error); return result;
    };
    E.mountUI(app, bridge, { popup: true });
  } catch (error) { app.style.cssText = 'padding:24px;font:14px/1.6 system-ui;color:#555'; app.textContent = error.message; }
})();
