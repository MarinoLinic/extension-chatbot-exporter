# Conversation Exporter

Save the chatbot conversation open in your browser as Markdown, JSON, HTML, text or CSV. Select individual messages, preserve source links and formatting, and optionally download images.

Conversation Exporter runs locally. It needs no API key, account, server or build step.

## Install

1. Open `chrome://extensions`, `brave://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose the folder containing `manifest.json`.
4. Pin **Conversation Exporter** to the toolbar.

If you downloaded a release ZIP, extract it first. After updating, reload the extension on its extension card and refresh any chatbot tabs that still show the previous interface. The toolbar can also initialize an already-open supported tab.

The extension targets Chromium browsers. Firefox is not validated.

## Export a conversation

1. Open a conversation and wait for the response to finish.
2. Click **↓ Export chat** on the page or the toolbar icon. Messages already rendered on the page are immediately available for selection.
3. Choose messages with **All**, **Human**, **Assistant**, **None**, **Invert** or individual checkboxes.
4. Choose a format and click **Export selected**.

Exporting all messages or all messages of one role verifies history automatically. If the page already contains the whole transcript, the exporter checks its boundaries rather than scanning through every screen. Unchanged verified history is reused for later exports. An individually selected subset exports directly from the loaded messages.

**Load all** lets you load and inspect the full history before exporting. **Refresh messages** rereads the current page without scrolling. These are optional; there is no required collection step. **Cancel** stops history loading without starting a download.

The message list uses most of the popup's height. Previews are limited to two lines; hover for the longer preview. Provider badges and assistant labels use colors to distinguish chatbots. Export controls stay visible while the list scrolls. The gear button opens a separate settings view, and **← Messages** returns to the selection.

Selection is preserved when the page updates. Bulk role selection includes newly discovered messages of that role; manually selected subsets retain their choices. Bulk controls apply across all selection pages, which display 80 messages at a time.

Closing the popup does not stop an operation. Navigation to another conversation discards the capture; reloading the tab also loses it. Turn off **Show the export button on chatbot pages** for toolbar-only controls.

The browser asks where to save by default. Check Downloads for completion after a download starts.

## Supported chatbots

| Interface | Domains |
|---|---|
| ChatGPT | `chatgpt.com`, `chat.openai.com` |
| Claude | `claude.ai` |
| Gemini | `gemini.google.com` |
| Google AI Studio | `aistudio.google.com` |
| Grok | `grok.com` |
| Grok on X | `x.com/i/grok…`, `twitter.com/i/grok…` |
| DeepSeek | `chat.deepseek.com` |
| GLM / Z.ai | `chat.z.ai`, `chatglm.cn` |
| Kimi | `kimi.com`, `www.kimi.com`, `kimi.ai`, `www.kimi.ai` |

Extraction uses the rendered page. Shared and signed-in pages can differ, and providers can change their markup. If no messages are found, wait for rendering and try again. Login screens, unavailable conversations and access challenges cannot be exported as conversations.

## Formats

| Format | Use |
|---|---|
| **Markdown** | Notes and readable archives, with lists, code, tables, TeX, links and image URLs |
| **JSON** | Structured messages, original message formatting, resources, selection counts and capture metadata |
| **HTML / print PDF** | A standalone reading copy. Open it and use the browser's Print / Save as PDF |
| **Text** | A text copy that retains link notation, code fences and TeX |
| **CSV** | One row per message, with resource JSON columns and capture warnings |

Markdown reserves the document title for level 1 and message headings for level 2. Headings within each message start at level 3 and retain their relative nesting, up to Markdown's six heading levels. Code and math blocks are not changed when heading levels are adjusted. HTML uses the same hierarchy, with numbered role labels beside the message body.

The interface uses a compact white layout with provider accents, fine rules and small role labels. HTML reading copies use a white, monochrome layout, adapt to narrow screens and printing, and make no remote image or font requests.

Filenames follow `YYYY-MM-DD - Chatbot - Conversation title.ext`, using the browser's local export date. Title separators such as slashes and bullets become spaced hyphens. Branch labels are retained. Windows-invalid characters are removed and long titles are shortened without joining words together.

## Rich content

- **Math:** exposed TeX annotations are retained as `$…$` or `$$…$$`. HTML displays the notation as text; Markdown readers with math support can render it.
- **Code:** indentation, blank lines and available language labels are retained. Fences accommodate backticks inside the code.
- **Tables:** HTML preserves row and column spans. Markdown uses a rectangular table, with empty cells for covered spans. Use HTML or JSON for complex tables.
- **Sources and tools:** visible links, source labels and already-rendered tool-status text are retained. A source label without an exposed URL is marked accordingly. Source URLs in Gemini's source-chip DOM metadata are decoded when available.
- **Files:** visible attachment names and download URLs are included. Uploaded file contents are not downloaded automatically.
- **Generated apps:** visible code, iframe preview URLs and exposed `srcdoc` are preserved as inert text or references. Cross-origin iframe content and closed code editors are inaccessible. Open the app's code view before capture if you need its source.
- **Maps:** exposed location labels, links and thumbnail images can be retained. Interactive map state, routes and tiles are not archived.

The exporter does not run generated apps or tools, open attachment controls, expand collapsed panels or switch between regenerated-answer branches automatically.

## Images

Markdown embeds image URLs, JSON lists them and HTML provides links. Known avatars, file-type icons and source favicons are excluded.

Enable **Also download selected messages' images** to request separate image files after saving the transcript. A `.media.json` companion records URLs, proposed filenames, browser download IDs, failures and skips. It reports requests as **queued**; check Downloads for completion. The browser may add filename suffixes when files already exist.

Each export is limited to 100 unique image URLs. URLs can expire or require authentication. Temporary blob images should be downloaded before leaving the tab. When an image type cannot be inferred, its filename uses `.image`. Markdown links are not rewritten to local image paths, and images are not bundled into a media ZIP.

A Markdown viewer may contact image hosts when rendering URL images. The HTML reading copy does not load images automatically.

## Capture settings and limits

The exporter reads rendered messages rather than private chatbot APIs or hidden application stores. It chooses the least work supported by the page:

- A reported total with every message index present can verify the history without scrolling.
- When all messages remain rendered, a settled top check must retain the original messages and latest-message anchor. A bottom check is added when needed. No downward scan is required.
- Virtualized chats, unrendered placeholders or disappearing messages require a downward scan. Each viewport is captured before advancing. Rendering changes and viewport coverage determine when it is safe to move; tall messages already captured in full can be skipped through in a larger step.

Endpoint anchors alone cannot establish completeness on a virtualized page. The collector preserves overlaps, stable IDs and available row indices to order messages. It restores the previous viewport or bottom position afterward.

| Setting | Default | Range |
|---|---|---|
| Maximum render wait | 650 ms | 300–3,000 ms |
| History loading limit | 180 seconds | 15–900 seconds |

Boundary checks use longer quiet windows to allow older messages to load, and visible loading indicators are awaited. Increase the render wait for slow pages or the loading limit for long conversations. Turn off **Verify full history when exporting all messages** to export only loaded messages. Reasoning can be included when it is present in the page.

Capture status is recorded in every format:

- `reported-total`: all indices match the page's reported message total.
- `observed-edges`: both rendered boundaries were verified without a detected concern.
- `visible-only`: only loaded messages were read.
- `partial`: cancellation, a limit, missing content, a count mismatch or another collection concern.

A partial full-history check does not start a download automatically. Inspect its warning, retry **Load all**, or explicitly choose loaded messages. Settled boundaries and reported totals are DOM evidence, not proof of server-side completeness.

The collector stops at 60 boundary checks, 3,000 scan iterations, 10,000 messages, approximately 32 MB of serialized capture data or the configured time limit. A hidden tab stops active history loading because rendering can be throttled. Missing stable IDs, non-overlapping virtualized batches and unrendered placeholders produce warnings.

Collapsed content, unsent drafts, alternative answer branches and messages never supplied by the page are outside the capture. Captures do not survive tab reload or browser restart.

## Privacy

There is no telemetry, external service or private chatbot API connection. Conversations remain in the source tab's memory until saved. Only preferences persist in extension storage.

Optional image downloads contact image hosts and can use your browser's session cookies. Signed URLs can contain access credentials. Treat exports as private when their conversations or resource URLs are private. See [PRIVACY.md](PRIVACY.md) for permissions and network behavior.

## Development

The extension has no runtime dependencies. Development commands require the source checkout, rather than the runtime-only release ZIP.

```powershell
npm install
npx playwright install chromium
npm run check
npm test
```

DOM tests default to installed Chrome. Set `CE_BROWSER_CHANNEL=chromium` to use Playwright Chromium instead. Extension tests use Playwright Chromium, or a binary selected through `CE_CHROMIUM_PATH`, in a separate profile under `.local/qa`. The native toolbar test checks message space, controls and exports in Chrome's action popup. See [Playwright's extension testing guide](https://playwright.dev/docs/chrome-extensions).

Additional commands:

- `npm run test:samples`: check optional local HTML fixtures without printing conversation text. Fixtures absent from a clean checkout are skipped.
- `npm run console`: generate a universal console exporter and nine provider-specific scripts under `.local/console`. Edit their settings to change format or timing. Message selection and image-file downloads are extension features.
- `npm run package`: create a runtime-only unpacked release and ZIP under `.local/release`. Packaging uses an explicit file allowlist.

Keep real conversations, development captures, test profiles and generated artifacts in ignored `.local/`. Never put private conversation text in committed test fixtures. Repository invariants are documented in [AGENTS.md](AGENTS.md).

The shared source separates provider adapters, semantic conversion, collection, output formats, design, interface controls and browser downloads. Providers use the same converter and collector; generated console scripts use those modules too.
