// Chrome throttles timers in background tabs, which is the #1 reason batch
// automation "stops when you switch tabs". The offscreen document (see
// src/offscreen/) is never throttled, so it broadcasts UNQ_TICK every second.
// sleepAwake() races a normal timer against those ticks, so a run keeps moving
// even when the tab is hidden or the window is minimized.

const listeners = new Set()
let wired = false

function wire() {
	if (wired) return
	wired = true
	chrome.runtime.onMessage.addListener((message) => {
		if (message && message.type === "UNQ_TICK") {
			for (const fn of [...listeners]) {
				try {
					fn(message.at)
				} catch (err) {
					/* ignore */
				}
			}
		}
	})
}

export function onTick(fn) {
	wire()
	listeners.add(fn)
	return () => listeners.delete(fn)
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function sleepAwake(ms) {
	if (ms <= 0) return Promise.resolve()
	const deadline = Date.now() + ms
	return new Promise((resolve) => {
		let done = false
		const finish = () => {
			if (done) return
			done = true
			off()
			clearTimeout(timer)
			resolve()
		}
		const timer = setTimeout(finish, ms)
		const off = onTick(() => {
			if (Date.now() >= deadline) finish()
		})
	})
}

export function randomDelay(minMs, maxMs) {
	const lo = Math.max(0, Number(minMs) || 0)
	const hi = Math.max(lo, Number(maxMs) || lo)
	return lo === hi ? lo : lo + Math.floor(Math.random() * (hi - lo + 1))
}
