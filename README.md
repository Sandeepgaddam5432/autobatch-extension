# UnQ Automation

Bulk prompt automation for AI image & video sites. One extension, many platforms.

> **Proprietary software. All rights reserved.** This repository is public so end
> users can download and verify official builds. It is **not** open source and
> carries no licence to reuse, modify, redistribute or republish the code.
> See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

Every comparable tool in this category (Meta AI Automation, Veo Automation, Grok
Automation, Autojourney, BulkyGen, …) is closed source and mostly paid. UnQ is
built to beat them on reliability and on the number of platforms covered by a
single install.

## Install

1. Open the [Releases](https://github.com/Sandeepgaddam5432/autobatch-extension/releases) page
2. Download the newest `unq-automation-<version>-<commit>.zip`
3. On your browser's extensions page, select that zip directly
4. Open a supported site, tap the toolbar icon → side panel opens
5. Go to **Logs → Probe this page** first to verify the selectors match the live DOM

## Supported platforms

| Platform | Adapter | Modes |
| --- | --- | --- |
| Meta.ai | `src/adapters/meta.js` | t2v, f2v, ing2v, t2i, i2i |
| Google Labs Flow (Veo) | `src/adapters/flow.js` | t2v, i2v, f2v, ing2v, t2i |
| Grok | `src/adapters/grok.js` | t2i, i2i, t2v, i2v |
| Gemini | `src/adapters/gemini.js` | t2i, i2i, t2v |
| ChatGPT / Sora | `src/adapters/chatgpt.js` | t2i, i2i |
| Qwen | `src/adapters/qwen.js` | t2i, i2i, t2v |

Adding a platform = one adapter file + one registry line + one host in the
manifest. Core code never changes.

## Features

**Prompts**

- Blank-line prompt blocks, `.txt` / `.csv` / `.tsv` import
- CSV per-row overrides: `prompt, image, ratio, mode, outputs`
- `{{variable}}` templates with cartesian expansion
- Prefix / suffix, repeat each prompt N times, shuffle, de-duplicate

**Images**

- Multi-image upload for image-to-image / image-to-video
- Pairing modes: 1→1, one image → all prompts, all images → each prompt,
  first+last frame

**Platform controls**

- Per-platform pickers surfaced in the panel: model, image model, video length,
  resolution, outputs per prompt, aspect ratio, style
- Options the page does not offer are reported instead of silently skipped

**Queue engine**

- Concurrency lanes with staggered starts
- Randomised delay range (min–max) instead of a fixed, bot-like interval
- Retries with backoff, per-item retry, abort after N consecutive failures
- Pause / resume / stop, live per-item status
- Queue snapshot persisted, so a crash does not lose the remaining prompts

**Downloads**

- Auto-download with guaranteed sequential numbering (`0001`, `0002`, …)
- Filename templates: `{n}` `{index}` `{slot}` `{slug}` `{date}` `{time}`
  `{mode}` `{ratio}` `{platform}`
- Folder per project, per date, per run
- Duplicate skipping, blob relay for in-page media, fallback to the site's own
  download button

**Scheduling & safety**

- Time window (supports wrapping past midnight)
- Daily generation cap with usage counter
- Per-item timeout

**Reliability**

- Offscreen 1s heartbeat keeps runs alive in background tabs and minimised
  windows — the single most common failure of every tool in this category
- Remote `selectors.json` config: when a site changes its UI, publishing new
  selectors fixes all users instantly with no update. See `selectors.example.json`

**Workspace**

- 4-tab side panel: Control / Setting / Logs / Library
- Result library, settings import / export
- Debug logs with a page probe report you can copy in one tap
- Desktop notification on completion

## Architecture

```
manifest.json
src/
  core/            platform-agnostic engine (knows nothing about any site)
    pool.js        concurrency, delay, retry, pause, gate
    runner.js      snapshot → submit → poll → download → library
    prompts.js     parsing, variables, pairing
    filename.js    filename token engine
    schedule.js    time windows, daily caps
    storage.js     settings, counters, library, queue snapshot
    selectors.js   remote selector config
    ticker.js      throttle-proof sleep
  adapters/
    base.js        adapter factory: everything generic lives here
    meta.js flow.js grok.js gemini.js chatgpt.js qwen.js
  content/         page bridge
  offscreen/       1s heartbeat
  sidepanel/       compiled UI
  background.js    downloads, notifications, tick relay
registry.js        URL → adapter
ui/                React + TypeScript + Tailwind source for the panel
_locales/          UI strings
```

## Adapter contract

| Method | Purpose |
| --- | --- |
| `isReady()` | composer present, signed in |
| `setMode(mode)` | switch t2i / t2v / i2i / i2v / f2v / ing2v |
| `setAspectRatio(ratio)` | pick the ratio control |
| `applyOptions(config)` | set model / length / resolution / outputs |
| `attachImages(images)` | inject files into the page input |
| `snapshotResults()` | media URLs before submitting |
| `submitPrompt(text, images)` | type + send |
| `waitForResults({ before, expected })` | diff until new media is stable |
| `clickDownload(url)` | fallback to the site's own download button |
| `probe()` | selector health check |

`base.js` implements all of it; a platform file only supplies selectors and label
maps, and may override any method.

## Fixing a broken selector

1. Open the site, then **Logs → Probe this page** in the panel
2. Any `false` value points to the selector list to fix in that platform's adapter
3. Nothing else in the codebase needs to change

## Roadmap

- Seedance / Dreamina, Vibes, Canva, Google Vids adapters
- `optional_host_permissions` runtime grant flow; Firefox and Edge builds
- Prompt library with tags, webhook on completion, light theme, pop-out window

## Legal

UnQ automates the UI you are already signed in to. Respect each platform's terms
of service and rate limits. It contains no reverse-engineered or decompiled code
from any other extension.

Copyright (c) 2026 Sandeep Gaddam. All rights reserved. Proprietary — see
[LICENSE](LICENSE).
