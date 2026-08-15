// Offscreen documents are not subject to background-tab timer throttling, so
// this 1s heartbeat is what keeps a batch running when the user switches tabs
// or minimises the window (the #1 complaint about every tool in this category).
setInterval(() => {
	chrome.runtime.sendMessage({ type: "UNQ_TICK_SRC", at: Date.now() }).catch(() => {})
}, 1000)
