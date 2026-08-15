import { Pool } from "./pool.js"
import { sleepAwake } from "./ticker.js"
import { renderFilename } from "./filename.js"
import { makeGate } from "./schedule.js"
import {
	nextCounter,
	addLibraryEntries,
	bumpDailyUsage,
	getDailyUsage,
	saveQueueSnapshot,
	clearQueueSnapshot,
} from "./storage.js"

const MAX_RELAY_BYTES = 25 * 1024 * 1024

async function toDownloadableUrl(url) {
	if (!/^blob:/i.test(url)) return url
	// The service worker cannot read a page blob, so relay it as a data URL.
	const blob = await (await fetch(url)).blob()
	if (blob.size > MAX_RELAY_BYTES) throw new Error("BLOB_TOO_LARGE")
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
		this.pool = null
		this.seenUrls = new Set()
		this.stats = { total: 0, done: 0, failed: 0, downloaded: 0, startedAt: 0 }
		this.runScope = `${config.folder || "UnQ"}:${config.resetNumbering ? Date.now() : "global"}`
	}

	emit(type, payload = {}) {
		try {
			this.onEvent({ type, at: Date.now(), stats: { ...this.stats }, ...payload })
		} catch (err) {
			/* panel closed */
		}
	}

	get stopped() {
		return !this.pool || this.pool.stopped
	}

	stop() {
		if (this.pool) this.pool.stop()
	}

	pause() {
		if (this.pool) this.pool.pause()
	}

	resume() {
		if (this.pool) this.pool.resume()
	}

	retryItem(job) {
		if (this.pool) this.pool.requeue(job)
	}

	async start() {
		const config = this.config
		this.stats.total = config.jobs.length
		this.stats.startedAt = Date.now()
		this.emit("run:started", { total: config.jobs.length, adapter: this.adapter.id })

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

		this.pool = new Pool({
			items: config.jobs,
			concurrency: config.concurrency,
			delayMinMs: config.delayMinMs,
			delayMaxMs: config.delayMaxMs,
			maxRetries: config.maxRetries,
			stopOnConsecutiveFailures: config.stopOnConsecutiveFailures,
			gate: makeGate({ settings: config, getDaily: getDailyUsage }),
			worker: (job) => this.processOne(job),
			onEvent: (event) => {
				if (event.type === "item:done") this.stats.done += 1
				if (event.type === "item:failed") this.stats.failed += 1
				this.emit(event.type, event)
				this.persist()
			},
		})

		await this.pool.run()
		await clearQueueSnapshot()
		const finished = this.pool.stopped ? "run:stopped" : "run:finished"
		this.emit(finished, { elapsedMs: Date.now() - this.stats.startedAt })

		if (config.notifyOnFinish) {
			chrome.runtime.sendMessage({
				type: "UNQ_NOTIFY",
				title: "UnQ Automation",
				message: `${this.stats.done}/${this.stats.total} done · ${this.stats.downloaded} saved${
					this.stats.failed ? ` · ${this.stats.failed} failed` : ""
				}`,
			})
		}
		chrome.runtime.sendMessage({ type: "UNQ_RUN_STATE", running: false })
	}

	persist() {
		saveQueueSnapshot({
			at: Date.now(),
			platform: this.adapter.id,
			pending: this.pool ? this.pool.queue.map((job) => job.text) : [],
			stats: this.stats,
		}).catch(() => {})
	}

	async processOne(job) {
		const config = this.config
		const mode = job.mode || config.mode
		const ratio = job.aspectRatio || config.aspectRatio
		const expected = job.outputsPerPrompt || config.outputsPerPrompt || 1

		if (job.mode && this.adapter.setMode) await this.adapter.setMode(mode)
		if (job.aspectRatio && this.adapter.setAspectRatio) await this.adapter.setAspectRatio(ratio)

		this.emit("item:submitting", { index: job.index, text: job.text })
		const before = await this.adapter.snapshotResults()
		await this.adapter.submitPrompt(job.text, job.images || null)
		await bumpDailyUsage(1)

		this.emit("item:generating", { index: job.index })
		const urls = await this.adapter.waitForResults({
			before,
			expected,
			timeoutMs: config.timeoutMs,
			shouldStop: () => this.stopped,
		})
		this.emit("item:generated", { index: job.index, count: urls.length })

		const entries = []
		let saved = 0

		for (let slot = 0; slot < urls.length; slot += 1) {
			const sourceUrl = urls[slot]
			if (config.skipDuplicates && this.seenUrls.has(sourceUrl)) continue
			this.seenUrls.add(sourceUrl)

			let filename = ""
			if (config.autoDownload) {
				const subfolders = []
				if (config.folderPerDate) subfolders.push(new Date().toISOString().slice(0, 10))
				if (config.folderPerRun) subfolders.push(`run-${String(this.stats.startedAt).slice(-6)}`)
				const counter = await nextCounter(this.runScope, config.startIndex)
				filename = renderFilename({
					template: config.filenameTemplate,
					counter,
					index: job.index,
					slot,
					prompt: job.text,
					mode,
					ratio,
					platform: this.adapter.id,
					url: sourceUrl,
					folder: config.folder,
					subfolders,
				})
				try {
					const relayUrl = await toDownloadableUrl(sourceUrl)
					const reply = await chrome.runtime.sendMessage({
						type: "UNQ_DOWNLOAD",
						url: relayUrl,
						filename,
					})
					if (!reply || !reply.ok) throw new Error((reply && reply.error) || "download failed")
					saved += 1
				} catch (err) {
					let handled = false
					if (this.adapter.clickDownload) {
						handled = await this.adapter.clickDownload(sourceUrl)
					}
					if (handled) saved += 1
					else
						this.emit("item:downloadFailed", {
							index: job.index,
							error: String((err && err.message) || err),
						})
				}
			}

			entries.push({
				id: `${Date.now()}-${job.index}-${slot}`,
				ts: Date.now(),
				platform: this.adapter.id,
				mode,
				ratio,
				prompt: job.text,
				filename,
				url: /^blob:|^data:/i.test(sourceUrl) ? "" : sourceUrl,
				pageUrl: location.href,
			})
		}

		this.stats.downloaded += saved
		if (entries.length) await addLibraryEntries(entries)
		if (config.autoDownload) this.emit("item:downloaded", { index: job.index, count: saved })

		// small settle pause so the next submit does not race the UI
		await sleepAwake(400)
		return urls
	}
}
