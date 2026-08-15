import { createAdapter } from "./base.js"

export default createAdapter({
	id: "meta",
	label: "Meta.ai",
	host: "meta.ai",
	modes: ["t2i", "t2v", "i2i", "i2v"],
	aspectRatios: ["1:1", "16:9", "9:16"],
	selectors: {
		composer: ['div[contenteditable="true"]', '[role="textbox"]', "textarea"],
		sendButton: [
			'button[aria-label*="Send" i]',
			'div[role="button"][aria-label*="Send" i]',
			'button[type="submit"]',
		],
		media: ["video", "img"],
		downloadButton: ["a[download]", 'button[aria-label*="Download" i]', 'div[role="button"][aria-label*="Download" i]'],
		fileInput: ['input[type="file"]'],
		errorToast: [],
		loginWall: [],
	},
	modeLabels: {
		t2i: ["Image"],
		t2v: ["Video"],
		i2i: ["Image"],
		i2v: ["Video"],
	},
})
