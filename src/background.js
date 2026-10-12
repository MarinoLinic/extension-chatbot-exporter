'use strict';
importScripts('common.js', 'adapters.js');
const E = globalThis.ChatExport;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'ce:download') return;
  (async () => {
    if (!sender.tab || !E.provider(sender.url)) throw new Error('Downloads must originate from a supported chatbot tab.');
    if (typeof message.filename !== 'string' || message.filename.length > 240 || /[\\/\x00-\x1f]/.test(message.filename) || /(^|\.)\.(\.|$)/.test(message.filename)) throw new Error('Invalid filename.');
    const source = new URL(sender.url);
    const isBlob = typeof message.url === 'string' && message.url.startsWith('blob:' + source.origin + '/');
    const isImage = message.media === true && (/^https?:\/\//.test(message.url || '') || /^data:image\/(png|jpeg|gif|webp|avif);/i.test(message.url || ''));
    if (!isBlob && !isImage) throw new Error('Invalid download URL.');
    const id = await chrome.downloads.download({ url: message.url, filename: message.filename, saveAs: message.saveAs === true, conflictAction: 'uniquify' });
    return { ok: true, id, status: 'queued' };
  })().then(reply, error => reply({ ok: false, error: error.message }));
  return true;
});
