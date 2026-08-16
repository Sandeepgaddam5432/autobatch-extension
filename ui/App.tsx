import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	AlertTriangle,
	Bug,
	ChevronDown,
	Copy,
	Download,
	Eraser,
	ExternalLink,
	FileSpreadsheet,
	FileText,
	Film,
	Image as ImageIcon,
	Images,
	Layers,
	Library as LibraryIcon,
	Pause,
	Play,
	RefreshCw,
	RotateCcw,
	Save,
	Settings2,
	SlidersHorizontal,
	Square,
	Terminal,
	Trash2,
	Upload,
	X,
} from "lucide-react"
import { Badge, Button, Card, Hint, Input, Label, Select, Textarea, Toggle } from "./components/primitives"
import {
	activeTab,
	clearLogs,
	control,
	onLogsChanged,
	onRunEvent,
	ping,
	readLogs,
	readSettings,
	retryItem,
	startRun,
	writeSettings,
} from "./lib/bridge"
// The engine modules stay plain ESM and are reused as-is by the build.
import {
	ASPECT_RATIOS,
	DEFAULTS,
	MODES,
	clearCaches,
	clearLibrary,
	exportConfig,
	getLibrary,
	importConfig,
	resetSettings,
} from "../src/core/storage.js"
import { buildJobs, parseAny, parseFile, parseVariables } from "../src/core/prompts.js"

type Settings = Record<string, any>
type Tone = "neutral" | "accent" | "amber" | "rose"
type Item = { index: number; text: string; status: string; tone: Tone }
type Img = { name: string; dataUrl: string; size: number }
type Row = { text: string; image?: string; aspectRatio?: string; mode?: string; outputsPerPrompt?: number }
type PlatformOption = {
	key: string
	label: string
	hint?: string
	values: Array<{ value: string; label: string }>
}
type Platform = { id: string; label: string; modes: string[]; options: PlatformOption[] }

const REPO = "https://github.com/Sandeepgaddam5432/autobatch-extension"
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

// modes that cannot produce anything without at least one input image
const IMAGE_MODES = ["f2v", "ing2v", "i2i", "i2v"]

const MODE_ICON: Record<string, typeof Film> = {
	t2v: Film,
	f2v: ImageIcon,
	i2v: ImageIcon,
	ing2v: Layers,
	t2i: Images,
	i2i: ImageIcon,
}

const PLATFORMS = [
	{ id: "meta", label: "Meta AI", url: "https://www.meta.ai/" },
	{ id: "flow", label: "Google Flow", url: "https://labs.google/fx/tools/flow" },
	{ id: "grok", label: "Grok", url: "https://grok.com/" },
	{ id: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
	{ id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
	{ id: "qwen", label: "Qwen", url: "https://chat.qwen.ai/" },
]

const TABS = [
	{ id: "control", label: "Control", icon: SlidersHorizontal },
	{ id: "setting", label: "Setting", icon: Settings2 },
	{ id: "logs", label: "Logs", icon: Terminal },
	{ id: "library", label: "Library", icon: LibraryIcon },
] as const

const readAsDataUrl = (file: File) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(file)
	})

const prettyBytes = (bytes: number) =>
	bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`

export function App() {
	const [settings, setSettings] = useState<Settings>(DEFAULTS)
	const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("control")
	const [tabId, setTabId] = useState<number | null>(null)
	const [platform, setPlatform] = useState<Platform | null>(null)
	const [connected, setConnected] = useState<boolean | null>(null)
	const [items, setItems] = useState<Item[]>([])
	const [running, setRunning] = useState(false)
	const [paused, setPaused] = useState(false)
	const [logs, setLogs] = useState<Array<{ at: number; level: string; line: string }>>([])
	const [autoScroll, setAutoScroll] = useState(true)
	const [queueOpen, setQueueOpen] = useState(true)
	const [images, setImages] = useState<Img[]>([])
	const [source, setSource] = useState<"text" | "txt" | "table">("text")
	const [fileRows, setFileRows] = useState<Row[]>([])
	const [fileName, setFileName] = useState("")
	const [notice, setNotice] = useState("")
	const [library, setLibrary] = useState<any[]>([])

	const logRef = useRef<HTMLPreElement>(null)
	const promptFileRef = useRef<HTMLInputElement>(null)
	const tableFileRef = useRef<HTMLInputElement>(null)
	const imageFileRef = useRef<HTMLInputElement>(null)
	const configFileRef = useRef<HTMLInputElement>(null)

	const version = useMemo(() => {
		try {
			return chrome.runtime.getManifest().version
		} catch {
			return ""
		}
	}, [])

	const patch = useCallback((next: Settings) => {
		setSettings((current) => ({ ...current, ...next }))
		writeSettings(next)
	}, [])

	const flash = useCallback((message: string) => {
		setNotice(message)
		window.setTimeout(() => setNotice(""), 4000)
	}, [])

	/* ---------------- boot + detection ---------------- */

	const detect = useCallback(async () => {
		const current = await activeTab()
		if (!current?.id) return
		setTabId(current.id)
		const reply = (await ping(current.id)) as any
		if (reply?.ok) {
			setConnected(true)
			setPlatform({
				id: String(reply.adapter),
				label: String(reply.label),
				modes: reply.modes || [],
				options: reply.options || [],
			})
			setRunning(!!reply.running)
		} else {
			setConnected(false)
			setPlatform(null)
		}
	}, [])

	useEffect(() => {
		readSettings<Settings>().then((stored) => setSettings({ ...DEFAULTS, ...stored }))
		readLogs().then(setLogs)
		getLibrary().then((entries: any[]) => setLibrary(entries || []))
		detect()
		const id = setInterval(detect, 4000)
		return () => clearInterval(id)
	}, [detect])

	useEffect(() => onLogsChanged(() => readLogs().then(setLogs)), [])

	useEffect(() => {
		if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
	}, [logs, autoScroll])

	/* ---------------- run events ---------------- */

	useEffect(
		() =>
			onRunEvent(({ event, payload }) => {
				const setStatus = (status: string, tone: Tone) =>
					setItems((current) =>
						current.map((item) => (item.index === payload.index ? { ...item, status, tone } : item)),
					)

				if (event === "item:submitting") setStatus("submitting", "amber")
				if (event === "item:generating") setStatus("generating", "amber")
				if (event === "item:generated") setStatus(`${payload.count ?? 0} results`, "amber")
				if (event === "item:downloaded") setStatus(`saved ${payload.count ?? 0}`, "accent")
				if (event === "item:done") {
					setStatus("done", "accent")
					getLibrary().then((entries: any[]) => setLibrary(entries || []))
				}
				if (event === "item:retry") setStatus(`retry ${payload.attempt ?? ""}`, "amber")
				if (event === "item:failed") setStatus(payload.error || "failed", "rose")
				if (event === "run:error") {
					setItems((current) =>
						current.map((item) => ({ ...item, status: payload.error || "run error", tone: "rose" })),
					)
				}
				// say out loud which page dropdowns could not be set
				if (event === "run:options") {
					if (payload.missed?.length) flash(`Page did not offer → ${payload.missed.join(", ")}`)
					else if (payload.applied?.length) flash(`Set on page → ${payload.applied.join(", ")}`)
				}
				if (event === "run:warning") flash(String(payload.warning || ""))
				if (event === "run:blocked") flash(`Waiting: ${payload.reason}`)
				if (event === "run:paused") setPaused(true)
				if (event === "run:resumed") setPaused(false)
				if (event === "run:finished" || event === "run:stopped" || event === "run:aborted") {
					setRunning(false)
					setPaused(false)
					getLibrary().then((entries: any[]) => setLibrary(entries || []))
				}
			}),
		[flash],
	)

	/* ---------------- derived ---------------- */

	const rows = useMemo<Row[]>(
		() => (source === "text" ? (parseAny(settings.lastPrompts || "") as Row[]) : fileRows),
		[source, settings.lastPrompts, fileRows],
	)

	const modes = useMemo(
		() => (MODES as any[]).filter((mode) => !platform || platform.modes.includes(mode.value)),
		[platform],
	)

	const needsImages = IMAGE_MODES.includes(settings.mode)
	const done = items.filter((item) => item.tone === "accent").length
	const failed = items.filter((item) => item.tone === "rose").length
	const active = items.filter((item) => item.tone === "amber").length
	const progress = items.length ? Math.round(((done + failed) / items.length) * 100) : 0

	const chosenOptions: Record<string, string> = useMemo(
		() => (settings.platformOptions || {})[platform?.id || ""] || {},
		[settings.platformOptions, platform],
	)

	const patchOption = (key: string, value: string) => {
		if (!platform) return
		patch({
			platformOptions: {
				...(settings.platformOptions || {}),
				[platform.id]: { ...chosenOptions, [key]: value },
			},
		})
	}

	const variableError = useMemo(() => {
		try {
			parseVariables(settings.variablesJson || "")
			return ""
		} catch (err) {
			return String((err as Error).message || err)
		}
	}, [settings.variablesJson])

	// Every reason a run could not possibly succeed, surfaced before the click.
	const blocker = useMemo(() => {
		if (!connected) return "Open a supported generator page first."
		if (!rows.length) return "Add at least one prompt."
		if (needsImages && !images.length) return "This mode needs at least one input image."
		if (variableError) return `Variables JSON is invalid: ${variableError}`
		return ""
	}, [connected, rows.length, needsImages, images.length, variableError])

	/* ---------------- actions ---------------- */

	const addImages = async (files: FileList | null) => {
		if (!files?.length) return
		const accepted: Img[] = []
		const rejected: string[] = []
		for (const file of Array.from(files)) {
			if (!/^image\//.test(file.type)) {
				rejected.push(`${file.name} (not an image)`)
				continue
			}
			if (file.size > MAX_IMAGE_BYTES) {
				rejected.push(`${file.name} (over 10 MB)`)
				continue
			}
			accepted.push({ name: file.name, dataUrl: await readAsDataUrl(file), size: file.size })
		}
		if (accepted.length) setImages((current) => [...current, ...accepted])
		if (rejected.length) flash(`Skipped ${rejected.join(", ")}`)
	}

	const loadPromptFile = async (file: File | undefined, kind: "txt" | "table") => {
		if (!file) return
		try {
			const parsed = (await parseFile(file)) as Row[]
			if (!parsed.length) {
				flash("No prompts found in that file.")
				return
			}
			setFileRows(parsed)
			setFileName(file.name)
			setSource(kind)
			flash(`Loaded ${parsed.length} prompts from ${file.name}`)
		} catch (err) {
			flash(`Could not read that file: ${String((err as Error).message || err)}`)
		}
	}

	const run = async () => {
		if (!tabId || blocker) return

		let variables: Record<string, string[]> = {}
		try {
			variables = parseVariables(settings.variablesJson || "") as Record<string, string[]>
		} catch {
			return
		}

		const jobs = buildJobs({
			rows,
			variables,
			prefix: settings.prefix,
			suffix: settings.suffix,
			repeatCount: Number(settings.repeatCount) || 1,
			dedupe: settings.dedupe,
			shuffle: settings.shuffle,
			// data URLs survive extension messaging; the adapter rebuilds real Files
			images,
			mode: settings.mode,
			imageMatchMode: settings.imageMatchMode,
			maxInputImages: Number(settings.maxInputImages) || 1,
			frameOption: settings.frameOption,
			autoAddCharacterImages: !!settings.autoAddCharacterImages,
		}) as Array<{ index: number; text: string }>

		if (!jobs.length) return
		setItems(jobs.map((job) => ({ index: job.index, text: job.text, status: "queued", tone: "neutral" as Tone })))
		setRunning(true)
		setQueueOpen(true)

		await startRun(tabId, jobs, {
			...settings,
			platform: platform?.id,
			// the engine works in milliseconds; the UI collects seconds
			delayMinMs: (Number(settings.delayMinSec) || 0) * 1000,
			delayMaxMs: (Number(settings.delayMaxSec) || 0) * 1000,
			timeoutMs: Number(settings.timeoutMs) || 300000,
		})
	}

	const logText = logs.length
		? logs.map((entry) => `[${new Date(entry.at).toLocaleTimeString()}] ${entry.level} ${entry.line}`).join("\n")
		: "No logs yet. Start a run to see activity here."

	const downloadConfig = async () => {
		const payload = JSON.stringify(await exportConfig(), null, 2)
		const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }))
		const link = document.createElement("a")
		link.href = url
		link.download = `unq-settings-${version || "export"}.json`
		link.click()
		URL.revokeObjectURL(url)
		flash("Settings exported.")
	}

	const uploadConfig = async (file: File | undefined) => {
		if (!file) return
		try {
			await importConfig(JSON.parse(await file.text()))
			const stored = await readSettings<Settings>()
			setSettings({ ...DEFAULTS, ...stored })
			flash("Settings imported.")
		} catch (err) {
			flash(`Import failed: ${String((err as Error).message || err)}`)
		}
	}

	/* ---------------- control tab ---------------- */

	const platformOptionsCard = platform?.options?.length ? (
		<Card>
			<div className="mb-1 flex items-center justify-between">
				<span className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3">
					{platform.label.toUpperCase()} CONTROLS
				</span>
				<Badge tone="accent">{platform.options.length}</Badge>
			</div>
			{platform.options.map((option) => (
				<div key={option.key} className="mt-3">
					<Label>{option.label}</Label>
					<Select
						value={chosenOptions[option.key] || "auto"}
						onChange={(value) => patchOption(option.key, value)}
						options={[
							{ value: "auto", label: "Leave as the page has it" },
							...option.values.map((choice) => ({ value: choice.value, label: choice.label })),
						]}
					/>
					{option.hint ? <Hint>{option.hint}</Hint> : null}
				</div>
			))}
			<Hint>
				Set once when a run starts. Anything this page does not offer is named in a message instead of being
				silently skipped.
			</Hint>
		</Card>
	) : null

	const dropzone = (
		<Card>
			<Label>Input images</Label>
			<button
				onClick={() => imageFileRef.current?.click()}
				onDragOver={(event) => event.preventDefault()}
				onDrop={(event) => {
					event.preventDefault()
					addImages(event.dataTransfer.files)
				}}
				className="flex w-full flex-col items-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-hairline-strong bg-canvas px-3 py-5 text-center transition hover:border-accent/50"
			>
				<Upload size={16} className="text-ink-3" />
				<span className="text-[11.5px] font-semibold text-ink-2">Click to upload or drop images</span>
				<span className="text-[10.5px] text-ink-3">PNG, JPG, GIF up to 10 MB each</span>
			</button>
			<input
				ref={imageFileRef}
				type="file"
				accept="image/png,image/jpeg,image/gif,image/webp"
				multiple
				hidden
				onChange={(event) => {
					addImages(event.target.files)
					event.target.value = ""
				}}
			/>

			{images.length ? (
				<>
					<div className="mt-2.5 grid grid-cols-4 gap-1.5">
						{images.map((image, index) => (
							<div
								key={`${image.name}-${index}`}
								className="group relative aspect-square overflow-hidden rounded-lg border border-hairline"
								title={`${image.name} · ${prettyBytes(image.size)}`}
							>
								<img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
								<button
									onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
									className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-canvas/85 text-ink-2 hover:text-rose"
								>
									<X size={9} />
								</button>
							</div>
						))}
					</div>
					<div className="mt-2 flex items-center justify-between">
						<Badge tone="accent">{images.length} images</Badge>
						<Button variant="ghost" onClick={() => setImages([])}>
							<Trash2 size={12} /> Remove all
						</Button>
					</div>
				</>
			) : null}

			{settings.mode === "f2v" || settings.mode === "i2v" ? (
				<div className="mt-3">
					<Label>Image processing option</Label>
					<Select
						value={settings.frameOption}
						onChange={(value) => patch({ frameOption: value })}
						options={[
							{ value: "startOnly", label: "Start frame only for each prompt" },
							{ value: "startAndEnd", label: "Start and end frame per prompt" },
						]}
					/>
				</div>
			) : null}

			{settings.mode === "ing2v" || settings.mode === "i2i" ? (
				<div className="mt-3 grid grid-cols-2 gap-2.5">
					<div>
						<Label>Max input images</Label>
						<Select
							value={settings.maxInputImages}
							onChange={(value) => patch({ maxInputImages: Number(value) })}
							options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n} image${n > 1 ? "s" : ""}` }))}
						/>
					</div>
					<div>
						<Label>Pairing</Label>
						<Select
							value={settings.imageMatchMode}
							onChange={(value) => patch({ imageMatchMode: value })}
							options={[
								{ value: "oneToOne", label: "One image per prompt" },
								{ value: "oneImageAllPrompts", label: "First image for all" },
								{ value: "allImagesEachPrompt", label: "All images each prompt" },
							]}
						/>
					</div>
				</div>
			) : null}

			<div className="mt-3">
				<Toggle
					title="Auto-add character images"
					description="Attach images whose filename appears in the prompt text."
					checked={!!settings.autoAddCharacterImages}
					onChange={(value) => patch({ autoAddCharacterImages: value })}
				/>
			</div>
		</Card>
	)

	const controlTab = (
		<div className="animate-enter space-y-2.5">
			<div className="grid grid-cols-2 gap-2">
				{modes.map((mode) => {
					const Icon = MODE_ICON[mode.value] || Film
					const isActive = settings.mode === mode.value
					return (
						<button
							key={mode.value}
							onClick={() => patch({ mode: mode.value })}
							className={`sheen flex items-center gap-2.5 rounded-[var(--radius-card)] border p-3 text-left text-[11.5px] font-semibold transition ${
								isActive
									? "border-accent/40 bg-accent/10 text-ink"
									: "border-hairline bg-surface text-ink-2 hover:border-hairline-strong hover:text-ink"
							}`}
						>
							<span
								className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
									isActive ? "bg-accent text-accent-ink" : "bg-elevated text-ink-3"
								}`}
							>
								<Icon size={14} strokeWidth={2.2} />
							</span>
							{mode.label}
						</button>
					)
				})}
			</div>

			{platformOptionsCard}
			{needsImages ? dropzone : null}

			<div className="grid grid-cols-2 gap-2.5">
				<Card>
					<Label>Concurrent prompts</Label>
					<Select
						value={settings.concurrency}
						onChange={(value) => patch({ concurrency: Number(value) })}
						options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n} prompt${n > 1 ? "s" : ""}` }))}
					/>
					<Hint>Processed simultaneously.</Hint>
				</Card>
				<Card>
					<Label>Random delay (s)</Label>
					<div className="flex items-center gap-1.5">
						<Input
							type="number"
							value={settings.delayMinSec}
							onChange={(event) => patch({ delayMinSec: Number(event.target.value) })}
						/>
						<span className="text-ink-3">–</span>
						<Input
							type="number"
							value={settings.delayMaxSec}
							onChange={(event) => patch({ delayMaxSec: Number(event.target.value) })}
						/>
					</div>
					<Hint>Wait before the next prompt.</Hint>
				</Card>
			</div>

			<Card>
				<div className="mb-2.5 flex gap-1 rounded-[10px] border border-hairline bg-surface-2 p-1">
					{[
						{ id: "text" as const, label: "Prompts", icon: FileText },
						{ id: "txt" as const, label: ".txt", icon: FileText },
						{ id: "table" as const, label: ".xlsx / .csv", icon: FileSpreadsheet },
					].map(({ id, label, icon: Icon }) => (
						<button
							key={id}
							onClick={() => {
								if (id === "text") setSource("text")
								else if (id === "txt") promptFileRef.current?.click()
								else tableFileRef.current?.click()
							}}
							className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition ${
								source === id ? "bg-elevated text-ink" : "text-ink-3 hover:text-ink-2"
							}`}
						>
							<Icon size={12} strokeWidth={2.2} />
							{label}
						</button>
					))}
				</div>

				<input
					ref={promptFileRef}
					type="file"
					accept=".txt,text/plain"
					hidden
					onChange={(event) => {
						loadPromptFile(event.target.files?.[0], "txt")
						event.target.value = ""
					}}
				/>
				<input
					ref={tableFileRef}
					type="file"
					accept=".csv,.tsv,.xlsx"
					hidden
					onChange={(event) => {
						loadPromptFile(event.target.files?.[0], "table")
						event.target.value = ""
					}}
				/>

				{source === "text" ? (
					<>
						<Textarea
							rows={8}
							value={settings.lastPrompts || ""}
							onChange={(event) => patch({ lastPrompts: event.target.value })}
							placeholder={"First prompt.\nIt can span multiple lines.\n\nSecond prompt after a blank line."}
						/>
						<Hint>Separate prompts with a blank line.</Hint>
					</>
				) : (
					<div className="rounded-[var(--radius-control)] border border-hairline bg-canvas p-3">
						<div className="flex items-center justify-between">
							<span className="truncate text-[11.5px] font-semibold text-ink">{fileName}</span>
							<Badge tone="accent">{fileRows.length} rows</Badge>
						</div>
						<div className="mt-2 max-h-[150px] overflow-auto">
							{fileRows.slice(0, 40).map((row, index) => (
								<div key={index} className="truncate border-t border-hairline py-1 text-[10.5px] text-ink-3">
									{index + 1}. {row.text}
								</div>
							))}
						</div>
						<Hint>Columns prompt, image, ratio, mode and outputs are read when present.</Hint>
					</div>
				)}

				<div className="mt-2 flex items-center justify-between">
					<Badge tone={rows.length ? "accent" : "neutral"}>{rows.length} prompts</Badge>
					<Button
						variant="ghost"
						onClick={() => {
							setFileRows([])
							setFileName("")
							setSource("text")
							patch({ lastPrompts: "" })
						}}
					>
						<Trash2 size={12} /> Clear
					</Button>
				</div>
			</Card>

			<div className="grid grid-cols-2 gap-2.5">
				<Card>
					<Label>Outputs per prompt</Label>
					<Select
						value={settings.outputsPerPrompt}
						onChange={(value) => patch({ outputsPerPrompt: Number(value) })}
						options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
					/>
				</Card>
				<Card>
					<Label>Save to folder</Label>
					<Input value={settings.folder} onChange={(event) => patch({ folder: event.target.value })} />
				</Card>
			</div>

			<Card>
				<Toggle
					title="Auto change file name"
					description="Renames downloads using the template in Settings."
					checked={!!settings.autoRenameFiles}
					onChange={(value) => patch({ autoRenameFiles: value })}
				/>
			</Card>

			<Card>
				<button onClick={() => setQueueOpen((open) => !open)} className="flex w-full items-center justify-between">
					<span className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.09em] text-ink-3">
						<ChevronDown size={12} className={`transition-transform ${queueOpen ? "" : "-rotate-90"}`} />
						PROMPT QUEUE
					</span>
					<Badge tone={active ? "amber" : "neutral"}>{active} active</Badge>
				</button>

				{queueOpen ? (
					<>
						<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated">
							<div
								className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-accent-2 to-accent transition-[width] duration-500"
								style={{ width: `${progress}%` }}
							>
								{running ? (
									<span className="animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent" />
								) : null}
							</div>
						</div>

						<p className="tnum mt-2 text-[11px] text-ink-2">
							{items.length ? `${done} done · ${failed} failed · ${items.length} total` : "Nothing queued yet."}
						</p>

						<div className="mt-1 max-h-[280px] overflow-auto">
							{items.map((item) => (
								<div key={item.index} className="flex items-center gap-2 border-t border-hairline py-2 text-[11px]">
									<span className="tnum w-5 shrink-0 text-ink-3">{item.index + 1}</span>
									<span className="min-w-0 flex-1 truncate text-ink-2">{item.text}</span>
									<Badge tone={item.tone}>{item.status}</Badge>
									{item.tone === "rose" && tabId ? (
										<button
											onClick={() => retryItem(tabId, item.index)}
											className="shrink-0 rounded-md border border-hairline px-1.5 py-0.5 text-[10px] text-ink-3 hover:border-accent/40 hover:text-accent"
										>
											<RefreshCw size={10} />
										</button>
									) : null}
								</div>
							))}
						</div>
					</>
				) : null}
			</Card>
		</div>
	)

	/* ---------------- setting tab ---------------- */

	const settingTab = (
		<div className="animate-enter space-y-2.5">
			<Card>
				<Label>Default mode</Label>
				<Select
					value={settings.defaultMode}
					onChange={(value) => patch({ defaultMode: value })}
					options={(MODES as any[]).map((mode) => ({ value: mode.value, label: mode.label }))}
				/>
				<div className="mt-3" />
				<Label>Default aspect ratio</Label>
				<Select
					value={settings.aspectRatio}
					onChange={(value) => patch({ aspectRatio: value })}
					options={(ASPECT_RATIOS as any[]).map((ratio) => ({ value: ratio.value, label: ratio.label }))}
				/>
				<div className="mt-3" />
				<Label>Video duration</Label>
				<Select
					value={settings.videoOption}
					onChange={(value) => patch({ videoOption: value })}
					options={[
						{ value: "5s", label: "5 seconds" },
						{ value: "5s-concat", label: "5s, 5s concat" },
					]}
				/>
				<div className="mt-3" />
				<Label>Image input mode</Label>
				<Select
					value={settings.imageModeOption}
					onChange={(value) => patch({ imageModeOption: value })}
					options={[
						{ value: "new", label: "New image" },
						{ value: "last", label: "Last image" },
					]}
				/>
				<Hint>Platform-specific choices such as the Veo model live in the Control tab.</Hint>
			</Card>

			<Card>
				<Label>Prompt text tools</Label>
				<Input
					value={settings.prefix}
					placeholder="Prefix added before every prompt"
					onChange={(event) => patch({ prefix: event.target.value })}
				/>
				<div className="mt-1.5">
					<Input
						value={settings.suffix}
						placeholder="Suffix added after every prompt"
						onChange={(event) => patch({ suffix: event.target.value })}
					/>
				</div>
				<div className="mt-3" />
				<Label>Variables (JSON)</Label>
				<Textarea
					rows={3}
					value={settings.variablesJson}
					placeholder={'{"city": ["Paris", "Tokyo"]}'}
					onChange={(event) => patch({ variablesJson: event.target.value })}
				/>
				{variableError ? (
					<p className="mt-2 text-[10.5px] text-rose">{variableError}</p>
				) : (
					<Hint>Write {"{{city}}"} in a prompt to expand it into one job per value.</Hint>
				)}
				<div className="mt-3 grid grid-cols-2 gap-2.5">
					<div>
						<Label>Repeat each prompt</Label>
						<Input
							type="number"
							value={settings.repeatCount}
							onChange={(event) => patch({ repeatCount: Number(event.target.value) })}
						/>
					</div>
					<div>
						<Label>Start numbering at</Label>
						<Input
							type="number"
							value={settings.startIndex}
							onChange={(event) => patch({ startIndex: Number(event.target.value) })}
						/>
					</div>
				</div>
				<div className="mt-3">
					<Toggle
						title="Shuffle prompt order"
						checked={!!settings.shuffle}
						onChange={(value) => patch({ shuffle: value })}
					/>
					<Toggle
						title="Skip duplicate prompts"
						checked={!!settings.dedupe}
						onChange={(value) => patch({ dedupe: value })}
					/>
				</div>
			</Card>

			<Card>
				<Label>Max retries on failure</Label>
				<Input
					type="number"
					value={settings.maxRetries}
					onChange={(event) => patch({ maxRetries: Number(event.target.value) })}
				/>
				<div className="mt-3" />
				<Label>Stop after consecutive failures</Label>
				<Input
					type="number"
					value={settings.stopOnConsecutiveFailures}
					onChange={(event) => patch({ stopOnConsecutiveFailures: Number(event.target.value) })}
				/>
				<div className="mt-3" />
				<Label>Per-item timeout (seconds)</Label>
				<Input
					type="number"
					value={Math.round((Number(settings.timeoutMs) || 300000) / 1000)}
					onChange={(event) => patch({ timeoutMs: Number(event.target.value) * 1000 })}
				/>
			</Card>

			<Card>
				<Label>Video download quality</Label>
				<Select
					value={settings.downloadQualityVideo}
					onChange={(value) => patch({ downloadQualityVideo: value })}
					options={[
						{ value: "none", label: "No download" },
						{ value: "720p", label: "720p" },
						{ value: "1080p", label: "1080p (paid plan may be required)" },
						{ value: "4k", label: "4K (paid plan may be required)" },
					]}
				/>
				<div className="mt-3" />
				<Label>Image download quality</Label>
				<Select
					value={settings.downloadQualityImage}
					onChange={(value) => patch({ downloadQualityImage: value })}
					options={[
						{ value: "none", label: "No download" },
						{ value: "1k", label: "1k" },
						{ value: "4k", label: "4k (paid plan may be required)" },
					]}
				/>
				<div className="mt-3" />
				<Label>Filename template</Label>
				<Input
					value={settings.filenameTemplate}
					onChange={(event) => patch({ filenameTemplate: event.target.value })}
				/>
				<Hint>Tokens: {"{n} {index} {slot} {slug} {date} {time} {mode} {ratio} {platform} {ext}"}</Hint>
				<div className="mt-3">
					<Toggle
						title="Auto download results"
						checked={!!settings.autoDownload}
						onChange={(value) => patch({ autoDownload: value })}
					/>
					<Toggle
						title="Folder per run"
						checked={!!settings.folderPerRun}
						onChange={(value) => patch({ folderPerRun: value })}
					/>
					<Toggle
						title="Folder per date"
						checked={!!settings.folderPerDate}
						onChange={(value) => patch({ folderPerDate: value })}
					/>
					<Toggle
						title="Skip files that already exist"
						checked={!!settings.skipDuplicates}
						onChange={(value) => patch({ skipDuplicates: value })}
					/>
				</div>
			</Card>

			<Card>
				<Toggle
					title="Only run inside a time window"
					checked={!!settings.scheduleEnabled}
					onChange={(value) => patch({ scheduleEnabled: value })}
				/>
				{settings.scheduleEnabled ? (
					<div className="mt-3 grid grid-cols-2 gap-2.5">
						<div>
							<Label>From</Label>
							<Input
								type="time"
								value={settings.windowStart}
								onChange={(event) => patch({ windowStart: event.target.value })}
							/>
						</div>
						<div>
							<Label>To</Label>
							<Input
								type="time"
								value={settings.windowEnd}
								onChange={(event) => patch({ windowEnd: event.target.value })}
							/>
						</div>
					</div>
				) : null}
				<div className="mt-3" />
				<Label>Daily limit (0 = unlimited)</Label>
				<Input
					type="number"
					value={settings.dailyLimit}
					onChange={(event) => patch({ dailyLimit: Number(event.target.value) })}
				/>
			</Card>

			<Card>
				<Toggle
					title="Keep running in background tabs"
					description="Uses a heartbeat so throttled tabs keep working."
					checked={!!settings.keepAwake}
					onChange={(value) => patch({ keepAwake: value })}
				/>
				<Toggle
					title="Auto-detect page elements"
					description="Finds the composer and send button when a site changes its markup."
					checked={!!settings.autoDetectSelectors}
					onChange={(value) => patch({ autoDetectSelectors: value })}
				/>
				<Toggle
					title="Notify when finished"
					checked={!!settings.notifyOnFinish}
					onChange={(value) => patch({ notifyOnFinish: value })}
				/>
				<div className="mt-3" />
				<Label>Selector config URL (optional)</Label>
				<Input
					value={settings.selectorConfigUrl}
					placeholder="https://example.com/selectors.json"
					onChange={(event) => patch({ selectorConfigUrl: event.target.value })}
				/>
				<Hint>Lets selectors be fixed without shipping a new build.</Hint>
			</Card>

			<Card>
				<div className="flex flex-wrap gap-1.5">
					<Button onClick={downloadConfig}>
						<Download size={12} /> Export
					</Button>
					<Button onClick={() => configFileRef.current?.click()}>
						<Upload size={12} /> Import
					</Button>
					<Button
						onClick={async () => {
							await resetSettings()
							const stored = await readSettings<Settings>()
							setSettings({ ...DEFAULTS, ...stored })
							flash("Defaults restored.")
						}}
					>
						<RotateCcw size={12} /> Reset defaults
					</Button>
					<Button variant="primary" className="ml-auto" onClick={() => flash("Settings saved.")}>
						<Save size={12} /> Saved
					</Button>
				</div>
				<input
					ref={configFileRef}
					type="file"
					accept=".json,application/json"
					hidden
					onChange={(event) => {
						uploadConfig(event.target.files?.[0])
						event.target.value = ""
					}}
				/>
				<Hint>Changes save as you type and sync across tabs, so nothing is lost if you close the panel.</Hint>
			</Card>
		</div>
	)

	/* ---------------- logs + library ---------------- */

	const logsTab = (
		<div className="animate-enter">
			<Card>
				<div className="mb-2.5 flex items-center justify-between">
					<Badge>{logs.length} entries</Badge>
					<div className="flex gap-1.5">
						<Button
							onClick={() => {
								if (tabId) ping(tabId, true).then((reply) => flash(JSON.stringify(reply?.probe || {})))
							}}
						>
							Probe
						</Button>
						<Button onClick={() => navigator.clipboard.writeText(logText)}>
							<Copy size={12} /> Copy
						</Button>
						<Button onClick={() => clearLogs().then(() => setLogs([]))}>
							<Trash2 size={12} />
						</Button>
					</div>
				</div>
				<Toggle title="Auto-scroll" checked={autoScroll} onChange={setAutoScroll} />
				<pre
					ref={logRef}
					className="m-0 mt-2.5 max-h-[420px] overflow-auto rounded-[var(--radius-control)] border border-hairline bg-canvas p-2.5 text-[10.5px] leading-[1.7] whitespace-pre-wrap break-words text-ink-2"
					style={{ fontFamily: "var(--font-mono)" }}
				>
					{logText}
				</pre>
			</Card>
		</div>
	)

	const libraryTab = (
		<div className="animate-enter">
			<Card>
				<div className="mb-2.5 flex items-center justify-between">
					<Badge>{library.length} saved</Badge>
					<Button
						onClick={async () => {
							await clearLibrary()
							setLibrary([])
							flash("Library cleared.")
						}}
					>
						<Trash2 size={12} /> Clear
					</Button>
				</div>
				{library.length ? (
					<div className="max-h-[460px] overflow-auto">
						{library.map((entry, index) => (
							<div key={entry.id || index} className="border-t border-hairline py-2 first:border-t-0">
								<div className="flex items-center justify-between gap-2">
									<span className="truncate text-[11.5px] text-ink">{entry.filename || entry.prompt}</span>
									<span className="tnum shrink-0 text-[10px] text-ink-3">
										{new Date(entry.ts || entry.at || Date.now()).toLocaleTimeString()}
									</span>
								</div>
								<div className="mt-0.5 flex items-center gap-1.5">
									<Badge>{entry.platform || "—"}</Badge>
									<Badge>{entry.mode || "—"}</Badge>
									{entry.url ? (
										<a
											href={entry.url}
											target="_blank"
											rel="noreferrer"
											className="text-[10.5px] text-accent hover:underline"
										>
											open
										</a>
									) : null}
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="m-0 text-[11.5px] text-ink-3">Nothing saved yet. Finished downloads are recorded here.</p>
				)}
			</Card>
		</div>
	)

	/* ---------------- shell ---------------- */

	return (
		<div className="relative min-h-full pb-[74px]">
			<div className="pointer-events-none fixed left-1/2 top-0 h-56 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" />

			<div className="relative px-3.5">
				<header className="sticky top-0 z-10 bg-canvas/85 pb-2.5 pt-4 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<span className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-b from-accent to-accent-2 text-[11px] font-black text-accent-ink">
							U
						</span>
						<h1 className="m-0 text-[14.5px] font-bold tracking-[-0.02em]">UnQ Automation</h1>
						{version ? <Badge tone="accent">v{version}</Badge> : null}
						<a
							href={REPO}
							target="_blank"
							rel="noreferrer"
							title="Guide"
							className="ml-auto text-ink-3 transition hover:text-ink"
						>
							<ExternalLink size={13} />
						</a>
					</div>
					<p className="m-0 mt-1 text-[10.5px] text-ink-3">Batch prompt automation for AI image and video pages.</p>

					<div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] text-ink-3">
						<span className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-breathe bg-accent" : "bg-ink-3"}`} />
						{platform ? (
							<span>
								Connected to <span className="font-semibold text-ink">{platform.label}</span>
							</span>
						) : (
							<span>No generator page detected</span>
						)}
					</div>

					<nav className="mt-3 flex gap-1 rounded-[11px] border border-hairline bg-surface p-1">
						{TABS.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								onClick={() => setTab(id)}
								className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition ${
									tab === id ? "bg-elevated text-ink" : "text-ink-3 hover:text-ink-2"
								}`}
							>
								<Icon size={13} strokeWidth={2.2} />
								{label}
							</button>
						))}
					</nav>
				</header>

				<main className="pt-1">
					{tab === "control"
						? controlTab
						: tab === "setting"
							? settingTab
							: tab === "logs"
								? logsTab
								: libraryTab}
				</main>
			</div>

			{notice ? (
				<div className="animate-enter fixed bottom-[78px] left-1/2 z-30 max-w-[300px] -translate-x-1/2 rounded-xl border border-hairline bg-elevated px-3 py-1.5 text-center text-[10.5px] leading-relaxed text-ink-2 shadow-xl">
					{notice}
				</div>
			) : null}

			<footer className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-canvas/80 px-3.5 py-2.5 backdrop-blur-xl">
				{blocker && !running ? (
					<p className="m-0 mb-1.5 flex items-center gap-1.5 text-[10.5px] text-amber">
						<AlertTriangle size={11} /> {blocker}
					</p>
				) : null}
				<div className="flex items-center gap-1.5">
					<a
						href={`${REPO}/issues/new`}
						target="_blank"
						rel="noreferrer"
						title="Report a bug"
						className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] border border-hairline bg-surface-2 text-ink-3 transition hover:text-ink"
					>
						<Bug size={13} />
					</a>
					<Button
						onClick={async () => {
							await clearCaches()
							setLibrary([])
							flash("Cache cleared.")
						}}
					>
						<Eraser size={12} /> Cache
					</Button>

					{running ? (
						<>
							<Button onClick={() => tabId && control(tabId, paused ? "RESUME" : "PAUSE")}>
								{paused ? <Play size={12} /> : <Pause size={12} />}
								{paused ? "Resume" : "Pause"}
							</Button>
							<Button variant="danger" onClick={() => tabId && control(tabId, "STOP")}>
								<Square size={12} /> Stop
							</Button>
						</>
					) : null}

					<Button variant="primary" className="ml-auto min-w-[104px]" disabled={running || !!blocker} onClick={run}>
						<Play size={13} /> {running ? "Running…" : `Run ${rows.length || ""}`}
					</Button>
				</div>
			</footer>

			{connected === false ? (
				<div className="animate-enter fixed inset-0 z-30 grid place-items-center bg-canvas/75 p-5 backdrop-blur-md">
					<div className="sheen w-full max-w-[320px] rounded-2xl border border-hairline bg-surface p-5 text-center shadow-2xl">
						<div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full border border-amber/30 bg-amber/10 text-amber">
							<AlertTriangle size={18} />
						</div>
						<h2 className="m-0 text-[14px] font-bold">No generator page</h2>
						<p className="mx-auto mb-4 mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
							Open a supported platform, or reload the tab if it was open before the extension loaded.
						</p>
						<div className="grid gap-1.5">
							{PLATFORMS.slice(0, 2).map((item) => (
								<Button
									key={item.id}
									variant={item.id === "meta" ? "primary" : "ghost"}
									onClick={() => chrome.tabs.update({ url: item.url })}
								>
									<ExternalLink size={12} /> {item.label}
								</Button>
							))}
						</div>
						<div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
							{PLATFORMS.slice(2).map((item) => (
								<button
									key={item.id}
									onClick={() => chrome.tabs.update({ url: item.url })}
									className="rounded-full border border-hairline px-2.5 py-1 text-[10.5px] text-ink-3 transition hover:border-hairline-strong hover:text-ink"
								>
									{item.label}
								</button>
							))}
						</div>
						<button
							onClick={() => tabId && chrome.tabs.reload(tabId)}
							className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
						>
							<RefreshCw size={11} /> Reload current tab
						</button>
					</div>
				</div>
			) : null}
		</div>
	)
}
