import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	AlertTriangle,
	Copy,
	ExternalLink,
	Film,
	Image as ImageIcon,
	Images,
	Layers,
	Pause,
	Play,
	RefreshCw,
	Settings2,
	SlidersHorizontal,
	Square,
	Terminal,
	Trash2,
	Upload,
	Wand2,
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
import { ASPECT_RATIOS, DEFAULTS, MODES } from "../src/core/storage.js"
import { buildJobs, parseAny } from "../src/core/prompts.js"

type Settings = Record<string, any>
type Item = { index: number; text: string; status: string; tone: "neutral" | "accent" | "amber" | "rose" }

const MODE_ICON: Record<string, typeof Film> = {
	t2v: Film,
	f2v: ImageIcon,
	ing2v: Layers,
	t2i: Wand2,
	i2i: Images,
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
] as const

export function App() {
	const [settings, setSettings] = useState<Settings>(DEFAULTS)
	const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("control")
	const [tabId, setTabId] = useState<number | null>(null)
	const [platform, setPlatform] = useState<{ id: string; label: string; modes: string[] } | null>(null)
	const [connected, setConnected] = useState<boolean | null>(null)
	const [items, setItems] = useState<Item[]>([])
	const [running, setRunning] = useState(false)
	const [paused, setPaused] = useState(false)
	const [logs, setLogs] = useState<Array<{ at: number; level: string; line: string }>>([])
	const logRef = useRef<HTMLPreElement>(null)

	const patch = useCallback((next: Settings) => {
		setSettings((current) => ({ ...current, ...next }))
		writeSettings(next)
	}, [])

	/* ---------------- boot + detection ---------------- */

	const detect = useCallback(async () => {
		const tab = await activeTab()
		if (!tab?.id) return
		setTabId(tab.id)
		const reply = await ping(tab.id)
		if (reply?.ok) {
			setConnected(true)
			setPlatform({ id: reply.adapter!, label: reply.label!, modes: reply.modes || [] })
			setRunning(!!reply.running)
		} else {
			setConnected(false)
			setPlatform(null)
		}
	}, [])

	useEffect(() => {
		readSettings<Settings>().then((stored) => setSettings({ ...DEFAULTS, ...stored }))
		readLogs().then(setLogs)
		detect()
		const id = setInterval(detect, 4000)
		return () => clearInterval(id)
	}, [detect])

	useEffect(() => onLogsChanged(() => readLogs().then(setLogs)), [])

	useEffect(() => {
		if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
	}, [logs])

	/* ---------------- run events ---------------- */

	useEffect(
		() =>
			onRunEvent(({ event, payload }) => {
				const setStatus = (status: string, tone: Item["tone"]) =>
					setItems((current) =>
						current.map((item) =>
							item.index === payload.index ? { ...item, status, tone } : item,
						),
					)

				if (event === "item:submitting") setStatus("submitting", "amber")
				if (event === "item:generating") setStatus("generating", "amber")
				if (event === "item:generated") setStatus(`${payload.count ?? 0} results`, "amber")
				if (event === "item:downloaded") setStatus(`saved ${payload.count ?? 0}`, "accent")
				if (event === "item:done") setStatus("done", "accent")
				if (event === "item:retry") setStatus(`retry ${payload.attempt ?? ""}`, "amber")
				if (event === "item:failed") setStatus(payload.error || "failed", "rose")
				if (event === "run:error") setItems((current) => current.map((item) => ({ ...item, status: payload.error || "run error", tone: "rose" })))
				if (event === "run:paused") setPaused(true)
				if (event === "run:resumed") setPaused(false)
				if (event === "run:finished" || event === "run:stopped" || event === "run:aborted") {
					setRunning(false)
					setPaused(false)
				}
			}),
		[],
	)

	/* ---------------- derived ---------------- */

	const rows = useMemo(() => parseAny(settings.lastPrompts || ""), [settings.lastPrompts])
	const modes = useMemo(
		() => MODES.filter((mode: any) => !platform || platform.modes.includes(mode.id)),
		[platform],
	)
	const done = items.filter((item) => item.tone === "accent").length
	const failed = items.filter((item) => item.tone === "rose").length
	const progress = items.length ? Math.round(((done + failed) / items.length) * 100) : 0

	/* ---------------- actions ---------------- */

	const run = async () => {
		if (!tabId) return
		const jobs = buildJobs({
			rows,
			variables: {},
			prefix: settings.prefix,
			suffix: settings.suffix,
			repeatCount: Number(settings.repeatCount) || 1,
			dedupe: settings.dedupe,
			shuffle: settings.shuffle,
			images: [],
			mode: settings.mode,
			imageMatchMode: settings.imageMatchMode,
			maxInputImages: Number(settings.maxInputImages) || 1,
			frameOption: settings.frameOption,
			autoAddCharacterImages: false,
		}) as Array<{ index: number; text: string }>

		if (!jobs.length) return
		setItems(jobs.map((job) => ({ index: job.index, text: job.text, status: "queued", tone: "neutral" })))
		setRunning(true)

		await startRun(tabId, jobs, {
			...settings,
			platform: platform?.id,
			// the engine works in milliseconds; the UI collects seconds
			delayMinMs: (Number(settings.delayMinSec) || 0) * 1000,
			delayMaxMs: (Number(settings.delayMaxSec) || 0) * 1000,
			timeoutMs: Number(settings.timeoutMs) || 300000,
		})
	}

	/* ---------------- screens ---------------- */

	const controlTab = (
		<div className="animate-enter space-y-2.5">
			<div className="grid grid-cols-2 gap-2">
				{modes.map((mode: any) => {
					const Icon = MODE_ICON[mode.id] || Wand2
					const active = settings.mode === mode.id
					return (
						<button
							key={mode.id}
							onClick={() => patch({ mode: mode.id })}
							className={`sheen flex items-center gap-2.5 rounded-[var(--radius-card)] border p-3 text-left text-[11.5px] font-semibold transition ${
								active
									? "border-accent/40 bg-accent/10 text-ink"
									: "border-hairline bg-surface text-ink-2 hover:border-hairline-strong hover:text-ink"
							}`}
						>
							<span
								className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
									active ? "bg-accent text-accent-ink" : "bg-elevated text-ink-3"
								}`}
							>
								<Icon size={14} strokeWidth={2.2} />
							</span>
							{mode.label}
						</button>
					)
				})}
			</div>

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
				<Label>Prompts</Label>
				<Textarea
					rows={8}
					value={settings.lastPrompts || ""}
					onChange={(event) => patch({ lastPrompts: event.target.value })}
					placeholder={"First prompt.\nIt can span multiple lines.\n\nSecond prompt after a blank line."}
				/>
				<div className="mt-2 flex items-center justify-between">
					<Badge tone={rows.length ? "accent" : "neutral"}>{rows.length} prompts</Badge>
					<Button variant="ghost" onClick={() => patch({ lastPrompts: "" })}>
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
				<div className="flex items-center justify-between">
					<span className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3">PROMPT QUEUE</span>
					<Badge tone={running ? "amber" : "neutral"}>{running ? "running" : "idle"}</Badge>
				</div>

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
						<div
							key={item.index}
							className="flex items-center gap-2 border-t border-hairline py-2 text-[11px]"
						>
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
			</Card>
		</div>
	)

	const settingTab = (
		<div className="animate-enter space-y-2.5">
			<Card>
				<Label>Default aspect ratio</Label>
				<Select
					value={settings.aspectRatio}
					onChange={(value) => patch({ aspectRatio: value })}
					options={ASPECT_RATIOS.map((ratio: any) => ({ value: ratio.id, label: ratio.label }))}
				/>
				<Label>Video duration</Label>
				<Select
					value={settings.videoOption}
					onChange={(value) => patch({ videoOption: value })}
					options={[
						{ value: "5s", label: "5 seconds" },
						{ value: "5s-concat", label: "5s, 5s concat" },
					]}
				/>
			</Card>

			<Card>
				<Label>Max retries on failure</Label>
				<Input
					type="number"
					value={settings.maxRetries}
					onChange={(event) => patch({ maxRetries: Number(event.target.value) })}
				/>
				<Label>Per-item timeout (seconds)</Label>
				<Input
					type="number"
					value={Math.round((Number(settings.timeoutMs) || 300000) / 1000)}
					onChange={(event) => patch({ timeoutMs: Number(event.target.value) * 1000 })}
				/>
			</Card>

			<Card>
				<Label>Download quality</Label>
				<Select
					value={settings.downloadQualityVideo}
					onChange={(value) => patch({ downloadQualityVideo: value })}
					options={[
						{ value: "none", label: "Video: no download" },
						{ value: "720p", label: "Video: 720p" },
						{ value: "1080p", label: "Video: 1080p" },
						{ value: "4k", label: "Video: 4K" },
					]}
				/>
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
						title="Keep running in background tabs"
						description="Uses a heartbeat so throttled tabs keep working."
						checked={!!settings.keepAwake}
						onChange={(value) => patch({ keepAwake: value })}
					/>
					<Toggle
						title="Auto-detect page elements"
						description="Finds the composer and send button when selectors change."
						checked={!!settings.autoDetectSelectors}
						onChange={(value) => patch({ autoDetectSelectors: value })}
					/>
					<Toggle
						title="Notify when finished"
						checked={!!settings.notifyOnFinish}
						onChange={(value) => patch({ notifyOnFinish: value })}
					/>
				</div>
			</Card>
		</div>
	)

	const logsTab = (
		<div className="animate-enter">
			<Card>
				<div className="mb-2.5 flex items-center justify-between">
					<Badge>{logs.length} entries</Badge>
					<div className="flex gap-1.5">
						<Button onClick={() => tabId && ping(tabId, true).then((reply) => console.log(reply?.probe))}>
							Probe
						</Button>
						<Button
							onClick={() =>
								navigator.clipboard.writeText(
									logs.map((entry) => `[${new Date(entry.at).toLocaleTimeString()}] ${entry.level} ${entry.line}`).join("\n"),
								)
							}
						>
							<Copy size={12} /> Copy
						</Button>
						<Button onClick={() => clearLogs().then(() => setLogs([]))}>
							<Trash2 size={12} />
						</Button>
					</div>
				</div>
				<pre
					ref={logRef}
					className="m-0 max-h-[420px] overflow-auto rounded-[var(--radius-control)] border border-hairline bg-canvas p-2.5 text-[10.5px] leading-[1.7] whitespace-pre-wrap break-words text-ink-2"
					style={{ fontFamily: "var(--font-mono)" }}
				>
					{logs.length
						? logs
								.map((entry) => `[${new Date(entry.at).toLocaleTimeString()}] ${entry.level} ${entry.line}`)
								.join("\n")
						: "No logs yet. Start a run to see activity here."}
				</pre>
			</Card>
		</div>
	)

	/* ---------------- shell ---------------- */

	return (
		<div className="relative min-h-full pb-[74px]">
			{/* one soft light source at the top edge, nothing more */}
			<div className="pointer-events-none fixed left-1/2 top-0 h-56 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" />

			<div className="relative px-3.5">
				<header className="sticky top-0 z-10 bg-canvas/85 pb-2.5 pt-4 backdrop-blur-xl">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-b from-accent to-accent-2 text-[11px] font-black text-accent-ink">
								U
							</span>
							<h1 className="m-0 text-[14.5px] font-bold tracking-[-0.02em]">UnQ Automation</h1>
							<Badge tone="accent">v0.5</Badge>
						</div>
					</div>

					<div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] text-ink-3">
						<span
							className={`h-1.5 w-1.5 rounded-full ${
								connected ? "animate-breathe bg-accent" : "bg-ink-3"
							}`}
						/>
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
								className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-semibold transition ${
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
					{tab === "control" ? controlTab : tab === "setting" ? settingTab : logsTab}
				</main>
			</div>

			<footer className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-1.5 border-t border-hairline bg-canvas/80 px-3.5 py-2.5 backdrop-blur-xl">
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
				<Button
					variant="primary"
					className="ml-auto min-w-[108px]"
					disabled={running || !rows.length || !connected}
					onClick={run}
				>
					<Play size={13} /> {running ? "Running…" : `Run ${rows.length || ""}`}
				</Button>
			</footer>

			{/* wrong-page gate */}
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
							<Upload size={11} className="rotate-180" /> Reload current tab
						</button>
					</div>
				</div>
			) : null}
		</div>
	)
}
