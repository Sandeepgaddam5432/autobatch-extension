export const ASPECT_RATIOS = [
	{ value: "16:9", label: "16:9 (YouTube)" },
	{ value: "9:16", label: "9:16 (Shorts/Reels)" },
	{ value: "1:1", label: "1:1 (Square)" },
	{ value: "2:3", label: "2:3 (Portrait)" },
	{ value: "3:2", label: "3:2 (Landscape)" },
]

export const MODES = [
	{ value: "t2v", label: "Text to Video", needsImages: false },
	{ value: "f2v", label: "Frame to Video", needsImages: true },
	{ value: "i2v", label: "Image to Video", needsImages: true },
	{ value: "ing2v", label: "Ingredients to Video", needsImages: true },
	{ value: "t2i", label: "Text to Image", needsImages: false },
	{ value: "i2i", label: "Image to Image", needsImages: true },
]

export const DEFAULTS = {
	// control tab
	mode: "t2v",
	concurrency: 1,
	delayMinSec: 0,
	delayMaxSec: 10,
	outputsPerPrompt: 1,
	folder: "unq-folder-1",
	autoRenameFiles: true,
	autoAddCharacterImages: false,
	maxInputImages: 1,
	frameOption: "startOnly", // startOnly | startAndEnd
	imageMatchMode: "oneToOne",

	// prompt shaping
	prefix: "",
	suffix: "",
	variablesJson: "",
	repeatCount: 1,
	shuffle: false,
	dedupe: true,

	// settings tab
	defaultMode: "t2v",
	aspectRatio: "16:9",
	videoOption: "5s", // 5s | 5s-concat
	imageModeOption: "new", // new | last
	maxRetries: 5,
	downloadQualityVideo: "720p", // none | 720p | 1080p | 4k
	downloadQualityImage: "1k", // none | 1k | 4k
	locale: "auto",
	theme: "dark",

	// engine
	timeoutMs: 300000,
	stopOnConsecutiveFailures: 5,
	autoDownload: true,
	skipDuplicates: true,
	filenameTemplate: "{n}_{slug}",
	startIndex: 1,
	folderPerDate: false,
	folderPerRun: false,
	scheduleEnabled: false,
	windowStart: "00:00",
	windowEnd: "23:59",
	dailyLimit: 0,
	keepAwake: true,
	notifyOnFinish: true,
	selectorConfigUrl: "",
	autoDetectSelectors: true,
	lastPrompts: "",
}

const KEY = "unq.settings"
const LIB = "unq.library"
const COUNTER = "unq.counters"
const QUEUE = "unq.queue"

export async function getSettings() {
	const stored = await chrome.storage.local.get(KEY)
	const settings = { ...DEFAULTS, ...(stored[KEY] || {}) }
	// engine still speaks milliseconds; the UI speaks seconds
	settings.delayMinMs = Math.round((Number(settings.delayMinSec) || 0) * 1000)
	settings.delayMaxMs = Math.round((Number(settings.delayMaxSec) || 0) * 1000)
	return settings
}

export async function setSettings(patch) {
	const current = await getSettings()
	const next = { ...current, ...patch }
	delete next.delayMinMs
	delete next.delayMaxMs
	await chrome.storage.local.set({ [KEY]: next })
	return await getSettings()
}

export async function resetSettings() {
	await chrome.storage.local.set({ [KEY]: { ...DEFAULTS } })
	return await getSettings()
}

/* ---------- download counter (guarantees 1,2,3... numbering) ---------- */

export async function nextCounter(scope, startAt = 1) {
	const stored = await chrome.storage.local.get(COUNTER)
	const counters = stored[COUNTER] || {}
	const current = typeof counters[scope] === "number" ? counters[scope] : startAt - 1
	counters[scope] = current + 1
	await chrome.storage.local.set({ [COUNTER]: counters })
	return counters[scope]
}

export async function resetCounter(scope) {
	const stored = await chrome.storage.local.get(COUNTER)
	const counters = stored[COUNTER] || {}
	delete counters[scope]
	await chrome.storage.local.set({ [COUNTER]: counters })
}

/* ---------- daily limit tracking ---------- */

export async function bumpDailyUsage(n = 1) {
	const today = new Date().toISOString().slice(0, 10)
	const stored = await chrome.storage.local.get("unq.daily")
	const daily = stored["unq.daily"] || { date: today, count: 0 }
	if (daily.date !== today) {
		daily.date = today
		daily.count = 0
	}
	daily.count += n
	await chrome.storage.local.set({ "unq.daily": daily })
	return daily
}

export async function getDailyUsage() {
	const today = new Date().toISOString().slice(0, 10)
	const stored = await chrome.storage.local.get("unq.daily")
	const daily = stored["unq.daily"] || { date: today, count: 0 }
	return daily.date === today ? daily : { date: today, count: 0 }
}

/* ---------- result library ---------- */

const LIB_CAP = 3000

export async function addLibraryEntries(entries) {
	if (!entries || !entries.length) return
	const stored = await chrome.storage.local.get(LIB)
	const library = stored[LIB] || []
	library.unshift(...entries)
	await chrome.storage.local.set({ [LIB]: library.slice(0, LIB_CAP) })
}

export async function getLibrary() {
	const stored = await chrome.storage.local.get(LIB)
	return stored[LIB] || []
}

export async function clearLibrary() {
	await chrome.storage.local.set({ [LIB]: [] })
}

/* ---------- queue snapshot ---------- */

export async function saveQueueSnapshot(snapshot) {
	await chrome.storage.local.set({ [QUEUE]: snapshot })
}

export async function getQueueSnapshot() {
	const stored = await chrome.storage.local.get(QUEUE)
	return stored[QUEUE] || null
}

export async function clearQueueSnapshot() {
	await chrome.storage.local.remove(QUEUE)
}

/** "Clear Cache": selector cache, counters, queue snapshot, logs. Keeps settings. */
export async function clearCaches() {
	await chrome.storage.local.remove(["unq.selectorCache", COUNTER, QUEUE, "unq.logs"])
}

/* ---------- settings import / export ---------- */

export async function exportConfig() {
	const settings = await getSettings()
	delete settings.delayMinMs
	delete settings.delayMaxMs
	return JSON.stringify({ app: "UnQ Automation", version: 3, settings }, null, 2)
}

export async function importConfig(json) {
	const parsed = JSON.parse(json)
	const incoming = parsed && parsed.settings ? parsed.settings : parsed
	const allowed = {}
	for (const key of Object.keys(DEFAULTS)) {
		if (key in incoming) allowed[key] = incoming[key]
	}
	return await setSettings(allowed)
}
