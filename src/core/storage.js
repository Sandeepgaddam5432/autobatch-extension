export const DEFAULTS = {
	mode: "t2i",
	aspectRatio: "1:1",
	concurrency: 1,
	delayMs: 6000,
	maxRetries: 2,
	timeoutMs: 300000,
	outputsPerPrompt: 1,
	autoDownload: true,
	folder: "autobatch",
	lastPrompts: "",
}

export async function getSettings() {
	const stored = await chrome.storage.local.get("settings")
	return { ...DEFAULTS, ...(stored.settings || {}) }
}

export async function setSettings(patch) {
	const next = { ...(await getSettings()), ...patch }
	await chrome.storage.local.set({ settings: next })
	return next
}
