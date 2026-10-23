"use client";

import { focusRing } from "../ui";

/**
 * An on/off switch. It has no text of its own: point `labelledBy` at the
 * visible label (a `SettingsRow` hands you `labelId` and `helpId`).
 */
export function Switch({
  id,
  checked,
  onChange,
  labelledBy,
  describedBy,
  disabled,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${checked ? "bg-emerald-600" : "bg-zinc-700"} ${focusRing}`}
    >
      <span aria-hidden="true" className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}
