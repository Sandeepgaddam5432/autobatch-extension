import {
	DEFAULTS,
	MODES,
	ASPECT_RATIOS,
	getSettings,
	setSettings,
	resetSettings,
	exportConfig,
	importConfig,
	getLibrary,
	clearLibrary,
	clearCaches,
} from "../core/storage.js"
import { parseAny, parseFile, parseVariables, buildJobs } from "../core/prompts.js"
import { pushLog, getLogs, clearLogs, formatLog } from "../core/logger.js"

const MODE_ICONS = { t2v: "🎬", f2v: "🖼", ing2v: "🧩", t2i: "✨", i2i: "🎨" }
const REPO = "https://github.com/Sandeepgaddam5432/autobatch-extension"

const el = (id) => document.getElementById(id)
const state = {
	settings: { ...DEFAULTS },
	tabId: null,
	platform: null,
	supportedModes: null,
	images: [],
	rows: [],
	items: new Map(),
	running: false,
	paused: false,
	startedAt: 0,
}

/* ---------------- settings binding ---------------- */

const FIELDS = [
	"concurrency",
	"outputsPerPrompt",
	"folder",
	"autoRenameFiles",
	"autoAddCharacterImages",
	"maxInputImages",
	"frameOption",
	"imageMatchMode",
	"prefix",
	"suffix",
	"variablesJson",
	"repeatCount",
	"shuffle",
	"dedupe",
	"defaultMode",
	"aspectRatio",
	"videoOption",
	"imageModeOption",
	"maxRetries",
	"downloadQualityVideo",
	"downloadQualityImage",
	"stopOnConsecutiveFailures",
	"folderPerDate",
	"folderPerRun",
	"skipDuplicates",
	"scheduleEnabled",
	"windowStart",
	"windowEnd",
	"dailyLimit",
	"keepAwake",
	"notifyOnFinish",
	"autoDetectSelectors",
	"selectorConfigUrl",
	"filenameTemplate",
	"theme",
	"locale",
]

function fillSelect(node, options) {
	node.innerHTML = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")
}

function applySettingsToForm() {
	for (const key of FIELDS) {
		const node = el(key)
		if (!node) continue
		const value = state.settings[key]
		if (node.type === "checkbox") node.checked = !!value
		else node.value = value ?? ""
	}
	el("delayMin").value = state.settings.delayMinSec
	el("delayMax").value = state.settings.delayMaxSec
	el("timeoutSec").value = Math.round(state.settings.timeoutMs / 1000)
	el("prompts").value = state.settings.lastPrompts || ""
	document.body.classList.toggle("light", state.settings.theme === "light")
}

function readForm() {
	const patch = {}
	for (const key of FIELDS) {
		const node = el(key)
		if (!node) continue
		if (node.type === "checkbox") patch[key] = node.checked
		else if (node.type === "number") patch[key] = Number(node.value)
		else patch[key] = node.value
	}
	patch.delayMinSec = Number(el("delayMin").value) || 0
	patch.delayMaxSec = Number(el("delayMax").value) || 0
	patch.timeoutMs = Math.max(30, Number(el("timeoutSec").value) || 300) * 1000
	patch.mode = state.settings.mode
	patch.lastPrompts = el("prompts").value
	return patch
}

async function persist() {
	state.settings = await setSettings(readForm())
	document.body.classList.toggle("light", state.settings.theme === "light")
}

/* ---------------- modes + conditional UI ---------------- */

function renderModes() {
	el("modes").innerHTML = MODES.map(
		(m) =>
			`<button class="mode${m.value === state.settings.mode ? " on" : ""}" data-mode="${m.value}"${
				state.supportedModes && !state.supportedModes.includes(m.value) ? " disabled" : ""
			}><span class="ico">${MODE_ICONS[m.value]}</span>${m.label}</button>`
	).join("")
	for (const button of el("modes").querySelectorAll(".mode")) {
		button.addEventListener("click", async () => {
			state.settings.mode = button.dataset.mode
			renderModes()
			applyConditionalUi()
			await persist()
		})
	}
}

function applyConditionalUi() {
	const mode = state.settings.mode
	const needsImages = (MODES.find((m) => m.value === mode) || {}).needsImages
	el("dropzoneCard").classList.toggle("hidden", !needsImages)
	el("characterCard").classList.toggle("hidden", !needsImages)
	el("frameOptionCard").classList.toggle("hidden", mode !== "f2v")
	el("maxImagesCard").classList.toggle("hidden", !(mode === "ing2v" || mode === "i2i"))
}

/* ---------------- prompts ---------------- */

function refreshParsed() {
	const variables = (() => {
		try {
			return parseVariables(el("variablesJson").value)
		} catch (err) {
			return {}
		}
	})()
	const jobs = buildJobs({
		rows: state.rows.length ? state.rows : parseAny(el("prompts").value),
		variables,
		prefix: el("prefix").value,
		suffix: el("suffix").value,
		repeatCount: Number(el("repeatCount").value) || 1,
		dedupe: el("dedupe").checked,
		shuffle: false,
		images: state.images,
		mode: state.settings.mode,
		imageMatchMode: el("imageMatchMode").value,
		maxInputImages: Number(el("maxInputImages").value) || 1,
		frameOption: el("frameOption").value,
		autoAddCharacterImages: el("autoAddCharacterImages").checked,
	})
	const outputs = Number(el("outputsPerPrompt").value) || 1
	el("parsed").textContent = `${jobs.length} prompts → ${jobs.length * outputs} outputs`
	return jobs
}

function renderThumbs() {
	el("thumbs").innerHTML = state.images
		.map((img) => `<figure><img src="${img.dataUrl}" alt="" /><figcaption>${img.name}</figcaption></figure>`)
		.join("")
}

async function addImages(files) {
	for (const file of files) {
		if (file.size > 10 * 1024 * 1024) {
			await pushLog(`skipped ${file.name}: larger than 10MB`, "warn")
			continue
		}
		const dataUrl = await new Promise((resolve) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.readAsDataURL(file)
		})
		state.images.push({ name: file.name, dataUrl })
	}
	renderThumbs()
	refreshParsed()
}

/* ---------------- platform detection ---------------- */

async function detectPlatform() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	if (!tab) return
	state.tabId = tab.id
	try {
		const reply = await chrome.tabs.sendMessage(tab.id, { type: "UNQ_PING" })
		if (reply && reply.adapter) {
			state.platform = reply.adapter
			state.supportedModes = reply.modes || null
			el("platform").textContent = reply.label || reply.adapter
			if (state.supportedModes && !state.supportedModes.includes(state.settings.mode)) {
				state.settings.mode = state.supportedModes[0]
			}
			renderModes()
			applyConditionalUi()
			return
		}
	} catch (err) {
		/* content script not present */
	}
	el("platform").textContent = "not a supported page — open meta.ai, Flow, Grok, Gemini, ChatGPT or Qwen"
}

/* ---------------- run control ---------------- */

function setRunning(running) {
	state.running = running
	el("runBtn").textContent = running ? "Running…" : "▶ Run"
	el("runBtn").disabled = running
	el("pauseBtn").classList.toggle("hidden", !running)
	el("stopBtn").classList.toggle("hidden", !running)
}

function renderQueue() {
	const items = [...state.items.values()]
	const done = items.filter((i) => i.status === "done").length
	const failed = items.filter((i) => i.status === "failed").length
	const active = items.filter((i) => i.status === "running").length
	el("activeCount").textContent = `${active} active`
	el("barFill").style.width = items.length ? `${((done + failed) / items.length) * 100}%` : "0"

	const elapsed = state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0
	const finished = done + failed
	const eta = finished && elapsed ? Math.round((elapsed / finished) * (items.length - finished)) : 0
	const rate = finished ? Math.round((done / finished) * 100) : 0
	el("stats").textContent = items.length
		? `${done} done · ${failed} failed · ${items.length - finished} left${
				eta ? ` · ETA ~${Math.floor(eta / 60)}m ${eta % 60}s` : ""
		  }${finished ? ` · ${rate}% success` : ""}`
		: "Idle"

	el("queue").innerHTML = items
		.map(
			(item) =>
				`<div class="item ${item.status}"><span class="txt">${item.index + 1}. ${item.text.slice(
					0,
					70
				)}</span><span class="st">${item.status}${item.error ? `: ${item.error}` : ""}</span>${
					item.status === "failed" ? `<button data-retry="${item.index}">Retry</button>` : ""
				}</div>`
		)
		.join("")
	for (const button of el("queue").querySelectorAll("[data-retry]")) {
		button.addEventListener("click", () =>
			chrome.tabs.sendMessage(state.tabId, {
				type: "UNQ_RETRY_ITEM",
				index: Number(button.dataset.retry),
			})
		)
	}
}

async function startRun() {
	await persist()
	if (!state.tabId) {
		alert("Open a supported generator tab first.")
		return
	}
	const jobs = refreshParsed()
	if (!jobs.length) {
		alert("Add at least one prompt.")
		return
	}
	const needsImages = (MODES.find((m) => m.value === state.settings.mode) || {}).needsImages
	if (needsImages && !state.images.length) {
		alert("This mode needs at least one input image.")
		return
	}

	state.items = new Map(jobs.map((job) => [job.index, { ...job, status: "queued" }]))
	state.startedAt = Date.now()
	renderQueue()
	setRunning(true)
	await pushLog(`run started · ${jobs.length} prompts · mode ${state.settings.mode}`)

	try {
		await chrome.tabs.sendMessage(state.tabId, {
			type: "UNQ_START",
			jobs,
			config: { ...state.settings, platform: state.platform },
		})
	} catch (err) {
		setRunning(false)
		await pushLog(`could not reach the page: ${err.message}`, "error")
		alert(`Could not reach the page: ${err.message}\nReload the generator tab and try again.`)
	}
}

/* ---------------- events from the page ---------------- */

chrome.runtime.onMessage.addListener(async (message) => {
	if (!message || message.type !== "UNQ_EVENT") return
	const { event, payload = {} } = message
	const item = typeof payload.index === "number" ? state.items.get(payload.index) : null

	if (item) {
		if (event === "item:submitting") item.status = "running"
		if (event === "item:generating") item.status = "running"
		if (event === "item:generated") item.status = "running"
		if (event === "item:downloaded" || event === "item:done") item.status = "done"
		if (event === "item:failed") {
			item.status = "failed"
			item.error = payload.error
		}
		if (event === "item:retry") item.status = "queued"
	}
	if (event === "run:finished" || event === "run:stopped" || event === "run:aborted") {
		setRunning(false)
	}
	if (event === "run:paused") state.paused = true
	if (event === "run:resumed") state.paused = false
	el("pauseBtn").textContent = state.paused ? "Resume" : "Pause"

	renderQueue()
	await pushLog(
		`${event}${typeof payload.index === "number" ? ` #${payload.index + 1}` : ""}${
			payload.error ? ` — ${payload.error}` : ""
		}${payload.filename ? ` — ${payload.filename}` : ""}`,
		event.includes("failed") || event.includes("error") ? "error" : "info"
	)
	if (document.querySelector("#tab-logs").classList.contains("active")) renderLogs()
})

/* ---------------- logs ---------------- */

async function renderLogs() {
	const logs = await getLogs()
	el("logCount").textContent = `${logs.length} entries`
	el("logs").textContent = logs.length
		? logs.map(formatLog).join("\n")
		: "No logs yet. Start an automation to see activity here."
	if (el("autoScroll").checked) el("logs").scrollTop = el("logs").scrollHeight
}

/* ---------------- library ---------------- */

async function renderLibrary() {
	const term = el("librarySearch").value.trim().toLowerCase()
	const entries = (await getLibrary()).filter(
		(entry) => !term || String(entry.prompt || "").toLowerCase().includes(term)
	)
	el("library").innerHTML = entries.length
		? entries
				.slice(0, 300)
				.map(
					(entry) =>
						`<div class="lib-item"><div><b>${entry.filename || "—"}</b><br /><span>${String(
							entry.prompt || ""
						).slice(0, 90)}</span><br /><small>${entry.platform || ""} · ${entry.mode || ""} · ${new Date(
							entry.at || Date.now()
						).toLocaleString()}</small></div></div>`
				)
				.join("")
		: '<small style="padding:8px 0">Nothing here yet.</small>'
}

function download(name, text, type = "application/json") {
	const url = URL.createObjectURL(new Blob([text], { type }))
	const link = document.createElement("a")
	link.href = url
	link.download = name
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ---------------- wiring ---------------- */

function wire() {
	for (const tab of document.querySelectorAll(".tab")) {
		tab.addEventListener("click", () => {
			for (const other of document.querySelectorAll(".tab")) other.classList.remove("active")
			for (const panel of document.querySelectorAll(".panel")) panel.classList.remove("active")
			tab.classList.add("active")
			el(`tab-${tab.dataset.tab}`).classList.add("active")
			if (tab.dataset.tab === "logs") renderLogs()
			if (tab.dataset.tab === "library") renderLibrary()
		})
	}

	for (const node of document.querySelectorAll("input, select, textarea")) {
		node.addEventListener("change", async () => {
			await persist()
			refreshParsed()
		})
	}
	el("prompts").addEventListener("input", () => {
		state.rows = []
		refreshParsed()
	})

	el("swapDelay").addEventListener("click", async () => {
		const min = el("delayMin").value
		el("delayMin").value = el("delayMax").value
		el("delayMax").value = min
		await persist()
	})

	// prompt source buttons
	for (const button of el("promptSource").querySelectorAll(".seg-btn")) {
		button.addEventListener("click", () => {
			for (const other of el("promptSource").querySelectorAll(".seg-btn")) other.classList.remove("active")
			button.classList.add("active")
			if (button.dataset.src === "text") return
			el("promptFile").accept = button.dataset.src === "txt" ? ".txt" : ".csv,.tsv,.xlsx"
			el("promptFile").click()
		})
	}
	el("promptFile").addEventListener("change", async (event) => {
		const file = event.target.files[0]
		if (!file) return
		try {
			state.rows = await parseFile(file)
			el("prompts").value = state.rows.map((row) => row.text).join("\n\n")
			await pushLog(`loaded ${state.rows.length} prompts from ${file.name}`)
		} catch (err) {
			state.rows = []
			await pushLog(`could not read ${file.name}: ${err.message}`, "error")
			alert(`Could not read ${file.name}: ${err.message}`)
		}
		refreshParsed()
		event.target.value = ""
	})

	// dropzone
	const zone = el("dropzone")
	zone.addEventListener("click", () => el("images").click())
	zone.addEventListener("dragover", (event) => {
		event.preventDefault()
		zone.classList.add("over")
	})
	zone.addEventListener("dragleave", () => zone.classList.remove("over"))
	zone.addEventListener("drop", async (event) => {
		event.preventDefault()
		zone.classList.remove("over")
		await addImages([...event.dataTransfer.files].filter((file) => file.type.startsWith("image/")))
	})
	el("images").addEventListener("change", async (event) => {
		await addImages([...event.target.files])
		event.target.value = ""
	})

	// run controls
	el("runBtn").addEventListener("click", startRun)
	el("pauseBtn").addEventListener("click", () =>
		chrome.tabs.sendMessage(state.tabId, { type: state.paused ? "UNQ_RESUME" : "UNQ_PAUSE" })
	)
	el("stopBtn").addEventListener("click", () =>
		chrome.tabs.sendMessage(state.tabId, { type: "UNQ_STOP" })
	)

	// footer
	el("reportBug").addEventListener("click", () =>
		chrome.tabs.create({ url: `${REPO}/issues/new` })
	)
	el("clearCache").addEventListener("click", async () => {
		await clearCaches()
		await pushLog("cleared selector cache, counters, queue snapshot")
		renderLogs()
	})
	el("clearPrompts").addEventListener("click", async () => {
		el("prompts").value = ""
		state.rows = []
		state.images = []
		state.items = new Map()
		renderThumbs()
		renderQueue()
		refreshParsed()
		await persist()
	})

	// settings buttons
	el("saveSettings").addEventListener("click", async () => {
		await persist()
		el("saveHint").textContent = "Saved."
		setTimeout(() => {
			el("saveHint").textContent = "Settings are stored locally and shared across tabs."
		}, 1500)
	})
	el("resetDefaults").addEventListener("click", async () => {
		state.settings = await resetSettings()
		applySettingsToForm()
		renderModes()
		applyConditionalUi()
	})
	el("exportSettings").addEventListener("click", async () =>
		download("unq-config.json", await exportConfig())
	)
	el("importSettings").addEventListener("click", () => el("importFile").click())
	el("importFile").addEventListener("change", async (event) => {
		const file = event.target.files[0]
		if (!file) return
		try {
			state.settings = await importConfig(await file.text())
			applySettingsToForm()
			renderModes()
			applyConditionalUi()
		} catch (err) {
			alert(`Invalid config: ${err.message}`)
		}
		event.target.value = ""
	})

	// logs
	el("copyLogs").addEventListener("click", async () => {
		const logs = await getLogs()
		await navigator.clipboard.writeText(logs.map(formatLog).join("\n"))
	})
	el("clearLogs").addEventListener("click", async () => {
		await clearLogs()
		renderLogs()
	})
	el("probeBtn").addEventListener("click", async () => {
		try {
			const reply = await chrome.tabs.sendMessage(state.tabId, { type: "UNQ_PING", probe: true })
			await pushLog(`probe: ${JSON.stringify(reply && reply.probe ? reply.probe : reply)}`)
		} catch (err) {
			await pushLog(`probe failed: ${err.message}`, "error")
		}
		renderLogs()
	})

	// library
	el("librarySearch").addEventListener("input", renderLibrary)
	el("exportJson").addEventListener("click", async () =>
		download("unq-library.json", JSON.stringify(await getLibrary(), null, 2))
	)
	el("exportCsv").addEventListener("click", async () => {
		const entries = await getLibrary()
		const head = "at,platform,mode,filename,prompt,url\n"
		const body = entries
			.map((entry) =>
				[
					new Date(entry.at || Date.now()).toISOString(),
					entry.platform || "",
					entry.mode || "",
					entry.filename || "",
					`"${String(entry.prompt || "").replace(/"/g, '""')}"`,
					entry.url || "",
				].join(",")
			)
			.join("\n")
		download("unq-library.csv", head + body, "text/csv")
	})
	el("clearLibrary").addEventListener("click", async () => {
		await clearLibrary()
		renderLibrary()
	})
}

/* ---------------- boot ---------------- */

async function boot() {
	state.settings = await getSettings()
	if (!state.settings.mode) state.settings.mode = state.settings.defaultMode
	fillSelect(el("defaultMode"), MODES.map((m) => ({ value: m.value, label: m.label })))
	fillSelect(el("aspectRatio"), ASPECT_RATIOS)
	applySettingsToForm()
	renderModes()
	applyConditionalUi()
	wire()
	refreshParsed()
	await detectPlatform()
	await renderLogs()
}

boot()
