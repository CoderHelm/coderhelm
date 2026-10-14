import type { ReactNode } from "react";
import { CheckIcon, WarningIcon, XIcon } from "./icons";

type Tone = "neutral" | "success" | "warning" | "error";

const TONES: Record<Tone, string> = {
  neutral: "border-zinc-700 text-zinc-400",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  error: "border-red-500/30 bg-red-500/10 text-red-400",
};

const ICONS: Record<Tone, ReactNode> = {
  neutral: null,
  success: <CheckIcon />,
  warning: <WarningIcon />,
  error: <XIcon />,
};

/** A short status word in a pill. The icon repeats what the color says. */
export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {ICONS[tone] && <span aria-hidden="true" className="scale-75 -ml-0.5">{ICONS[tone]}</span>}
      {children}
    </span>
  );
}
