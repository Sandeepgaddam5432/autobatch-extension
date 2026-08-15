// Wrong-page gate.
//
// Deliberately independent of panel.js: it does its own detection so an error
// in the main controller can never leave the user staring at a dead panel with
// no explanation. Mirrors the "Not on a ... page" pattern, but offers every
// supported platform in one tap instead of a single hardcoded destination.

const PLATFORMS = [
	{ id: "meta", label: "Meta AI", url: "https://www.meta.ai/" },
	{ id: "flow", label: "Google Flow", url: "https://labs.google/fx/tools/flow" },
	{ id: "grok", label: "Grok", url: "https://grok.com/" },
	{ id: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
	{ id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
	{ id: "qwen", label: "Qwen", url: "https://chat.qwen.ai/" },
]

const gate = document.getElementById("gate")
const primary = document.getElementById("gatePrimary")
const more = document.getElementById("gateMore")
const text = document.getElementById("gateText")

function guessFromUrl(href = "") {
	if (/meta\.ai/i.test(href)) return "meta"
	if (/labs\.google/i.test(href)) return "flow"
	if (/grok\.com/i.test(href)) return "grok"
	if (/gemini\.google/i.test(href)) return "gemini"
	if (/chatgpt\.com/i.test(href)) return "chatgpt"
	if (/chat\.qwen\.ai/i.test(href)) return "qwen"
	return null
}

function renderTargets(preferredId) {
	const preferred = PLATFORMS.find((p) => p.id === preferredId) || PLATFORMS[0]
	primary.textContent = `↗ Open ${preferred.label}`
	primary.onclick = () => chrome.tabs.update({ url: preferred.url })

	more.innerHTML = ""
	for (const platform of PLATFORMS.filter((p) => p.id !== preferred.id)) {
		const button = document.createElement("button")
		button.className = "ghost"
		button.textContent = platform.label
		button.onclick = () => chrome.tabs.update({ url: platform.url })
		more.appendChild(button)
	}
}

async function check() {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		if (!tab) return
		const matched = guessFromUrl(tab.url || "")

		let connected = false
		try {
			const reply = await chrome.tabs.sendMessage(tab.id, { type: "UNQ_PING" })
			connected = !!(reply && reply.ok)
		} catch (err) {
			connected = false
		}

		if (connected) {
			gate.classList.add("hidden")
			return
		}

		// On a supported host but no bridge means the tab predates the current
		// build — a reload fixes it, so say exactly that.
		text.textContent = matched
			? "This tab was open before the extension loaded. Reload the page to connect."
			: "UnQ works on a generator page. Open one of the supported platforms to begin."
		renderTargets(matched)
		if (matched) {
			primary.textContent = "↻ Reload this page"
			primary.onclick = () => chrome.tabs.reload(tab.id)
		}
		gate.classList.remove("hidden")
	} catch (err) {
		/* nothing useful to do here */
	}
}

chrome.tabs.onActivated.addListener(check)
chrome.tabs.onUpdated.addListener((_id, info) => {
	if (info.status === "complete") check()
})
setInterval(check, 4000)
check()
