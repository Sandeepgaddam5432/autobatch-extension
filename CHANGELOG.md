# Changelog

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
