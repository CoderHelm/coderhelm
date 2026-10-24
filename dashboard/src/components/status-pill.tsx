import type { ReactNode } from "react";
import { CheckIcon, WarningIcon, XIcon } from "./icons";
import { TONES } from "./list/status";

type Tone = "neutral" | "success" | "warning" | "error";

// The shared list tones (./list/status), so a pill and a list chip of the
// same meaning are the same colour.
const TONE_CLASS: Record<Tone, string> = {
  neutral: TONES.neutral.chip,
  success: TONES.success.chip,
  warning: TONES.waiting.chip,
  error: TONES.danger.chip,
};

const ICONS: Record<Tone, ReactNode> = {
  neutral: null,
  success: <CheckIcon />,
  warning: <WarningIcon />,
  error: <XIcon />,
};

/**
 * A short status word in a pill. The icon repeats what the color says. It
 * never wraps; on a screen too narrow for it, the word is cut with an ellipsis
 * rather than pushing the page sideways. Names and emails go beside it, not in it.
 */
export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}>
      {ICONS[tone] && <span aria-hidden="true" className="scale-75 -ml-0.5 shrink-0">{ICONS[tone]}</span>}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
