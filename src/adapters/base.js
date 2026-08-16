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
		'button, div[role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="radio"], a, li'
	const candidates = document.querySelectorAll(extraSelectors ? `${base}, ${extraSelectors}` : base)
	for (const label of labels || []) {
		const needle = String(label).toLowerCase()
		for (const el of candidates) {
			const text = (el.innerText || el.getAttribute("aria-label") || el.title || "").trim().toLowerCase()
			if (text && text.length < 60 && text.includes(needle)) {
				el.click()
				return true
			}
		}
	}
	return false
}

/** Closes a dropdown that stayed open after a choice was clicked. */
function dismissMenus() {
	for (const type of ["keydown", "keyup"]) {
		document.body.dispatchEvent(
			new KeyboardEvent(type, { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true })
		)
	}
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
		qualities: spec.qualities || [],
		// platform-specific dropdowns (model, resolution, ...) shown in the panel
		options: spec.options || [],
		selectors: { ...spec.selectors },
		modeLabels: spec.modeLabels || {},
		ratioLabels: spec.ratioLabels || {},
		minMediaSize: spec.minMediaSize || 240,
		autoDetect: true,
		lastResolution: {},
		// filled in by applyOptions so adapters can read the user's choices
		chosen: {},
		// last aspect ratio requested for this run
		ratio: "",

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
				if (this.selectors.loginWall && qs(this.selectors.loginWall)) {
					throw new Error("sign in to this site first")
				}
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
			// remembered so chat sites can express the ratio in the prompt instead
			this.ratio = ratio
			if (!this.aspectRatios.length && !this.selectors.ratioOpener) return false
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

		/**
		 * Picks one value inside a platform dropdown: open the control, click the
		 * choice by its visible text, then close whatever stayed open.
		 */
		async setOption(option, value) {
			if (!option || value === undefined || value === null || value === "" || value === "auto") return true
			const choice = (option.values || []).find((item) => String(item.value) === String(value))
			if (!choice) return false
			// prompt-only options are applied by decoratePrompt, not by clicking
			if (option.promptOnly) return true

			let opened = false
			if (option.opener) {
				const opener = qs(option.opener)
				if (opener) {
					opener.click()
					opened = true
					await sleep(450)
				}
			}
			if (!opened && option.openerLabels && option.openerLabels.length) {
				opened = clickByText(option.openerLabels)
				if (opened) await sleep(450)
			}

			// native <select> controls need a value change, not a click
			if (option.select) {
				const el = qs(option.select)
				if (el && el.tagName === "SELECT") {
					const match = [...el.options].find((native) =>
						(choice.labels || [choice.label]).some((label) =>
							native.textContent.toLowerCase().includes(String(label).toLowerCase())
						)
					)
					if (match) {
						el.value = match.value
						el.dispatchEvent(new Event("change", { bubbles: true }))
						await sleep(400)
						return true
					}
				}
			}

			const ok = clickByText(choice.labels && choice.labels.length ? choice.labels : [choice.label])
			await sleep(ok ? 600 : 200)
			if (opened) dismissMenus()
			return ok
		},

		/**
		 * Applies every platform option the user picked, once, before the queue
		 * starts. Missed options are returned so the panel can say so out loud
		 * instead of pretending the run used them.
		 */
		async applyOptions(config) {
			const chosen = ((config && config.platformOptions) || {})[this.id] || {}
			this.chosen = chosen
			const applied = []
			const missed = []
			for (const option of this.options || []) {
				const value = chosen[option.key]
				if (value === undefined || value === null || value === "" || value === "auto") continue
				let ok = false
				try {
					ok = await this.setOption(option, value)
				} catch (err) {
					ok = false
				}
				const label = `${option.label}: ${value}`
				if (ok) applied.push(label)
				else missed.push(label)
			}
			return { applied, missed }
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
			// chat sites have no ratio or style controls, so the adapter may fold
			// those choices into the prompt text instead
			const finalText = this.decoratePrompt ? this.decoratePrompt(text) : text
			await typeInto(composer, finalText)
			await sleep(250)
			const button = this.sendButton(composer)
			const usable =
				button && !button.disabled && button.getAttribute("aria-disabled") !== "true"
			if (usable) button.click()
			else pressEnter(composer)
			await sleep(700)
			// if the composer still holds the text, the click did not register
			const leftover = (composer.value || composer.textContent || "").trim()
			if (leftover && leftover === finalText.trim()) {
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
				signedOut: !!(this.selectors.loginWall && qs(this.selectors.loginWall)),
				mediaFound: urls.length,
				resolvedBy: { ...this.lastResolution },
				sample: urls.slice(0, 3).map((url) => url.slice(0, 90)),
				autoDetect: autoReport(),
			}
		},
	}

	return Object.assign(adapter, spec.overrides || {})
}

/** Shared prompt decoration for chat sites without their own controls. */
export function decorateWith(adapter, extras = []) {
	const parts = []
	if (adapter.chosen.ratioHint !== "off" && adapter.ratio) parts.push(`Aspect ratio ${adapter.ratio}.`)
	for (const extra of extras) if (extra) parts.push(extra)
	return parts
}

export function applySelectorOverrides(adapter, overrides) {
	if (!overrides) return adapter
	const forPlatform = overrides[adapter.id]
	if (!forPlatform) return adapter
	adapter.selectors = { ...adapter.selectors, ...forPlatform }
	return adapter
}

export { sleep }
