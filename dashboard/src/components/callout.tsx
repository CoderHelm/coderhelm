import type { ReactNode } from "react";
import { AlertCircleIcon, CheckIcon, InfoIcon, WarningIcon } from "./icons";

type Variant = "neutral" | "info" | "success" | "warning" | "error";

// The tint goes on the border, the background wash, the icon and the title;
// the body is always zinc-200 so a long paragraph stays easy to read.
const STYLES: Record<Variant, { box: string; icon: string; label: string }> = {
  neutral: { box: "border-zinc-800 bg-zinc-900/50", icon: "text-zinc-400", label: "Note" },
  info: { box: "border-blue-500/25 bg-blue-500/5", icon: "text-blue-300", label: "Note" },
  success: { box: "border-emerald-500/30 bg-emerald-500/5", icon: "text-emerald-400", label: "Success" },
  warning: { box: "border-amber-500/30 bg-amber-500/5", icon: "text-amber-400", label: "Warning" },
  error: { box: "border-red-500/30 bg-red-500/5", icon: "text-red-400", label: "Problem" },
};

const ICONS: Record<Variant, ReactNode> = {
  neutral: <InfoIcon />,
  info: <InfoIcon />,
  success: <CheckIcon />,
  warning: <WarningIcon />,
  error: <AlertCircleIcon />,
};

/**
 * A message box. Meaning is carried by an icon, a spoken label and the text,
 * never by color alone. Errors and warnings interrupt (`alert`); the rest are
 * announced politely (`status`). `actions` puts buttons under the text.
 */
export function Callout({
  variant = "neutral",
  title,
  children,
  actions,
  live = true,
  testId,
}: {
  variant?: Variant;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Set false for static explanatory boxes that should not be announced. */
  live?: boolean;
  testId?: string;
}) {
  const style = STYLES[variant];
  const role = !live ? undefined : variant === "error" ? "alert" : "status";
  return (
    <div role={role} data-testid={testId} className={`flex min-w-0 gap-3 rounded-lg border px-4 py-3 text-sm text-zinc-200 ${style.box}`}>
      <span className={`mt-0.5 shrink-0 ${style.icon}`} aria-hidden="true">
        {ICONS[variant]}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <span className="sr-only">{style.label}: </span>
        {title && <p className="font-semibold text-zinc-50">{title}</p>}
        {children}
        {actions && <div className="flex flex-wrap items-center gap-2 pt-2">{actions}</div>}
      </div>
    </div>
  );
}
