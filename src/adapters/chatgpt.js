import { createAdapter, decorateWith } from "./base.js"

// ChatGPT image generation. The composer is a ProseMirror editor and results
// are served from oaiusercontent, which is a much tighter match than "img".
const STYLE_PHRASES = {
	photo: "Photorealistic, natural lighting, high detail.",
	cinematic: "Cinematic framing, shallow depth of field, film grain.",
	anime: "Anime illustration style, clean line art.",
	art: "Painterly digital illustration, rich texture.",
}

export default createAdapter({
	id: "chatgpt",
	label: "ChatGPT",
	host: "chatgpt.com",
	modes: ["t2i", "i2i"],
	aspectRatios: ["1:1", "16:9", "9:16", "3:2", "2:3"],
	minMediaSize: 220,
	selectors: {
		composer: [
			"#prompt-textarea",
			'div.ProseMirror[contenteditable="true"]',
			'div[contenteditable="true"]',
			"textarea",
		],
		sendButton: [
			'button[data-testid="send-button"]',
			"#composer-submit-button",
			'button[aria-label*="Send" i]',
		],
		media: [
			'img[src*="oaiusercontent"]',
			'img[alt*="Generated" i]',
			'div[data-testid*="image"] img',
			"video",
		],
		downloadButton: [
			"a[download]",
			'button[aria-label*="Download" i]',
			'button[data-testid*="download" i]',
		],
		fileInput: ['input[type="file"]'],
		errorToast: ['[role="alert"]', 'div[data-testid*="error" i]'],
		loginWall: ['button[data-testid="login-button"]', 'a[href*="/auth/login"]'],
	},
	modeLabels: {
		t2i: ["Create image", "Image"],
		i2i: ["Edit image", "Image"],
	},
	options: [
		{
			key: "model",
			label: "Model",
			hint: "Uses the model switcher next to the chat title.",
			opener: ['button[data-testid="model-switcher-dropdown-button"]', 'button[aria-label*="model" i]'],
			values: [
				{ value: "auto", label: "Auto", labels: ["Auto"] },
				{ value: "instant", label: "Instant", labels: ["Instant", "Fast"] },
				{ value: "thinking", label: "Thinking", labels: ["Thinking"] },
			],
		},
		{
			key: "tool",
			label: "Image tool",
			hint: "Turns on Create image in the composer plus menu.",
			opener: ['button[aria-label*="attach" i]', 'button[data-testid="composer-plus-btn"]'],
			values: [{ value: "image", label: "Create image", labels: ["Create image", "Image"] }],
		},
		{
			key: "style",
			label: "Look",
			promptOnly: true,
			values: [
				{ value: "photo", label: "Photorealistic" },
				{ value: "cinematic", label: "Cinematic" },
				{ value: "anime", label: "Anime" },
				{ value: "art", label: "Illustration" },
			],
		},
		{
			key: "ratioHint",
			label: "Aspect ratio handling",
			hint: "ChatGPT reads the ratio from the prompt text.",
			promptOnly: true,
			values: [
				{ value: "append", label: "Write it into the prompt" },
				{ value: "off", label: "Do not mention it" },
			],
		},
	],
	overrides: {
		decoratePrompt(text) {
			const parts = decorateWith(this, [STYLE_PHRASES[this.chosen.style]])
			return parts.length ? `${text}\n\n${parts.join(" ")}` : text
		},
	},
})
