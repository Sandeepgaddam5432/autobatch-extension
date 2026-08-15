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
	let jobsByIndex = new Map()

	const send = (message) => {
		try {
			chrome.runtime.sendMessage(message)
		} catch (err) {
			/* no receiver */
		}
	}

	// The engine emits { type, ...payload }; the panel listens for
	// { event, payload }. Normalise here so neither side has to guess.
	const relay = (raw) => {
		const { type, ...payload } = raw || {}
		if (!type) return
		send({ type: "UNQ_EVENT", event: type, payload })
	}

	const startRun = async (message) => {
		const jobs = message.jobs || (message.config && message.config.jobs) || []
		if (!jobs.length) {
			relay({ type: "run:error", error: "no prompts were received by the page" })
			relay({ type: "run:stopped" })
			return
		}

		jobsByIndex = new Map(jobs.map((job) => [job.index, job]))
		adapter.autoDetect = message.config.autoDetectSelectors !== false

		runner = new Runner({
			adapter,
			// runner reads config.jobs, so the job list must live inside config
			config: { ...message.config, jobs },
			onEvent: relay,
		})

		send({ type: "UNQ_RUN_STATE", running: true })
		try {
			await runner.start()
		} catch (err) {
			// never fail silently: the panel must always learn why a run died
			relay({ type: "run:error", error: String((err && err.stack) || (err && err.message) || err) })
		} finally {
			send({ type: "UNQ_RUN_STATE", running: false })
			relay({ type: "run:stopped" })
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
				// fire and forget: replying immediately keeps the port from closing
				startRun(message)
				reply({ ok: true, jobs: (message.jobs || []).length })
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

			case "UNQ_RETRY_ITEM": {
				// the panel knows row numbers, not job objects
				const job = message.job || jobsByIndex.get(message.index)
				if (runner && job) runner.retryItem(job)
				reply({ ok: !!job })
				return true
			}

			default:
				return undefined
		}
	})

	// Console helper for fixing selectors after a site UI change.
	window.__UNQ__ = { adapter, probe: () => adapter.probe && adapter.probe() }
	send({ type: "UNQ_READY", adapter: adapter.id })
})()
