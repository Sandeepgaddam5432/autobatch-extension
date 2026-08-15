function toMinutes(hhmm) {
	const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim())
	if (!match) return null
	return Number(match[1]) * 60 + Number(match[2])
}

/** Supports windows that wrap past midnight (e.g. 22:00 -> 06:00). */
export function inTimeWindow(start, end, now = new Date()) {
	const from = toMinutes(start)
	const to = toMinutes(end)
	if (from === null || to === null) return true
	const current = now.getHours() * 60 + now.getMinutes()
	return from <= to ? current >= from && current <= to : current >= from || current <= to
}

export function msUntilWindow(start, now = new Date()) {
	const from = toMinutes(start)
	if (from === null) return 0
	const current = now.getHours() * 60 + now.getMinutes()
	const diff = from - current
	return (diff > 0 ? diff : diff + 1440) * 60000
}

/**
 * Gate consulted before every submission: honours the time window and the
 * daily generation cap.
 */
export function makeGate({ settings, getDaily }) {
	return async function gate() {
		if (settings.dailyLimit > 0) {
			const daily = await getDaily()
			if (daily.count >= settings.dailyLimit) {
				return { ok: false, reason: "dailyLimit", waitMs: 0 }
			}
		}
		if (settings.scheduleEnabled && !inTimeWindow(settings.windowStart, settings.windowEnd)) {
			return {
				ok: false,
				reason: "outsideWindow",
				waitMs: Math.min(msUntilWindow(settings.windowStart), 15 * 60000),
			}
		}
		return { ok: true }
	}
}
