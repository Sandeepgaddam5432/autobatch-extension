// Content script bridge. Loads the matching adapter + core engine as ES
// modules (dynamic import from web_accessible_resources) so no build step is
// needed — the repo can be loaded unpacked as-is.
;(async () => {
	if (window.__AUTOBATCH_LOADED__) return
	window.__AUTOBATCH_LOADED__ = true

	const url = (path) => chrome.runtime.getURL(path)
	const { loadAdapter } = await import(url("src/registry.js"))
	const { Runner } = await import(url("src/core/runner.js"))

	const adapter = await loadAdapter(location.href)
	if (!adapter) return

	let runner = null

	const send = (message) => {
		try {
			chrome.runtime.sendMessage(message)
		} catch (err) {
			/* panel closed */
		}
	}

	chrome.runtime.onMessage.addListener((message, _sender, reply) => {
		if (!message || typeof message.type !== "string") return undefined

		if (message.type === "AB_PING") {
			reply({
				ok: true,
				adapter: adapter.id,
				label: adapter.label,
				modes: adapter.modes,
				aspectRatios: adapter.aspectRatios,
				running: !!runner && !runner.stopped,
				probe: adapter.probe ? adapter.probe() : null,
			})
			return true
		}

		if (message.type === "AB_START") {
			if (runner && !runner.stopped) {
				reply({ ok: false, error: "already running" })
				return true
			}
			runner = new Runner({
				adapter,
				config: message.config,
				onEvent: (event) => send({ type: "AB_EVENT", event }),
			})
			runner.start()
			reply({ ok: true })
			return true
		}

		if (message.type === "AB_STOP") {
			if (runner) runner.stop()
			reply({ ok: true })
			return true
		}

		return undefined
	})

	// Console helper for fixing selectors quickly after a site UI change.
	window.__AUTOBATCH__ = { adapter, probe: () => adapter.probe && adapter.probe() }
	send({ type: "AB_READY", adapter: adapter.id })
})()
