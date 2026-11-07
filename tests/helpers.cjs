const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const modules = ['common', 'design', 'markdown', 'adapters', 'collector', 'formats', 'ui'];
async function browser() { return chromium.launch({ headless: true, channel: process.env.CE_BROWSER_CHANNEL || 'chrome' }); }
async function setup(browser, html, url = 'https://gemini.google.com/app/test', { inert = false } = {}) {
  const page = await browser.newPage();
  const headers = inert ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } : undefined;
  await page.route('**/*', route => route.request().isNavigationRequest() && route.request().frame() === page.mainFrame() && route.request().url() === url ? route.fulfill({ contentType: 'text/html', headers, body: html }) : route.abort());
  await page.goto(url);
  for (const name of modules) {
    const source = fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8');
    if (inert) await page.evaluate(source);
    else await page.addScriptTag({ content: source });
  }
  return page;
}
module.exports = { fs, path, root, modules, browser, setup };
