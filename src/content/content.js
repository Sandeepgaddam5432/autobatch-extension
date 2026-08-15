// Content-script bridge. Loads the matching adapter + engine as ES modules
// (dynamic import from web_accessible_resources) so the repo stays build-free.
;(async () => {
	if (window.__UNQ_LOADED__) return
	window.__UNQ_LOADED__ = true

	const url = (path) => chrome.runtime.getURL(path)
	const { loadAdapter } = await import(url("src/registry.js"))
	const { Runner } = await import(url("src/core/runner.js"))
	const { applySelectorOverrides } = await import(url("src/adapters/base.js"))
	const { loadSelectorOverrides } = await import(url("src/core/selectors.js"))
	const { getSettings } = await import(url("src/core/storage.js"))

	const adapter = await loadAdapter(location.href)
	if (!adapter) return

	const settings = await getSettings()
	applySelectorOverrides(adapter, await loadSelectorOverrides(settings.selectorConfigUrl))

	let runner = null
	const send = (message) => {
		try {
			chrome.runtime.sendMessage(message)
		} catch (err) {
			/* no receiver */
		}
	}

	chrome.runtime.onMessage.addListener((message, _sender, reply) => {
		if (!message || typeof message.type !== "string") return undefined

		switch (message.type) {
			case "UNQ_PING":
				reply({
					ok: true,
					adapter: adapter.id,
					label: adapter.label,
					modes: adapter.modes,
					aspectRatios: adapter.aspectRatios,
					qualities: adapter.qualities,
					running: !!runner && !runner.stopped,
					probe: adapter.probe ? adapter.probe() : null,
				})
				return true

			case "UNQ_START":
				if (runner && !runner.stopped) {
					reply({ ok: false, error: "already running" })
					return true
				}
				runner = new Runner({
					adapter,
					config: message.config,
					onEvent: (event) => send({ type: "UNQ_EVENT", event }),
				})
				send({ type: "UNQ_RUN_STATE", running: true })
				runner.start()
				reply({ ok: true })
				return true

			case "UNQ_PAUSE":
				if (runner) runner.pause()
				reply({ ok: true })
				return true

			case "UNQ_RESUME":
				if (runner) runner.resume()
				reply({ ok: true })
				return true

			case "UNQ_STOP":
				if (runner) runner.stop()
				send({ type: "UNQ_RUN_STATE", running: false })
				reply({ ok: true })
				return true

			case "UNQ_RETRY_ITEM":
				if (runner) runner.retryItem(message.job)
				reply({ ok: true })
				return true

			default:
				return undefined
		}
	})

	// Console helper for fixing selectors after a site UI change.
	window.__UNQ__ = { adapter, probe: () => adapter.probe && adapter.probe() }
	send({ type: "UNQ_READY", adapter: adapter.id })
})()
