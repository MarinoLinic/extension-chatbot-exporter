const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { browser, setup } = require('./helpers.cjs');
let chrome;
before(async () => { chrome = await browser(); });
after(async () => { await chrome?.close(); });

test('semantic export preserves prose around math, deep code fences, tables, links and nested lists', async () => {
  const page = await setup(chrome, `<article><p>Before <span class="katex"><math><annotation encoding="application/x-tex">x^2 + y^2</annotation></math><span aria-hidden="true">duplicate visual</span></span> after.</p><div class="math-block" data-math="E=mc^2"></div><pre><code class="language-js">const s = '\x60\x60\x60\x60';\n\n\n  let x = 1;</code></pre><ol start="3"><li>First<ul><li>Nested</li></ul></li><li value="7">Later</li></ol><table><tr><th colspan="2">A | B</th></tr><tr><td rowspan="2">1</td><td>2</td></tr><tr><td><a href="/source?q=(x)">Source</a></td></tr></table><a href="javascript:alert(1)">Unsafe</a><img src="https://images.example/a.png" alt="Sketch"><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"> </iframe></article>`);
  const r = await page.evaluate(() => ChatExport.convert(document.querySelector('article')));
  assert.match(r.markdown, /Before \$x\^2 \+ y\^2\$ after/);
  assert.match(r.markdown, /\$\$\nE=mc\^2\n\$\$/);
  assert.match(r.markdown, /`````js/); assert.match(r.markdown, /\n\n\n  let x/);
  assert.match(r.markdown, /3\. First/); assert.match(r.markdown, /    - Nested/); assert.match(r.markdown, /7\. Later/);
  assert.match(r.markdown, /A \\\| B/); assert.match(r.html, /rowspan="2"/);
  assert.equal(r.images.length, 1); assert.equal(r.links.length, 1);
  assert.doesNotMatch(r.html, /<script|<iframe|<img|javascript:/); assert.match(r.html, /&lt;script&gt;/);
  await page.close();
});

test('repeated prompts survive, revisited stable IDs update instead of duplicating, and numeric rows sort', async () => {
  const page = await setup(chrome, '<main></main>');
  const r = await page.evaluate(() => {
    const store = new ChatExport.MessageStore();
    const item = (id, index, markdown) => ({ node: document.createElement('div'), row: null, stableID: id, index, role: 'user', markdown, html: '', links: [], images: [], attachments: [], artifacts: [], toolNotes: [], expectedTotal: null });
    store.add([item('three', 3, 'same'), item('four', 4, 'same')]);
    store.add([item('one', 1, 'same'), item('two', 2, 'same'), item('three', 3, 'corrected shorter')]);
    return store.values();
  });
  assert.deepEqual(r.map(m => m.id), ['one', 'two', 'three', 'four']); assert.equal(r.length, 4); assert.equal(r[2].markdown, 'corrected shorter');
  await page.close();
});

test('Gemini public-share response containers are captured with their user query', async () => {
  const page = await setup(chrome, '<share-turn-viewer><user-query><div class="query-text">Shared question</div></user-query><response-container><structured-content-container><p>Shared answer</p></structured-content-container></response-container></share-turn-viewer>', 'https://gemini.google.com/share/test');
  const result = await page.evaluate(() => ChatExport.read(document, ChatExport.provider(location.href)).map(m => ({ role: m.role, markdown: m.markdown })));
  assert.deepEqual(result, [{ role: 'user', markdown: 'Shared question' }, { role: 'assistant', markdown: 'Shared answer' }]);
  await page.close();
});

test('Gemini resources belong to their message and generated images inside buttons survive', async () => {
  const page = await setup(chrome, `<div class="conversation-container" id="turn"><user-query><user-query-file-preview><span class="filename-label">notes.txt</span></user-query-file-preview><div class="file-preview-container"></div><div class="query-text">Question</div></user-query><model-response><model-response-content><p>Answer <source-inline-chip><span class="source-title">Research</span><button id="source">Open</button></source-inline-chip></p><generated-image><button><img src="https://images.example/drawing.png" alt="Drawing"></button></generated-image></model-response-content></model-response></div>`);
  const r = await page.evaluate(() => {
    document.getElementById('source').setAttribute('jslog', 'BardVeMetadataKey:' + btoa(JSON.stringify([['https://research.example/paper']])));
    return ChatExport.read(document, ChatExport.provider(location.href));
  });
  assert.equal(r[0].attachments.length, 1); assert.equal(r[1].attachments.length, 0); assert.equal(r[0].images.length, 0); assert.equal(r[1].images.length, 1);
  assert.equal(r[0].links.length, 0); assert.equal(r[1].links[0].url, 'https://research.example/paper');
  assert.match(r[1].markdown, /Drawing/);
  await page.close();
});

test('bounded top-to-bottom scan harvests virtual rows and restores scroll position', async () => {
  const page = await setup(chrome, `<div data-testid="chat-transcript-scroller" style="height:220px;overflow:auto"><div id="plane" style="height:2200px;position:relative"></div></div>`, 'https://grok.com/c/test');
  const result = await page.evaluate(async () => {
    const sc = document.querySelector('[data-testid="chat-transcript-scroller"]'), plane = document.getElementById('plane');
    function draw() {
      plane.replaceChildren();
      const start = Math.max(0, Math.floor(sc.scrollTop / 110) - 1), end = Math.min(20, Math.ceil((sc.scrollTop + 220) / 110) + 1);
      for (let i = start; i < end; i++) { const row = document.createElement('div'); row.dataset.planeRow = 'row-' + i; row.style.cssText = `position:absolute;top:${i * 110}px;height:110px`;
        const body = document.createElement('div'); body.dataset.testid = i % 2 ? 'assistant-message' : 'user-message'; body.textContent = 'Message ' + i; row.append(body); plane.append(row); }
    }
    sc.addEventListener('scroll', draw); sc.scrollTop = 1100; draw();
    const archive = await ChatExport.capture({ provider: ChatExport.provider(location.href), settings: ChatExport.settings({ waitMs: 300, maxSeconds: 30 }) });
    return { messages: archive.messages.map(m => m.markdown), capture: archive.capture, restored: sc.scrollTop };
  });
  assert.equal(result.messages.length, 20); assert.deepEqual(result.messages, Array.from({ length: 20 }, (_, i) => 'Message ' + i));
  assert.equal(result.restored, 1100); assert.equal(result.capture.status, 'observed-edges'); assert.equal(result.capture.topConfirmed, true); assert.equal(result.capture.bottomConfirmed, true);
  await page.close();
});

test('cancellation retains partial messages and never claims settled edges', async () => {
  const page = await setup(chrome, '<div id="chat-history" style="height:200px;overflow:auto"><div style="height:2000px"><div class="conversation-container" id="t"><user-query><div class="query-text">Hello</div></user-query><model-response><p>Reply</p></model-response></div></div></div>');
  const r = await page.evaluate(async () => { const controller = new AbortController(); setTimeout(() => controller.abort(), 350); return ChatExport.capture({ provider: ChatExport.provider(location.href), settings: ChatExport.settings({ waitMs: 300 }), signal: controller.signal }); });
  assert.equal(r.capture.status, 'partial'); assert.equal(r.messages.length, 2); assert.match(r.capture.warnings.join(' '), /cancelled/); assert.equal(r.capture.bottomConfirmed, false);
  await page.close();
});

test('route change discards capture, and unrelated X pages are rejected', async () => {
  const page = await setup(chrome, '<div class="conversation-container"><user-query><p>Hello</p></user-query></div>');
  const result = await page.evaluate(async () => { setTimeout(() => history.pushState(null, '', '/app/other'), 350); try { await ChatExport.capture({ provider: ChatExport.provider(location.href), settings: ChatExport.settings({ waitMs: 300 }) }); return 'bad'; } catch (e) { return e.message; } });
  assert.match(result, /discarded/);
  assert.equal(await page.evaluate(() => ChatExport.provider('https://x.com/home')), null);
  await page.close();
});

test('all formats respect selection, HTML is inert, CSV neutralizes formulas, and filenames are safe', async () => {
  const page = await setup(chrome, '<article><p>=HYPERLINK("evil")</p><img src="https://image.example/a.png"><script>document.title="bad"</script><a href="https://source.example">Source</a></article>');
  const result = await page.evaluate(() => {
    const converted = ChatExport.convert(document.querySelector('article'));
    const m = { id: 'one', role: 'user', ...converted, attachments: [], toolNotes: [] };
    const a = { title: '../Bad:<title>', provider: { id: 'gemini', name: 'Gemini' }, sourceURL: location.href, exportedAt: new Date().toISOString(), capture: { status: 'visible-only', note: 'DOM only', warnings: ['Partial capture'] }, messages: [m, { ...m, id: 'two' }] };
    const selected = ChatExport.selectArchive(a, ['one']);
    return Object.fromEntries(['md', 'json', 'html', 'txt', 'csv'].map(type => [type, ChatExport.format(selected, type)]));
  });
  assert.equal(JSON.parse(result.json.content).messages.length, 1); assert.equal(JSON.parse(result.json.content).selection.captured, 2);
  assert.doesNotMatch(result.html.content, /<script|<img|<iframe|onclick=/); assert.match(result.html.content, /default-src 'none'/);
  assert.match(result.csv.content, /"'=HYPERLINK/); assert.match(result.md.content, /Partial capture/);
  for (const output of Object.values(result)) assert.doesNotMatch(output.filename, /[<>:"/\\|?*]/);
  await page.close();
});

test('UI selects roles and individual messages and persists popup-only mode', async () => {
  const page = await setup(chrome, '<main id="app"></main>');
  await page.evaluate(() => {
    window.commands = [];
    const state = { provider: 'Gemini', phase: 'Ready', token: 1, count: 3, settings: ChatExport.settings(), messages: [{ id: 'u1', role: 'user', number: 1, preview: 'First question' }, { id: 'a1', role: 'assistant', number: 2, preview: 'Reply' }, { id: 'u2', role: 'user', number: 3, preview: 'Next question' }] };
    ChatExport.mountUI(document.getElementById('app'), async command => { commands.push(command); return state; });
  });
  await page.getByRole('button', { name: 'Human', exact: true }).click();
  assert.match(await page.locator('.selection').textContent(), /2 of 3/);
  await page.getByLabel('Select user message 1').uncheck();
  await page.getByText('Export settings', { exact: true }).click();
  await page.getByText('Show the export button on chatbot pages', { exact: true }).click();
  await page.getByRole('button', { name: 'Export selected', exact: true }).click();
  const commands = await page.evaluate(() => commands);
  assert.deepEqual(commands.find(c => c.type === 'ce:export').ids, ['u2']);
  assert.equal(commands.filter(c => c.type === 'ce:settings').at(-1).settings.pageButton, false);
  await page.close();
});
