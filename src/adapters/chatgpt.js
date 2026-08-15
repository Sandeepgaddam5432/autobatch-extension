import { createAdapter } from "./base.js"

export default createAdapter({
	id: "chatgpt",
	label: "ChatGPT / Sora",
	host: "chatgpt.com",
	modes: ["t2i", "i2i"],
	aspectRatios: ["1:1", "16:9", "9:16"],
	selectors: {
		composer: ["#prompt-textarea", 'div[contenteditable="true"]', "textarea"],
		sendButton: ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'],
		media: ["video", "img"],
		downloadButton: ["a[download]", 'button[aria-label*="Download" i]'],
		fileInput: ['input[type="file"]'],
		errorToast: ['[role="alert"]'],
	},
	modeLabels: { t2i: ["Image"], i2i: ["Image"] },
})
