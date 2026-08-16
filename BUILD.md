# Build

The engine (`src/core`, `src/adapters`, `src/background.js`, `src/content`) stays
plain ES modules with no build step. Only the side panel UI is compiled.

## Why a build step for the UI only

A Chrome side panel can only render HTML, so "switching away from HTML" is not
possible — what actually changes perceived quality is the toolchain behind it:

- **React + TypeScript** — state for queue/run events is real state, not manual DOM writes
- **Tailwind v4** — one design-token scale instead of hand-tuned CSS values
- **Lucide** — real stroke icons; emoji glyphs were the single biggest reason the
  old panel looked unpolished, since they render differently per OS and cannot
  inherit colour or weight
- **Vite** — tree-shaken, minified output

## Commands

```bash
npm install
npm run build     # outputs dist/sidepanel
npm run dev       # rebuild on save
npm run typecheck
```

## Loading the extension

The UI build lands in `dist/sidepanel`. Until you have run a build at least
once, `manifest.json` keeps pointing at the build-free panel in
`src/sidepanel/index.html`, so the extension always loads.

After a successful build, switch the manifest to the compiled panel:

```json
"side_panel": { "default_path": "dist/sidepanel/ui/index.html" }
```

Check the exact emitted path inside `dist/sidepanel` first — Vite mirrors the
input folder structure.

## No Node available?

Stay on `src/sidepanel`. It is feature-complete and needs no build; the React UI
is an upgrade path, not a replacement.
