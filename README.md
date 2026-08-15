# AutoBatch — Bulk AI Media Automation

Open-source Chrome extension that batch-runs prompts on AI media sites and
auto-downloads every result. Built adapter-first so one extension covers many
platforms instead of one paid extension per site.

- **Runs 100% locally.** No backend, no accounts, no telemetry.
- **MIT licensed.** Every competitor in this category is closed source.
- **No build step.** Load the repo unpacked and it works.

> Status: **v0.1 — Meta.ai adapter, needs selector verification on a live page.**
> See `STATE.md`.

## Install (unpacked, for testing)

1. `git clone https://github.com/Sandeepgaddam5432/autobatch-extension`
2. Open `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select the cloned folder
4. Open <https://www.meta.ai/> and sign in
5. Click the AutoBatch toolbar icon → side panel opens
6. Click **Probe** first. It reports whether the composer / send button / media
   selectors currently match. All good → paste prompts → **Run**

## Architecture

```
src/
  core/          platform-agnostic engine (no site knowledge at all)
    pool.js      concurrency + delay + retry
    runner.js    submit -> poll -> collect -> download pipeline
    prompts.js   blank-line prompt parsing
    storage.js   settings
  adapters/
    meta.js      ALL Meta.ai-specific DOM logic lives here
  registry.js    URL -> adapter mapping
  content/       bridge: loads adapter + runner into the page
  sidepanel/     UI (queue monitor, settings)
  background.js  chrome.downloads service worker
```

### Adding a platform

1. Create `src/adapters/<id>.js` implementing the contract below
2. Add one entry to `src/registry.js`
3. Add the host to `manifest.json` (`host_permissions`, `content_scripts`,
   `web_accessible_resources`)

Core code is never touched.

### Adapter contract

| Member | Required | Purpose |
| :--- | :--- | :--- |
| `id`, `label`, `modes`, `aspectRatios` | yes | metadata for the UI |
| `isReady()` | yes | resolve once the page is usable / logged in |
| `snapshotResults()` | yes | `Set` of media URLs already on the page |
| `submitPrompt(text, image)` | yes | type + send one prompt |
| `waitForResults({ before, expected, timeoutMs, shouldStop })` | yes | resolve with new result URLs |
| `setMode(mode)` | no | switch generation mode (best effort) |
| `setAspectRatio(ratio)` | no | best effort |
| `attachImage(dataUrl, name)` | no | for image-to-\* modes |
| `clickDownload(url)` | no | fallback when a blob is too large to relay |
| `probe()` | no | selector health report for debugging |

## Roadmap

- **v0.1** Meta.ai, text-to-image / text-to-video, auto-download ← *here*
- **v0.2** Google Labs Flow adapter (proves the abstraction), image-to-\* modes
- **v0.3** Grok + ChatGPT/Sora adapters, remote selector config, Firefox build

## Disclaimer

Independent tool, not affiliated with Meta, Google, xAI, or OpenAI. Use in
accordance with each platform's terms of service.
