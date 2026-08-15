import { createAdapter } from "./base.js"

// Selectors are intentionally minimal: whatever is missing is resolved by
// heuristic auto-detection in autodetect.js.
export default createAdapter({
	id: "meta",
	label: "Meta.ai",
	host: "meta.ai",
	modes: ["t2v", "f2v", "ing2v", "t2i", "i2i"],
	aspectRatios: ["16:9", "9:16", "1:1", "2:3", "3:2"],
	selectors: {
		composer: ['div[contenteditable="true"]', '[role="textbox"]', "textarea"],
		sendButton: ['button[aria-label*="Send" i]', 'div[role="button"][aria-label*="Send" i]'],
		media: [],
		downloadButton: ["a[download]", '[aria-label*="Download" i]'],
		fileInput: ['input[type="file"]'],
		errorToast: [],
		loginWall: [],
	},
	modeLabels: {
		t2v: ["Text to video", "Video"],
		f2v: ["Frame to video", "Animate", "Image to video"],
		ing2v: ["Ingredients", "Ingredients to video"],
		t2i: ["Text to image", "Image"],
		i2i: ["Image to image", "Edit"],
	},
	ratioLabels: {
		"16:9": ["Landscape", "YouTube"],
		"9:16": ["Portrait", "Reels", "Shorts"],
		"1:1": ["Square"],
	},
})
