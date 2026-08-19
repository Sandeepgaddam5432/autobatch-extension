# Contributing to UnQ Automation

Thanks for helping! The project is MIT-licensed and contributions of every size are welcome — from a one-line selector fix to a whole new platform adapter.

## Highest-impact ways to help

1. **Verify selectors on live pages.** Only Meta.ai is fully verified today. Open Flow/Grok/Gemini/ChatGPT/Qwen, run a small batch, and if something misbehaves click **Probe** in the panel and attach the report to an issue.
2. **Fix selectors or add adapters** (guide below).
3. **Improve docs & translations** — UI strings live in `_locales/`.
4. **Report bugs** — always attach the Probe report + run log (Logs tab → Copy report).

## Dev setup

Requires Node 20+.

```bash
npm install
npm run build        # vite build → dist/sidepanel
npm run typecheck
```

- The **engine** (`src/`) is plain, dependency-free ESM JavaScript — no build step. Edit, then reload the extension.
- The **panel UI** (`ui/`) compiles to `src/sidepanel/`. Locally, copy `dist/sidepanel/` over `src/sidepanel/`; on `main`, CI does this automatically and publishes an install-ready zip to the `latest` release.
- Load the repo root via `chrome://extensions` → Developer mode → **Load unpacked**.

## Adding a platform adapter

Adapters are small declarative configs (~100 lines). Create `src/adapters/<id>.js`:

```js
import { createAdapter } from "./base.js"

export default createAdapter({
	id: "myplatform",
	label: "My Platform",
	host: "example.com",
	modes: ["t2i", "i2i"],
	aspectRatios: ["1:1", "16:9"],
	selectors: {
		composer: ["textarea"],
		sendButton: ['button[type="submit"]'],
		media: ["img"],
		downloadButton: ["a[download]"],
		fileInput: ['input[type="file"]'],
		errorToast: ['[role="alert"]'],
	},
	modeLabels: { t2i: ["Create image"], i2i: ["Edit image"] },
	options: [
		// page dropdowns/toggles applied once at run start;
		// promptOnly options are appended to the prompt text instead
	],
})
```

Then:
1. Register it in `src/registry.js`
2. Add the host to `manifest.json` → `host_permissions`, `content_scripts[0].matches`, `web_accessible_resources[0].matches`

Notes:
- Every selector is an **ordered fallback list**; anything missing is resolved heuristically by `adapters/autodetect.js`.
- Selectors can also be hot-fixed after release via the remote `selectors.json` mechanism — see `selectors.example.json`.
- `overrides.decoratePrompt(text)` lets you fold style/ratio hints into the prompt for platforms without native controls (see `grok.js`).

## Code style

- Tabs for indentation, double quotes, no semicolons (match the existing files)
- Engine code stays dependency-free plain ESM
- Run `npm run typecheck` before PRs that touch `ui/`

## PR checklist

- [ ] One focused change per PR
- [ ] `CHANGELOG.md` updated
- [ ] Selector changes: attach a Probe report (or a screen recording) from the live page
- [ ] `npm run build` and `npm run typecheck` pass

## Releases

Every merge to `main` triggers CI ([build.yml](.github/workflows/build.yml)): it rebuilds the panel, regenerates icons, commits the bundle back, and publishes `unq-automation-<version>-<sha>.zip` to the **latest** release.
