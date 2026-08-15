// URL -> adapter mapping. Adding a platform = one entry here + one adapter file.
export const ADAPTERS = [
	{ id: "meta", label: "Meta.ai", match: /^https:\/\/(www\.)?meta\.ai\//i, path: "src/adapters/meta.js" },
	// v0.3 roadmap:
	// { id: "flow",    label: "Google Labs Flow", match: /^https:\/\/labs\.google\//i,  path: "src/adapters/flow.js" },
	// { id: "grok",    label: "Grok",             match: /^https:\/\/grok\.com\//i,      path: "src/adapters/grok.js" },
	// { id: "chatgpt", label: "ChatGPT / Sora",   match: /^https:\/\/chatgpt\.com\//i,   path: "src/adapters/chatgpt.js" },
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
