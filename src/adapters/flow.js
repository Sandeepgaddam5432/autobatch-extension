import { createAdapter } from "./base.js"

// Google Labs Flow (Veo / Imagen). The page keeps its generation choices in
// dropdowns rather than the prompt, so they are declared as options and
// applied once at the start of a run.
export default createAdapter({
	id: "flow",
	label: "Google Labs Flow",
	host: "labs.google",
	modes: ["t2v", "i2v", "f2v", "ing2v", "t2i"],
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
		t2v: ["Text to video", "Text to Video", "Video"],
		i2v: ["Frames to video", "Image to video"],
		f2v: ["Frames to video", "Frame to video"],
		ing2v: ["Ingredients to video", "Ingredients"],
		t2i: ["Text to image", "Image"],
	},
	options: [
		{
			key: "model",
			label: "Model",
			hint: "Video model used for every prompt in the run.",
			opener: ['button[aria-label*="model" i]', '[data-testid*="model" i]'],
			openerLabels: ["Model"],
			select: ["select"],
			values: [
				{ value: "veo31-quality", label: "Veo 3.1 · Quality", labels: ["Veo 3.1 - Quality", "Veo 3.1 Quality"] },
				{ value: "veo31-fast", label: "Veo 3.1 · Fast", labels: ["Veo 3.1 - Fast", "Veo 3.1 Fast"] },
				{ value: "veo3-quality", label: "Veo 3 · Quality", labels: ["Veo 3 - Quality", "Veo 3 Quality"] },
				{ value: "veo3-fast", label: "Veo 3 · Fast", labels: ["Veo 3 - Fast", "Veo 3 Fast"] },
				{ value: "veo2-quality", label: "Veo 2 · Quality", labels: ["Veo 2 - Quality", "Veo 2 Quality"] },
				{ value: "veo2-fast", label: "Veo 2 · Fast", labels: ["Veo 2 - Fast", "Veo 2 Fast"] },
			],
		},
		{
			key: "imageModel",
			label: "Image model",
			hint: "Used for image outputs and for frames generated from text.",
			opener: ['button[aria-label*="image model" i]'],
			openerLabels: ["Image model"],
			select: ["select"],
			values: [
				{ value: "imagen4-ultra", label: "Imagen 4 Ultra", labels: ["Imagen 4 Ultra"] },
				{ value: "imagen4", label: "Imagen 4", labels: ["Imagen 4"] },
				{ value: "nano-banana", label: "Nano Banana", labels: ["Nano Banana"] },
			],
		},
		{
			key: "videoLength",
			label: "Video length",
			openerLabels: ["Video option", "Duration", "Length"],
			values: [
				{ value: "4s", label: "4 seconds", labels: ["4 seconds", "4s"] },
				{ value: "6s", label: "6 seconds", labels: ["6 seconds", "6s"] },
				{ value: "8s", label: "8 seconds", labels: ["8 seconds", "8s"] },
			],
		},
		{
			key: "resolution",
			label: "Output resolution",
			hint: "1080p and 4K need a paid Google plan.",
			openerLabels: ["Quality", "Resolution"],
			values: [
				{ value: "720p", label: "720p", labels: ["720p"] },
				{ value: "1080p", label: "1080p", labels: ["1080p"] },
				{ value: "4k", label: "4K", labels: ["4K", "2160p"] },
			],
		},
		{
			key: "outputs",
			label: "Outputs on the page",
			hint: "Match this to Outputs per prompt so the run waits for the right number.",
			openerLabels: ["Outputs per prompt", "Outputs"],
			values: [
				{ value: "1", label: "1", labels: ["1 output", "1"] },
				{ value: "2", label: "2", labels: ["2 outputs", "2"] },
				{ value: "3", label: "3", labels: ["3 outputs", "3"] },
				{ value: "4", label: "4", labels: ["4 outputs", "4"] },
			],
		},
	],
})
