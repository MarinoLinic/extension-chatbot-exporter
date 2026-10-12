(function () {
  'use strict';
  const E = globalThis.ChatExport;
  const providers = [
    { id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'], selector: '[data-message-author-role]', fallback: '[data-user-message-bubble],.bg-user-message,[data-markdown-text-style="assistant-message"],[class*="MarkdownRoot"]' },
    { id: 'claude', name: 'Claude', hosts: ['claude.ai'], selector: '[data-testid="user-message"],[data-testid="assistant-message"]', scroller: '[data-testid="chat-scroll-container"]' },
    { id: 'gemini', name: 'Gemini', hosts: ['gemini.google.com'], selector: 'user-query,model-response,share-turn-viewer response-container', scroller: '#chat-history' },
    { id: 'studio', name: 'Google AI Studio', hosts: ['aistudio.google.com'], selector: 'ms-chat-turn', scroller: 'ms-autoscroll-container' },
    { id: 'grok', name: 'Grok', hosts: ['grok.com'], selector: '[data-testid="user-message"],[data-testid="assistant-message"]', scroller: '[data-testid="chat-transcript-scroller"],[data-testid="share-transcript-scroller"],[role="region"][aria-label="Conversation"]' },
    { id: 'xgrok', name: 'Grok on X', hosts: ['x.com', 'twitter.com'], path: /^\/i\/grok(?:\/|$)/, selector: '[role="region"][aria-label="Conversation"] .rounded-chat,[role="region"][aria-label="Conversation"] [data-quotable-message]', scroller: '[role="region"][aria-label="Conversation"]' },
    { id: 'deepseek', name: 'DeepSeek', hosts: ['chat.deepseek.com'], selector: '.ds-message', scroller: '.ds-virtual-list.ds-scroll-area' },
    { id: 'glm', name: 'GLM / Z.ai', hosts: ['chat.z.ai', 'chatglm.cn'], selector: '.chat-user,.chat-assistant' },
    { id: 'kimi', name: 'Kimi', hosts: ['kimi.com', 'www.kimi.com', 'kimi.ai', 'www.kimi.ai'], selector: '.chat-content-item-user,.chat-content-item-assistant' }
  ];
  E.providers = providers;
  E.provider = href => { try { const u = new URL(href); return providers.find(p => p.hosts.includes(u.hostname) && (!p.path || p.path.test(u.pathname))) || null; } catch { return null; } };
  const keys = ['data-message-id', 'data-chatgpt-selection-message-id', 'data-chatgpt-search-message-ids', 'data-plane-row', 'data-virtual-list-item-key', 'data-turn-id', 'data-chatgpt-search-unit-key', 'data-content-search-unit-key', 'data-quotable-message', 'data-index'];
  const keySelector = keys.map(k => `[${k}]`).join(',');
  const text = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  E.read = function (doc, provider, settings = E.defaults) {
    let nodes = [...doc.querySelectorAll(provider.selector)];
    if (!nodes.length && provider.fallback) nodes = [...doc.querySelectorAll(provider.fallback)];
    const candidates = new Set(nodes);
    nodes = nodes.filter(node => {
      if (node.closest('[data-chat-export-ui]')) return false;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) if (candidates.has(parent)) return false;
      return true;
    });
    return nodes.map(node => {
      let role, body = node, row = node;
      switch (provider.id) {
        case 'chatgpt':
          role = node.getAttribute('data-message-author-role') || (node.matches('[data-user-message-bubble],.bg-user-message') ? 'user' : 'assistant');
          body = node.querySelector('.markdown,[data-markdown-text-style="assistant-message"],.whitespace-pre-wrap') || node;
          row = node.closest('[data-chatgpt-search-unit-key],[data-testid^="conversation-turn"],article') || node;
          break;
        case 'claude':
          role = node.getAttribute('data-testid') === 'user-message' ? 'user' : 'assistant';
          row = node.closest('[data-testid="transcript-row"]') || node.parentElement || node;
          break;
        case 'gemini':
          role = node.tagName === 'USER-QUERY' ? 'user' : 'assistant';
          body = node.querySelector(role === 'user' ? '.query-text' : 'model-response-content,structured-content-container') || node;
          row = node.closest('.conversation-container,share-turn-viewer') || node;
          break;
        case 'studio':
          role = node.querySelector('.chat-turn-container.user') ? 'user' : 'assistant';
          body = node.querySelector('.turn-content') || node;
          break;
        case 'grok':
          role = node.getAttribute('data-testid') === 'user-message' ? 'user' : 'assistant';
          body = node.querySelector('.response-content-markdown') || node;
          row = node.closest('[data-plane-row]') || node;
          break;
        case 'xgrok':
          role = node.hasAttribute('data-quotable-message') ? 'assistant' : 'user';
          body = node;
          break;
        case 'deepseek':
          role = node.querySelector('.ds-assistant-message-main-content') ? 'assistant' : 'user';
          body = node.querySelector('.ds-assistant-message-main-content,.ds-markdown') || node;
          row = node.closest('[data-virtual-list-item-key]') || node;
          break;
        case 'glm': role = node.classList.contains('chat-user') ? 'user' : 'assistant'; row = node.closest('[id^="message-"]') || node; break;
        case 'kimi': role = node.classList.contains('chat-content-item-user') ? 'user' : 'assistant'; body = node.querySelector('.markdown,.segment-content,.segment-user') || node; break;
      }
      const converted = E.convert(body, { base: doc.URL, includeThoughts: settings.includeThoughts });
      const resourceRoot = provider.id === 'gemini' ? node : provider.id === 'chatgpt' ? node.closest('[data-chatgpt-search-unit-key]') || node : row;
      // Resource cards often sit beside the message body; inspect only this row.
      const links = [...converted.links];
      for (const a of resourceRoot.querySelectorAll('a[href]')) {
        if (a.closest('nav,[data-chat-export-ui]')) continue;
        const url = E.url(a.getAttribute('href'), doc.URL);
        if (url) links.push({ url, title: text(a) || a.getAttribute('aria-label') || url });
      }
      const attachmentSelector = 'user-query-file-preview,[data-testid="file-thumbnail"],[data-testid="file-card-open"],[aria-label="Open attachment"],a[download],.attachment-card';
      let attachments = [...resourceRoot.querySelectorAll(attachmentSelector)].map(el => ({
        name: text(el.querySelector('.filename-label,.truncate,bdi')) || el.getAttribute('aria-label') || el.querySelector('[aria-label]')?.getAttribute('aria-label') || text(el) || 'Attachment',
        url: E.url(el.getAttribute('href') || el.querySelector('a[href]')?.getAttribute('href'), doc.URL) || null,
        kind: el.matches('[data-testid="file-card-open"]') ? 'artifact' : 'attachment'
      }));
      attachments = E.unique(attachments, a => a.name + '|' + a.url);
      const extraImages = [...resourceRoot.querySelectorAll('img')].filter(el => !body.contains(el)).flatMap(el => E.convert(el, { base: doc.URL }).images);
      const toolNotes = [...resourceRoot.querySelectorAll('[data-testid="tool-status-pill"],.tool-call,.tool-result')].map(text).filter(Boolean);
      const keyNode = node.closest(keySelector) || row.closest(keySelector);
      let stableID = null, index = null;
      if (keyNode) {
        const attr = keys.find(k => keyNode.hasAttribute(k));
        stableID = attr + ':' + keyNode.getAttribute(attr);
        if (attr === 'data-index' || attr === 'data-virtual-list-item-key') index = Number(keyNode.getAttribute(attr));
      }
      if (!stableID && row.id) stableID = 'id:' + row.id;
      const indexed = row.querySelector('[aria-label^="Message "]')?.getAttribute('aria-label')?.match(/^Message (\d+) of (\d+)/);
      const expectedTotal = indexed ? Number(indexed[2]) : null;
      return {
        node, row, stableID: stableID ? stableID + ':' + role : null, index, expectedTotal,
        role, markdown: converted.markdown, html: converted.html,
        links: E.unique(links, l => l.url), images: E.unique([...converted.images, ...extraImages], i => i.url),
        attachments, artifacts: converted.artifacts, toolNotes,
        placeholder: !converted.markdown && !converted.images.length && !attachments.length && !converted.artifacts.length
      };
    });
  };
  E.scroller = function (doc, provider, items) {
    const known = provider.scroller && doc.querySelector(provider.scroller);
    if (known && known.scrollHeight > known.clientHeight) return known;
    let el = items[0]?.node.parentElement;
    while (el && el !== doc.body) {
      if (el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(doc.defaultView.getComputedStyle(el).overflowY)) return el;
      el = el.parentElement;
    }
    return known || doc.scrollingElement || doc.documentElement;
  };
})(globalThis);
