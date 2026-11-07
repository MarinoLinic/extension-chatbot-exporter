const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { browser, setup } = require('./helpers.cjs');
let chrome;
before(async () => { chrome = await browser(); });
after(async () => { await chrome?.close(); });

test('ChatGPT keeps distinct prompts that reuse a search key and reports empty responses', async () => {
  const page = await setup(chrome, `
    <div data-chatgpt-search-message-ids="first"><div data-content-search-unit-key="shared"><div data-user-message-bubble>First prompt</div></div></div>
    <div data-chatgpt-selection-message-id="reply"><div data-markdown-text-style="assistant-message"></div></div>
    <div data-chatgpt-search-message-ids="second"><div data-content-search-unit-key="shared"><div data-user-message-bubble>Second prompt</div></div></div>`,
    'https://chatgpt.com/c/branch');
  const archive = await page.evaluate(() => ChatExport.loadedArchive({ provider: ChatExport.provider(location.href) }));
  assert.deepEqual(archive.messages.map(message => message.markdown), ['First prompt', 'Second prompt']);
  assert.equal(archive.capture.status, 'partial');
  assert.match(archive.capture.warnings.join(' '), /no rendered content/);
  await page.close();
});

test('Gemini and AI Studio share safe conversion of code output and preview controls', async () => {
  const body = '<code-block><pre><code class="language-python">print(2)</code></pre><pre><code class="code-result-container">2</code></pre></code-block><immersive-entry-chip><button aria-label="Open sample">Open</button></immersive-entry-chip>';
  for (const [url, html] of [
    ['https://gemini.google.com/app/test', `<model-response>${body}</model-response>`],
    ['https://aistudio.google.com/prompts/test', `<ms-chat-turn><div class="turn-content">${body}</div></ms-chat-turn>`]
  ]) {
    const page = await setup(chrome, html, url);
    const archive = await page.evaluate(() => ChatExport.loadedArchive({ provider: ChatExport.provider(location.href) }));
    assert.match(archive.messages[0].markdown, /python\nprint\(2\)[\s\S]*Code output[\s\S]*\n2\n/);
    assert.equal(archive.messages[0].artifacts[0].title, 'Open sample');
    assert.equal(archive.capture.status, 'partial');
    await page.close();
  }
});

test('an oversized table preserves readable text and a renderer error falls back to a text file', async () => {
  const cells = '<td rowspan="100" colspan="100">Cell text</td>'.repeat(11);
  const page = await setup(chrome, `<model-response><p>Before the table</p><table><tr>${cells}</tr></table><p>After the table</p><button>Ignore this control</button></model-response>`);
  const { archive, output } = await page.evaluate(() => {
    const archive = ChatExport.loadedArchive({ provider: ChatExport.provider(location.href) });
    ChatExport.reader = () => { throw new Error('Synthetic renderer failure'); };
    return { archive, output: ChatExport.formatAvailable(archive, 'html') };
  });
  assert.equal(archive.capture.status, 'partial');
  assert.match(output.filename, /\.txt$/);
  assert.match(output.content, /Before the table[\s\S]*Cell text[\s\S]*After the table/);
  assert.doesNotMatch(output.content, /Ignore this control/);
  assert.match(output.content, /exported as text/);
  await page.close();
});

test('SVG charts preserve geometry, labels and colors in encoded images, base64 images and inline markup', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" style="color:rgb(13,13,13)"><path d="M10 90 L90 10 L190 60" fill="none" stroke="#0d9488"/><text x="10" y="95">Start</text><text x="150" y="95">End</text></svg>';
  const page = await setup(chrome, `<model-response><img data-d-component="svg" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">${svg}</model-response>`);
  const result = await page.evaluate(() => {
    const archive = ChatExport.loadedArchive({ provider: ChatExport.provider(location.href) });
    return { archive, html: ChatExport.format(archive, 'html').content };
  });
  const message = result.archive.messages[0];
  assert.equal((message.html.match(/class="chart"/g) || []).length, 3);
  assert.equal(message.images.length, 1, 'Identical encoded charts share one download resource');
  assert.equal(message.images[0].mime, 'image/svg+xml');
  assert.match(message.markdown, /Start.*End/);
  assert.match(message.html, /stroke="#0d9488"/);
  assert.match(message.html, /color:rgb\(13,13,13\)/);
  assert.equal(result.archive.capture.warnings.length, 0);
  await page.setContent(result.html);
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.locator('.chart svg').first().boundingBox();
    assert.ok(geometry.width > 150 && geometry.height > 70);
    assert.ok(geometry.x >= 0 && geometry.x + geometry.width <= width);
  }
  await page.close();
});

test('SVG charts remove executable content and external resources and warn when conversion loses content', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" onload="globalThis.chartExecuted=true"><script>globalThis.chartExecuted=true</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">Unsafe app</div></foreignObject><image href="https://external.example/tracker.png"/><rect width="100" height="50" fill="url(https://external.example/style)" style="stroke:url(https://external.example/stroke)"/><text x="10" y="30">Retained label</text></svg>';
  const page = await setup(chrome, `<model-response><img src="data:image/svg+xml,${encodeURIComponent(svg)}"></model-response>`);
  const { archive, html } = await page.evaluate(() => {
    const archive = ChatExport.loadedArchive({ provider: ChatExport.provider(location.href) });
    return { archive, html: ChatExport.format(archive, 'html').content };
  });
  const source = decodeURIComponent(archive.messages[0].images[0].url.split(',').slice(1).join(','));
  assert.doesNotMatch(source, /script|onload|foreignObject|<image|external\.example|Unsafe app/);
  assert.match(source, /Retained label/);
  assert.equal(archive.capture.status, 'partial');
  await page.setContent(html);
  assert.equal(await page.evaluate(() => globalThis.chartExecuted), undefined);
  await page.close();
});

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
  assert.match(await page.locator('.selection').textContent(), /2 \/ 3/);
  await page.getByLabel('Select user message 1').uncheck();
  await page.getByRole('button', { name: 'Export settings', exact: true }).click();
  const panelBounds = await page.locator('.ce').boundingBox();
  const exportBounds = await page.getByRole('button', { name: 'Export selected', exact: true }).boundingBox();
  assert.ok(exportBounds.y + exportBounds.height <= panelBounds.y + panelBounds.height, 'Export action stays inside the panel while settings are open');
  await page.getByText('Show the export button on chatbot pages', { exact: true }).click();
  await page.getByRole('button', { name: '← Messages', exact: true }).click();
  await page.getByRole('button', { name: 'Export selected', exact: true }).click();
  const commands = await page.evaluate(() => commands);
  assert.deepEqual(commands.find(c => c.type === 'ce:export').ids, ['u2']);
  assert.equal(commands.filter(c => c.type === 'ce:settings').at(-1).settings.pageButton, false);
  await page.close();
});

test('numbered headings retain punctuation, message sections contain body headings, and code is untouched', async () => {
  const page = await setup(chrome, '<article><h2>1. NES / SNES</h2><h3><strong>2. Native ports</strong></h3><p>1. Literal numbered prose</p><pre><code># Literal code heading\n## Also code\n\n\nvalue = "**literal**";</code></pre></article>');
  const result = await page.evaluate(() => {
    const converted = ChatExport.convert(document.querySelector('article'));
    const a = { title: 'A / B *literal*', provider: { id: 'gemini', name: 'Gemini' }, sourceURL: location.href, exportedAt: '2026-10-12T10:03:36.991Z', capture: { status: 'observed-edges', note: 'DOM only', warnings: [] }, messages: [{ id: 'a', role: 'assistant', ...converted, attachments: [], toolNotes: [] }] };
    return { converted, md: ChatExport.format(a, 'md'), txt: ChatExport.format(a, 'txt'), html: ChatExport.format(a, 'html') };
  });
  assert.match(result.converted.markdown, /^## 1\. NES \/ SNES/m);
  assert.doesNotMatch(result.converted.markdown, /\\[12]\./);
  assert.match(result.converted.markdown, /1\\\. Literal numbered prose/);
  assert.match(result.md.content, /^## 1\. Gemini/m);
  assert.match(result.md.content, /^### 1\. NES \/ SNES/m);
  assert.match(result.md.content, /^#### \*\*2\. Native ports\*\*/m);
  assert.match(result.md.content, /```\n# Literal code heading\n## Also code\n\n\nvalue = "\*\*literal\*\*";\n```/);
  assert.match(result.txt.content, /# Literal code heading\n## Also code\n\n\nvalue = "\*\*literal\*\*";/);
  assert.match(result.txt.content, /1\. Literal numbered prose/);
  assert.match(result.txt.content, /^A \/ B \*literal\*$/m);
  assert.match(result.html.content, /<h2>Gemini<\/h2>/); assert.match(result.html.content, /<h3>1\. NES \/ SNES<\/h3>/);
  assert.equal(result.md.filename, '2026-10-12 - Gemini - A - B literal.md');
  await page.close();
});

test('heading normalization skips longer fences, list code fences and display math', async () => {
  const page = await setup(chrome, '<main></main>');
  const result = await page.evaluate(() => {
    const body = ['## Section', '#### Detail', '````md', '# code', '```', '## still code', '````', '- ```md', '    # nested code', '    ```', '$$', '# math content', '$$', '### Next'].join('\n');
    return ChatExport.nestMarkdownHeadings(body);
  });
  assert.match(result, /^### Section/m); assert.match(result, /^##### Detail/m); assert.match(result, /^#### Next/m);
  assert.match(result, /````md\n# code\n```\n## still code\n````/); assert.match(result, /    # nested code/); assert.match(result, /\$\$\n# math content\n\$\$/);
  await page.close();
});

test('filenames preserve word boundaries and branch names while rejecting Windows path characters', async () => {
  const page = await setup(chrome, '<main></main>');
  const result = await page.evaluate(() => ['Branch • Nintendo Game Decompilations and Ports', 'NES/SNES: Ports | Builds', 'CON', '../ ?<> ', 'A'.repeat(100)].map(ChatExport.filename));
  assert.equal(result[0], 'Branch - Nintendo Game Decompilations and Ports'); assert.equal(result[1], 'NES - SNES - Ports - Builds'); assert.equal(result[2], 'Conversation - CON'); assert.equal(result[3], 'Conversation'); assert.equal(result[4].length, 90);
  await page.close();
});
