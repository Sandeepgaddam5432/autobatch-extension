import { sleepAwake, randomDelay } from "./ticker.js"

function errText(err) {
	return String((err && err.message) || err)
}

/**
 * Platform-agnostic worker pool: concurrency lanes, randomised delay,
 * retry with backoff, pause/resume, stop, per-item requeue, and a gate
 * callback used for scheduling / daily limits.
 */
export class Pool {
	constructor({
		items,
		concurrency = 1,
		delayMinMs = 0,
		delayMaxMs = 0,
		maxRetries = 0,
		stopOnConsecutiveFailures = 0,
		gate = null,
		worker,
		onEvent = () => {},
	}) {
		this.queue = items.slice()
		this.concurrency = Math.max(1, Number(concurrency) || 1)
		this.delayMinMs = delayMinMs
		this.delayMaxMs = delayMaxMs
		this.maxRetries = maxRetries
		this.stopOnConsecutiveFailures = stopOnConsecutiveFailures
		this.gate = gate
		this.worker = worker
		this.onEvent = onEvent
		this.results = []
		this.stopped = false
		this.paused = false
		this.consecutiveFailures = 0
		this.active = 0
	}

	stop() {
		this.stopped = true
	}

	pause() {
		this.paused = true
		this.onEvent({ type: "run:paused" })
	}

	resume() {
		this.paused = false
		this.onEvent({ type: "run:resumed" })
	}

	/** Push an item back onto the queue (per-row "retry" from the UI). */
	requeue(item) {
		this.queue.push({ ...item })
	}

	drop(index) {
		this.queue = this.queue.filter((item) => item.index !== index)
	}

	get pending() {
		return this.queue.length
	}

	async waitWhilePaused() {
		while (this.paused && !this.stopped) await sleepAwake(500)
	}

	async waitForGate() {
		if (!this.gate) return true
		for (;;) {
			if (this.stopped) return false
			const verdict = await this.gate()
			if (verdict.ok) return true
			if (verdict.reason === "dailyLimit") {
				this.onEvent({ type: "run:blocked", reason: verdict.reason })
				this.stopped = true
				return false
			}
			this.onEvent({ type: "run:waiting", reason: verdict.reason, waitMs: verdict.waitMs })
			await sleepAwake(Math.min(verdict.waitMs || 60000, 60000))
		}
	}

	async lane() {
		while (this.queue.length) {
			if (this.stopped) return
			await this.waitWhilePaused()
			if (this.stopped) return
			if (!(await this.waitForGate())) return

			const item = this.queue.shift()
			if (!item) return
			this.active += 1
			let attempt = 0
			for (;;) {
				try {
					const out = await this.worker(item)
					this.results.push({ index: item.index, ok: true, out })
					this.consecutiveFailures = 0
					this.onEvent({ type: "item:done", index: item.index })
					break
				} catch (err) {
					attempt += 1
					if (attempt > this.maxRetries || this.stopped) {
						this.results.push({ index: item.index, ok: false, error: errText(err) })
						this.consecutiveFailures += 1
						this.onEvent({ type: "item:failed", index: item.index, error: errText(err) })
						if (
							this.stopOnConsecutiveFailures > 0 &&
							this.consecutiveFailures >= this.stopOnConsecutiveFailures
						) {
							this.onEvent({ type: "run:aborted", reason: "tooManyFailures" })
							this.stopped = true
						}
						break
					}
					this.onEvent({ type: "item:retry", index: item.index, attempt, error: errText(err) })
					await sleepAwake(Math.min(45000, Math.max(2000, this.delayMinMs) * attempt))
				}
			}
			this.active -= 1

			if (this.queue.length) {
				const wait = randomDelay(this.delayMinMs, this.delayMaxMs)
				if (wait > 0) {
					this.onEvent({ type: "run:cooldown", ms: wait })
					await sleepAwake(wait)
				}
			}
		}
	}

	async run() {
		const lanes = []
		for (let i = 0; i < this.concurrency; i += 1) {
			lanes.push(this.lane())
			if (i < this.concurrency - 1) await sleepAwake(Math.min(this.delayMinMs || 1500, 2500))
		}
		await Promise.all(lanes)
		return this.results
	}
}
