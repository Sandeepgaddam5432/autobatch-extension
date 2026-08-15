const activeTabs = new Set()
let offscreenReady = false

async function ensureOffscreen() {
	if (offscreenReady) return
	try {
		const existing = await chrome.offscreen.hasDocument()
		if (!existing) {
			await chrome.offscreen.createDocument({
				url: "src/offscreen/keepalive.html",
				reasons: ["BLOBS"],
				justification: "1s heartbeat so batch runs survive background-tab throttling",
			})
		}
		offscreenReady = true
	} catch (err) {
		offscreenReady = false
	}
}

async function closeOffscreen() {
	try {
		if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
	} catch (err) {
		/* ignore */
	}
	offscreenReady = false
}

chrome.runtime.onInstalled.addListener(() => {
	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

chrome.action.onClicked.addListener(async (tab) => {
	try {
		await chrome.sidePanel.open({ tabId: tab.id })
	} catch (err) {
		/* panel behavior flag handles it */
	}
})

chrome.tabs.onRemoved.addListener((tabId) => {
	activeTabs.delete(tabId)
	if (!activeTabs.size) closeOffscreen()
})

chrome.runtime.onMessage.addListener((message, sender, reply) => {
	if (!message || typeof message.type !== "string") return undefined

	switch (message.type) {
		case "UNQ_DOWNLOAD":
			chrome.downloads
				.download({ url: message.url, filename: message.filename, saveAs: false })
				.then((id) => reply({ ok: true, id }))
				.catch((err) => reply({ ok: false, error: String((err && err.message) || err) }))
			return true

		case "UNQ_NOTIFY":
			chrome.notifications.create({
				type: "basic",
				title: message.title || "UnQ Automation",
				message: message.message || "",
				iconUrl: "icons/icon128.png",
				silent: false,
			})
			reply({ ok: true })
			return true

		case "UNQ_RUN_STATE":
			if (message.running && sender.tab) {
				activeTabs.add(sender.tab.id)
				ensureOffscreen()
			} else {
				if (sender.tab) activeTabs.delete(sender.tab.id)
				if (!activeTabs.size) closeOffscreen()
			}
			reply({ ok: true })
			return true

		// Heartbeat from the offscreen document -> relay into running tabs.
		case "UNQ_TICK_SRC":
			for (const tabId of activeTabs) {
				chrome.tabs.sendMessage(tabId, { type: "UNQ_TICK", at: message.at }).catch(() => {})
			}
			return undefined

		default:
			return undefined
	}
})
