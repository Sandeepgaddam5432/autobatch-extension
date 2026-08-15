const MAX_EXPANDED = 2000

/** Blank-line separated blocks (the de-facto convention for prompt .txt files). */
export function parseTxt(raw) {
	if (!raw) return []
	return String(raw)
		.replace(/\r\n/g, "\n")
		.split(/\n\s*\n+/)
		.map((block) => block.trim())
		.filter(Boolean)
}

/** One prompt per line. */
export function parseLines(raw) {
	if (!raw) return []
	return String(raw)
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
}

function splitCsvLine(line) {
	const out = []
	let field = ""
	let quoted = false
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i]
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') {
				field += '"'
				i += 1
			} else if (ch === '"') {
				quoted = false
			} else {
				field += ch
			}
		} else if (ch === '"') {
			quoted = true
		} else if (ch === "," || ch === "\t") {
			out.push(field)
			field = ""
		} else {
			field += ch
		}
	}
	out.push(field)
	return out.map((value) => value.trim())
}

/**
 * CSV / TSV: first column is the prompt. Optional columns named
 * `image`, `ratio`, `mode`, `outputs` become per-row overrides.
 */
export function parseCsv(raw) {
	const lines = String(raw || "")
		.replace(/\r\n/g, "\n")
		.split("\n")
		.filter((line) => line.trim())
	if (!lines.length) return []

	const first = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
	const hasHeader = first.includes("prompt")
	const headers = hasHeader ? first : ["prompt"]
	const rows = hasHeader ? lines.slice(1) : lines

	return rows
		.map((line) => {
			const cells = splitCsvLine(line)
			const row = { text: cells[0] }
			headers.forEach((header, i) => {
				if (i === 0 || !cells[i]) return
				if (header === "image") row.image = cells[i]
				if (header === "ratio") row.aspectRatio = cells[i]
				if (header === "mode") row.mode = cells[i]
				if (header === "outputs") row.outputsPerPrompt = Number(cells[i]) || 1
			})
			return row
		})
		.filter((row) => row.text)
}

export function parseAny(raw, filename = "") {
	if (/\.(csv|tsv)$/i.test(filename)) return parseCsv(raw)
	const blocks = parseTxt(raw)
	return blocks.map((text) => ({ text }))
}

/** {{var}} substitution with cartesian expansion. */
export function parseVariables(json) {
	if (!json || !json.trim()) return {}
	const parsed = JSON.parse(json)
	const out = {}
	for (const [key, value] of Object.entries(parsed)) {
		out[key] = Array.isArray(value) ? value.map(String) : [String(value)]
	}
	return out
}

function expandVariables(text, variables) {
	const used = Object.keys(variables).filter((key) => text.includes(`{{${key}}}`))
	if (!used.length) return [text]
	let results = [text]
	for (const key of used) {
		const next = []
		for (const partial of results) {
			for (const value of variables[key]) {
				next.push(partial.split(`{{${key}}}`).join(value))
			}
		}
		results = next
		if (results.length > MAX_EXPANDED) return results.slice(0, MAX_EXPANDED)
	}
	return results
}

function shuffleInPlace(list) {
	for (let i = list.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1))
		const tmp = list[i]
		list[i] = list[j]
		list[j] = tmp
	}
	return list
}

/**
 * Build the final job list: variables -> prefix/suffix -> repeat -> dedupe ->
 * shuffle -> image pairing.
 */
export function buildJobs({
	rows,
	variables = {},
	prefix = "",
	suffix = "",
	repeatCount = 1,
	dedupe = true,
	shuffle = false,
	images = [],
	imageMatchMode = "oneToOne",
}) {
	let expanded = []
	for (const row of rows) {
		for (const text of expandVariables(row.text, variables)) {
			expanded.push({ ...row, text })
		}
	}

	expanded = expanded.map((row) => ({
		...row,
		text: `${prefix ? `${prefix} ` : ""}${row.text}${suffix ? ` ${suffix}` : ""}`.trim(),
	}))

	if (dedupe) {
		const seen = new Set()
		expanded = expanded.filter((row) => {
			const key = `${row.text}|${row.image || ""}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
	}

	const repeats = Math.max(1, Number(repeatCount) || 1)
	if (repeats > 1) {
		const once = expanded.slice()
		for (let r = 1; r < repeats; r += 1) expanded.push(...once.map((row) => ({ ...row })))
	}

	if (shuffle) shuffleInPlace(expanded)

	// image pairing
	if (images.length) {
		if (imageMatchMode === "oneImageAllPrompts") {
			expanded = expanded.map((row) => ({ ...row, images: [images[0]] }))
		} else if (imageMatchMode === "allImagesEachPrompt") {
			expanded = expanded.map((row) => ({ ...row, images: images.slice() }))
		} else if (imageMatchMode === "firstLastFrame") {
			expanded = expanded.map((row, i) => ({
				...row,
				images: [images[i % images.length], images[(i + 1) % images.length]].filter(Boolean),
			}))
		} else {
			expanded = expanded.map((row, i) => ({ ...row, images: [images[i % images.length]] }))
		}
	}

	return expanded.slice(0, MAX_EXPANDED).map((row, index) => ({ index, ...row }))
}
