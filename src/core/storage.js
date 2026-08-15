export const DEFAULTS = {
	// generation
	mode: "t2i",
	aspectRatio: "1:1",
	outputsPerPrompt: 1,

	// pacing
	concurrency: 1,
	delayMinMs: 6000,
	delayMaxMs: 9000,
	maxRetries: 2,
	timeoutMs: 300000,

	// prompt shaping
	prefix: "",
	suffix: "",
	variablesJson: "",
	repeatCount: 1,
	shuffle: false,
	dedupe: true,

	// image pairing (image-to-* modes)
	imageMatchMode: "oneToOne", // oneToOne | oneImageAllPrompts | allImagesEachPrompt | firstLastFrame

	// downloads
	autoDownload: true,
	downloadQuality: "best", // best | 1080p | 720p | gif
	folder: "UnQ",
	folderPerDate: false,
	folderPerRun: false,
	filenameTemplate: "{n}_{slug}",
	startIndex: 1,
	skipDuplicates: true,

	// scheduling / limits
	scheduleEnabled: false,
	windowStart: "00:00",
	windowEnd: "23:59",
	dailyLimit: 0, // 0 = unlimited

	// runtime behavior
	keepAwake: true, // survive background-tab throttling
	notifyOnFinish: true,
	stopOnConsecutiveFailures: 5,

	// app
	theme: "dark",
	locale: "auto",
	selectorConfigUrl: "",
	lastPrompts: "",
}

const KEY = "unq.settings"
const LIB = "unq.library"
const COUNTER = "unq.counters"
const QUEUE = "unq.queue"

export async function getSettings() {
	const stored = await chrome.storage.local.get(KEY)
	return { ...DEFAULTS, ...(stored[KEY] || {}) }
}

export async function setSettings(patch) {
	const next = { ...(await getSettings()), ...patch }
	await chrome.storage.local.set({ [KEY]: next })
	return next
}

export async function resetSettings() {
	await chrome.storage.local.set({ [KEY]: { ...DEFAULTS } })
	return { ...DEFAULTS }
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

/* ---------- queue snapshot (resume after reload) ---------- */

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

/* ---------- settings import / export ---------- */

export async function exportConfig() {
	const settings = await getSettings()
	return JSON.stringify({ app: "UnQ Automation", version: 2, settings }, null, 2)
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
