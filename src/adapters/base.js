import { sleepAwake as sleep } from "../core/ticker.js"

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

export async function waitFor(list, timeoutMs = 15000) {
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const el = qs(list)
		if (el) return el
		if (Date.now() > deadline) throw new Error(`selector not found: ${(list || []).join(" | ")}`)
		await sleep(300)
	}
}

export function clickByText(labels, extraSelectors = "") {
	const base = 'button, div[role="button"], [role="tab"], [role="menuitem"], [role="option"], a, li'
	const candidates = document.querySelectorAll(extraSelectors ? `${base}, ${extraSelectors}` : base)
	for (const label of labels || []) {
		const needle = String(label).toLowerCase()
		for (const el of candidates) {
			const text = (el.innerText || el.getAttribute("aria-label") || el.title || "")
				.trim()
				.toLowerCase()
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

export async function typeInto(el, text) {
	el.focus()
	if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
		el.value = text
		el.dispatchEvent(new Event("input", { bubbles: true }))
		return el
	}
	document.execCommand("selectAll", false, null)
	document.execCommand("delete", false, null)
	const ok = document.execCommand("insertText", false, text)
	if (!ok) {
		el.textContent = text
		el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }))
	}
	await sleep(150)
	return el
}

export async function attachFiles(inputSelectors, images) {
	const input = qs(inputSelectors)
	if (!input) throw new Error("file input not found")
	const dt = new DataTransfer()
	for (const image of images) {
		const blob = await (await fetch(image.dataUrl)).blob()
		dt.items.add(new File([blob], image.name || "source.png", { type: blob.type }))
	}
	input.files = dt.files
	input.dispatchEvent(new Event("change", { bubbles: true }))
	await sleep(2500)
	return true
}

const MEDIA_HINT = /^blob:|^data:(image|video)|scontent|fbcdn|cdninstagram|googleusercontent|gstatic|oaiusercontent|alicdn|aliyuncs|\.mp4|\.webm|\.png|\.jpe?g|\.webp|\.gif/i

export function isResultMedia(el, minSize = 256) {
	const src = el.currentSrc || el.src || ""
	if (!src) return false
	if (el.tagName === "VIDEO") return true
	if (!MEDIA_HINT.test(src)) return false
	const w = el.naturalWidth || el.width || 0
	const h = el.naturalHeight || el.height || 0
	return w >= minSize && h >= minSize
}

export function collectMediaUrls(selectors, minSize) {
	return qsa(selectors)
		.filter((el) => isResultMedia(el, minSize))
		.map((el) => el.currentSrc || el.src)
		.filter(Boolean)
}

/**
 * Builds a full adapter from a small spec. Every platform gets concurrency,
 * retries, result diffing, download fallback and probing for free; only the
 * selectors and label maps differ. `spec.overrides` can replace any method.
 */
export function createAdapter(spec) {
	const adapter = {
		id: spec.id,
		label: spec.label,
		host: spec.host,
		modes: spec.modes || ["t2i"],
		aspectRatios: spec.aspectRatios || [],
		qualities: spec.qualities || [],
		selectors: { ...spec.selectors },
		modeLabels: spec.modeLabels || {},
		minMediaSize: spec.minMediaSize || 256,

		async isReady() {
			await waitFor(this.selectors.composer, 25000)
			if (this.selectors.loginWall && qs(this.selectors.loginWall)) {
				throw new Error("not signed in")
			}
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
			const ok = clickByText([ratio, ratio.replace(":", " : ")])
			if (ok) await sleep(500)
			return ok
		},

		async attachImages(images) {
			if (!images || !images.length) return false
			return await attachFiles(this.selectors.fileInput, images)
		},

		async snapshotResults() {
			return new Set(collectMediaUrls(this.selectors.media, this.minMediaSize))
		},

		async submitPrompt(text, images) {
			if (images && images.length) await this.attachImages(images)
			const composer = await waitFor(this.selectors.composer)
			await typeInto(composer, text)
			const button = qs(this.selectors.sendButton)
			if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
				button.click()
			} else {
				pressEnter(composer)
			}
			await sleep(700)
			return { submittedAt: Date.now() }
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
				const fresh = collectMediaUrls(this.selectors.media, this.minMediaSize).filter(
					(url) => !before.has(url)
				)
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
			const el = qsa(this.selectors.media).find((node) => (node.currentSrc || node.src) === url)
			if (!el) return false
			el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
			await sleep(400)
			let scope = el
			for (let hop = 0; hop < 6 && scope; hop += 1) {
				const button = qs(this.selectors.downloadButton, scope)
				if (button) {
					button.click()
					await sleep(1000)
					return true
				}
				scope = scope.parentElement
			}
			return false
		},

		probe() {
			const urls = collectMediaUrls(this.selectors.media, this.minMediaSize)
			return {
				platform: this.id,
				composer: !!qs(this.selectors.composer),
				sendButton: !!qs(this.selectors.sendButton),
				fileInput: !!qs(this.selectors.fileInput),
				downloadButton: !!qs(this.selectors.downloadButton),
				mediaFound: urls.length,
				sample: urls.slice(0, 3),
			}
		},
	}

	return Object.assign(adapter, spec.overrides || {})
}

/** Merge remote selector overrides so UI breakages are fixed without shipping. */
export function applySelectorOverrides(adapter, overrides) {
	if (!overrides) return adapter
	const forPlatform = overrides[adapter.id]
	if (!forPlatform) return adapter
	adapter.selectors = { ...adapter.selectors, ...forPlatform }
	return adapter
}

export { sleep }
