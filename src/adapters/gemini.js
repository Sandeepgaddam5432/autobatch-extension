import { createAdapter, decorateWith } from "./base.js"

// Gemini web app. The composer is a Quill editor inside <rich-textarea>, and
// generated media comes from googleusercontent hosts.
const STYLE_PHRASES = {
	photo: "Photorealistic, natural lighting, high detail.",
	cinematic: "Cinematic framing, shallow depth of field.",
	anime: "Anime illustration style, clean lines.",
	art: "Painterly digital illustration.",
}

export default createAdapter({
	id: "gemini",
	label: "Gemini",
	host: "gemini.google.com",
	modes: ["t2i", "i2i", "t2v", "i2v"],
	aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
	minMediaSize: 220,
	selectors: {
		composer: [
			'rich-textarea div[contenteditable="true"]',
			'.ql-editor[contenteditable="true"]',
			'div[contenteditable="true"][role="textbox"]',
			"textarea",
		],
		sendButton: [
			"button.send-button",
			'button[aria-label*="Send" i]',
			'button[mattooltip*="Send" i]',
			'button[aria-label*="Submit" i]',
		],
		media: [
			'img[src*="googleusercontent"]',
			"generated-image img",
			'img[alt*="Generated" i]',
			"video",
		],
		downloadButton: [
			"a[download]",
			'button[aria-label*="Download" i]',
			'button[mattooltip*="Download" i]',
		],
		fileInput: ['input[type="file"]'],
		errorToast: ['[role="alert"]', "message-error"],
		loginWall: ['a[href*="accounts.google.com/ServiceLogin"]'],
	},
	modeLabels: {
		t2i: ["Create images", "Image"],
		i2i: ["Edit image", "Image"],
		t2v: ["Create videos", "Video"],
		i2v: ["Animate", "Video"],
	},
	options: [
		{
			key: "model",
			label: "Model",
			hint: "Uses the model switcher at the top of the page.",
			opener: ['button[aria-label*="model" i]', "bard-mode-switcher button"],
			openerLabels: ["Fast", "Thinking", "Pro", "Flash"],
			values: [
				{ value: "pro", label: "Pro (thinking)", labels: ["Pro", "Thinking"] },
				{ value: "flash", label: "Flash (fast)", labels: ["Flash", "Fast"] },
			],
		},
		{
			key: "tool",
			label: "Generation tool",
			hint: "Turns on the image or video tool in the composer toolbar.",
			openerLabels: ["Tools", "More"],
			values: [
				{ value: "image", label: "Create images", labels: ["Create images", "Image"] },
				{ value: "video", label: "Create videos", labels: ["Create videos", "Video"] },
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
			hint: "Gemini exposes no ratio control, so the ratio is written into the prompt.",
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
