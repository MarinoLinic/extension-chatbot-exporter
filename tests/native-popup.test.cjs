const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fs, path, root } = require('./helpers.cjs');

async function attachPopup(context, worker) {
  const cdp = await context.browser().newBrowserCDPSession();
  await worker.evaluate(() => chrome.action.openPopup());
  let target;
  for (let i = 0; i < 30; i++) {
    target = (await cdp.send('Target.getTargets')).targetInfos.find(t => t.url.endsWith('/src/popup.html'));
    if (target) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(target, 'Chrome created its native action popup');
  // Native action popups are CDP targets, but Playwright does not expose them as Pages.
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let id = 0;
  const pending = new Map();
  cdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message), call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id); clearTimeout(call.timer);
    if (message.error) call.reject(new Error(message.error.message)); else call.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const number = ++id;
    const timer = setTimeout(() => { pending.delete(number); reject(new Error('Native popup CDP timeout: ' + method)); }, 10000);
    pending.set(number, { resolve, reject, timer });
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: number, method, params }) }).catch(error => {
      clearTimeout(timer); pending.delete(number); reject(error);
    });
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, evaluate };
}

test('native Chrome toolbar popup: immediate selection, large list, one-click history check and cached export', { timeout: 60000 }, async () => {
  const executablePath = process.env.CE_CHROMIUM_PATH || chromium.executablePath();
  const work = path.join(root, '.local/qa/native-' + Date.now());
  fs.mkdirSync(work, { recursive: true });
  const context = await chromium.launchPersistentContext(path.join(work, 'profile'), {
    executablePath, channel: 'chromium', headless: true, acceptDownloads: true, downloadsPath: path.join(work, 'downloads'),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const source = await context.newPage(), url = 'https://gemini.google.com/app/native-test';
    const body = '<title>Native toolbar test</title><div id="chat-history" style="height:220px;overflow:auto">' + Array.from({ length: 9 }, (_, i) => `<div class="conversation-container" id="t-${i}" style="height:100px"><user-query><div class="query-text">Question ${i}: ${'Long preview. '.repeat(18)}</div></user-query><model-response><model-response-content><p>Answer ${i}: ${'Response preview. '.repeat(18)}</p></model-response-content></model-response></div>`).join('') + '</div>';
    await context.route('**/*', route => route.request().url() === url ? route.fulfill({ contentType: 'text/html', body }) : route.request().url().startsWith('chrome-extension:') ? route.continue() : route.abort());
    await source.goto(url); await source.bringToFront();
    await source.locator('[data-chat-export-ui="button"]').waitFor();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    await worker.evaluate(async tabId => chrome.tabs.sendMessage(tabId, { type: 'ce:settings', settings: { scan: true, saveAs: false } }), tabId);
    const popup = await attachPopup(context, worker);
    for (let i = 0; i < 30; i++) {
      if (await popup.evaluate('document.querySelectorAll(".item").length===18')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const metrics = await popup.evaluate(`(() => {
      const list = document.querySelector('.list').getBoundingClientRect(), preview = document.querySelector('.preview');
      const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Export selected').getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, listHeight: list.height, buttonBottom: button.bottom,
        count: document.querySelector('.selection').textContent, footer: !!document.querySelector('.footer'),
        previewHeight: preview.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(preview).lineHeight) };
    })()`);
    assert.equal(metrics.count, '18 / 18');
    assert.ok(metrics.height <= 600);
    assert.ok(metrics.listHeight >= metrics.height * .64, JSON.stringify(metrics));
    assert.ok(metrics.buttonBottom <= metrics.height);
    assert.equal(metrics.footer, false);
    assert.ok(metrics.previewHeight <= metrics.lineHeight * 2 + 1);
    const shot = await popup.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(work, 'toolbar-popup.png'), Buffer.from(shot.data, 'base64'));
    await source.evaluate(() => { window.scrollEvents = 0; document.getElementById('chat-history').addEventListener('scroll', () => scrollEvents++); });
    await popup.evaluate(`(() => {
      const select = document.querySelector('select'); select.value = 'json'; select.dispatchEvent(new Event('change', { bubbles: true }));
      [...document.querySelectorAll('button')].find(b => b.textContent === 'Export selected').click();
    })()`);
    async function completedDownloads(count) {
      for (let i = 0; i < 120; i++) {
        const files = await worker.evaluate(() => chrome.downloads.search({}));
        if (files.length >= count && files.every(f => f.state === 'complete')) return files;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Downloads did not complete');
    }
    let files = await completedDownloads(1);
    const archive = JSON.parse(fs.readFileSync(files[0].filename, 'utf8'));
    assert.equal(archive.messages.length, 18);
    assert.equal(archive.capture.strategy, 'retained-dom');
    assert.equal(archive.capture.scrollSteps, 0);
    const events = await source.evaluate(() => scrollEvents), started = Date.now();
    await popup.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Export selected').click()`);
    files = await completedDownloads(2);
    assert.equal(await source.evaluate(() => scrollEvents), events, 'Unchanged verified history is reused without scrolling');
    assert.ok(Date.now() - started < 1500, 'Cached export starts immediately');
    await popup.evaluate(`document.querySelector('[aria-label="Export settings"]').click()`);
    assert.equal(await popup.evaluate('document.querySelector(".settings-view").hidden'), false);
    const settingsShot = await popup.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(work, 'toolbar-settings.png'), Buffer.from(settingsShot.data, 'base64'));
    await source.evaluate(() => document.querySelector('user-query .query-text').textContent = 'Edited question');
    await popup.evaluate(`document.querySelector('[aria-label="Export settings"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 850));
    await popup.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Export selected').click()`);
    files = await completedDownloads(3);
    const edited = JSON.parse(fs.readFileSync(files.sort((a, b) => b.id - a.id)[0].filename, 'utf8'));
    assert.equal(edited.messages[0].markdown, 'Edited question');
    assert.ok(await source.evaluate(() => scrollEvents) > events, 'Editing invalidates history verification');
    await source.evaluate(() => document.getElementById('chat-history').setAttribute('aria-busy', 'true'));
    // Trigger through the content API to cover a click that races a newly busy page.
    const exportPromise = worker.evaluate(async tabId => chrome.tabs.sendMessage(tabId, { type: 'ce:export', selection: 'all', ids: [], format: 'json' }), tabId);
    await new Promise(resolve => setTimeout(resolve, 200));
    await worker.evaluate(async tabId => chrome.tabs.sendMessage(tabId, { type: 'ce:cancel' }), tabId);
    await exportPromise;
    assert.equal((await worker.evaluate(() => chrome.downloads.search({}))).length, 3, 'Cancelling verification starts no download');
    await source.evaluate(() => document.getElementById('chat-history').setAttribute('aria-busy', 'false'));
    console.log('Native toolbar metrics:', JSON.stringify(metrics), 'artifacts:', work);
  } finally { await context.close(); }
});
