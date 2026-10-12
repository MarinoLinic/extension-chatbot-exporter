const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const modules = ['common', 'markdown', 'adapters', 'collector', 'formats', 'ui'];
async function browser() { return chromium.launch({ headless: true, channel: process.env.CE_BROWSER_CHANNEL || 'chrome' }); }
async function setup(browser, html, url = 'https://gemini.google.com/app/test') {
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().url() === url ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await page.goto(url);
  for (const name of modules) await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8') });
  return page;
}
module.exports = { fs, path, root, modules, browser, setup };
