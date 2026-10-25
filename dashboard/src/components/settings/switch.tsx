"use client";

import { focusRing } from "../ui";

/**
 * The one on/off switch. It has no visible text of its own: point
 * `labelledBy` at the visible label (a `SettingsRow` hands you `labelId` and
 * `helpId`), or give it a spoken `label` when the words beside it are not a
 * label element.
 */
export function Switch({
  id,
  checked,
  onChange,
  labelledBy,
  label,
  describedBy,
  disabled,
  testId,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy?: string;
  /** Spoken name when there is no label element to point at. */
  label?: string;
  describedBy?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-describedby={describedBy}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${checked ? "bg-emerald-600" : "bg-zinc-700"} ${focusRing}`}
    >
      <span aria-hidden="true" className={`absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}
