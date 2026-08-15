chrome.runtime.onInstalled.addListener(() => {
	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

chrome.action.onClicked.addListener(async (tab) => {
	try {
		await chrome.sidePanel.open({ tabId: tab.id })
	} catch (err) {
		/* behavior flag already handles it */
	}
})

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
	if (message && message.type === "AB_DOWNLOAD") {
		chrome.downloads
			.download({ url: message.url, filename: message.filename, saveAs: false })
			.then((id) => reply({ ok: true, id }))
			.catch((err) => reply({ ok: false, error: String((err && err.message) || err) }))
		return true
	}
	return undefined
})
