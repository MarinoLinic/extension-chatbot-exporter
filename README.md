# Conversation Exporter

A local Manifest V3 extension for saving the chatbot conversation open in your browser. Choose individual messages, keep readable formatting and source links, and optionally download images. It runs directly from this folder, with no API key, server or build step.

## Install and use

1. Open `chrome://extensions`, `brave://extensions` or `edge://extensions`.
2. Enable **Developer mode**, click **Load unpacked**, and select this project folder, the one containing `manifest.json`.
3. Pin **Conversation Exporter** to your toolbar and open a chatbot conversation.
4. Click **↓ Export chat** on the page or click the toolbar icon.
5. Check **Export settings**, then click **Collect conversation**. Keep the chat tab selected while scanning. The page scrolls temporarily and returns to its original position.
6. Read any capture warnings. Select messages using **All**, **Human**, **Assistant**, **None**, **Invert** or individual checkboxes. These bulk controls apply across all selection pages; the list displays 80 messages at a time.
7. Choose a format and click **Export selected**. The browser asks where to save by default. Check Downloads for completion. “Queued” means the browser accepted the request.

Turn off **Show the export button on chatbot pages** for toolbar-only controls. Both interfaces control the same capture in the source tab. Closing the popup does not stop a scan. **Cancel** retains collected messages as a partial export. Reloading the source tab loses its in-memory capture; navigating to another conversation discards it to prevent mixing chats. Wait for the chatbot to finish generating, and avoid typing or navigating while scanning.

After an update, reload the extension on its extension card. Refresh the chatbot tab if its page button is still using an older version. The toolbar can initialize an already-open supported tab. Chrome, Brave and Edge are the intended browsers; Firefox is not validated. A ZIP must be extracted before loading its folder. This project does not install itself in your normal browser profile or publish to a store.

## Chatbots

| Interface | Domains | Identity and content |
|---|---|---|
| ChatGPT | `chatgpt.com`, `chat.openai.com` | Author-role nodes; message-bubble and assistant-markdown fallbacks |
| Claude | `claude.ai` | User/assistant messages, transcript row indices and reported message totals |
| Gemini | `gemini.google.com` | User queries and model responses, including public-share response containers |
| Google AI Studio | `aistudio.google.com` | Chat-turn IDs, user/model containers and rendered prompt chunks |
| Grok | `grok.com` | Role markers, virtualized plane-row IDs and public-share scrollers |
| Grok on X | `x.com/i/grok…`, `twitter.com/i/grok…` | User bubbles and entire quotable assistant messages |
| DeepSeek | `chat.deepseek.com` | Message bodies and virtual-list item keys |
| GLM / Z.ai | `chat.z.ai`, `chatglm.cn` | User/assistant containers and message IDs |
| Kimi | `kimi.com`, `www.kimi.com`, `kimi.ai`, `www.kimi.ai` | User/assistant content items |

These are DOM adapters, not private API integrations. Providers can change their pages. Shared and signed-in pages can use different markup. If no messages are found, wait for rendering and try again. Login screens, access challenges and missing conversations are not exportable. There is no generic whole-page scraper: that could include unrelated sidebar conversations or account details.

## Formats

- **Markdown:** readable role headings, paragraphs, emphasis, nested lists, quotes, code, tables, TeX, source links, image URLs and resource notes.
- **JSON:** versioned archive, source URL, capture status and warnings, selected messages, semantic HTML, Markdown and structured resources.
- **HTML / print PDF:** a styled, script-free reading copy. Open the HTML and use your browser's Print / Save as PDF. Images remain links, so opening the HTML makes no image requests.
- **Text:** a portable text copy. It retains link notation, code fences and TeX so technical content and URLs survive.
- **CSV:** one row per message, resource JSON columns and capture warnings. Cells that could begin spreadsheet formulas are neutralized.

JSON records the original captured count and the exported selection count separately. Messages are numbered in selection order in the readable formats.

## Math, code, tables and resources

**Math:** Gemini `data-math` and KaTeX/MathML TeX annotations become `$…$` or `$$…$$`. The exporter retains original notation when exposed, rather than guessing from a visual equation. The offline HTML displays TeX as text; it does not download a math renderer. Markdown readers with math support can render it.

**Code:** indentation and blank lines are retained. Fences are longer than any run of backticks inside the code. Language labels are retained when available. Code is never executed in the exported HTML.

**Tables:** HTML retains row/column spans. Markdown creates a rectangular table, leaves covered span cells empty and escapes literal pipes. The first row becomes the Markdown header when no explicit header exists. Use JSON/HTML for complicated tables. Nested tables and unusual visual widgets may not translate exactly into Markdown.

**Sources and tools:** visible links are collected even when they sit beside the answer. Gemini source chips preserve their labels; URLs in a chip's JSON DOM metadata are decoded when present. A label with no exposed URL is marked accordingly. Already-rendered tool-status text is retained. The extension does not open tool panels, run tools, retrieve private tool payloads or infer every search result the chatbot consulted.

**Files:** attachment names and visible download URLs are retained. A card can exist without the file's original bytes or any downloadable URL. Uploaded files are not fetched automatically. Claude artifact cards become resource notes; their full source is available only when it is rendered in the page.

**Generated apps:** visible code is retained. Gemini iframe preview URLs and exposed `srcdoc` are preserved; `srcdoc` is stored as inert source text. Cross-origin iframe content, closed canvas editors and application state are inaccessible to this top-level DOM exporter. A preview URL may be a temporary shim, not the app source. If you need the full source, open its code view before capture or use the chatbot's own download control. Exported HTML never runs the generated app.

**Maps:** Gemini location labels and exposed links are recorded. If a map button exposes no URL, the export says so. Interactive tiles, routes and map state are not archived. Map thumbnail images may be captured as image resources.

**Images:** Markdown embeds their URLs; JSON lists them; HTML uses links. Known avatars, file-type icons and source favicons are excluded. Enable **Also download selected messages' images** to request separate image files after saving the transcript. A `.media.json` companion records URLs, proposed filenames, browser download IDs, failures and skips. Its success state is **queued**, not a claim that every image has finished downloading. Check browser Downloads; filenames can gain suffixes when they collide.

There is a 100-unique-image limit per export. Remote images go through the browser download API. Blob images are read from the current tab and passed to the browser as a new blob. Expired or authenticated URLs can fail. When a file type cannot be inferred, the filename uses `.image`. There is no media ZIP and no automatic rewriting of Markdown to local paths. A Markdown reader can contact image hosts automatically when it renders URL images; HTML does not.

## Why one top-to-bottom scan

The old Gemini approach jumped repeatedly between the top and bottom, then extracted the DOM. That can work if the entire transcript remains rendered. Grok and DeepSeek can remove off-screen messages, so extraction only at the end loses earlier content.

The shared collector finds the chat scroller, moves to the beginning, and waits for its height and message signature to settle for three consecutive checks. It then makes one downward pass in steps of about 55% of a viewport. It retains the currently rendered messages **before each scroll**. Overlapping batches connect neighboring virtualized rows. At the bottom, height and captured-content fingerprint must settle for four checks. The original scroll position is restored afterward.

Stable IDs distinguish messages: two identical prompts with different IDs remain two messages. Revisiting an ID updates it. New IDs are inserted beside known neighbors, and numeric row indices determine final order when all messages expose them. Absolute vertical positions are not permanent ordering keys, because estimated heights change as content renders.

Non-virtualized pages without IDs can use node identity. Virtualized pages without stable IDs warn about possible duplicates or omissions. Non-overlapping virtual batches also warn. Unrendered placeholders are omitted and counted as missing. Reported message totals are compared with the captured count when exposed.

Limits are finite: 60 top checks, 3,000 downward steps, 10,000 messages and approximately 32 MB of serialized capture data in memory. Default pacing is 650 ms per step with a 180-second scan limit. Settings allow 300–3,000 ms waits and 15–900 seconds. Increase the wait for slow rendering or the time limit for a long conversation. A hidden tab stops the scan as partial because timer throttling makes completeness unreliable.

Capture status is included in every export:

- `observed-edges`: both DOM edges settled, with no specific detected concern. It does **not** prove server-side completeness.
- `visible-only`: scanning was disabled; only loaded/rendered messages were read.
- `partial`: cancellation, a limit, a hidden tab, unresolved placeholders, count mismatch or another collection concern.

Collapsed content, unsent drafts, other regenerated-answer branches and messages never supplied by the page are outside capture. The extension does not click expand controls or switch branches automatically. Captures do not survive tab reload or browser restart.

## Privacy and preservation

Read [PRIVACY.md](PRIVACY.md). No chat goes to an extension server. Only preferences persist in extension storage. Optional image downloads contact image hosts and can use your browser session cookies. Signed resource URLs can contain access credentials and expire. Treat exports as private whenever the chats or resource URLs are private.

All original project material is preserved under ignored `.local/`:

- `samples/`: the original HTML samples.
- `legacy/`: original Gemini and Grok scripts.
- `references/`: screenshots and original README instructions.
- `qa/`: separate test profiles, synthetic downloads and screenshots.
- `console/`: generated standalone console scripts.
- `release/`: allowlisted packaging output.

The package script copies only `manifest.json`, `README.md`, `PRIVACY.md`, `AGENTS.md`, `src/` and `assets/`. It does not traverse private sample folders. Nothing is deleted during packaging. Review staged files before committing; ignored files can still be force-added.

## Development and standalone scripts

The extension itself needs no dependency installation. Use the source project for the development commands below; the release ZIP contains only the runtime and documentation. Browser tests require Playwright:

```powershell
npm install
npx playwright install chromium
npm run check
npm test
npm run test:samples
npm run console
npm run package
```

DOM tests default to installed Chrome. Set `CE_BROWSER_CHANNEL=chromium` to use Playwright Chromium instead. Extension tests use Playwright Chromium or a binary selected by `CE_CHROMIUM_PATH`, with a separate profile under `.local/qa`. Branded Chrome and Edge removed command-line extension-loading flags. See [Playwright's extension guidance](https://playwright.dev/docs/chrome-extensions). The popup test substitutes an extension tab for the toolbar surface and simulates only active-tab metadata. Popup code, content scripts, CSP, storage, messaging and download APIs remain real.

`test:samples` prints counts and pass/fail results without conversation text. Private fixtures are intentionally not distributed and are skipped if absent. Synthetic regression fixtures are in `tests/`.

`console` generates `all-export.js` plus nine provider-specific scripts in `.local/console/`. Paste one on an open chat to scan and download Markdown, with a cancel button and capture warnings. Edit its `settings` object to change format or timing. Images remain URLs. Selection and optional image-file downloads are extension features. These scripts are generated from the shared source, not maintained separately.

`package` creates a fresh unpacked release folder and ZIP in `.local/release/`, preserving earlier releases.

Shared modules:

| File | Responsibility |
|---|---|
| `src/common.js` | Preferences, safe URLs and filenames, source-chip metadata |
| `src/markdown.js` | Semantic conversion, math, code, tables and resources |
| `src/adapters.js` | Provider selectors, roles and identity |
| `src/collector.js` | Scan, ordering, retention and capture warnings |
| `src/formats.js` | Selected archive and five formats |
| `src/ui.js` | Shared settings and message selection |
| `src/content.js` | Tab-local capture, page controls and export |
| `src/background.js` | Validated browser download requests |
| `src/popup.js` | Toolbar connection and initialization |

Future-agent rules are in [AGENTS.md](AGENTS.md). Browser mechanisms are documented in Chrome's [activeTab guide](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) and [downloads API reference](https://developer.chrome.com/docs/extensions/reference/api/downloads).

## Validation and limitations

The 16 supplied HTML samples cover nine interfaces. Rich-content checks verify all 26 tables and 5 code blocks in the X/Grok sample, all 10 generated images in Gemini's image sample, four attachment names in its file sample, 15 map location records and an embedded app preview. AI Studio contains 44 turn elements but only five with rendered content; the other 39 are placeholders. A saved snapshot cannot recover those missing messages.

Regression tests cover math within prose, nested lists, long code fences, table spans, metadata URLs, resource ownership, duplicate prompts, virtualized harvesting, restoration, cancellation, route changes, selection, inert HTML, CSV formulas, popup controls, preferences and real extension downloads.

Live public shares were checked in a clean browser separately from fixture validation. Grok, Gemini and ChatGPT exposed conversation content; Gemini needed a separate public-share response selector. The X shared URL returned an HTTP error, and the Claude shared URL exposed no conversation messages. These failures are not successful live tests and do not establish how your logged-in browser will behave. No login or access challenge was bypassed. Provider markup can change; update this validation record when adapters change.
