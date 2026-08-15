const EXT_BY_MODE = { t2v: "mp4", i2v: "mp4", f2v: "mp4", t2i: "png", i2i: "png" }

export function extFromUrl(url, mode) {
	const match = /\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.exec(url || "")
	if (match) return match[1].toLowerCase()
	const dataMatch = /^data:(video|image)\/([a-z0-9+.-]+)/i.exec(url || "")
	if (dataMatch) return dataMatch[2].replace("jpeg", "jpg").toLowerCase()
	return EXT_BY_MODE[mode] || "bin"
}

export function slugify(text, max = 48) {
	return String(text || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, max)
}

function sanitizeSegment(segment) {
	return String(segment || "")
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
		.replace(/\.+$/g, "")
		.trim()
}

function pad(n, width = 4) {
	return String(n).padStart(width, "0")
}

/**
 * Supported tokens:
 * {n} global counter  {index} prompt position  {slot} output # within a prompt
 * {slug} prompt slug  {prompt} first 60 chars  {date} YYYY-MM-DD  {time} HH-MM-SS
 * {mode} {ratio} {platform} {ext}
 */
export function renderFilename({
	template = "{n}_{slug}",
	counter = 1,
	index = 0,
	slot = 0,
	prompt = "",
	mode = "t2i",
	ratio = "",
	platform = "",
	url = "",
	folder = "UnQ",
	subfolders = [],
}) {
	const now = new Date()
	const ext = extFromUrl(url, mode)
	const tokens = {
		"{n}": pad(counter),
		"{index}": pad(index + 1),
		"{slot}": String(slot + 1),
		"{slug}": slugify(prompt),
		"{prompt}": slugify(prompt, 60),
		"{date}": now.toISOString().slice(0, 10),
		"{time}": now.toTimeString().slice(0, 8).replace(/:/g, "-"),
		"{mode}": mode,
		"{ratio}": String(ratio).replace(":", "x"),
		"{platform}": platform,
		"{ext}": ext,
	}
	let name = template || "{n}_{slug}"
	for (const [token, value] of Object.entries(tokens)) {
		name = name.split(token).join(value)
	}
	name = sanitizeSegment(name) || `${pad(counter)}`
	if (slot > 0 && !template.includes("{slot}")) name += `_${slot + 1}`

	const parts = [sanitizeSegment(folder) || "UnQ", ...subfolders.map(sanitizeSegment).filter(Boolean)]
	return `${parts.join("/")}/${name}.${ext}`
}
