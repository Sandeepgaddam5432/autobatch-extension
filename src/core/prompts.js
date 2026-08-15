import { parseXlsx } from "./xlsx.js"

const MAX_EXPANDED = 2000

/** Blank-line separated blocks. */
export function parseTxt(raw) {
	if (!raw) return []
	return String(raw)
		.replace(/\r\n/g, "\n")
		.split(/\n\s*\n+/)
		.map((block) => block.trim())
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

/** Shared table -> rows logic for CSV, TSV and XLSX. */
export function rowsFromTable(table) {
	if (!table.length) return []
	const header = table[0].map((cell) => String(cell).toLowerCase())
	const hasHeader = header.includes("prompt")
	const headers = hasHeader ? header : ["prompt"]
	const body = hasHeader ? table.slice(1) : table

	return body
		.map((cells) => {
			const row = { text: String(cells[0] || "").trim() }
			headers.forEach((name, i) => {
				const value = cells[i]
				if (i === 0 || !value) return
				if (name === "image") row.image = String(value)
				if (name === "ratio") row.aspectRatio = String(value)
				if (name === "mode") row.mode = String(value)
				if (name === "outputs") row.outputsPerPrompt = Number(value) || 1
			})
			return row
		})
		.filter((row) => row.text)
}

export function parseCsv(raw) {
	const lines = String(raw || "")
		.replace(/\r\n/g, "\n")
		.split("\n")
		.filter((line) => line.trim())
	return rowsFromTable(lines.map(splitCsvLine))
}

/** Reads a File object of any supported type. */
export async function parseFile(file) {
	if (/\.xlsx$/i.test(file.name)) {
		return rowsFromTable(await parseXlsx(await file.arrayBuffer()))
	}
	const text = await file.text()
	if (/\.(csv|tsv)$/i.test(file.name)) return parseCsv(text)
	return parseTxt(text).map((text2) => ({ text: text2 }))
}

export function parseAny(raw) {
	return parseTxt(raw).map((text) => ({ text }))
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
			for (const value of variables[key]) next.push(partial.split(`{{${key}}}`).join(value))
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

function baseName(name) {
	return String(name || "")
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/[_\-]+/g, " ")
		.trim()
}

/**
 * "Auto-add character images": if an uploaded file is named after something
 * mentioned in the prompt (e.g. `maya.png` + "maya walks into frame"), attach
 * that image to that prompt automatically.
 */
export function matchCharacterImages(text, images, limit = 4) {
	const haystack = String(text).toLowerCase()
	const hits = []
	for (const image of images) {
		const name = baseName(image.name).toLowerCase()
		if (name.length < 2) continue
		const parts = name.split(/\s+/).filter((part) => part.length >= 2)
		const matched = parts.length
			? parts.every((part) => haystack.includes(part))
			: haystack.includes(name)
		if (matched) hits.push(image)
		if (hits.length >= limit) break
	}
	return hits
}

function pairImages({ row, index, images, mode, imageMatchMode, maxInputImages, frameOption }) {
	if (!images.length) return []
	if (mode === "ing2v" || mode === "i2i") {
		if (imageMatchMode === "oneToOne") return [images[index % images.length]]
		return images.slice(0, Math.max(1, maxInputImages))
	}
	if (mode === "f2v") {
		if (frameOption === "startAndEnd") {
			return [images[index % images.length], images[(index + 1) % images.length]].filter(Boolean)
		}
		return [images[index % images.length]]
	}
	if (imageMatchMode === "oneImageAllPrompts") return [images[0]]
	if (imageMatchMode === "allImagesEachPrompt") return images.slice(0, Math.max(1, maxInputImages))
	return [images[index % images.length]]
}

/** Build the final job list. */
export function buildJobs({
	rows,
	variables = {},
	prefix = "",
	suffix = "",
	repeatCount = 1,
	dedupe = true,
	shuffle = false,
	images = [],
	mode = "t2v",
	imageMatchMode = "oneToOne",
	maxInputImages = 1,
	frameOption = "startOnly",
	autoAddCharacterImages = false,
}) {
	let expanded = []
	for (const row of rows) {
		for (const text of expandVariables(row.text, variables)) expanded.push({ ...row, text })
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

	const needsImages = ["f2v", "ing2v", "i2i", "i2v"].includes(mode)
	if (needsImages && images.length) {
		expanded = expanded.map((row, index) => {
			let picked = autoAddCharacterImages ? matchCharacterImages(row.text, images, maxInputImages) : []
			if (!picked.length) {
				picked = pairImages({
					row,
					index,
					images,
					mode,
					imageMatchMode,
					maxInputImages,
					frameOption,
				})
			}
			return { ...row, images: picked.filter(Boolean) }
		})
	}

	return expanded.slice(0, MAX_EXPANDED).map((row, index) => ({ index, ...row }))
}
