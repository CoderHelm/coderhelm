import type { ReactNode } from "react";
import { AlertCircleIcon, CheckIcon, InfoIcon, WarningIcon } from "./icons";

type Variant = "info" | "success" | "warning" | "error";

const STYLES: Record<Variant, { box: string; icon: string; label: string }> = {
  info: { box: "border-zinc-800 bg-zinc-900/50 text-zinc-300", icon: "text-zinc-400", label: "Note" },
  success: { box: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200", icon: "text-emerald-400", label: "Success" },
  warning: { box: "border-amber-500/30 bg-amber-500/10 text-amber-200", icon: "text-amber-400", label: "Warning" },
  error: { box: "border-red-500/30 bg-red-500/10 text-red-200", icon: "text-red-400", label: "Problem" },
};

const ICONS: Record<Variant, ReactNode> = {
  info: <InfoIcon />,
  success: <CheckIcon />,
  warning: <WarningIcon />,
  error: <AlertCircleIcon />,
};

/**
 * A message box. Meaning is carried by an icon, a spoken label and the text,
 * never by color alone. Errors and warnings interrupt (`alert`); the rest are
 * announced politely (`status`).
 */
export function Callout({
  variant = "info",
  title,
  children,
  live = true,
}: {
  variant?: Variant;
  title?: ReactNode;
  children?: ReactNode;
  /** Set false for static explanatory boxes that should not be announced. */
  live?: boolean;
}) {
  const style = STYLES[variant];
  const role = !live ? undefined : variant === "error" ? "alert" : "status";
  return (
    <div role={role} className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${style.box}`}>
      <span className={`mt-0.5 shrink-0 ${style.icon}`} aria-hidden="true">
        {ICONS[variant]}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <span className="sr-only">{style.label}: </span>
        {title && <p className="font-semibold text-zinc-100">{title}</p>}
        {children}
      </div>
    </div>
  );
}
