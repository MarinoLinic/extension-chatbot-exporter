(function () {
  'use strict';
  const E = globalThis.ChatExport;
  // IDs are kept distinct from text: two identical prompts are still two messages.
  E.MessageStore = class {
    constructor() { this.items = new Map(); this.order = []; this.nodeIDs = new WeakMap(); this.serial = 0; this.bytes = 0; this.unstable = false; this.gaps = false; }
    add(batch, { virtual = false } = {}) {
      let previous = null;
      const visible = batch.filter(item => !item.placeholder).map(item => {
        let id = item.stableID;
        if (!id) {
          if (!this.nodeIDs.has(item.node)) this.nodeIDs.set(item.node, 'node:' + (++this.serial));
          id = this.nodeIDs.get(item.node) + ':' + item.role;
          if (virtual) { this.unstable = true; id += ':' + E.hash(item.markdown); }
        }
        return { item, id };
      });
      if (virtual && this.items.size && visible.length && !visible.some(v => this.items.has(v.id))) this.gaps = true;
      for (let i = 0; i < visible.length; i++) {
        const { item, id } = visible[i];
        const { node, row, stableID, placeholder, ...serializable } = item;
        const value = { id, ...serializable };
        const size = JSON.stringify(value).length * 2;
        this.bytes += size - (this.items.get(id)?._bytes || 0);
        if (this.bytes > 32 * 1024 * 1024 || this.items.size >= 10000) throw new Error('Capture limit reached (32 MB or 10,000 messages). Export this partial capture or use a shorter conversation.');
        if (!this.items.has(id)) {
          const next = visible.slice(i + 1).find(v => this.items.has(v.id));
          const position = previous ? this.order.indexOf(previous) + 1 : next ? this.order.indexOf(next.id) : this.order.length;
          this.order.splice(position, 0, id);
        }
        this.items.set(id, { ...value, _bytes: size });
        previous = id;
      }
    }
    values() {
      let items = this.order.map(id => this.items.get(id));
      if (items.length && items.every(m => Number.isFinite(m.index))) items = items.sort((a, b) => a.index - b.index);
      return items.map(({ _bytes, ...item }) => item);
    }
    fingerprint() { return E.hash(JSON.stringify(this.values())); }
  };
  E.capture = async function ({ doc = document, provider, settings, signal, progress = () => {} }) {
    const store = new E.MessageStore(), warnings = new Set(), unresolved = new Set();
    const sourceURL = doc.URL, started = Date.now(), deadline = started + settings.maxSeconds * 1000;
    let status = 'observed-edges', topConfirmed = false, bottomConfirmed = false, expectedTotal = null;
    let sc, original = 0, originalBehavior = '';
    const check = () => {
      if (signal?.aborted) throw new Error('Capture cancelled; collected messages are available as a partial export.');
      if (doc.URL !== sourceURL) throw new Error('Conversation changed; capture stopped.');
      if (Date.now() > deadline) throw new Error('Time limit reached; capture is partial. Increase the scan limit to try again.');
      if (doc.visibilityState === 'hidden') throw new Error('Chat tab became hidden; capture is partial. Keep the chat tab selected during scanning.');
    };
    const read = () => {
      const batch = E.read(doc, provider, settings);
      for (const item of batch) if (item.expectedTotal) expectedTotal = Math.max(expectedTotal || 0, item.expectedTotal);
      for (const item of batch) {
        if (item.stableID) { if (item.placeholder) unresolved.add(item.stableID); else unresolved.delete(item.stableID); }
      }
      return batch;
    };
    const wait = async () => {
      for (let remaining = settings.waitMs; remaining > 0; remaining -= 100) { check(); await E.sleep(Math.min(100, remaining)); }
      check();
    };
    try {
      check();
      const initial = read();
      if (!initial.length) throw new Error('No conversation messages found. Open a chat and wait for it to finish rendering.');
      sc = E.scroller(doc, provider, initial);
      original = sc.scrollTop;
      originalBehavior = sc.style.scrollBehavior;
      const virtual = !!doc.querySelector('[data-plane-row],.ds-virtual-list,[data-testid="transcript-spacer"]');
      if (!settings.scan) { store.add(initial, { virtual }); status = 'visible-only'; warnings.add('Visible/loaded messages only: the conversation was not scanned.'); }
      else {
        sc.style.scrollBehavior = 'auto';
        let stable = 0, last = '';
        for (let round = 0; round < 60; round++) {
          check(); sc.scrollTop = 0; await wait();
          const batch = read();
          const signature = sc.scrollHeight + ':' + E.hash(batch.map(m => (m.stableID || '') + m.markdown).join('|'));
          const busy = sc.getAttribute('aria-busy') === 'true';
          stable = sc.scrollTop <= 2 && signature === last && !busy ? stable + 1 : 0;
          last = signature;
          progress({ phase: 'Finding the beginning', count: 0 });
          if (stable >= 3) { topConfirmed = true; break; }
        }
        if (!topConfirmed) warnings.add('Beginning did not settle before the top-search limit. Older messages may be missing.');
        stable = 0; last = '';
        for (let step = 0; step < 3000; step++) {
          check();
          store.add(read(), { virtual });
          const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 3;
          const signature = sc.scrollHeight + ':' + store.fingerprint();
          stable = atBottom && signature === last && sc.getAttribute('aria-busy') !== 'true' && !E.generating(doc) ? stable + 1 : 0;
          last = signature;
          progress({ phase: 'Collecting messages', count: store.items.size, percent: Math.min(100, Math.round((sc.scrollTop + sc.clientHeight) / Math.max(1, sc.scrollHeight) * 100)) });
          if (stable >= 4) { bottomConfirmed = true; break; }
          sc.scrollTop += Math.max(80, Math.floor(sc.clientHeight * 0.55));
          await wait();
        }
        if (!bottomConfirmed) warnings.add('End did not settle before the scan limit; capture is partial.');
      }
    } catch (error) {
      status = 'partial'; warnings.add(error.message);
      // Keep the last rendered batch on cancellation/time limits, unless the route changed.
      if (doc.URL === sourceURL && sc) { try { store.add(read()); } catch { /* Existing capture is retained. */ } }
    } finally {
      if (sc) { if (doc.URL === sourceURL) sc.scrollTop = original; sc.style.scrollBehavior = originalBehavior; }
    }
    if (store.unstable) warnings.add('Virtualized messages lacked stable IDs; duplicates or missing messages are possible.');
    if (E.generating(doc)) warnings.add('A generation control is still visible. The last response may be unfinished.');
    if (unresolved.size) warnings.add(`${unresolved.size} message placeholders were observed without rendered content. They are not included in this export.`);
    if (store.gaps) warnings.add('Some virtualized viewports had no overlapping message IDs; inspect ordering and completeness.');
    if (expectedTotal && store.items.size !== expectedTotal) warnings.add(`The page reports ${expectedTotal} messages; ${store.items.size} were collected.`);
    if (!topConfirmed || !bottomConfirmed || warnings.size) { if (status === 'observed-edges') status = 'partial'; }
    const messages = store.values();
    if (doc.URL !== sourceURL) throw new Error('Conversation changed. The capture was discarded to prevent mixing chats.');
    if (!messages.length) throw new Error([...warnings].join(' ') || 'No message content found.');
    const title = (doc.querySelector('[data-testid="chat-title-split"],a.mdc-list-item--activated .title-text')?.textContent.trim() || doc.title || messages.find(m => m.role === 'user')?.markdown.split('\n')[0] || `${provider.name} conversation`).slice(0, 200);
    return {
      schema: 'conversation-export/v1', provider: { id: provider.id, name: provider.name }, title,
      sourceURL, exportedAt: new Date().toISOString(), capture: { status, topConfirmed, bottomConfirmed, expectedTotal, warnings: [...warnings], elapsedMs: Date.now() - started, note: 'Rendered DOM only. Settled edges do not prove server-side completeness; collapsed or inaccessible content may be absent.' },
      messages
    };
  };
})(globalThis);
