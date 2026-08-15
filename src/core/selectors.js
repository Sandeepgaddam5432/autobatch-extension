const CACHE_KEY = "unq.selectorCache"
const MAX_AGE_MS = 6 * 60 * 60 * 1000

/**
 * Remote selector config: a JSON file shaped like
 * { "version": 3, "platforms": { "meta": { "composer": ["..."] } } }
 * When a platform changes its UI, publishing a new JSON fixes every user
 * immediately — no Web Store review, no reinstall.
 */
export async function loadSelectorOverrides(url) {
	const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || null
	if (!url) return cached && cached.platforms ? cached.platforms : null

	if (cached && cached.url === url && Date.now() - cached.at < MAX_AGE_MS) {
		return cached.platforms
	}
	try {
		const response = await fetch(url, { cache: "no-store" })
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		const json = await response.json()
		const platforms = json && json.platforms ? json.platforms : null
		await chrome.storage.local.set({ [CACHE_KEY]: { url, at: Date.now(), platforms } })
		return platforms
	} catch (err) {
		return cached && cached.platforms ? cached.platforms : null
	}
}
