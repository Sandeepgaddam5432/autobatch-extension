<div align="center">

<img src="icons/icon128.png" width="88" alt="UnQ Automation logo" />

# UnQ Automation

**Bulk AI Image & Video Studio** — a Chrome side-panel extension that batch-runs hundreds of prompts on **Meta.ai, Google Labs Flow (Veo), Grok, Gemini, ChatGPT and Qwen**, then auto-downloads every result with clean, sequential filenames.

[![License: MIT](https://img.shields.io/badge/license-MIT-3ce9a9.svg)](LICENSE)
[![Version](https://img.shields.io/github/manifest-json/v/Sandeepgaddam5432/autobatch-extension?label=version&color=blue)](https://github.com/Sandeepgaddam5432/autobatch-extension/releases/latest)
[![Build](https://github.com/Sandeepgaddam5432/autobatch-extension/actions/workflows/build.yml/badge.svg)](https://github.com/Sandeepgaddam5432/autobatch-extension/actions)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-8957e5.svg)](manifest.json)

[Install](#-install) · [Quick start](#-quick-start) · [Features](#-features) · [Platforms](#-supported-platforms) · [Prompt sources](#-prompt-sources) · [Filenames](#-filename-tokens) · [Troubleshooting](#-troubleshooting) · [Architecture](#-architecture) · [Contributing](CONTRIBUTING.md)

</div>

---

## Why?

Generating media on AI platforms is a manual grind: paste a prompt, wait, click download, rename the file, repeat ×200. UnQ Automation turns that into a queue — load your prompts (typed, `.txt`, `.csv` or `.xlsx`), press **Run**, and walk away. The extension types, submits, waits for results, downloads them with your naming scheme, and keeps going even while the tab sits in the background.

Everything runs **locally, inside your own logged-in browser session**. No server, no API keys, no data leaves your machine — it automates the same web pages you already use by hand.

## ✨ Features

### Prompt engine
- Type prompts directly (separated by blank lines) or import `.txt`, `.csv`, `.tsv`, `.xlsx`
- `{{variable}}` templating with cartesian expansion (up to 2,000 combinations per run)
- Global prefix/suffix, repeat count, shuffle and de-duplication
- Per-row overrides in spreadsheets: `image`, `ratio`, `mode`, `outputs` columns
- Attach input images with flexible pairing (one per prompt, first for all, every image × every prompt, start + end frames)
- **Characters**: named reference images that auto-attach whenever a prompt mentions their name

### Queue engine
- 1–4 concurrent lanes with staggered starts
- Randomised delay range between submissions for human-like pacing
- Automatic retries with backoff (default 5) plus one-click retry per item
- Abort after N consecutive failures; configurable per-item timeout (default 5 min)
- Pause / resume / stop at any time; queue snapshot persisted during runs
- Offscreen heartbeat keeps runs ticking in throttled background tabs
- Live progress in the panel **and on the toolbar badge** (green count = clean, amber = some failures, ✓ / ✕ flash when the run ends)

### Downloads
- Auto-downloads every generated image/video; falls back to clicking the page's own download button (e.g. for very large videos)
- Filename token engine with guaranteed sequential numbering (see [tokens](#-filename-tokens))
- Folder per run / per date, duplicate skipping
- Library tab remembering the last 3,000 downloads

### Scheduling & safety
- Daily generation cap
- Active time window, including windows that wrap midnight (e.g. 22:00 → 06:00)
- Completion notifications with the UnQ icon

### Ops
- Remote `selectors.json` override — selector hot-fixes ship **without** an extension update ([example](selectors.example.json))
- Built-in **Probe** that reports exactly what the extension sees on the page — perfect bug reports
- One-click settings export/import (JSON)
- Localised UI strings: English, Telugu, Hindi, Vietnamese, Spanish, Chinese

## 🌐 Supported platforms

| Platform | Modes | Page controls driven per run |
| --- | --- | --- |
| **Meta.ai** | T2V · F2V · ING2V · T2I · I2I | mode & aspect-ratio pickers |
| **Google Labs Flow** (Veo / Imagen) | T2V · I2V · F2V · ING2V · T2I | model (Veo 3.1/3/2 · Quality/Fast), image model (Imagen 4 Ultra/4, Nano Banana), video length (4/6/8 s), resolution (720p/1080p/4K), outputs per prompt |
| **Grok** (Imagine) | T2I · I2I · T2V · I2V | model (Grok 4 / 4 Heavy / 3); style & ratio folded into the prompt |
| **Gemini** | T2I · I2I · T2V · I2V | model (Pro/Flash), image/video tool toggle; style & ratio via prompt |
| **ChatGPT** | T2I · I2I | model (Auto/Instant/Thinking), Create-image tool; style & ratio via prompt |
| **Qwen** | T2I · I2I · T2V · I2V | model (Qwen3 Max/Plus/VL), image/video tool toggle; style & ratio via prompt |

**Modes** — T2V: text → video · F2V: frame(s) → video · I2V: image → video · ING2V: ingredients → video · T2I: text → image · I2I: image → image.

> ⚠️ **Selector status**: Meta.ai is verified against the live page. The other platforms use best-effort selectors plus heuristic auto-detection — if a button isn't found, run **Probe** and [open an issue](https://github.com/Sandeepgaddam5432/autobatch-extension/issues) with the report. Fixes can ship instantly via remote selectors. See [STATE.md](STATE.md).

## 📦 Install

Needs a Chromium browser **≥ 114** (side-panel support): Chrome, Edge, Brave — including Android browsers that can load extensions (Kiwi, Lemur, Mises…).

### From a release (recommended)
1. Grab the zip from **[Releases → latest](https://github.com/Sandeepgaddam5432/autobatch-extension/releases/latest)**
2. **Desktop**: unzip → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the folder.
   **Android**: use the browser's *install from zip* option and pick the zip directly.
3. Open a supported site and click the UnQ toolbar icon — the side panel opens.

### From source
```bash
npm install
npm run build        # vite → dist/sidepanel (CI copies it to src/sidepanel)
```
A plain checkout already contains the compiled `src/sidepanel` bundle, so **Load unpacked** on the repo root works too. Every push to `main` makes CI rebuild the panel, regenerate icons and publish a fresh install-ready zip — see [BUILD.md](BUILD.md).

## 🚀 Quick start

1. Open a supported platform (say `meta.ai`) and log in
2. Click the UnQ icon — the panel detects the page
3. Pick a **mode** and any platform options (model, ratio, outputs…)
4. Paste prompts (blank line between each) or load a file
5. Set folder / delays / concurrency → hit **Run**

Track progress in the queue list, the Logs tab, or the toolbar badge. Files land in `Downloads/<your folder>` and appear in the Library tab.

## 📄 Prompt sources

**Typed / .txt** — one prompt per block, blank line separated.

**.csv / .tsv / .xlsx** — first row is the header:

| Column | Meaning |
| --- | --- |
| `prompt` | prompt text (required) |
| `image` | input image filename to pair with this row |
| `ratio` | aspect-ratio override, e.g. `9:16` |
| `mode` | mode override, e.g. `t2i` |
| `outputs` | outputs-per-prompt override |

**Variables** — define values in the panel, reference them as `{{name}}`:

```json
{ "city": ["Tokyo", "Paris"], "time": ["dawn", "night"] }
```

`A cinematic drone shot of {{city}} at {{time}}` → expands to 4 prompts (capped at 2,000).

## 🏷 Filename tokens

Template `{n}_{slug}` → `042_a-cinematic-drone-shot.mp4`

| Token | Value |
| --- | --- |
| `{n}` | guaranteed sequential counter (per folder or global) |
| `{index}` | prompt's position in the run |
| `{slot}` | result slot when one prompt yields multiple outputs |
| `{slug}` | slugified prompt text |
| `{date}` / `{time}` | run date / time |
| `{mode}` / `{ratio}` / `{platform}` | run metadata |
| `{ext}` | detected file extension |

Optional folder-per-date and folder-per-run subfolders.

## 🔧 Troubleshooting

| Symptom | Fix |
| --- | --- |
| "No generator page" overlay | Reload the platform tab (content scripts attach on page load) or open a supported URL |
| A button/dropdown isn't found | Run **Probe**, copy the report, [open an issue](https://github.com/Sandeepgaddam5432/autobatch-extension/issues) — selectors can be hot-fixed remotely without an update |
| Mode/ratio not applied | Pickers are matched by visible label text (locale-dependent) — try the page in English, or report your locale's labels |
| Huge video won't auto-download | Downloads above the 25 MB relay cap fall back to the page's own download button |
| Run stalls when the tab is backgrounded | Keep **Keep awake** enabled (offscreen heartbeat) |

The Logs tab's **Copy report** bundles the probe output and run log — paste that into any bug report.

## 🏗 Architecture

```
manifest.json              MV3 · side panel · content scripts
src/
  background.js            service worker: downloads, notifications, toolbar badge, offscreen lifecycle
  content/content.js       bridge: panel messages ↔ in-page engine, dynamic module loading
  registry.js              host → adapter registry
  adapters/
    base.js                createAdapter factory: DOM driving, waiting, downloading
    autodetect.js          heuristic selector fallback
    meta / flow / grok / gemini / chatgpt / qwen.js    ~100-line platform configs
  core/
    runner.js              per-item orchestration: options → submit → wait → download
    pool.js                concurrency lanes, retries/backoff, pause gates
    prompts.js             parsing, {{var}} expansion, job building
    filename.js            token engine        schedule.js   windows & daily caps
    storage.js             settings/library/queue persistence
    ticker.js · logger.js · selectors.js · xlsx.js
  offscreen/               keep-alive heartbeat document
ui/                        React 18 + Tailwind 4 side panel (compiled into src/sidepanel by CI)
```

**Message flow**: panel → `UNQ_START` → content bridge → engine → `UNQ_EVENT` broadcasts → panel + toolbar badge; engine → `UNQ_DOWNLOAD` / `UNQ_NOTIFY` → service worker.

## 🤝 Contributing

PRs welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)**. Highest-impact help right now: live-verifying selectors on Flow/Grok/Gemini/ChatGPT/Qwen (via Probe reports) and new platform adapters (~100 lines each).

## 📜 License

[MIT](LICENSE) © 2026 Sandeep Gaddam. The "UnQ" name and logo are brand assets — see [NOTICE.md](NOTICE.md).
