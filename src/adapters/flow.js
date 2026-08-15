import { createAdapter } from "./base.js"

// Google Labs Flow (Veo / Imagen). Selectors unverified — run Probe.
export default createAdapter({
	id: "flow",
	label: "Google Labs Flow",
	host: "labs.google",
	modes: ["t2v", "i2v", "f2v", "t2i"],
	aspectRatios: ["16:9", "9:16", "1:1"],
	qualities: ["best", "1080p", "720p"],
	selectors: {
		composer: ["textarea", 'div[contenteditable="true"]', '[role="textbox"]'],
		sendButton: [
			'button[aria-label*="Generate" i]',
			'button[aria-label*="Create" i]',
			'button[type="submit"]',
		],
		media: ["video", "img"],
		downloadButton: ["a[download]", 'button[aria-label*="Download" i]'],
		fileInput: ['input[type="file"]'],
		ratioOpener: ['button[aria-label*="aspect" i]', 'button[aria-label*="ratio" i]'],
		errorToast: ['[role="alert"]'],
	},
	modeLabels: {
		t2v: ["Text to video", "Video"],
		i2v: ["Frames to video", "Image to video"],
		f2v: ["Frames to video"],
		t2i: ["Image"],
	},
})
