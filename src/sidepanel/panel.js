import {
	DEFAULTS,
	getSettings,
	setSettings,
	resetSettings,
	getLibrary,
	clearLibrary,
	getDailyUsage,
	exportConfig,
	importConfig,
	resetCounter,
} from "../core/storage.js"
import { parseAny, parseVariables, buildJobs } from "../core/prompts.js"

const $ = (id) => document.getElementById(id)

const FIELDS = [
	"mode",
	"aspectRatio",
	"outputsPerPrompt",
	"concurrency",
	"delayMinMs",
	"delayMaxMs",
	"maxRetries",
	"timeoutMs",
	"stopOnConsecutiveFailures",
	"prefix",
	"suffix",
	"variablesJson",
	"repeatCount",
	"shuffle",
	"dedupe",
	"imageMatchMode",
	"autoDownload",
	"downloadQuality",
	"folder",
	"folderPerDate",
	"folderPerRun",
	"filenameTemplate",
	"startIndex",
	"skipDuplicates",
	"scheduleEnabled",
	"windowStart",
	"windowEnd",
	"dailyLimit",
	"keepAwake",
	"notifyOnFinish",
	"theme",
	"locale",
	"selectorConfigUrl",
]

let rows = [] // parsed prompt rows
let images = [] // { name, dataUrl }
let jobs = []
let itemState = new Map()
let startedAt = 0
let running = false

/* ---------------- i18n ---------------- */
function applyI18n() {
	for (const el of document.querySelectorAll("[data-i18n]")) {
		const message = chrome.i18n.getMessage(el.dataset.i18n)
		if (message) el.textContent = message
	}
}

/* ---------------- settings binding ---------------- */
async function loadSettings() {
	const settings = await getSettings()
	for (const key of FIELDS) {
		const el = $(key)
		if (!el) continue
		if (el.type === "checkbox") el.checked = !!settings[key]
		else el.value = settings[key] ?? ""
	}
	$("prompts").value = settings.lastPrompts || ""
	document.body.dataset.theme = settings.theme === "light" ? "light" : "dark"
	reparse()
	refreshDaily()
	return settings
}

function readForm() {
	const out = {}
	for (const key of FIELDS) {
		const el = $(key)
		if (!el) continue
		if (el.type === "checkbox") out[key] = el.checked
		else if (el.type === "number") out[key] = Number(el.value)
		else out[key] = el.value
	}
	return out
}

let saveTimer = null
function scheduleSave() {
	clearTimeout(saveTimer)
	saveTimer = setTimeout(() => {
		setSettings({ ...readForm(), lastPrompts: $("prompts").value }).catch(() => {})
	}, 400)
}

/* ---------------- prompt parsing ---------------- */
function reparse() {
	rows = parseAny($("prompts").value, "inline.txt")
	$("promptCount").textContent = `${rows.length} prompts`
	try {
		const preview = buildJobs({
			rows,
			variables: parseVariables($("variablesJson").value),
			prefix: $("prefix").value,
			suffix: $("suffix").value,
			repeatCount: Number($("repeatCount").value) || 1,
			dedupe: $("dedupe").checked,
			shuffle: false,
			images,
			imageMatchMode: $("imageMatchMode").value,
		})
		$("expandCount").textContent = `→ ${preview.length} jobs after expansion`
	} catch (err) {
		$("expandCount").textContent = `variables JSON error: ${err.message}`
	}
}

/* ---------------- logging + status ---------------- */
function log(line) {
	const el = $("log")
	el.textContent = `${new Date().toLocaleTimeString()}  ${line}\n${el.textContent}`.slice(0, 12000)
}

function setStatus(text, kind = "") {
	$("status").textContent = text
	$("status").className = `pill ${kind}`
}

function setRunning(state) {
	running = state
	$("run").disabled = state
	$("stop").disabled = !state
	$("pause").disabled = !state
	$("pause").textContent = "Pause"
}

/* ---------------- queue rendering ---------------- */
function renderQueue() {
	const filter = ($("queueFilter").value || "").toLowerCase()
	const host = $("queue")
	host.innerHTML = ""
	for (const job of jobs) {
		if (filter && !job.text.toLowerCase().includes(filter)) continue
		const state = itemState.get(job.index) || { status: "queued", note: "" }
		const item = document.createElement("div")
		item.className = `item ${state.status}`
		const text = document.createElement("div")
		text.className = "txt"
		text.textContent = `${job.index + 1}. ${job.text}`
		const meta = document.createElement("div")
		meta.className = "meta"
		const left = document.createElement("span")
		left.textContent = `${state.status}${state.note ? ` · ${state.note}` : ""}`
		meta.appendChild(left)
		if (state.status === "failed" && running) {
			const retry = document.createElement("button")
			retry.className = "mini ghost"
			retry.textContent = "retry"
			retry.onclick = () => sendToTab({ type: "UNQ_RETRY_ITEM", job })
			meta.appendChild(retry)
		}
		item.append(text, meta)
		host.appendChild(item)
	}
}

function updateProgress(stats) {
	if (!stats || !stats.total) return
	const finished = stats.done + stats.failed
	$("barFill").style.width = `${Math.round((finished / stats.total) * 100)}%`
	$("summary").textContent = `${finished}/${stats.total} · ${stats.downloaded} saved${
		stats.failed ? ` · ${stats.failed} failed` : ""
	}`
	if (finished > 0 && startedAt) {
		const per = (Date.now() - startedAt) / finished
		const left = Math.max(0, Math.round((per * (stats.total - finished)) / 1000))
		$("eta").textContent = `~${Math.floor(left / 60)}m ${left % 60}s left`
	}
}

/* ---------------- tab messaging ---------------- */
async function activeTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	return tab
}

async function sendToTab(message) {
	const tab = await activeTab()
	if (!tab) throw new Error("no active tab")
	return await chrome.tabs.sendMessage(tab.id, message)
}

async function detect() {
	try {
		const info = await sendToTab({ type: "UNQ_PING" })
		if (info && info.ok) {
			$("platformLabel").textContent = info.label
			if (info.aspectRatios && info.aspectRatios.length) {
				const select = $("aspectRatio")
				const current = select.value
				select.innerHTML = ""
				for (const ratio of info.aspectRatios) {
					const option = document.createElement("option")
					option.value = ratio
					option.textContent = ratio
					select.appendChild(option)
				}
				select.value = info.aspectRatios.includes(current) ? current : info.aspectRatios[0]
			}
			setRunning(!!info.running)
			setStatus(info.running ? "running" : "ready", info.running ? "running" : "")
			return info
		}
	} catch (err) {
		/* no content script on this tab */
	}
	$("platformLabel").textContent = "unsupported page"
	setStatus("open a supported site", "err")
	return null
}

/* ---------------- library ---------------- */
async function renderLibrary() {
	const filter = ($("libFilter").value || "").toLowerCase()
	const entries = await getLibrary()
	const host = $("library")
	host.innerHTML = ""
	const shown = entries
		.filter((entry) => !filter || (entry.prompt || "").toLowerCase().includes(filter))
		.slice(0, 300)
	if (!shown.length) {
		host.innerHTML = '<div class="hint">Nothing yet.</div>'
		return
	}
	for (const entry of shown) {
		const item = document.createElement("div")
		item.className = "item done"
		const text = document.createElement("div")
		text.className = "txt"
		text.textContent = entry.prompt
		const meta = document.createElement("div")
		meta.className = "meta"
		const left = document.createElement("span")
		left.textContent = `${entry.platform} · ${entry.mode} · ${new Date(entry.ts).toLocaleString()}`
		meta.appendChild(left)
		if (entry.filename) {
			const name = document.createElement("span")
			name.textContent = entry.filename
			meta.appendChild(name)
		}
		item.append(text, meta)
		host.appendChild(item)
	}
}

function saveBlob(content, filename, mime) {
	const blob = new Blob([content], { type: mime })
	const link = document.createElement("a")
	link.href = URL.createObjectURL(blob)
	link.download = filename
	link.click()
	setTimeout(() => URL.revokeObjectURL(link.href), 5000)
}

async function refreshDaily() {
	const daily = await getDailyUsage()
	$("dailyUsage").textContent = `Today: ${daily.count} generations`
}

/* ---------------- run ---------------- */
async function startRun() {
	reparse()
	if (!rows.length) {
		log("no prompts")
		return
	}
	const info = await detect()
	if (!info) return

	const settings = await setSettings({ ...readForm(), lastPrompts: $("prompts").value })
	let variables = {}
	try {
		variables = parseVariables(settings.variablesJson)
	} catch (err) {
		log(`variables JSON invalid: ${err.message}`)
		return
	}

	jobs = buildJobs({
		rows,
		variables,
		prefix: settings.prefix,
		suffix: settings.suffix,
		repeatCount: settings.repeatCount,
		dedupe: settings.dedupe,
		shuffle: settings.shuffle,
		images,
		imageMatchMode: settings.imageMatchMode,
	})
	itemState = new Map()
	startedAt = Date.now()
	if (settings.startIndex && settings.startIndex > 0) await resetCounter(`${settings.folder}:global`)
	renderQueue()

	const reply = await sendToTab({ type: "UNQ_START", config: { ...settings, jobs } })
	if (!reply || !reply.ok) {
		log(`start failed: ${(reply && reply.error) || "unknown"}`)
		return
	}
	setRunning(true)
	setStatus("running", "running")
	log(`run started · ${jobs.length} jobs on ${info.label}`)
}

/* ---------------- events from the page ---------------- */
chrome.runtime.onMessage.addListener((message) => {
	if (!message || message.type !== "UNQ_EVENT") return
	const event = message.event
	const mark = (status, note) => {
		if (typeof event.index === "number") itemState.set(event.index, { status, note })
		renderQueue()
	}

	switch (event.type) {
		case "run:started":
			setRunning(true)
			setStatus("running", "running")
			break
		case "item:submitting":
			mark("running", "submitting")
			break
		case "item:generating":
			mark("running", "generating")
			break
		case "item:generated":
			mark("running", `${event.count} result(s)`)
			break
		case "item:downloaded":
			mark("running", `${event.count} saved`)
			break
		case "item:downloadFailed":
			log(`download failed #${event.index + 1}: ${event.error}`)
			break
		case "item:retry":
			mark("running", `retry ${event.attempt}`)
			log(`retry #${event.index + 1}: ${event.error}`)
			break
		case "item:done":
			mark("done", "")
			break
		case "item:failed":
			mark("failed", event.error)
			log(`failed #${event.index + 1}: ${event.error}`)
			break
		case "run:cooldown":
			setStatus(`cooldown ${Math.round(event.ms / 1000)}s`, "running")
			break
		case "run:waiting":
			setStatus(`waiting (${event.reason})`, "paused")
			break
		case "run:blocked":
			setStatus("daily cap reached", "err")
			break
		case "run:paused":
			setStatus("paused", "paused")
			break
		case "run:resumed":
			setStatus("running", "running")
			break
		case "run:aborted":
			log(`aborted: ${event.reason}`)
			break
		case "run:error":
			setRunning(false)
			setStatus("error", "err")
			log(`error: ${event.error}`)
			break
		case "run:stopped":
		case "run:finished":
			setRunning(false)
			setStatus(event.type === "run:finished" ? "finished" : "stopped", "done")
			log(`${event.type} in ${Math.round((event.elapsedMs || 0) / 1000)}s`)
			renderLibrary()
			refreshDaily()
			break
		default:
			break
	}
	updateProgress(event.stats)
})

/* ---------------- wiring ---------------- */
for (const tab of document.querySelectorAll(".tab")) {
	tab.onclick = () => {
		for (const el of document.querySelectorAll(".tab")) el.classList.toggle("active", el === tab)
		for (const el of document.querySelectorAll(".panel")) {
			el.classList.toggle("active", el.id === `tab-${tab.dataset.tab}`)
		}
		if (tab.dataset.tab === "library") renderLibrary()
		if (tab.dataset.tab === "queue") renderQueue()
	}
}

for (const key of FIELDS) {
	const el = $(key)
	if (!el) continue
	el.addEventListener("change", () => {
		scheduleSave()
		if (["variablesJson", "prefix", "suffix", "repeatCount", "dedupe", "imageMatchMode"].includes(key)) {
			reparse()
		}
		if (key === "theme") document.body.dataset.theme = el.value
	})
}

$("prompts").addEventListener("input", () => {
	reparse()
	scheduleSave()
})

$("promptFile").addEventListener("change", async (event) => {
	const file = event.target.files[0]
	if (!file) return
	const text = await file.text()
	const parsed = parseAny(text, file.name)
	$("prompts").value = parsed.map((row) => row.text).join("\n\n")
	reparse()
	scheduleSave()
	log(`loaded ${parsed.length} prompts from ${file.name}`)
})

$("imageFiles").addEventListener("change", async (event) => {
	images = []
	for (const file of event.target.files) {
		const dataUrl = await new Promise((resolve) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.readAsDataURL(file)
		})
		images.push({ name: file.name, dataUrl })
	}
	$("imageCount").textContent = `${images.length} images`
	reparse()
})

$("run").onclick = () => startRun().catch((err) => log(`run error: ${err.message}`))
$("stop").onclick = () => sendToTab({ type: "UNQ_STOP" }).catch(() => {})
$("pause").onclick = async () => {
	const paused = $("pause").textContent === "Pause"
	await sendToTab({ type: paused ? "UNQ_PAUSE" : "UNQ_RESUME" }).catch(() => {})
	$("pause").textContent = paused ? "Resume" : "Pause"
}
$("probe").onclick = async () => {
	try {
		const info = await sendToTab({ type: "UNQ_PING" })
		const text = JSON.stringify(info && info.probe, null, 2)
		log(`probe ${text}`)
		$("probeOut").textContent = text
	} catch (err) {
		log(`probe failed: ${err.message}`)
	}
}
$("retryFailed").onclick = async () => {
	for (const [index, state] of itemState) {
		if (state.status !== "failed") continue
		const job = jobs.find((candidate) => candidate.index === index)
		if (job) await sendToTab({ type: "UNQ_RETRY_ITEM", job }).catch(() => {})
	}
}
$("queueFilter").oninput = renderQueue
$("libFilter").oninput = renderLibrary
$("clearLib").onclick = async () => {
	await clearLibrary()
	renderLibrary()
}
$("exportJson").onclick = async () => {
	saveBlob(JSON.stringify(await getLibrary(), null, 2), "unq-library.json", "application/json")
}
$("exportCsv").onclick = async () => {
	const entries = await getLibrary()
	const header = "timestamp,platform,mode,ratio,filename,prompt\n"
	const body = entries
		.map((entry) =>
			[
				new Date(entry.ts).toISOString(),
				entry.platform,
				entry.mode,
				entry.ratio,
				entry.filename,
				`"${String(entry.prompt || "").replace(/"/g, '""')}"`,
			].join(",")
		)
		.join("\n")
	saveBlob(header + body, "unq-library.csv", "text/csv")
}
$("exportCfg").onclick = async () => saveBlob(await exportConfig(), "unq-settings.json", "application/json")
$("importCfg").addEventListener("change", async (event) => {
	const file = event.target.files[0]
	if (!file) return
	try {
		await importConfig(await file.text())
		await loadSettings()
		log("settings imported")
	} catch (err) {
		log(`import failed: ${err.message}`)
	}
})
$("resetCfg").onclick = async () => {
	await resetSettings()
	await loadSettings()
	log("settings reset")
}
$("themeToggle").onclick = async () => {
	const next = document.body.dataset.theme === "light" ? "dark" : "light"
	document.body.dataset.theme = next
	if ($("theme")) $("theme").value = next
	await setSettings({ theme: next })
}
$("popout").onclick = () => {
	chrome.windows.create({
		url: chrome.runtime.getURL("src/sidepanel/index.html?popout=1"),
		type: "popup",
		width: 460,
		height: 900,
	})
}

chrome.tabs.onActivated.addListener(() => detect())

;(async () => {
	applyI18n()
	await loadSettings()
	if (!$("filenameTemplate").value) $("filenameTemplate").value = DEFAULTS.filenameTemplate
	await detect()
	await renderLibrary()
})()
