# Privacy

Conversation Exporter runs on your computer. It has no telemetry, analytics, account, external service, remote library or chatbot API connection.

The content scripts read rendered messages on the supported chatbot domains. They do not read passwords, cookies, access tokens, hidden application stores or private API responses. Gemini source-chip metadata is decoded only when it appears on a source element in the DOM.

Collected conversations live in the source tab's content-script memory. Closing the popup preserves them. Reloading or leaving the conversation discards them. Only preferences are written to `chrome.storage.local`. Downloads are ordinary files and remain wherever you save them. When you click **Copy**, the selected export is written to the system clipboard. The extension never reads clipboard contents.

The extension uses:

- `storage` for preferences.
- `downloads` for the selected conversation and optional images.
- `clipboardWrite` for the **Copy** action. Chrome may describe this as permission to modify data you copy and paste; it is used only when you click **Copy**.
- `activeTab` for the toolbar popup's access to the tab you invoke it on.
- `scripting` to initialize an already-open tab after installation or an extension reload.

Content scripts are restricted to the listed chatbot domains and the `/i/grok` routes on X. There is no `tabs` permission, no `<all_urls>` access and no broad CDN host permission. The page button appears automatically on these domains when enabled. The exporter reads currently rendered messages when you open its controls and refreshes them while those controls are open. History loading runs only when you export a full selection with verification enabled or press **Load all**. Hiding the page button changes the interface; it does not revoke the browser's domain access. Restrict site access in your browser's extension settings if you want to control that access.

Default exports make no additional network requests during capture beyond requests the chatbot itself makes while its conversation scrolls. Markdown includes image URLs, which a Markdown viewer may load automatically. Exported HTML uses image links and a restrictive Content Security Policy. Opening that HTML makes no image requests and executes no generated application code. Following a source or image link contacts its destination.

If you turn on **Also download selected messages' images**, the browser requests those URLs. The image host receives ordinary request information, and the download may use cookies from your browser session. Signed URLs can contain access credentials and can expire. Treat exported files as private whenever the chat, attachment names or URLs are private. Uploaded files are listed by name and visible URL; the extension does not retrieve their contents automatically.

Private development samples, screenshots, original instructions, old scripts, console builds, test profiles and release staging live under ignored `.local/`. Release packaging uses a file allowlist. Review the files you stage before committing; `.gitignore` cannot protect a file that someone force-adds.
