// Heuristic DOM discovery.
//
// Hand-written CSS selectors break every time a site ships a redesign, and for
// a new platform we may not know them at all. This module finds the composer,
// send button, file input and result media by *shape* instead: position, size,
// visibility, and relationship to each other. It is used as a fallback whenever
// the configured selectors miss, and its findings are reported by probe().

const SEND_WORDS = ["send", "submit", "generate", "create", "run", "g\u1eedi", "\u53d1\u9001", "\u751f\u6210"]

function visible(el) {
	if (!el || !el.getBoundingClientRect) return false
	const rect = el.getBoundingClientRect()
	if (rect.width < 2 || rect.height < 2) return false
	const style = getComputedStyle(el)
	return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0
}

function area(el) {
	const rect = el.getBoundingClientRect()
	return rect.width * rect.height
}

function label(el) {
	return (
		(el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"))) ||
		el.innerText ||
		""
	)
		.trim()
		.toLowerCase()
}

/** Largest visible editable surface in the lower half of the viewport wins. */
export function findComposer() {
	const candidates = [
		...document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"]'),
	].filter((el) => visible(el) && !el.readOnly && !el.disabled)
	if (!candidates.length) return null
	const height = window.innerHeight || 1000
	candidates.sort((a, b) => {
		const ra = a.getBoundingClientRect()
		const rb = b.getBoundingClientRect()
		const lowerA = ra.top > height * 0.4 ? 1 : 0
		const lowerB = rb.top > height * 0.4 ? 1 : 0
		if (lowerA !== lowerB) return lowerB - lowerA
		return area(b) - area(a)
	})
	return candidates[0]
}

/**
 * Send button: prefer an explicit send-ish label; otherwise the closest
 * enabled button to the right of / just below the composer.
 */
export function findSendButton(composer) {
	const buttons = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')].filter(
		(el) => visible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true"
	)
	if (!buttons.length) return null

	const labelled = buttons.filter((el) => {
		const text = label(el)
		return text && text.length < 24 && SEND_WORDS.some((word) => text.includes(word))
	})
	if (labelled.length) return labelled[labelled.length - 1]

	if (!composer) return null
	const base = composer.getBoundingClientRect()
	let best = null
	let bestScore = Infinity
	for (const button of buttons) {
		const rect = button.getBoundingClientRect()
		if (rect.bottom < base.top - 40 || rect.top > base.bottom + 80) continue
		const dx = rect.left - base.right
		const dy = Math.abs(rect.top - base.top)
		const score = Math.abs(dx) + dy + (dx < 0 ? 220 : 0)
		if (score < bestScore) {
			bestScore = score
			best = button
		}
	}
	return best
}

export function findFileInput() {
	const inputs = [...document.querySelectorAll('input[type="file"]')]
	if (!inputs.length) return null
	return inputs.find((el) => /image|video|\*/i.test(el.accept || "*")) || inputs[0]
}

/** Media large enough to be a generated result, sorted top-down. */
export function findResultMedia(minSize = 220) {
	return [...document.querySelectorAll("video, img")]
		.filter((el) => {
			if (!visible(el)) return false
			const src = el.currentSrc || el.src || ""
			if (!src || /^data:image\/svg/i.test(src)) return false
			if (el.tagName === "VIDEO") return true
			const w = el.naturalWidth || el.width || 0
			const h = el.naturalHeight || el.height || 0
			return w >= minSize && h >= minSize
		})
		.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
}

/** Any clickable download affordance inside/near a media element. */
export function findDownloadButton(scope) {
	let node = scope
	for (let hop = 0; hop < 7 && node; hop += 1) {
		const direct = node.querySelector
			? node.querySelector('a[download], [aria-label*="download" i], [title*="download" i]')
			: null
		if (direct && visible(direct)) return direct
		const byText = node.querySelectorAll
			? [...node.querySelectorAll('button, [role="button"], a')].find((el) =>
					/download|save|t\u1ea3i|\u4e0b\u8f7d/i.test(label(el))
			  )
			: null
		if (byText && visible(byText)) return byText
		node = node.parentElement
	}
	return null
}

/** Full report used by probe() and the Debug Logs tab. */
export function report() {
	const composer = findComposer()
	const send = findSendButton(composer)
	const media = findResultMedia()
	const describe = (el) =>
		el
			? {
					tag: el.tagName.toLowerCase(),
					id: el.id || null,
					ariaLabel: el.getAttribute("aria-label") || null,
					testId: el.getAttribute("data-testid") || null,
					role: el.getAttribute("role") || null,
					className: String(el.className || "").slice(0, 80) || null,
			  }
			: null
	return {
		composer: describe(composer),
		sendButton: describe(send),
		fileInput: describe(findFileInput()),
		mediaCount: media.length,
		mediaSample: media.slice(0, 3).map((el) => (el.currentSrc || el.src || "").slice(0, 90)),
	}
}
