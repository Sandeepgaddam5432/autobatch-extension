// Minimal .xlsx reader: enough to pull the first sheet's cell text.
// xlsx is a zip of XML, and Chrome ships DecompressionStream("deflate-raw"),
// so no third-party library and no build step are needed.

function findEocd(view) {
	for (let i = view.byteLength - 22; i >= 0; i -= 1) {
		if (view.getUint32(i, true) === 0x06054b50) return i
	}
	return -1
}

async function inflateRaw(bytes) {
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
	return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Returns a Map of entry name -> text content. */
async function readZip(buffer) {
	const view = new DataView(buffer)
	const bytes = new Uint8Array(buffer)
	const eocd = findEocd(view)
	if (eocd < 0) throw new Error("not a zip file")
	const count = view.getUint16(eocd + 10, true)
	let pointer = view.getUint32(eocd + 16, true)
	const decoder = new TextDecoder()
	const out = new Map()

	for (let i = 0; i < count; i += 1) {
		if (view.getUint32(pointer, true) !== 0x02014b50) break
		const method = view.getUint16(pointer + 10, true)
		const compressedSize = view.getUint32(pointer + 20, true)
		const nameLen = view.getUint16(pointer + 28, true)
		const extraLen = view.getUint16(pointer + 30, true)
		const commentLen = view.getUint16(pointer + 32, true)
		const localOffset = view.getUint32(pointer + 42, true)
		const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLen))
		pointer += 46 + nameLen + extraLen + commentLen

		if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml)$/.test(name)) continue

		const localNameLen = view.getUint16(localOffset + 26, true)
		const localExtraLen = view.getUint16(localOffset + 28, true)
		const dataStart = localOffset + 30 + localNameLen + localExtraLen
		const raw = bytes.subarray(dataStart, dataStart + compressedSize)
		const content = method === 0 ? raw : await inflateRaw(raw)
		out.set(name, decoder.decode(content))
	}
	return out
}

function unescapeXml(text) {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#10;/g, "\n")
		.replace(/&amp;/g, "&")
}

function parseSharedStrings(xml) {
	if (!xml) return []
	return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => {
		const parts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1])
		return unescapeXml(parts.join(""))
	})
}

function columnIndex(ref) {
	const letters = /^([A-Z]+)/.exec(ref || "")
	if (!letters) return 0
	let index = 0
	for (const ch of letters[1]) index = index * 26 + (ch.charCodeAt(0) - 64)
	return index - 1
}

/** Parses an .xlsx ArrayBuffer into a 2D array of strings. */
export async function parseXlsx(buffer) {
	const files = await readZip(buffer)
	const sheet = files.get("xl/worksheets/sheet1.xml")
	if (!sheet) throw new Error("sheet1 not found")
	const shared = parseSharedStrings(files.get("xl/sharedStrings.xml"))
	const rows = []

	for (const rowMatch of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
		const cells = []
		for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
			const attrs = cellMatch[1]
			const body = cellMatch[2]
			const ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1] || ""
			const type = (/t="([^"]+)"/.exec(attrs) || [])[1] || ""
			let value = ""
			if (type === "s") {
				const index = Number((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1])
				value = shared[index] || ""
			} else if (type === "inlineStr") {
				value = unescapeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""))
			} else {
				value = unescapeXml((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1] || "")
			}
			cells[columnIndex(ref)] = value
		}
		if (cells.length) rows.push([...cells].map((cell) => cell || ""))
	}
	return rows
}
