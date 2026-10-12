const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { root, path, fs } = require('./helpers.cjs');
const http = require('node:http');

test('real MV3 extension: content script, popup messaging, selected transcript download and optional images', { timeout: 60000 }, async () => {
  const executablePath = process.env.CE_CHROMIUM_PATH || chromium.executablePath();
  if (!fs.existsSync(executablePath)) throw new Error('Extension test needs bundled Chromium: run npx playwright install chromium or set CE_CHROMIUM_PATH.');
  const work = path.join(root, '.local', 'qa', 'run-' + Date.now()); fs.mkdirSync(work, { recursive: true });
  const imageServer = http.createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(fs.readFileSync(path.join(root, 'assets', 'icon-16.png'))); });
  await new Promise(resolve => imageServer.listen(0, '127.0.0.1', resolve));
  const context = await chromium.launchPersistentContext(path.join(work, 'profile'), {
    executablePath, headless: true, channel: 'chromium', acceptDownloads: true, downloadsPath: path.join(work, 'downloads'),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2], page = await context.newPage();
    const url = 'https://gemini.google.com/app/extension-test';
    const imageURL = `http://127.0.0.1:${imageServer.address().port}/sketch.png`;
    await context.route('**/*', async route => {
      if (route.request().url() === url) await route.fulfill({ contentType: 'text/html', body: `<title>Test conversation</title><div class="conversation-container" id="turn"><user-query><div class="query-text">Export only my question.</div></user-query><model-response><model-response-content><p>Answer with a <a href="https://example.test/source">source</a>.</p><button><img src="${imageURL}" alt="Sketch"></button></model-response-content></model-response></div>` });
      else if (route.request().url() === imageURL) await route.continue();
      else if (route.request().url().startsWith('chrome-extension:')) await route.continue();
      else await route.abort();
    });
    await page.goto(url); await page.bringToFront();
    await page.locator('[data-chat-export-ui="button"]').waitFor();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    const send = message => worker.evaluate(async ({ tabId, message }) => chrome.tabs.sendMessage(tabId, message), { tabId, message });
    await send({ type: 'ce:settings', settings: { scan: false, saveAs: false, pageButton: false } });
    assert.equal(await page.locator('[data-chat-export-ui="button"]').count(), 0);
    let state = await send({ type: 'ce:state' });
    assert.equal(state.messages.length, 2); assert.equal(state.warnings.length, 0);
    const response = await send({ type: 'ce:export', ids: [state.messages[0].id], format: 'json' });
    assert.ok(!response.error, response.error);
    let saved;
    for (let i = 0; i < 50; i++) {
      saved = (await worker.evaluate(async () => chrome.downloads.search({})))[0];
      if (saved?.state === 'complete') break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(saved?.state, 'complete', JSON.stringify(saved) || 'No browser download recorded');
    const exported = JSON.parse(fs.readFileSync(saved.filename, 'utf8'));
    assert.equal(exported.messages.length, 1); assert.equal(exported.messages[0].role, 'user'); assert.equal(exported.messages[0].markdown, 'Export only my question.');
    assert.equal(exported.capture.status, 'visible-only');
    // Popup page runs with real extension CSP and real runtime messaging.
    const popup = await context.newPage();
    // A test tab substitutes for the toolbar popup. Simulate its activeTab
    // metadata; keep the actual popup code, CSP, messaging and storage intact.
    await popup.addInitScript(({ tabId, url }) => { const query = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = async options => options.active ? [{ id: tabId, url }] : query(options); }, { tabId, url });
    await popup.goto(`chrome-extension://${id}/src/popup.html`);
    await popup.getByRole('button', { name: 'Human', exact: true }).click();
    assert.match(await popup.locator('.selection').textContent(), /1 \/ 2/);
    await popup.screenshot({ path: path.join(work, 'popup.png') });
    await popup.close(); await page.bringToFront();
    await send({ type: 'ce:settings', settings: { scan: false, saveAs: false, pageButton: true, downloadImages: true } });
    await send({ type: 'ce:export', ids: [state.messages[1].id], format: 'md' });
    let downloads;
    for (let i = 0; i < 40; i++) {
      downloads = await worker.evaluate(async () => chrome.downloads.search({}));
      if (downloads.length === 4 && downloads.every(d => d.state === 'complete')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(downloads.length, 4, 'Transcript JSON, Markdown, image and media manifest were queued');
    assert.ok(downloads.every(d => d.state === 'complete'));
    const image = downloads.find(d => d.url === imageURL);
    assert.ok(image); assert.equal(fs.readFileSync(image.filename).subarray(1, 4).toString(), 'PNG');
    const media = downloads.filter(d => d.url.startsWith('blob:')).map(d => { try { return JSON.parse(fs.readFileSync(d.filename, 'utf8')); } catch { return null; } }).find(value => value?.images);
    assert.equal(media.images.length, 1); assert.equal(media.images[0].status, 'queued');
    await page.screenshot({ path: path.join(work, 'page.png') });
    console.log('Real extension QA artifacts: ' + work);
  } finally { await context.close(); await new Promise(resolve => imageServer.close(resolve)); }
});
