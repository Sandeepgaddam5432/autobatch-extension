import { runPool } from "./pool.js"

function extFromUrl(url, fallback) {
	const match = /\.(mp4|webm|mov|jpg|jpeg|png|webp|gif)(\?|$)/i.exec(url || "")
	return match ? match[1].toLowerCase() : fallback
}

function buildFilename({ folder, index, slot, url, mode }) {
	const isVideo = mode === "t2v" || mode === "i2v"
	const ext = extFromUrl(url, isVideo ? "mp4" : "png")
	const n = String(index + 1).padStart(4, "0")
	const s = slot > 0 ? `_${slot + 1}` : ""
	const safeFolder = (folder || "autobatch").replace(/[^a-z0-9-_ ]/gi, "").trim()
	return `${safeFolder || "autobatch"}/${n}${s}.${ext}`
}

async function toDownloadableUrl(url) {
	if (!/^blob:/i.test(url)) return url
	// chrome.downloads (in the service worker) cannot read a page's blob: URL,
	// so relay small results as data: URLs. Large videos fall back to the
	// site's own download control via adapter.clickDownload().
	const response = await fetch(url)
	const blob = await response.blob()
	if (blob.size > 25 * 1024 * 1024) throw new Error("BLOB_TOO_LARGE")
	return await new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result)
		reader.onerror = () => reject(new Error("blob read failed"))
		reader.readAsDataURL(blob)
	})
}

export class Runner {
	constructor({ adapter, config, onEvent }) {
		this.adapter = adapter
		this.config = config
		this.onEvent = onEvent || (() => {})
		this.stopped = false
	}

	emit(type, payload = {}) {
		try {
			this.onEvent({ type, at: Date.now(), ...payload })
		} catch (err) {
			/* panel closed */
		}
	}

	stop() {
		this.stopped = true
	}

	async start() {
		const config = this.config
		this.emit("run:started", { total: config.prompts.length, adapter: this.adapter.id })
		try {
			await this.adapter.isReady()
			if (this.adapter.setMode) await this.adapter.setMode(config.mode)
			if (this.adapter.setAspectRatio && config.aspectRatio) {
				await this.adapter.setAspectRatio(config.aspectRatio)
			}
		} catch (err) {
			this.emit("run:error", { error: String((err && err.message) || err) })
			return
		}

		const items = config.prompts.map((text, index) => ({ index, text }))
		await runPool({
			items,
			concurrency: config.concurrency,
			delayMs: config.delayMs,
			maxRetries: config.maxRetries,
			shouldStop: () => this.stopped,
			onEvent: (event) => this.emit(event.type, event),
			worker: (item) => this.processOne(item),
		})
		this.emit(this.stopped ? "run:stopped" : "run:finished")
	}

	async processOne(item) {
		const config = this.config
		this.emit("item:submitting", { index: item.index, text: item.text })
		const before = await this.adapter.snapshotResults()
		await this.adapter.submitPrompt(item.text, config.image || null)

		this.emit("item:generating", { index: item.index })
		const urls = await this.adapter.waitForResults({
			before,
			expected: config.outputsPerPrompt || 1,
			timeoutMs: config.timeoutMs,
			shouldStop: () => this.stopped,
		})
		this.emit("item:generated", { index: item.index, count: urls.length })

		if (config.autoDownload && urls.length) {
			let saved = 0
			for (let slot = 0; slot < urls.length; slot += 1) {
				try {
					const url = await toDownloadableUrl(urls[slot])
					const filename = buildFilename({
						folder: config.folder,
						index: item.index,
						slot,
						url: urls[slot],
						mode: config.mode,
					})
					const reply = await chrome.runtime.sendMessage({ type: "AB_DOWNLOAD", url, filename })
					if (!reply || !reply.ok) throw new Error((reply && reply.error) || "download failed")
					saved += 1
				} catch (err) {
					if (this.adapter.clickDownload) {
						const clicked = await this.adapter.clickDownload(urls[slot])
						if (clicked) {
							saved += 1
							continue
						}
					}
					this.emit("item:downloadFailed", {
						index: item.index,
						error: String((err && err.message) || err),
					})
				}
			}
			this.emit("item:downloaded", { index: item.index, count: saved })
		}
		return urls
	}
}
