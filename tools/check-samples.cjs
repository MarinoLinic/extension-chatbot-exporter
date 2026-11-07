const { fs, path, root, browser, setup } = require('../tests/helpers.cjs');
const mapping = {
  'chatgpt-sample.html': ['https://chatgpt.com/c/test', 16],
  'claude-sample.html': ['https://claude.ai/chat/test', 6],
  'deepseek.html': ['https://chat.deepseek.com/a/chat/test', 2],
  'glm-sample.html': ['https://chat.z.ai/c/test', 12],
  'google-studio-sample.html': ['https://aistudio.google.com/prompts/test', 3, { users: 1, placeholders: 41, code: 1, status: 'partial' }],
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
  'gemini-sample-8.html': ['https://gemini.google.com/app/test', 4],
  '2026-11-07/chatgpt---1.html': ['https://chatgpt.com/c/test', 12, { users: 6, tables: 5, charts: 3, images: 3 }],
  '2026-11-07/chatgpt---1.2.html': ['https://chatgpt.com/c/test', 12, { users: 6, tables: 6, charts: 2, images: 2 }],
  '2026-11-07/chatgpt---2.html': ['https://chatgpt.com/c/test', 16, { users: 11, placeholders: 6, code: 2 }],
  '2026-11-07/gemini---1.html': ['https://gemini.google.com/app/test', 12, { users: 6, tables: 5, code: 6 }],
  '2026-11-07/gemini---2.html': ['https://gemini.google.com/app/test', 8, { users: 4, images: 2, attachments: 2 }],
  '2026-11-07/gemini---3.html': ['https://gemini.google.com/app/test', 20, { users: 10, images: 1, attachments: 4, artifacts: 2, status: 'partial' }],
  '2026-11-07/Grok---1.html': ['https://grok.com/c/test', 4, { users: 2, images: 2 }]
};
(async () => {
  const chrome = await browser(); let failures = 0, checked = 0;
  try {
    for (const [file, [url, expected, details = {}]] of Object.entries(mapping)) {
      const source = path.join(root, '.local', 'samples', file);
      if (!fs.existsSync(source)) { console.log(file + ': absent (private fixture, skipped)'); continue; }
      const page = await setup(chrome, fs.readFileSync(source, 'utf8'), url, { inert: true });
      const result = await page.evaluate(() => {
        const provider = ChatExport.provider(location.href);
        const rows = ChatExport.read(document, provider);
        const archive = ChatExport.loadedArchive({ provider, settings: ChatExport.defaults });
        const populated = archive.messages;
        const formats = ['md', 'json', 'html', 'txt', 'csv'];
        return {
          messages: populated.length, users: populated.filter(m => m.role === 'user').length, assistants: populated.filter(m => m.role === 'assistant').length,
          placeholders: rows.filter(m => m.placeholder).length, links: populated.reduce((n, m) => n + m.links.length, 0), images: populated.reduce((n, m) => n + m.images.length, 0),
          attachments: populated.reduce((n, m) => n + m.attachments.length, 0), artifacts: populated.reduce((n, m) => n + m.artifacts.length, 0),
          math: populated.reduce((n, m) => n + (m.html.match(/class="math"/g) || []).length, 0), tables: populated.reduce((n, m) => n + (m.html.match(/<table>/g) || []).length, 0),
          code: populated.reduce((n, m) => n + (m.html.match(/<pre>/g) || []).length, 0), emptyRoles: rows.some(m => !m.role),
          charts: populated.reduce((n, m) => n + m.images.filter(image => image.kind === 'chart').length, 0),
          unsafe: populated.some(m => /<script|<iframe|<img|onerror=|javascript:/i.test(m.html)),
          exports: formats.filter(format => ChatExport.formatAvailable(archive, format).filename.endsWith('.' + format)).length,
          status: archive.capture.status
        };
      });
      checked++;
      let pass = !result.unsafe && !result.emptyRoles && result.messages === expected && result.exports === 5 && Object.entries(details).every(([key, value]) => result[key] === value);
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
