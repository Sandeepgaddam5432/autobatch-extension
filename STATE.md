# Project state

## Verified

- v0.1 loaded unpacked and ran end-to-end on Meta.ai (user-confirmed)

## Needs verification (run Probe)

Selectors for **flow, grok, gemini, chatgpt, qwen** were written from generic
patterns, not from the live DOM. Meta.ai selectors are the only ones exercised so
far. For each site: open it, run `window.__UNQ__.probe()`, and fix the failing
list in that platform's adapter file.

## Known limitations

- Mode / aspect-ratio switching uses visible label text, so it is locale-dependent
- `downloadQuality` is stored and passed to adapters but no adapter implements a
  quality picker yet (always "best available")
- Videos over 25 MB cannot be relayed as data URLs; the runner falls back to the
  site's own download button
- Hosts are static in the manifest; the `optional_host_permissions` flow is not wired yet
- No extension icon files, so the toolbar shows the default placeholder
- Watermark removal is deliberately out of scope

## Next

1. Fix real selectors per platform from Probe output
2. Publish a hosted `selectors.json` and set it in Settings
3. Seedance / Dreamina, Vibes, Canva adapters
4. Firefox (MV3) build
