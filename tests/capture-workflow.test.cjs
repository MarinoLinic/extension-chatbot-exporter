const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { browser, setup } = require('./helpers.cjs');
let chrome;
before(async () => { chrome = await browser(); });
after(async () => { await chrome?.close(); });
const turn = i => `<div class="conversation-container" id="t-${i}" style="height:100px"><user-query><div class="query-text">Question ${i}</div></user-query><model-response><model-response-content><p>Answer ${i}</p></model-response-content></model-response></div>`;

test('fully retained history uses endpoint checks without any downward scan', async () => {
  const page = await setup(chrome, `<div id="chat-history" style="height:220px;overflow:auto">${Array.from({ length: 40 }, (_, i) => turn(i)).join('')}</div>`);
  const result = await page.evaluate(async () => {
    const sc = document.getElementById('chat-history');
    sc.scrollTop = sc.scrollHeight;
    const original = sc.scrollTop;
    const archive = await ChatExport.capture({ provider: ChatExport.provider(location.href), settings: ChatExport.settings({ waitMs: 300, maxSeconds: 15 }) });
    return { capture: archive.capture, messages: archive.messages.map(m => m.markdown), original, restored: sc.scrollTop };
  });
  assert.equal(result.messages.length, 80);
  assert.equal(result.capture.strategy, 'retained-dom');
  assert.equal(result.capture.scrollSteps, 0);
  assert.equal(result.capture.status, 'observed-edges');
  assert.equal(result.restored, result.original);
  assert.ok(result.capture.elapsedMs < 3500, JSON.stringify(result.capture));
  console.log('Retained DOM benchmark:', result.capture.elapsedMs + ' ms, 80 messages, 0 scan steps');
  await page.close();
});

test('a complete reported total needs no scrolling and rejects duplicate indices', async () => {
  const html = `<div role="feed" style="height:180px;overflow:auto">${Array.from({ length: 6 }, (_, i) => `<div data-testid="transcript-row" data-index="${i}" style="height:80px"><div role="article" aria-label="Message ${i + 1} of 6"><div data-testid="${i % 2 ? 'assistant-message' : 'user-message'}"><p>Message ${i}</p></div></div></div>`).join('')}</div>`;
  const page = await setup(chrome, html, 'https://claude.ai/chat/count');
  const result = await page.evaluate(async () => {
    const sc = document.querySelector('[role=feed]');
    sc.scrollTop = sc.scrollHeight;
    const archive = await ChatExport.capture({ provider: ChatExport.provider(location.href), settings: ChatExport.settings() });
    document.querySelector('[data-index="5"]').setAttribute('data-index', '4');
    return { capture: archive.capture, count: archive.messages.length, invalid: ChatExport.reportedComplete(ChatExport.read(document, ChatExport.provider(location.href))) };
  });
  assert.equal(result.count, 6);
  assert.equal(result.capture.status, 'reported-total');
  assert.equal(result.capture.scrollSteps, 0);
  assert.equal(result.invalid, false);
  assert.ok(result.capture.elapsedMs < 500);
  await page.close();
});

test('delayed older-page loading is awaited and original bottom position is retained', async () => {
  const page = await setup(chrome, `<div id="chat-history" style="height:180px;overflow:auto">${[3, 4, 5].map(turn).join('')}</div>`);
  const result = await page.evaluate(async () => {
    const sc = document.getElementById('chat-history');
    sc.scrollTop = sc.scrollHeight;
    await new Promise(resolve => setTimeout(resolve, 40));
    let requested = false;
    sc.addEventListener('scroll', () => {
      if (sc.scrollTop !== 0 || requested) return;
      requested = true;
      sc.setAttribute('aria-busy', 'true');
      setTimeout(() => {
        for (let i = 2; i >= 0; i--) {
          const row = document.createElement('div');
          row.className = 'conversation-container'; row.id = 't-' + i; row.style.height = '100px';
          const query = document.createElement('user-query'); query.textContent = 'Question ' + i;
          const answer = document.createElement('model-response'); answer.textContent = 'Answer ' + i;
          row.append(query, answer); sc.prepend(row);
        }
        sc.setAttribute('aria-busy', 'false');
      }, 850);
    });
    const archive = await ChatExport.capture({ provider: ChatExport.provider(location.href), settings: ChatExport.settings({ waitMs: 300, maxSeconds: 15 }) });
    return { count: archive.messages.length, capture: archive.capture, atBottom: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 3 };
  });
  assert.equal(result.count, 12);
  assert.equal(result.capture.status, 'observed-edges');
  assert.equal(result.capture.scrollSteps, 0);
  assert.ok(result.atBottom);
  await page.close();
});

test('persistent endpoint anchors cannot hide virtualized middle messages', async () => {
  const page = await setup(chrome, '<div data-testid="chat-transcript-scroller" style="height:220px;overflow:auto"><div id="plane" style="position:relative;height:2750px"></div></div>', 'https://grok.com/c/anchors');
  const result = await page.evaluate(async () => {
    const sc = document.querySelector('[data-testid="chat-transcript-scroller"]'), plane = document.getElementById('plane');
    function draw() {
      plane.replaceChildren();
      const start = Math.max(0, Math.floor(sc.scrollTop / 110) - 1), end = Math.min(25, Math.ceil((sc.scrollTop + 220) / 110) + 1);
      const indices = [...new Set([0, ...Array.from({ length: end - start }, (_, i) => start + i), 24])].sort((a, b) => a - b);
      for (const i of indices) {
        const row = document.createElement('div'); row.dataset.planeRow = 'row-' + i;
        row.style.cssText = `position:absolute;top:${i * 110}px;height:110px`;
        const body = document.createElement('div'); body.dataset.testid = i % 2 ? 'assistant-message' : 'user-message'; body.textContent = 'Message ' + i;
        row.append(body); plane.append(row);
      }
    }
    let timer;
    sc.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(draw, 260); });
    sc.scrollTop = sc.scrollHeight; draw();
    await new Promise(resolve => setTimeout(resolve, 300));
    const archive = await ChatExport.capture({ provider: ChatExport.provider(location.href), settings: ChatExport.settings({ waitMs: 500, maxSeconds: 30 }) });
    return { messages: archive.messages.map(m => m.markdown), capture: archive.capture };
  });
  assert.deepEqual(result.messages, Array.from({ length: 25 }, (_, i) => 'Message ' + i));
  assert.equal(result.capture.strategy, 'virtual-scan');
  assert.equal(result.capture.status, 'observed-edges');
  assert.ok(result.capture.scrollSteps > 0);
  await page.close();
});

test('600px popup gives messages most of the space and keeps manual selection across updates', async () => {
  const page = await setup(chrome, '<style>body{margin:0}</style><main id="app"></main>');
  await page.setViewportSize({ width: 480, height: 600 });
  await page.evaluate(() => {
    window.commands = [];
    window.viewState = {
      provider: 'Gemini', providerID: 'gemini', phase: 'Ready', token: 1, revision: 1, count: 18, settings: ChatExport.settings(),
      messages: Array.from({ length: 18 }, (_, i) => ({ id: 'id-' + i, role: i % 2 ? 'assistant' : 'user', number: i + 1, preview: 'Preview ' + i + ' ' + 'A long line of message text. '.repeat(16) }))
    };
    ChatExport.mountUI(document.getElementById('app'), async command => { commands.push(command); return viewState; }, { popup: true });
  });
  await page.getByLabel('Select user message 1', { exact: true }).uncheck();
  await page.evaluate(() => { viewState.messages.push({ id: 'new', role: 'user', number: 19, preview: 'New message' }); viewState.revision++; });
  await page.waitForTimeout(850);
  assert.equal(await page.getByLabel('Select user message 1', { exact: true }).isChecked(), false);
  assert.equal(await page.getByLabel('Select user message 19', { exact: true }).isChecked(), false);
  const geometry = await page.evaluate(() => {
    const list = document.querySelector('.list').getBoundingClientRect(), preview = document.querySelector('.preview');
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Export selected').getBoundingClientRect();
    return { height: list.height, previewHeight: preview.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(preview).lineHeight), buttonBottom: button.bottom, text: document.body.textContent };
  });
  assert.ok(geometry.height >= 380, JSON.stringify(geometry));
  assert.ok(geometry.previewHeight <= geometry.lineHeight * 2 + 1);
  assert.ok(geometry.buttonBottom <= 600);
  assert.doesNotMatch(geometry.text, /Local only|No telemetry|Capture stays|Select messages\. Save a clean copy/);
  await page.getByRole('button', { name: 'Export selected', exact: true }).click();
  const command = await page.evaluate(() => commands.find(c => c.type === 'ce:export'));
  assert.equal(command.selection, 'custom');
  assert.ok(!command.ids.includes('id-0') && !command.ids.includes('new'));
  await page.getByRole('button', { name: 'Export settings', exact: true }).click();
  assert.equal(await page.locator('.list').isVisible(), false);
  await page.getByRole('button', { name: '← Messages', exact: true }).click();
  assert.equal(await page.locator('.list').isVisible(), true);
  await page.close();
});
