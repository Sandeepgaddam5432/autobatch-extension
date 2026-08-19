const activeTabs = new Set()
let offscreenReady = false

// The UnQ icon ships with every build (CI generates the icon set and refuses
// to publish an archive without it), so notifications use the real logo.
const NOTIFY_ICON = chrome.runtime.getURL("icons/icon128.png")

/* ------------------------------------------------------------------------- *
 * Toolbar badge — live run progress on the extension icon.
 *
 * The engine already broadcasts UNQ_EVENT messages for the side panel; the
 * worker mirrors the same stream, so no new protocol is needed.
 *   "…"  green   run started, nothing finished yet
 *   "N"  green   N items finished, no failures
 *   "N"  amber   N items finished, at least one failed
 *   "✓" / "N✕"  run ended — flashes for 12 s, then clears
 * ------------------------------------------------------------------------- */

const badge = { active: false, done: 0, failed: 0 }
let badgeClearTimer = null

function paintBadge(text, color) {
	try {
		chrome.action.setBadgeText({ text }).catch(() => {})
		if (color) chrome.action.setBadgeBackgroundColor({ color }).catch(() => {})
	} catch (err) {
		/* badge is best-effort */
	}
}

function renderBadge() {
	if (!badge.active) return
	if (badgeClearTimer) {
		clearTimeout(badgeClearTimer)
		badgeClearTimer = null
	}
	const finished = badge.done + badge.failed
	paintBadge(finished ? String(finished) : "…", badge.failed ? "#f2b743" : "#14c689")
}

function finishBadge() {
	if (!badge.active) return
	badge.active = false
	paintBadge(badge.failed ? `${badge.failed}✕` : "✓", badge.failed ? "#f4575d" : "#14c689")
	if (badgeClearTimer) clearTimeout(badgeClearTimer)
	badgeClearTimer = setTimeout(() => paintBadge(""), 12000)
}

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
	paintBadge("")
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
			try {
				chrome.notifications.create({
					type: "basic",
					title: message.title || "UnQ Automation",
					message: message.message || "",
					iconUrl: NOTIFY_ICON,
					silent: false,
				})
			} catch (err) {
				/* notifications are best-effort */
			}
			reply({ ok: true })
			return true

		case "UNQ_RUN_STATE":
			if (message.running && sender.tab) {
				activeTabs.add(sender.tab.id)
				ensureOffscreen()
				badge.active = true
				badge.done = 0
				badge.failed = 0
				renderBadge()
			} else {
				if (sender.tab) activeTabs.delete(sender.tab.id)
				if (!activeTabs.size) closeOffscreen()
				finishBadge()
			}
			reply({ ok: true })
			return true

		// Run events power the side panel UI; the worker only mirrors counts
		// onto the toolbar badge.
		case "UNQ_EVENT":
			if (message.event === "item:done") {
				badge.done += 1
				renderBadge()
			} else if (message.event === "item:failed") {
				badge.failed += 1
				renderBadge()
			}
			return undefined

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
