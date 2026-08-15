import { sleepAwake as sleep } from "../core/ticker.js"
import {
	findComposer,
	findSendButton,
	findFileInput,
	findResultMedia,
	findDownloadButton,
	report as autoReport,
} from "./autodetect.js"

export function qs(list, root = document) {
	for (const selector of list || []) {
		try {
			const el = root.querySelector(selector)
			if (el) return el
		} catch (err) {
			/* invalid selector from remote config */
		}
	}
	return null
}

export function qsa(list, root = document) {
	const out = []
	for (const selector of list || []) {
		try {
			out.push(...root.querySelectorAll(selector))
		} catch (err) {
			/* ignore */
		}
	}
	return out
}

export function clickByText(labels, extraSelectors = "") {
	const base =
		'button, div[role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="radio"], a, li'
	const candidates = document.querySelectorAll(extraSelectors ? `${base}, ${extraSelectors}` : base)
	for (const label of labels || []) {
		const needle = String(label).toLowerCase()
		for (const el of candidates) {
			const text = (el.innerText || el.getAttribute("aria-label") || el.title || "").trim().toLowerCase()
			if (text && text.length < 48 && text.includes(needle)) {
				el.click()
				return true
			}
		}
	}
	return false
}

export function pressEnter(el) {
	for (const type of ["keydown", "keypress", "keyup"]) {
		el.dispatchEvent(
			new KeyboardEvent(type, {
				key: "Enter",
				code: "Enter",
				keyCode: 13,
				which: 13,
				bubbles: true,
				cancelable: true,
			})
		)
	}
}

/**
 * Types text in a way React/Lexical editors accept: real input events, and a
 * paste event as a fallback for editors that ignore execCommand.
 */
export async function typeInto(el, text) {
	el.focus()
	el.click()
	await sleep(80)

	if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
		const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value")
		if (setter && setter.set) setter.set.call(el, text)
		else el.value = text
		el.dispatchEvent(new Event("input", { bubbles: true }))
		el.dispatchEvent(new Event("change", { bubbles: true }))
		return el
	}

	document.execCommand("selectAll", false, null)
	document.execCommand("delete", false, null)
	let ok = false
	try {
		ok = document.execCommand("insertText", false, text)
	} catch (err) {
		ok = false
	}
	if (!ok || !el.textContent.trim()) {
		try {
			const data = new DataTransfer()
			data.setData("text/plain", text)
			el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
		} catch (err) {
			/* ignore */
		}
	}
	if (!el.textContent.trim()) {
		el.textContent = text
		el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }))
	}
	await sleep(150)
	return el
}

export async function attachFiles(input, images) {
	if (!input) throw new Error("file input not found")
	const data = new DataTransfer()
	for (const image of images) {
		const blob = await (await fetch(image.dataUrl)).blob()
		data.items.add(new File([blob], image.name || "source.png", { type: blob.type }))
	}
	input.files = data.files
	input.dispatchEvent(new Event("change", { bubbles: true }))
	await sleep(2500)
	return true
}

export function isResultMedia(el, minSize = 240) {
	const src = el.currentSrc || el.src || ""
	if (!src || /^data:image\/svg/i.test(src)) return false
	if (el.tagName === "VIDEO") return true
	const w = el.naturalWidth || el.width || 0
	const h = el.naturalHeight || el.height || 0
	return w >= minSize && h >= minSize
}

/**
 * Builds a full adapter from a small spec. Configured selectors are tried
 * first; whenever they miss, heuristic auto-detection takes over, so a site
 * redesign degrades instead of breaking.
 */
export function createAdapter(spec) {
	const adapter = {
		id: spec.id,
		label: spec.label,
		host: spec.host,
		modes: spec.modes || ["t2i"],
		aspectRatios: spec.aspectRatios || [],
		selectors: { ...spec.selectors },
		modeLabels: spec.modeLabels || {},
		ratioLabels: spec.ratioLabels || {},
		minMediaSize: spec.minMediaSize || 240,
		autoDetect: true,
		lastResolution: {},

		/* ---- element resolution: selectors first, heuristics second ---- */

		composer() {
			const el = qs(this.selectors.composer)
			if (el) {
				this.lastResolution.composer = "selector"
				return el
			}
			if (!this.autoDetect) return null
			const found = findComposer()
			this.lastResolution.composer = found ? "auto" : "none"
			return found
		},

		sendButton(composer) {
			const el = qs(this.selectors.sendButton)
			if (el) {
				this.lastResolution.sendButton = "selector"
				return el
			}
			if (!this.autoDetect) return null
			const found = findSendButton(composer || this.composer())
			this.lastResolution.sendButton = found ? "auto" : "none"
			return found
		},

		fileInput() {
			return qs(this.selectors.fileInput) || (this.autoDetect ? findFileInput() : null)
		},

		mediaElements() {
			const configured = qsa(this.selectors.media).filter((el) => isResultMedia(el, this.minMediaSize))
			if (configured.length) return configured
			return this.autoDetect ? findResultMedia(this.minMediaSize) : []
		},

		mediaUrls() {
			return this.mediaElements()
				.map((el) => el.currentSrc || el.src)
				.filter(Boolean)
		},

		/* ---- contract ---- */

		async isReady() {
			const deadline = Date.now() + 25000
			for (;;) {
				if (this.composer()) break
				if (Date.now() > deadline) throw new Error("composer not found on this page")
				await sleep(400)
			}
			if (this.selectors.loginWall && qs(this.selectors.loginWall)) throw new Error("not signed in")
			return true
		},

		async setMode(mode) {
			const labels = this.modeLabels[mode]
			if (!labels || !labels.length) return false
			const ok = clickByText(labels)
			if (ok) await sleep(900)
			return ok
		},

		async setAspectRatio(ratio) {
			if (!ratio) return false
			if (this.selectors.ratioOpener) {
				const opener = qs(this.selectors.ratioOpener)
				if (opener) {
					opener.click()
					await sleep(400)
				}
			}
			const extra = this.ratioLabels[ratio] || []
			const ok = clickByText([ratio, ratio.replace(":", " : "), ...extra])
			if (ok) await sleep(500)
			return ok
		},

		async attachImages(images) {
			if (!images || !images.length) return false
			return await attachFiles(this.fileInput(), images)
		},

		async snapshotResults() {
			return new Set(this.mediaUrls())
		},

		async submitPrompt(text, images) {
			if (images && images.length) await this.attachImages(images)
			const composer = this.composer()
			if (!composer) throw new Error("composer not found")
			await typeInto(composer, text)
			await sleep(250)
			const button = this.sendButton(composer)
			const usable =
				button && !button.disabled && button.getAttribute("aria-disabled") !== "true"
			if (usable) button.click()
			else pressEnter(composer)
			await sleep(700)
			// if the composer still holds the text, the click did not register
			const leftover = (composer.value || composer.textContent || "").trim()
			if (leftover && leftover === text.trim()) {
				pressEnter(composer)
				await sleep(600)
			}
			return { submittedAt: Date.now(), via: usable ? "button" : "enter" }
		},

		async waitForResults({ before, expected = 1, timeoutMs = 300000, shouldStop = () => false }) {
			const deadline = Date.now() + timeoutMs
			let stable = 0
			let lastSignature = ""
			for (;;) {
				if (shouldStop()) throw new Error("stopped")
				if (this.selectors.errorToast && qs(this.selectors.errorToast)) {
					throw new Error("platform reported an error")
				}
				const fresh = this.mediaUrls().filter((url) => !before.has(url))
				const signature = fresh.join("|")
				if (fresh.length >= expected) {
					stable = signature === lastSignature ? stable + 1 : 0
					if (stable >= 2) return fresh.slice(0, expected)
				}
				lastSignature = signature
				if (Date.now() > deadline) throw new Error("generation timed out")
				await sleep(2000)
			}
		},

		async clickDownload(url) {
			const el = this.mediaElements().find((node) => (node.currentSrc || node.src) === url)
			if (!el) return false
			el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
			await sleep(400)
			const configured = (() => {
				let scope = el
				for (let hop = 0; hop < 6 && scope; hop += 1) {
					const button = qs(this.selectors.downloadButton, scope)
					if (button) return button
					scope = scope.parentElement
				}
				return null
			})()
			const button = configured || (this.autoDetect ? findDownloadButton(el) : null)
			if (!button) return false
			button.click()
			await sleep(1200)
			return true
		},

		probe() {
			const composer = this.composer()
			const send = this.sendButton(composer)
			const urls = this.mediaUrls()
			return {
				platform: this.id,
				url: location.href,
				composer: !!composer,
				sendButton: !!send,
				fileInput: !!this.fileInput(),
				mediaFound: urls.length,
				resolvedBy: { ...this.lastResolution },
				sample: urls.slice(0, 3).map((url) => url.slice(0, 90)),
				autoDetect: autoReport(),
			}
		},
	}

	return Object.assign(adapter, spec.overrides || {})
}

export function applySelectorOverrides(adapter, overrides) {
	if (!overrides) return adapter
	const forPlatform = overrides[adapter.id]
	if (!forPlatform) return adapter
	adapter.selectors = { ...adapter.selectors, ...forPlatform }
	return adapter
}

export { sleep }
