import { createAdapter, decorateWith } from "./base.js"

// Grok / Grok Imagine on grok.com. Image and video generation happen inside the
// chat, so the model picker is clicked and the framing choices are folded into
// the prompt text.
const STYLE_PHRASES = {
	photo: "Photorealistic, natural lighting, sharp detail.",
	cinematic: "Cinematic composition, shallow depth of field, film grain.",
	anime: "Anime illustration style, clean line art, vivid colour.",
	art: "Painterly digital illustration, rich texture.",
}

export default createAdapter({
	id: "grok",
	label: "Grok",
	host: "grok.com",
	modes: ["t2i", "i2i", "t2v", "i2v"],
	aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
	minMediaSize: 220,
	selectors: {
		composer: [
			'textarea[aria-label*="Ask" i]',
			"form textarea",
			"textarea",
			'div[contenteditable="true"]',
		],
		sendButton: [
			'button[type="submit"][aria-label*="Submit" i]',
			'button[aria-label*="Submit" i]',
			'button[aria-label*="Send" i]',
			'form button[type="submit"]',
		],
		// generated assets are served from x/grok asset hosts
		media: [
			'img[src*="assets.grok"]',
			'img[src*="imgen"]',
			'img[src*="video.twimg"]',
			"video",
			'img[alt*="generated" i]',
		],
		downloadButton: [
			"a[download]",
			'button[aria-label*="Download" i]',
			'button[title*="Download" i]',
		],
		fileInput: ['input[type="file"]'],
		errorToast: ['[role="alert"]', '[data-testid*="error" i]'],
		loginWall: ['a[href*="/sign-in"]', 'button[data-testid*="login" i]'],
	},
	modeLabels: {
		t2i: ["Create images", "Image", "Imagine"],
		i2i: ["Edit image", "Image"],
		t2v: ["Make video", "Video", "Imagine"],
		i2v: ["Animate", "Make video", "Video"],
	},
	options: [
		{
			key: "model",
			label: "Model",
			hint: "Clicked in the model picker before the run starts.",
			openerLabels: ["Model", "Grok 4", "Grok 3"],
			values: [
				{ value: "grok4", label: "Grok 4", labels: ["Grok 4"] },
				{ value: "grok4-heavy", label: "Grok 4 Heavy", labels: ["Grok 4 Heavy", "Heavy"] },
				{ value: "grok3", label: "Grok 3", labels: ["Grok 3"] },
			],
		},
		{
			key: "style",
			label: "Look",
			hint: "Added to the prompt text, since Grok has no style control.",
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
			hint: "Grok has no ratio picker, so the ratio is written into the prompt.",
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
