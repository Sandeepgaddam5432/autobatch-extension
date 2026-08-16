import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwind from "@tailwindcss/vite"
import { resolve } from "node:path"

// Builds the side panel into dist/sidepanel so the extension can be loaded
// unpacked from dist/ while src/ keeps the build-free engine modules.
export default defineConfig({
	plugins: [react(), tailwind()],
	base: "./",
	build: {
		outDir: "dist/sidepanel",
		emptyOutDir: true,
		target: "chrome120",
		rollupOptions: {
			input: resolve(__dirname, "ui/index.html"),
		},
	},
})
