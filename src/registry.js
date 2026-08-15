// URL -> adapter mapping. Adding a platform = one entry here + one adapter
// file + the host in manifest.json. Core code is never touched.
export const ADAPTERS = [
	{ id: "meta", label: "Meta.ai", match: /^https:\/\/([a-z0-9-]+\.)?meta\.ai\//i, path: "src/adapters/meta.js" },
	{ id: "flow", label: "Google Labs Flow", match: /^https:\/\/labs\.google\//i, path: "src/adapters/flow.js" },
	{ id: "grok", label: "Grok", match: /^https:\/\/grok\.com\//i, path: "src/adapters/grok.js" },
	{ id: "gemini", label: "Gemini", match: /^https:\/\/gemini\.google\.com\//i, path: "src/adapters/gemini.js" },
	{ id: "chatgpt", label: "ChatGPT / Sora", match: /^https:\/\/chatgpt\.com\//i, path: "src/adapters/chatgpt.js" },
	{ id: "qwen", label: "Qwen", match: /^https:\/\/chat\.qwen\.ai\//i, path: "src/adapters/qwen.js" },
]

export function findAdapterMeta(href) {
	return ADAPTERS.find((entry) => entry.match.test(href)) || null
}

export async function loadAdapter(href) {
	const meta = findAdapterMeta(href)
	if (!meta) return null
	const module = await import(chrome.runtime.getURL(meta.path))
	return module.default
}
