import { createAdapter } from "./base.js"

export default createAdapter({
	id: "grok",
	label: "Grok",
	host: "grok.com",
	modes: ["t2i", "t2v", "i2i"],
	aspectRatios: ["1:1", "16:9", "9:16"],
	selectors: {
		composer: ["textarea", 'div[contenteditable="true"]'],
		sendButton: ['button[aria-label*="Submit" i]', 'button[aria-label*="Send" i]', 'button[type="submit"]'],
		media: ["video", "img"],
		downloadButton: ["a[download]", 'button[aria-label*="Download" i]'],
		fileInput: ['input[type="file"]'],
		errorToast: ['[role="alert"]'],
	},
	modeLabels: { t2i: ["Image"], t2v: ["Video"], i2i: ["Image"] },
})
