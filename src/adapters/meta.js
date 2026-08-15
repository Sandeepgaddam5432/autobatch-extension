import { sleep } from "../core/pool.js"

/**
 * Meta.ai adapter.
 *
 * Everything site-specific lives in this file. If Meta ships a UI change,
 * only SELECTORS below should need editing — the core engine is untouched.
 * Run `window.__AUTOBATCH__.probe()` in the meta.ai console to see what the
 * current selectors are matching.
 */
const SELECTORS = {
	composer: ['div[contenteditable="true"]', '[role="textbox"]', "textarea"],
	sendButton: [
		'button[aria-label*="Send" i]',
		'div[role="button"][aria-label*="Send" i]',
		'button[aria-label*="Submit" i]',
		'button[type="submit"]',
	],
	media: ["video", "img"],
	downloadButton: [
		"a[download]",
		'button[aria-label*="Download" i]',
		'div[role="button"][aria-label*="Download" i]',
	],
	fileInput: ['input[type="file"]'],
}

const MODE_LABELS = {
	t2v: ["Video", "Text to video"],
	i2v: ["Video", "Image to video"],
	t2i: ["Image", "Text to image"],
	i2i: ["Image", "Image to image"],
}

function qs(list, root = document) {
	for (const selector of list) {
		const el = root.querySelector(selector)
		if (el) return el
	}
	return null
}

function qsa(list, root = document) {
	const out = []
	for (const selector of list) out.push(...root.querySelectorAll(selector))
	return out
}

async function waitFor(list, timeoutMs = 15000) {
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const el = qs(list)
		if (el) return el
		if (Date.now() > deadline) throw new Error(`selector not found: ${list.join(" | ")}`)
		await sleep(300)
	}
}

// Filters out avatars, logos, sprites and other UI chrome.
function isResultMedia(el) {
	const src = el.currentSrc || el.src || ""
	if (!src) return false
	if (el.tagName === "VIDEO") return true
	if (!/^blob:|scontent|fbcdn|cdninstagram|\.mp4|\.webp|\.png|\.jpg/i.test(src)) return false
	const w = el.naturalWidth || el.width || 0
	const h = el.naturalHeight || el.height || 0
	return w >= 256 && h >= 256
}

function collectMediaUrls() {
	return qsa(SELECTORS.media)
		.filter(isResultMedia)
		.map((el) => el.currentSrc || el.src)
		.filter(Boolean)
}

function clickByText(labels) {
	const candidates = document.querySelectorAll('button, div[role="button"], [role="tab"], a')
	for (const label of labels) {
		const needle = label.toLowerCase()
		for (const el of candidates) {
			const text = (el.innerText || el.getAttribute("aria-label") || "").trim().toLowerCase()
			if (text && text.length < 40 && text.includes(needle)) {
				el.click()
				return true
			}
		}
	}
	return false
}

async function typeIntoComposer(text) {
	const composer = await waitFor(SELECTORS.composer)
	composer.focus()
	if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
		composer.value = text
		composer.dispatchEvent(new Event("input", { bubbles: true }))
		return composer
	}
	// contenteditable (React-controlled): execCommand keeps the framework in sync
	document.execCommand("selectAll", false, null)
	document.execCommand("delete", false, null)
	const inserted = document.execCommand("insertText", false, text)
	if (!inserted) {
		composer.textContent = text
		composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }))
	}
	await sleep(150)
	return composer
}

function pressEnter(el) {
	for (const type of ["keydown", "keypress", "keyup"]) {
		el.dispatchEvent(
			new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true })
		)
	}
}

const adapter = {
	id: "meta",
	label: "Meta.ai",
	modes: ["t2v", "i2v", "t2i", "i2i"],
	aspectRatios: ["16:9", "9:16", "1:1"],
	selectors: SELECTORS,

	async isReady() {
		await waitFor(SELECTORS.composer, 20000)
		return true
	},

	// Best-effort: never fatal, because mode may already be correct.
	async setMode(mode) {
		const labels = MODE_LABELS[mode]
		if (!labels) return false
		const ok = clickByText(labels)
		if (ok) await sleep(800)
		return ok
	},

	async setAspectRatio(ratio) {
		const ok = clickByText([ratio])
		if (ok) await sleep(500)
		return ok
	},

	async attachImage(dataUrl, filename = "source.png") {
		const input = qs(SELECTORS.fileInput)
		if (!input) throw new Error("file input not found")
		const blob = await (await fetch(dataUrl)).blob()
		const file = new File([blob], filename, { type: blob.type })
		const dt = new DataTransfer()
		dt.items.add(file)
		input.files = dt.files
		input.dispatchEvent(new Event("change", { bubbles: true }))
		await sleep(2500)
		return true
	},

	async snapshotResults() {
		return new Set(collectMediaUrls())
	},

	async submitPrompt(text, image) {
		if (image) await this.attachImage(image.dataUrl, image.name)
		const composer = await typeIntoComposer(text)
		const button = qs(SELECTORS.sendButton)
		if (button && !button.disabled) button.click()
		else pressEnter(composer)
		await sleep(600)
		return { submittedAt: Date.now() }
	},

	async waitForResults({ before, expected = 1, timeoutMs = 300000, shouldStop = () => false }) {
		const deadline = Date.now() + timeoutMs
		let stableCount = 0
		let lastSignature = ""
		for (;;) {
			if (shouldStop()) throw new Error("stopped")
			const fresh = collectMediaUrls().filter((url) => !before.has(url))
			const signature = fresh.join("|")
			if (fresh.length >= expected) {
				// wait for the URL set to stop changing (streamed/replaced sources)
				stableCount = signature === lastSignature ? stableCount + 1 : 0
				if (stableCount >= 2) return fresh.slice(0, expected)
			}
			lastSignature = signature
			if (Date.now() > deadline) throw new Error("generation timed out")
			await sleep(2000)
		}
	},

	// Fallback when a blob: result is too large to relay to chrome.downloads.
	async clickDownload(url) {
		const el = qsa(SELECTORS.media).find((node) => (node.currentSrc || node.src) === url)
		if (!el) return false
		el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
		await sleep(400)
		let scope = el
		for (let hop = 0; hop < 5 && scope; hop += 1) {
			const button = qs(SELECTORS.downloadButton, scope)
			if (button) {
				button.click()
				await sleep(800)
				return true
			}
			scope = scope.parentElement
		}
		return false
	},

	probe() {
		return {
			composer: !!qs(SELECTORS.composer),
			sendButton: !!qs(SELECTORS.sendButton),
			fileInput: !!qs(SELECTORS.fileInput),
			mediaFound: collectMediaUrls().length,
			urls: collectMediaUrls().slice(0, 5),
		}
	},
}

export default adapter
