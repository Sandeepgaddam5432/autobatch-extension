const KEY = "unq.logs"
const CAP = 800

export async function pushLog(line, level = "info") {
	const stored = await chrome.storage.local.get(KEY)
	const logs = stored[KEY] || []
	logs.push({ at: Date.now(), level, line: String(line).slice(0, 600) })
	await chrome.storage.local.set({ [KEY]: logs.slice(-CAP) })
}

export async function pushLogs(entries) {
	if (!entries || !entries.length) return
	const stored = await chrome.storage.local.get(KEY)
	const logs = stored[KEY] || []
	for (const entry of entries) {
		logs.push({ at: Date.now(), level: entry.level || "info", line: String(entry.line).slice(0, 600) })
	}
	await chrome.storage.local.set({ [KEY]: logs.slice(-CAP) })
}

export async function getLogs() {
	const stored = await chrome.storage.local.get(KEY)
	return stored[KEY] || []
}

export async function clearLogs() {
	await chrome.storage.local.set({ [KEY]: [] })
}

export function formatLog(entry) {
	const time = new Date(entry.at).toLocaleTimeString("en-GB", { hour12: false })
	const level = (entry.level || "info").toUpperCase().padEnd(5)
	return `[${time}] ${level} ${entry.line}`
}
