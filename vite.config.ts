import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwind from "@tailwindcss/vite"
import { resolve } from "node:path"

// root is ui/ so the bundle lands at dist/sidepanel/index.html rather than
// dist/sidepanel/ui/index.html, keeping the manifest path stable.
export default defineConfig({
	plugins: [react(), tailwind()],
	root: resolve(__dirname, "ui"),
	base: "./",
	build: {
		outDir: resolve(__dirname, "dist/sidepanel"),
		emptyOutDir: true,
		target: "chrome120",
		// the modulepreload polyfill injects an inline script, which MV3's
		// content security policy rejects
		modulePreload: false,
		sourcemap: false,
	},
})
