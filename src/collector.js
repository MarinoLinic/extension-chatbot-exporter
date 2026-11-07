(function () {
  'use strict';
  const E = globalThis.ChatExport;
  const maxBytes = 32 * 1024 * 1024;
  const limitWarning = 'Capture limit reached (32 MB or 10,000 messages). Some content could not be included.';
  E.MessageStore = class {
    constructor() { this.items = new Map(); this.order = []; this.ordered = new Set(); this.nodeIDs = new WeakMap(); this.serial = 0; this.bytes = 0; this.revision = 0; this.unstable = false; this.gaps = false; this.lastBatch = null; }
    key(item, virtual) {
      if (item.stableID) return item.stableID;
      let entry = this.nodeIDs.get(item.node);
      const signature = item.role + ':' + E.hash(item.markdown);
      if (!entry) { entry = { id: 'node:' + (++this.serial) + ':' + item.role, versions: new Map() }; entry.versions.set(signature, entry.id); this.nodeIDs.set(item.node, entry); }
      if (!virtual) return entry.id;
      this.unstable = true;
      if (!entry.versions.has(signature)) entry.versions.set(signature, entry.id + ':' + E.hash(signature));
      return entry.versions.get(signature);
    }
    add(batch, { virtual = false, replace = false } = {}) {
      const visible = batch.filter(item => !item.placeholder).map(item => ({ item, id: this.key(item, virtual) }));
      if (replace) {
        const ids = new Set(visible.map(v => v.id));
        for (const [id, value] of this.items) if (!ids.has(id)) { this.items.delete(id); this.bytes -= value._bytes; this.revision++; }
      }
      if (virtual && this.lastBatch?.size && visible.length && !visible.some(v => this.lastBatch.has(v.id))) this.gaps = true;
      let previous = null, limited = false;
      const accepted = new Set();
      for (let i = 0; i < visible.length; i++) {
        const { item, id } = visible[i];
        const { node, row, stableID, placeholder, ...serializable } = item;
        let value = { id, ...serializable };
        let json = JSON.stringify(value);
        if (json.length * 2 > maxBytes) {
          limited = true;
          const text = item.markdown.replace(/data:image\/[^)\s]+/gi, '[image data omitted]').slice(0, 65536);
          const note = 'Message exceeded the capture limit.';
          value = { id, role: item.role, index: item.index, expectedTotal: item.expectedTotal, markdown: [text, note].filter(Boolean).join('\n\n'), html: `<pre>${E.escapeHTML(text)}</pre><p>${note}</p>`, links: [], images: [], attachments: [], artifacts: [], toolNotes: [], degraded: true };
          json = JSON.stringify(value);
        }
        const size = json.length * 2, digest = E.hash(json), old = this.items.get(id);
        if (!old || old._digest !== digest) {
          const newBytes = this.bytes + size - (old?._bytes || 0);
          if (newBytes > maxBytes || (!old && this.items.size >= 10000)) {
            limited = true;
            if (!old) continue;
          } else {
            this.bytes = newBytes; this.items.set(id, { ...value, _bytes: size, _digest: digest }); this.revision++;
          }
        }
        if (!replace && !this.ordered.has(id)) {
          const next = visible.slice(i + 1).find(v => this.ordered.has(v.id));
          const position = previous ? this.order.indexOf(previous) + 1 : next ? this.order.indexOf(next.id) : this.order.length;
          this.order.splice(position, 0, id); this.ordered.add(id);
        }
        accepted.add(id);
        previous = id;
      }
      if (replace) {
        const order = [...accepted];
        if (order.length !== this.order.length || order.some((id, i) => id !== this.order[i])) this.revision++;
        this.order = order; this.ordered = accepted;
      }
      this.lastBatch = accepted;
      return limited;
    }
    beginScan() { this.order = []; this.ordered.clear(); this.lastBatch = null; this.gaps = false; }
    values() {
      let items = [...this.order, ...[...this.items.keys()].filter(id => !this.ordered.has(id))].map(id => this.items.get(id)).filter(Boolean);
      if (items.length && items.every(m => Number.isFinite(m.index))) items.sort((a, b) => a.index - b.index);
      return items.map(({ _bytes, _digest, ...item }) => item);
    }
    fingerprint() { return this.revision + ':' + this.items.size; }
  };
  const contentWarning = messages => messages.some(m => m.degraded) ? 'Some message elements could not be fully converted. Available content was kept.' : null;
  E.virtualTranscript = doc => !!doc.querySelector('[data-plane-row],.ds-virtual-list,[data-testid="transcript-spacer"],.virtual-list-spacer');
  E.transcriptBusy = (doc, sc) => E.generating(doc) || sc.getAttribute('aria-busy') === 'true' || [...sc.querySelectorAll('[aria-busy="true"],[role="progressbar"],mat-progress-spinner,[data-testid="loading-messages"]')].some(el => !el.closest('[data-chat-export-ui]') && !el.hidden && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length);
  E.makeArchive = (doc, provider, messages, capture) => ({
    schema: 'conversation-export/v1', provider: { id: provider.id, name: provider.name },
    title: (doc.querySelector('[data-testid="chat-title-split"],a.mdc-list-item--activated .title-text')?.textContent.trim() || doc.title || messages.find(m => m.role === 'user')?.markdown.split('\n')[0] || `${provider.name} conversation`).slice(0, 200),
    sourceURL: doc.URL, exportedAt: new Date().toISOString(),
    capture: { status: 'visible-only', strategy: 'loaded-dom', topConfirmed: false, bottomConfirmed: false, expectedTotal: null, warnings: [], elapsedMs: 0, note: 'Rendered DOM only. Settled edges do not prove server-side completeness; collapsed or inaccessible content may be absent.', ...capture }, messages
  });
  E.loadedArchive = ({ doc = document, provider, settings, store = new E.MessageStore(), retain = false }) => {
    const batch = E.read(doc, provider, settings), virtual = E.virtualTranscript(doc);
    const limited = store.add(batch, { virtual, replace: !virtual && !retain });
    const messages = store.values(), warnings = [];
    const total = batch.reduce((max, m) => Math.max(max, m.expectedTotal || 0), 0) || null;
    const placeholders = batch.filter(m => m.placeholder).length;
    if (placeholders) warnings.push(`${placeholders} messages had no rendered content.`);
    if (total && total !== messages.length) warnings.push(`The page reports ${total} messages; ${messages.length} were collected.`);
    if (limited) warnings.push(limitWarning);
    const conversion = contentWarning(messages); if (conversion) warnings.push(conversion);
    const complete = !warnings.length && E.reportedComplete(batch) && !E.transcriptBusy(doc, E.scroller(doc, provider, batch));
    return E.makeArchive(doc, provider, messages, { warnings, expectedTotal: total, status: complete ? 'reported-total' : warnings.length ? 'partial' : 'visible-only', strategy: complete ? 'reported-total' : 'loaded-dom' });
  };
  // A known total is useful only with every index present, not just an equal count.
  E.reportedComplete = batch => {
    const total = batch.reduce((max, m) => Math.max(max, m.expectedTotal || 0), 0);
    if (!total || batch.length !== total || batch.some(m => m.placeholder || !Number.isInteger(m.index))) return false;
    const indices = new Set(batch.map(m => m.index));
    return indices.size === total && [...indices].every(i => i >= 0 && i < total);
  };
  E.capture = async function ({ doc = document, provider, settings, signal, progress = () => {}, store = new E.MessageStore() }) {
    const warnings = new Set(), unresolved = new Set(), sourceURL = doc.URL, started = Date.now(), deadline = started + settings.maxSeconds * 1000;
    let status = 'observed-edges', strategy = 'retained-dom', topConfirmed = false, bottomConfirmed = false, expectedTotal = null, virtual = E.virtualTranscript(doc), sc, original = 0, originalBehavior = '', steps = 0, wasAtBottom = false, anchor = null;
    const check = () => {
      if (signal?.aborted) throw new Error('Capture cancelled.');
      if (doc.URL !== sourceURL) throw new Error('Conversation changed.');
      if (sc && !sc.isConnected) throw new Error('The conversation view changed; try again.');
      if (Date.now() > deadline) throw new Error('Time limit reached; capture is partial.');
      if (doc.visibilityState === 'hidden') throw new Error('Chat tab is hidden; capture is partial. Keep it selected while loading history.');
    };
    const read = () => {
      const batch = E.read(doc, provider, settings);
      const numeric = batch.every(m => Number.isFinite(m.index));
      if (numeric) batch.sort((a, b) => a.index - b.index);
      for (const item of batch) {
        if (item.expectedTotal) expectedTotal = Math.max(expectedTotal || 0, item.expectedTotal);
        const key = item.stableID || item.node;
        if (item.placeholder) unresolved.add(key); else unresolved.delete(key);
      }
      return batch;
    };
    const describe = batch => batch.map(item => ({ id: store.key(item, virtual), digest: E.hash(JSON.stringify([item.markdown, item.html, item.links, item.images, item.attachments, item.artifacts, item.toolNotes, item.degraded])), placeholder: item.placeholder }));
    const retain = batch => { if (store.add(batch, { virtual })) throw new Error(limitWarning); };
    const signature = batch => E.hash(JSON.stringify(describe(batch)));
    const retained = (before, after) => { const map = new Map(after.map(m => [m.id, m])); return before.length > 0 && before.every(m => !m.placeholder && map.get(m.id)?.digest === m.digest); };
    const wait = async (boundary = false) => {
      // Boundaries receive a longer quiet window for delayed older-page loads.
      // Ordinary virtual viewports advance as soon as rendering actually settles.
      const minimum = boundary ? Math.max(650, settings.waitMs) : 110;
      const maximum = boundary ? Math.max(minimum * 2, 1500) : Math.max(300, settings.waitMs);
      const t = Date.now(); let changed = t;
      const Observer = doc.defaultView.MutationObserver;
      const observer = new Observer(() => { changed = Date.now(); }); observer.observe(sc, { childList: true, subtree: true, characterData: true, attributes: true });
      try {
        do { check(); await E.sleep(35); } while (Date.now() - t < minimum || (Date.now() - changed < (boundary ? minimum : 85) && Date.now() - t < maximum) || E.transcriptBusy(doc, sc));
        check();
      } finally { observer.disconnect(); }
    };
    const edge = async direction => {
      let previous = null, stable = 0;
      for (let round = 0; round < 60; round++) {
        check(); sc.scrollTop = direction === 'top' ? 0 : sc.scrollHeight;
        await wait(true); const batch = read();
        // An unmarked renderer can recycle a DOM node as well as unmount it.
        if (!virtual && batch.some(item => !item.stableID && store.items.get(store.key(item, false))?.markdown !== undefined && store.items.get(store.key(item, false)).markdown !== item.markdown)) virtual = true;
        // Top seeking can retain snapshots without deciding their final order.
        retain(batch);
        const here = direction === 'top' ? sc.scrollTop <= 2 : sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 3;
        const current = sc.scrollHeight + ':' + signature(batch);
        progress({ phase: direction === 'top' ? 'Checking beginning' : 'Checking end', count: store.items.size });
        stable = here && current === previous && !E.transcriptBusy(doc, sc) ? stable + 1 : 0;
        if (stable >= 2) return batch;
        previous = current;
      }
      return null;
    };
    const viewportReady = batch => {
      if (!virtual) return true;
      const bounds = sc === doc.scrollingElement ? { top: 0, bottom: doc.defaultView.innerHeight } : sc.getBoundingClientRect();
      const target = Math.min(bounds.bottom, bounds.top + sc.clientHeight) - Math.min(55, sc.clientHeight * .14);
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 3 && batch.length && !batch.some(m => m.placeholder)) return batch.some(m => { const r = m.row.getBoundingClientRect(); return r.bottom > bounds.top && r.top < bounds.bottom; });
      return batch.some(m => { if (m.placeholder || batch.some(other => other.row === m.row && other.placeholder)) return false; const r = (m.row.getBoundingClientRect().height ? m.row : m.node).getBoundingClientRect(); return r.top < target && r.bottom >= target; });
    };
    try {
      check(); const initial = read();
      if (!initial.length) throw new Error('No messages found. Wait for the chat to render.');
      sc = E.scroller(doc, provider, initial); original = sc.scrollTop; originalBehavior = sc.style.scrollBehavior;
      const initialBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 3;
      wasAtBottom = initialBottom;
      const rootTop = sc === doc.scrollingElement ? 0 : sc.getBoundingClientRect().top;
      const firstVisible = initial.find(m => m.row.getBoundingClientRect().bottom > rootTop);
      if (firstVisible) anchor = { node: firstVisible.row, offset: firstVisible.row.getBoundingClientRect().top - rootTop };
      const initialDescription = describe(initial);
      retain(initial);
      if (!settings.scan) status = 'visible-only';
      else if (E.reportedComplete(initial) && !E.transcriptBusy(doc, sc)) { status = 'reported-total'; strategy = 'reported-total'; }
      else {
        sc.style.scrollBehavior = 'auto';
        const top = await edge('top'); topConfirmed = !!top;
        if (!top) warnings.add('The beginning did not settle; older messages may be missing.');
        let canSkip = !virtual && top && !top.some(m => m.placeholder) && retained(initialDescription, describe(top));
        if (canSkip && initialBottom) bottomConfirmed = true;
        else if (canSkip) {
          const topDescription = describe(top), bottom = await edge('bottom'); bottomConfirmed = !!bottom;
          canSkip = !!bottom && !bottom.some(m => m.placeholder) && retained(topDescription, describe(bottom));
        }
        if (!canSkip) {
          // Retaining only endpoint anchors is insufficient when middle rows unmount.
          virtual = true; strategy = 'virtual-scan';
          store.beginScan(); sc.scrollTop = 0; await wait();
          let previous = null, stable = 0, stalls = 0;
          for (let step = 0; step < 3000; step++) {
            check(); const batch = read();
            retain(batch);
            if (!viewportReady(batch)) { await wait(); if (++stalls >= 12) throw new Error('A message viewport did not render; capture is partial.'); continue; }
            stalls = 0;
            const bottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 3;
            const current = sc.scrollHeight + ':' + signature(batch);
            stable = bottom && current === previous && !E.transcriptBusy(doc, sc) ? stable + 1 : 0; previous = current;
            progress({ phase: 'Loading messages', count: store.items.size, percent: Math.min(100, Math.round((sc.scrollTop + sc.clientHeight) / Math.max(1, sc.scrollHeight) * 100)) });
            if (stable >= 2) { bottomConfirmed = true; break; }
            if (bottom) await wait(true);
            else {
              const bounds = sc === doc.scrollingElement ? { top: 0 } : sc.getBoundingClientRect();
              // A fully captured tall row need not be visited in small increments.
              const extent = batch.filter(m => !m.placeholder && !batch.some(other => other.row === m.row && other.placeholder)).map(m => m.row.getBoundingClientRect()).filter(r => r.top < bounds.top + sc.clientHeight && r.bottom > bounds.top + sc.clientHeight * .2).reduce((max, r) => Math.max(max, r.bottom - bounds.top - sc.clientHeight * .2), 0);
              sc.scrollTop += Math.max(80, sc.clientHeight * .8, extent); steps++; await wait();
            }
          }
        }
        if (!bottomConfirmed) warnings.add('The end did not settle; capture is partial.');
      }
    } catch (error) {
      status = 'partial'; warnings.add(error.message);
      if (doc.URL === sourceURL && sc) { try { retain(read()); } catch { /* Keep the existing capture. */ } }
    } finally {
      if (sc) {
        if (doc.URL === sourceURL) {
          sc.scrollTop = wasAtBottom ? sc.scrollHeight : original;
          await E.sleep(70);
          if (!wasAtBottom && !virtual && anchor?.node.isConnected) sc.scrollTop += anchor.node.getBoundingClientRect().top - (sc === doc.scrollingElement ? 0 : sc.getBoundingClientRect().top) - anchor.offset;
        }
        sc.style.scrollBehavior = originalBehavior;
      }
    }
    if (doc.URL !== sourceURL) throw new Error('Conversation changed. The capture was discarded.');
    if (store.unstable) warnings.add('Virtualized messages lack stable IDs; duplicates or omissions are possible.');
    if (store.gaps) warnings.add('Some viewports did not overlap; inspect message ordering and completeness.');
    if (unresolved.size) warnings.add(`${unresolved.size} placeholders had no rendered content.`);
    if (E.generating(doc)) warnings.add('The last response is still generating.');
    if (expectedTotal && store.items.size !== expectedTotal) warnings.add(`The page reports ${expectedTotal} messages; ${store.items.size} were collected.`);
    const indexed = store.values();
    const conversion = contentWarning(indexed); if (conversion) warnings.add(conversion);
    if (expectedTotal && indexed.length && indexed.every(m => Number.isInteger(m.index))) {
      const indices = new Set(indexed.map(m => m.index));
      if (indices.size !== expectedTotal || [...indices].some(index => index < 0 || index >= expectedTotal)) warnings.add('Message indices do not cover the reported history.');
    }
    if ((status === 'observed-edges' && (!topConfirmed || !bottomConfirmed)) || warnings.size) status = 'partial';
    if (!indexed.length) throw new Error([...warnings].join(' ') || 'No message content found.');
    return E.makeArchive(doc, provider, indexed, { status, strategy, topConfirmed, bottomConfirmed, expectedTotal, warnings: [...warnings], elapsedMs: Date.now() - started, scrollSteps: steps });
  };
})(globalThis);
