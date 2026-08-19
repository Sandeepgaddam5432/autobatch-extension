# Changelog

## v0.9.0 — Production hardening

- **Live toolbar badge** — the extension icon now mirrors run progress: a green count of finished items, amber once something has failed, and a ✓ or failure count flashed for 12 s when the run ends
- **New mode: Image to Video (i2v)** — the Qwen adapter always supported it, but the shared mode list didn't include it, so the button never appeared in the panel
- **Real notification icon** — completion notifications use the UnQ logo instead of a 1×1 placeholder pixel
- **Version sync** — manifest.json and package.json now agree (previously 0.8.2 vs 0.8.1)
- **Install guard** — `minimum_chrome_version: 114` (the Side Panel API floor), so unsupported Chromium builds refuse the install instead of breaking at runtime
- **Modern UI pass** — aurora canvas backdrop, larger radii (14/10), crisper hairlines, layered card shadows with hover borders, tactile button press feedback, gradient toggle switches, and accent focus borders on inputs

## v0.2.0 — UnQ Automation

- **Rebranded** from AutoBatch to **UnQ Automation**
- **6 platforms**: Meta.ai, Google Labs Flow, Grok, Gemini, ChatGPT/Sora, Qwen
- **Adapter factory** (`adapters/base.js`) — platform files are now ~30 lines of selectors
- Prompt variables `{{token}}` with cartesian expansion, prefix/suffix, repeat, shuffle, dedupe
- CSV / TSV import with per-row `image`, `ratio`, `mode`, `outputs` overrides
- Multi-image upload with 4 pairing modes (incl. first+last frame)
- Randomised delay range, pause/resume, per-item retry, retry-all-failed, abort after N failures
- Filename token engine, guaranteed sequential numbering, folder per date/run, duplicate skipping
- Scheduling: time window (wraps midnight) and daily generation cap
- **Offscreen 1s heartbeat** so runs survive background tabs / minimised windows
- **Remote selectors.json** so site UI changes can be fixed without an update
- 4-tab side panel, result library with CSV/JSON export, settings import/export, light theme, pop-out window
- i18n: en, te, hi, vi, es, zh_CN
- Completion notifications

## v0.1.0

- MV3 skeleton, Meta.ai adapter, core queue/pool/runner, side panel
