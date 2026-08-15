import { createAdapter } from "./base.js"

export default createAdapter({
	id: "gemini",
	label: "Gemini",
	host: "gemini.google.com",
	modes: ["t2i", "i2i", "t2v"],
	aspectRatios: ["1:1", "16:9", "9:16"],
	selectors: {
		composer: ['div[contenteditable="true"]', "rich-textarea div", "textarea"],
		sendButton: ['button[aria-label*="Send" i]', 'button[aria-label*="Submit" i]'],
		media: ["video", "img"],
		downloadButton: ["a[download]", 'button[aria-label*="Download" i]'],
		fileInput: ['input[type="file"]'],
		errorToast: ['[role="alert"]'],
	},
	modeLabels: { t2i: ["Image"], i2i: ["Image"], t2v: ["Video"] },
})
