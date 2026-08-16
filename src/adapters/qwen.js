import { createAdapter, decorateWith } from "./base.js"

// Qwen chat. Image and video generation are toolbar toggles under the
// composer, and the model picker sits above the chat.
const STYLE_PHRASES = {
	photo: "Photorealistic, natural lighting, high detail.",
	cinematic: "Cinematic framing, shallow depth of field.",
	anime: "Anime illustration style, clean line art.",
	art: "Painterly digital illustration.",
}

export default createAdapter({
	id: "qwen",
	label: "Qwen",
	host: "chat.qwen.ai",
	modes: ["t2i", "i2i", "t2v", "i2v"],
	aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
	minMediaSize: 220,
	selectors: {
		composer: [
			"textarea#chat-input",
			'textarea[placeholder*="Qwen" i]',
			"textarea",
			'div[contenteditable="true"]',
		],
		sendButton: [
			"#send-message-button",
			'button[class*="send" i]',
			'button[aria-label*="Send" i]',
			'button[type="submit"]',
		],
		media: [
			'img[src*="cdn.qwenlm"]',
			'img[src*="dashscope"]',
			'img[src*="aliyuncs"]',
			"video",
			'img[alt*="generated" i]',
		],
		downloadButton: [
			"a[download]",
			'button[aria-label*="Download" i]',
			'button[title*="Download" i]',
			'[class*="download" i]',
		],
		fileInput: ['input[type="file"]'],
		errorToast: ['[role="alert"]', '[class*="error-toast" i]'],
		loginWall: ['button[class*="login" i]', 'a[href*="/auth" i]'],
	},
	modeLabels: {
		t2i: ["Image Generation", "\u56fe\u7247\u751f\u6210", "Image"],
		i2i: ["Image Edit", "Image Generation", "Image"],
		t2v: ["Video Generation", "\u89c6\u9891\u751f\u6210", "Video"],
		i2v: ["Video Generation", "Video"],
	},
	options: [
		{
			key: "model",
			label: "Model",
			hint: "Uses the model selector above the chat.",
			opener: ['button[class*="model" i]', '[data-testid*="model" i]'],
			openerLabels: ["Qwen3", "Model"],
			values: [
				{ value: "max", label: "Qwen3 Max", labels: ["Qwen3-Max", "Max"] },
				{ value: "plus", label: "Qwen3 Plus", labels: ["Qwen3-Plus", "Plus"] },
				{ value: "vl", label: "Qwen3 VL", labels: ["Qwen3-VL", "VL"] },
			],
		},
		{
			key: "tool",
			label: "Generation tool",
			hint: "Toggles the Image or Video button under the composer.",
			values: [
				{
					value: "image",
					label: "Image generation",
					labels: ["Image Generation", "\u56fe\u7247\u751f\u6210", "Image"],
				},
				{
					value: "video",
					label: "Video generation",
					labels: ["Video Generation", "\u89c6\u9891\u751f\u6210", "Video"],
				},
			],
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
