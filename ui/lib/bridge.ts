// Thin typed wrapper over the extension messaging surface. Keeping every
// chrome.* call in one file means the React tree stays testable and the message
// contract has exactly one definition instead of being spelled out inline.

export type RunEvent = {
	event: string
	payload: Record<string, any>
}

export type PingReply = {
	ok: boolean
	adapter?: string
	label?: string
	modes?: string[]
	aspectRatios?: string[]
	running?: boolean
	probe?: unknown
}

const SETTINGS_KEY = "unq.settings"
const LOGS_KEY = "unq.logs"

export async function activeTab(): Promise<chrome.tabs.Tab | null> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	return tab ?? null
}

export async function ping(tabId: number, probe = false): Promise<PingReply | null> {
	try {
		return await chrome.tabs.sendMessage(tabId, { type: "UNQ_PING", probe })
	} catch {
		return null
	}
}

export async function startRun(tabId: number, jobs: unknown[], config: Record<string, unknown>) {
	return chrome.tabs.sendMessage(tabId, { type: "UNQ_START", jobs, config })
}

export async function control(tabId: number, action: "PAUSE" | "RESUME" | "STOP") {
	try {
		return await chrome.tabs.sendMessage(tabId, { type: `UNQ_${action}` })
	} catch {
		return null
	}
}

export async function retryItem(tabId: number, index: number) {
	try {
		return await chrome.tabs.sendMessage(tabId, { type: "UNQ_RETRY_ITEM", index })
	} catch {
		return null
	}
}

export function onRunEvent(handler: (event: RunEvent) => void) {
	const listener = (message: any) => {
		if (message && message.type === "UNQ_EVENT") {
			handler({ event: message.event, payload: message.payload || {} })
		}
	}
	chrome.runtime.onMessage.addListener(listener)
	return () => chrome.runtime.onMessage.removeListener(listener)
}

export async function readSettings<T>(): Promise<Partial<T>> {
	const bag = await chrome.storage.local.get(SETTINGS_KEY)
	return (bag[SETTINGS_KEY] as Partial<T>) || {}
}

export async function writeSettings(patch: Record<string, unknown>) {
	const current = await readSettings<Record<string, unknown>>()
	await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...patch } })
}

export async function readLogs(): Promise<Array<{ at: number; level: string; line: string }>> {
	const bag = await chrome.storage.local.get(LOGS_KEY)
	return bag[LOGS_KEY] || []
}

export async function clearLogs() {
	await chrome.storage.local.set({ [LOGS_KEY]: [] })
}

export function onLogsChanged(handler: () => void) {
	const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
		if (changes[LOGS_KEY]) handler()
	}
	chrome.storage.onChanged.addListener(listener)
	return () => chrome.storage.onChanged.removeListener(listener)
}
