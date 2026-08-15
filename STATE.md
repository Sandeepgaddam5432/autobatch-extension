# STATE

## Current: v0.1.0 — first testable build

### Done

- MV3 manifest, side panel, downloads service worker
- Core engine: concurrency pool, per-prompt delay, retry with backoff, stop
- Prompt parsing (blank-line separated) + `.txt` / `.csv` upload
- Runner pipeline: `snapshot -> submit -> poll for new media -> download`
- Meta.ai adapter with all site-specific logic isolated in one file
- Side panel: live queue, progress bar, event log, `Probe` selector check
- Settings persisted in `chrome.storage.local`; prompts survive panel close

### Needs verification on a live page (do this first)

1. **Selectors.** `SELECTORS` in `src/adapters/meta.js` are written from
   generic patterns, not from Meta.ai's real DOM. Open meta.ai, run
   `window.__AUTOBATCH__.probe()` in the console (or click **Probe**). Fix any
   `false` values. This is the only file that should need editing.
2. **Send behavior.** Adapter clicks the send button, falls back to Enter.
   Confirm which one Meta.ai actually needs.
3. **Result detection.** `waitForResults` diffs media URLs before/after submit
   and waits for the set to stay stable for 2 polls. Verify it does not latch
   onto a placeholder / low-res preview frame.
4. **Mode + aspect ratio.** `setMode` / `setAspectRatio` click by visible text,
   which is brittle. Replace with real selectors once known.

### Known limitations

- **blob: results.** `chrome.downloads` in the service worker cannot read a
  page blob, so results are relayed as data URLs. Over 25MB it falls back to
  clicking the site's own download control. Long videos may need the fallback.
- **Image-to-image / image-to-video.** `attachImage()` exists in the adapter
  but the side panel does not expose an image picker yet (v0.2).
- **Concurrency > 1** is implemented but unverified against Meta.ai rate
  limits. Start at 1.
- **No resume after page reload.** Queue state lives in the content script.
- **Single tab.** The run targets the active meta.ai tab only.

### Next

- v0.2: Flow adapter (validates the adapter contract), image picker in panel,
  remote selector config fetched from a JSON file so UI breakages are fixed
  without a Web Store review
- v0.3: Grok + ChatGPT adapters, `optional_host_permissions` instead of
  upfront hosts, Firefox build
