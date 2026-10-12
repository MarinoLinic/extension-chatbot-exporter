const { fs, path, root, browser, setup } = require('../tests/helpers.cjs');
const mapping = {
  'chatgpt-sample.html': ['https://chatgpt.com/c/test', 16],
  'claude-sample.html': ['https://claude.ai/chat/test', 6],
  'deepseek.html': ['https://chat.deepseek.com/a/chat/test', 2],
  'glm-sample.html': ['https://chat.z.ai/c/test', 12],
  'google-studio-sample.html': ['https://aistudio.google.com/prompts/test', 5],
  'grok-sample.html': ['https://grok.com/c/test', 7],
  'kimi.ai-sample.html': ['https://www.kimi.com/chat/test', 4],
  'x.com-grok-sample.html': ['https://x.com/i/grok', 24],
  'gemini-sample.html': ['https://gemini.google.com/app/test', 6],
  'gemini-sample-2.html': ['https://gemini.google.com/app/test', 4],
  'gemini-sample-3.html': ['https://gemini.google.com/app/test', 8],
  'gemini-sample-4.html': ['https://gemini.google.com/app/test', 20],
  'gemini-sample-5.html': ['https://gemini.google.com/app/test', 20],
  'gemini-sample-6.html': ['https://gemini.google.com/app/test', 8],
  'gemini-sample-7.html': ['https://gemini.google.com/app/test', 2],
  'gemini-sample-8.html': ['https://gemini.google.com/app/test', 4]
};
(async () => {
  const chrome = await browser(); let failures = 0, checked = 0;
  try {
    for (const [file, [url, expected]] of Object.entries(mapping)) {
      const source = path.join(root, '.local', 'samples', file);
      if (!fs.existsSync(source)) { console.log(file + ': absent (private fixture, skipped)'); continue; }
      const page = await setup(chrome, fs.readFileSync(source, 'utf8'), url);
      const result = await page.evaluate(() => {
        const rows = ChatExport.read(document, ChatExport.provider(location.href), ChatExport.defaults);
        const populated = rows.filter(m => !m.placeholder);
        return { messages: populated.length, users: populated.filter(m => m.role === 'user').length, assistants: populated.filter(m => m.role === 'assistant').length, placeholders: rows.filter(m => m.placeholder).length, links: populated.reduce((n, m) => n + m.links.length, 0), images: populated.reduce((n, m) => n + m.images.length, 0), attachments: populated.reduce((n, m) => n + m.attachments.length, 0), artifacts: populated.reduce((n, m) => n + m.artifacts.length, 0), math: populated.reduce((n, m) => n + (m.markdown.match(/\$/g) || []).length, 0), tables: populated.reduce((n, m) => n + (m.html.match(/<table>/g) || []).length, 0), code: populated.reduce((n, m) => n + (m.html.match(/<pre>/g) || []).length, 0), emptyRoles: rows.some(m => !m.role), unsafe: populated.some(m => /<script|<iframe|<img|onerror=|javascript:/i.test(m.html)) };
      });
      checked++;
      let pass = !result.unsafe && !result.emptyRoles && result.messages === expected;
      if (file === 'x.com-grok-sample.html') pass &&= result.tables === 26 && result.code === 5;
      if (file === 'gemini-sample-5.html') pass &&= result.images === 10 && result.attachments === 0;
      if (file === 'gemini-sample-2.html') pass &&= result.attachments === 4;
      if (file === 'gemini-sample-4.html') pass &&= result.artifacts === 15 && result.tables === 6;
      if (file === 'gemini-sample-8.html') pass &&= result.artifacts === 1;
      console.log(file, pass ? 'PASS' : 'FAIL', JSON.stringify(result)); if (!pass) failures++;
      await page.close();
    }
  } finally { await chrome.close(); }
  console.log(`${checked} private fixtures checked, ${failures} failures (no conversation text printed).`);
  if (!checked) console.log('Private fixtures are intentionally not distributed; run npm test for synthetic regressions.');
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
