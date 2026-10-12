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

1. Open a conversation and wait for the response to finish generating.
2. Click **↓ Export chat** on the page or the extension's toolbar icon.
3. Review **Export settings**, then click **Collect conversation**.
4. Keep the chat tab selected during the scan. Read any capture warnings afterward.
5. Choose messages using **All**, **Human**, **Assistant**, **None**, **Invert** or individual checkboxes.
6. Choose a format and click **Export selected**.

Bulk selection applies to the entire capture, including other selection pages. The list displays 80 messages at a time. Closing the popup does not stop a scan. **Cancel** stops scanning and keeps the collected messages available as a partial export.

Turn off **Show the export button on chatbot pages** for toolbar-only controls. Both interfaces control the same capture in the source tab. Navigation to another conversation discards the capture; reloading the tab also loses it. Save before leaving or reloading.

The browser asks where to save by default. A “queued” download has been accepted by the browser; check Downloads for completion.

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

The interface and HTML reading copy use a white background, monochrome controls, fine rules and small monospaced labels. HTML adapts to narrow screens and printing and makes no remote image or font requests.

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

The collector finds the chat's scroll container, waits for the beginning to settle, then makes one downward pass. It retains rendered messages before each scroll and uses overlapping viewports, stable message IDs and available row indices to preserve order. It restores the original scroll position afterward.

| Setting | Default | Range |
|---|---|---|
| Wait after each scroll | 650 ms | 300–3,000 ms |
| Scan time limit | 180 seconds | 15–900 seconds |

Increase the wait for slow rendering or the time limit for long conversations. Disabling scanning captures only currently loaded messages. Reasoning can be included when it is already present in the page.

Capture status is recorded in every format:

- `observed-edges`: both rendered edges settled without a detected concern. This does not prove server-side completeness.
- `visible-only`: scanning was disabled.
- `partial`: cancellation, a limit, a hidden tab, missing content, a count mismatch or another collection concern.

The collector stops at 60 top checks, 3,000 downward steps, 10,000 messages, approximately 32 MB of serialized capture data or the configured time limit. A hidden tab stops the scan as partial because rendering can be throttled. Missing stable IDs, non-overlapping virtualized batches and unrendered placeholders produce warnings.

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

DOM tests default to installed Chrome. Set `CE_BROWSER_CHANNEL=chromium` to use Playwright Chromium instead. Extension tests use Playwright Chromium, or a binary selected through `CE_CHROMIUM_PATH`, in a separate profile under `.local/qa`. See [Playwright's extension testing guide](https://playwright.dev/docs/chrome-extensions).

Additional commands:

- `npm run test:samples`: check optional local HTML fixtures without printing conversation text. Fixtures absent from a clean checkout are skipped.
- `npm run console`: generate a universal console exporter and nine provider-specific scripts under `.local/console`. Edit their settings to change format or timing. Message selection and image-file downloads are extension features.
- `npm run package`: create a runtime-only unpacked release and ZIP under `.local/release`. Packaging uses an explicit file allowlist.

Keep real conversations, development captures, test profiles and generated artifacts in ignored `.local/`. Never put private conversation text in committed test fixtures. Repository invariants are documented in [AGENTS.md](AGENTS.md).

The shared source separates provider adapters, semantic conversion, collection, output formats, design, interface controls and browser downloads. Providers use the same converter and collector; generated console scripts use those modules too.
