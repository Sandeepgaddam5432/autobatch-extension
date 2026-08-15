// Prompts are separated by one or more blank lines (matches the convention
// used by every tool in this category, so existing .txt prompt files work).
export function parsePrompts(raw) {
	if (!raw) return []
	return String(raw)
		.replace(/\r\n/g, "\n")
		.split(/\n\s*\n+/)
		.map((block) => block.trim())
		.filter((block) => block.length > 0)
}
