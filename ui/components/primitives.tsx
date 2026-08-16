import type { ReactNode } from "react"

// Small, unopinionated primitives. Everything visual lives here so screens read
// as structure, not as a wall of utility classes.

export function Card({
	children,
	className = "",
}: {
	children: ReactNode
	className?: string
}) {
	return (
		<div
			className={`sheen rounded-[var(--radius-card)] border border-hairline bg-surface p-3.5 ${className}`}
		>
			{children}
		</div>
	)
}

export function Label({ children }: { children: ReactNode }) {
	return (
		<div className="mb-2 text-[11px] font-semibold tracking-[0.01em] text-ink-2">{children}</div>
	)
}

export function Hint({ children }: { children: ReactNode }) {
	return <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">{children}</p>
}

export function Button({
	children,
	onClick,
	variant = "ghost",
	disabled,
	className = "",
}: {
	children: ReactNode
	onClick?: () => void
	variant?: "primary" | "ghost" | "danger"
	disabled?: boolean
	className?: string
}) {
	const base =
		"inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-[11.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45"
	const styles = {
		// accent is a small, bright surface — never a full-width neon slab
		primary:
			"bg-gradient-to-b from-accent to-accent-2 text-accent-ink shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_6px_18px_-8px_rgba(62,232,168,0.6)] hover:brightness-110 active:brightness-95",
		ghost:
			"border border-hairline bg-surface-2 text-ink-2 hover:border-hairline-strong hover:text-ink",
		danger: "border border-rose/40 text-rose hover:bg-rose/10",
	}[variant]
	return (
		<button className={`${base} ${styles} ${className}`} onClick={onClick} disabled={disabled}>
			{children}
		</button>
	)
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			{...props}
			className={`w-full rounded-[var(--radius-control)] border border-hairline bg-canvas px-2.5 py-2 text-[12.5px] text-ink placeholder:text-ink-3 transition hover:border-hairline-strong ${props.className || ""}`}
		/>
	)
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return (
		<textarea
			{...props}
			className={`w-full resize-y rounded-[var(--radius-control)] border border-hairline bg-canvas px-2.5 py-2 text-[12.5px] leading-relaxed text-ink placeholder:text-ink-3 transition hover:border-hairline-strong ${props.className || ""}`}
		/>
	)
}

export function Select({
	value,
	onChange,
	options,
}: {
	value: string | number
	onChange: (value: string) => void
	options: Array<{ value: string | number; label: string }>
}) {
	return (
		<div className="relative">
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="w-full appearance-none rounded-[var(--radius-control)] border border-hairline bg-canvas px-2.5 py-2 pr-8 text-[12.5px] text-ink transition hover:border-hairline-strong"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			<svg
				viewBox="0 0 12 12"
				className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-3"
			>
				<path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
			</svg>
		</div>
	)
}

export function Toggle({
	checked,
	onChange,
	title,
	description,
}: {
	checked: boolean
	onChange: (value: boolean) => void
	title: string
	description?: string
}) {
	return (
		<div className="flex items-center justify-between gap-3 border-t border-hairline py-2.5 first:border-t-0 first:pt-0">
			<div className="min-w-0">
				<div className="text-[12px] font-medium text-ink">{title}</div>
				{description ? <Hint>{description}</Hint> : null}
			</div>
			<button
				role="switch"
				aria-checked={checked}
				onClick={() => onChange(!checked)}
				className={`relative h-[21px] w-[38px] shrink-0 rounded-full transition ${
					checked ? "bg-accent" : "bg-elevated"
				}`}
			>
				<span
					className={`absolute top-[2px] left-[2px] h-[17px] w-[17px] rounded-full bg-white shadow transition-transform duration-200 ${
						checked ? "translate-x-[17px]" : ""
					}`}
				/>
			</button>
		</div>
	)
}

export function Badge({
	children,
	tone = "neutral",
}: {
	children: ReactNode
	tone?: "neutral" | "accent" | "amber" | "rose"
}) {
	const tones = {
		neutral: "border-hairline bg-surface-2 text-ink-3",
		accent: "border-accent/30 bg-accent/10 text-accent",
		amber: "border-amber/30 bg-amber/10 text-amber",
		rose: "border-rose/30 bg-rose/10 text-rose",
	}[tone]
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.04em] ${tones}`}
		>
			{children}
		</span>
	)
}
