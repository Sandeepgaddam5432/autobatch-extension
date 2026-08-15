export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function errText(err) {
	return String((err && err.message) || err)
}

/**
 * Platform-agnostic worker pool with delay + retry.
 * Knows nothing about any AI site — that lives in the adapters.
 */
export async function runPool({
	items,
	concurrency = 1,
	delayMs = 0,
	maxRetries = 0,
	shouldStop = () => false,
	worker,
	onEvent,
}) {
	const queue = items.slice()
	const results = []
	const emit = (event) => {
		if (onEvent) onEvent(event)
	}

	async function lane() {
		while (queue.length) {
			if (shouldStop()) return
			const item = queue.shift()
			let attempt = 0
			for (;;) {
				try {
					const out = await worker(item)
					results.push({ index: item.index, ok: true, out })
					emit({ type: "item:done", index: item.index })
					break
				} catch (err) {
					attempt += 1
					if (attempt > maxRetries || shouldStop()) {
						results.push({ index: item.index, ok: false, error: errText(err) })
						emit({ type: "item:failed", index: item.index, error: errText(err) })
						break
					}
					emit({ type: "item:retry", index: item.index, attempt, error: errText(err) })
					await sleep(Math.min(30000, Math.max(1000, delayMs) * attempt))
				}
			}
			if (queue.length && delayMs > 0) await sleep(delayMs)
		}
	}

	const lanes = []
	for (let i = 0; i < Math.max(1, concurrency); i += 1) {
		lanes.push(lane())
		// stagger lane starts so we never fire N submits in the same tick
		if (i < concurrency - 1) await sleep(Math.min(delayMs || 1500, 2000))
	}
	await Promise.all(lanes)
	return results
}
