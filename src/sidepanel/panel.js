import { DEFAULTS, getSettings, setSettings } from "../core/storage.js"
import { parsePrompts } from "../core/prompts.js"

const el = (id) => document.getElementById(id)
const FIELDS = [
	"mode",
	"aspectRatio",
	"concurrency",
	"delayMs",
	"outputsPerPrompt",
	"maxRetries",
	"folder",
	"autoDownload",
]

let prompts = []
const statuses = new Map()

function log(line) {
	const node = el("log")
	node.textContent = `${new Date().toLocaleTimeString()}  ${line}\n${node.textContent}`.slice(0, 6000)
}

async function activeTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	return tab
}

async function askTab(message) {
	const tab = await activeTab()
	if (!tab) throw new Error("no active tab")
	return await chrome.tabs.sendMessage(tab.id, message)
}

async function refreshStatus() {
	const pill = el("status")
	try {
		const reply = await askTab({ type: "AB_PING" })
		pill.textContent = reply.label || reply.adapter
		pill.className = "pill pill-ok"
		el("run").disabled = false
	} catch (err) {
		pill.textContent = "open meta.ai"
		pill.className = "pill pill-err"
		el("run").disabled = true
	}
}

function renderQueue() {
	const list = el("queue")
	list.innerHTML = ""
	prompts.forEach((text, index) => {
		const state = statuses.get(index) || "pending"
		const li = document.createElement("li")
		const idx = document.createElement("span")
		idx.className = "idx"
		idx.textContent = String(index + 1).padStart(2, "0")
		const txt = document.createElement("span")
		txt.className = "txt"
		txt.textContent = text
		txt.title = text
		const st = document.createElement("span")
		st.className = `st st-${state.replace(/[^a-z]/g, "")}`
		st.textContent = state
		li.append(idx, txt, st)
		list.append(li)
	})
	const done = [...statuses.values()].filter((s) => s === "done" || s === "failed").length
	const pct = prompts.length ? Math.round((done / prompts.length) * 100) : 0
	el("barFill").style.width = `${pct}%`
	el("summary").textContent = prompts.length ? `${done}/${prompts.length} complete` : "idle"
	el("promptCount").textContent = `${prompts.length} prompts`
}

function syncPrompts() {
	prompts = parsePrompts(el("prompts").value)
	renderQueue()
}

async function loadForm() {
	const settings = await getSettings()
	for (const key of FIELDS) {
		const node = el(key)
		if (!node) continue
		if (node.type === "checkbox") node.checked = !!settings[key]
		else node.value = settings[key] ?? DEFAULTS[key]
	}
	el("prompts").value = settings.lastPrompts || ""
	syncPrompts()
}

function readForm() {
	const config = {}
	for (const key of FIELDS) {
		const node = el(key)
		if (!node) continue
		if (node.type === "checkbox") config[key] = node.checked
		else if (node.type === "number") config[key] = Number(node.value)
		else config[key] = node.value
	}
	return config
}

el("prompts").addEventListener("input", syncPrompts)

el("promptFile").addEventListener("change", async (event) => {
	const file = event.target.files && event.target.files[0]
	if (!file) return
	el("prompts").value = await file.text()
	syncPrompts()
})

el("run").addEventListener("click", async () => {
	syncPrompts()
	if (!prompts.length) {
		log("no prompts")
		return
	}
	const form = readForm()
	await setSettings({ ...form, lastPrompts: el("prompts").value })
	statuses.clear()
	renderQueue()
	try {
		const reply = await askTab({
			type: "AB_START",
			config: { ...form, prompts, timeoutMs: DEFAULTS.timeoutMs },
		})
		if (!reply || !reply.ok) log(`start failed: ${(reply && reply.error) || "unknown"}`)
	} catch (err) {
		log(`start failed: ${err.message} — reload meta.ai and retry`)
	}
})

el("stop").addEventListener("click", async () => {
	try {
		await askTab({ type: "AB_STOP" })
		log("stop requested")
	} catch (err) {
		log(`stop failed: ${err.message}`)
	}
})

el("probe").addEventListener("click", async () => {
	try {
		const reply = await askTab({ type: "AB_PING" })
		log(`probe: ${JSON.stringify(reply.probe)}`)
	} catch (err) {
		log(`probe failed: ${err.message}`)
	}
})

chrome.runtime.onMessage.addListener((message) => {
	if (!message || message.type !== "AB_EVENT") return
	const event = message.event
	const i = event.index
	switch (event.type) {
		case "run:started":
			log(`run started — ${event.total} prompts on ${event.adapter}`)
			break
		case "item:submitting":
			statuses.set(i, "running")
			break
		case "item:generating":
			statuses.set(i, "running")
			break
		case "item:generated":
			log(`#${i + 1} generated ${event.count}`)
			break
		case "item:downloaded":
			log(`#${i + 1} saved ${event.count}`)
			break
		case "item:downloadFailed":
			log(`#${i + 1} download failed: ${event.error}`)
			break
		case "item:retry":
			statuses.set(i, "retry")
			log(`#${i + 1} retry ${event.attempt}: ${event.error}`)
			break
		case "item:done":
			statuses.set(i, "done")
			break
		case "item:failed":
			statuses.set(i, "failed")
			log(`#${i + 1} failed: ${event.error}`)
			break
		case "run:error":
			log(`run error: ${event.error}`)
			break
		case "run:finished":
			log("run finished")
			break
		case "run:stopped":
			log("run stopped")
			break
		default:
			break
	}
	renderQueue()
})

chrome.tabs.onActivated.addListener(refreshStatus)
chrome.tabs.onUpdated.addListener((_id, info) => {
	if (info.status === "complete") refreshStatus()
})

await loadForm()
await refreshStatus()
