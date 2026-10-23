// The one status vocabulary for every list: a handful of tones (the colour
// and whether it pulses) and the group words the toolbar toggles use. Pages
// map their own status codes onto these, so "waiting" is the same amber and
// "Done" the same word on Runs, Reviewer, Plans and the rest.

/** What a status means to the person reading the list. */
export type Tone =
  | "live" // working right now (pulses)
  | "queued" // about to start (pulses, dimmer)
  | "waiting" // blocked on CI, a person or time
  | "attention" // needs someone to act outside the app
  | "success" // finished well
  | "merged" // landed
  | "danger" // failed, blocked
  | "neutral" // finished, nothing to say
  | "muted"; // left out, archived, skipped

export interface ToneLook {
  /** Small round dot. */
  dot: string;
  /** Text colour for the status word or a summary line. */
  text: string;
  /** Border + background + text for a chip. */
  chip: string;
  /** The dot pulses while the thing is moving. */
  pulse?: boolean;
}

export const TONES: Record<Tone, ToneLook> = {
  live: { dot: "bg-sky-400", text: "text-sky-300", chip: "border-sky-500/30 bg-sky-500/10 text-sky-300", pulse: true },
  queued: { dot: "bg-sky-400/60", text: "text-sky-300", chip: "border-sky-500/20 bg-sky-500/5 text-sky-300", pulse: true },
  waiting: { dot: "bg-amber-400", text: "text-amber-300", chip: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  attention: { dot: "bg-orange-400", text: "text-orange-300", chip: "border-orange-500/30 bg-orange-500/10 text-orange-300" },
  success: { dot: "bg-emerald-400", text: "text-emerald-300", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  merged: { dot: "bg-violet-400", text: "text-violet-300", chip: "border-violet-500/30 bg-violet-500/10 text-violet-300" },
  danger: { dot: "bg-red-400", text: "text-red-300", chip: "border-red-500/30 bg-red-500/10 text-red-300" },
  neutral: { dot: "bg-zinc-400", text: "text-zinc-300", chip: "border-zinc-700 bg-zinc-800/60 text-zinc-300" },
  muted: { dot: "bg-zinc-600", text: "text-zinc-400", chip: "border-zinc-800 bg-transparent text-zinc-400" },
};

/** A status as a list shows it: its words, its tone, and whether it is still moving. */
export interface StatusLook {
  label: string;
  tone: Tone;
  /** Still moving: the dot pulses (and a page may keep refreshing). */
  live?: boolean;
}

/** The group words every status toggle uses, in this order. */
export type StatusGroup = "active" | "waiting" | "attention" | "done" | "failed" | "closed" | "off";

export const GROUP_LABEL: Record<StatusGroup | "all", string> = {
  all: "All",
  active: "Active",
  waiting: "Waiting",
  attention: "Needs attention",
  done: "Done",
  failed: "Failed",
  closed: "Closed",
  off: "Off",
};

/** The tone a group's header dot uses. */
export const GROUP_TONE: Record<StatusGroup, Tone> = {
  active: "live",
  waiting: "waiting",
  attention: "attention",
  done: "success",
  failed: "danger",
  closed: "muted",
  off: "muted",
};

/** "needs_input" → "Needs input": unknown codes still read as words. */
export function statusWords(code: string | null | undefined): string {
  if (!code) return "Unknown";
  const words = code.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusDot({ tone, live, className = "" }: { tone: Tone; live?: boolean; className?: string }) {
  const look = TONES[tone];
  const pulse = live ?? look.pulse;
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${look.dot} ${pulse ? "animate-pulse motion-reduce:animate-none" : ""} ${className}`}
    />
  );
}

/** Dot and word, no box: the status line inside a row. */
export function StatusText({ look }: { look: StatusLook }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${TONES[look.tone].text}`}>
      <StatusDot tone={look.tone} live={look.live} className="!h-1.5 !w-1.5" />
      {look.label}
    </span>
  );
}

/** A short word in a box: verdicts, steps, "Ask me first". */
export function Chip({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${TONES[tone].chip}`}
    >
      {children}
    </span>
  );
}
