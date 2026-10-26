"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";
import { focusRing, inputClass } from "./ui";
import { Field as SettingsField } from "./settings/field";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * Label + control + helper + inline error, in the one field look (the
 * settings Field). The control is a render prop so the ids that tie the
 * label, helper and error to it are always wired up.
 */
export function Field({
  id,
  label,
  helper,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  children: (props: FieldControlProps) => ReactNode;
}) {
  return (
    <SettingsField as="custom" id={id} label={label} help={helper} error={error}>
      {(ids) => children(ids)}
    </SettingsField>
  );
}

/** Password-style field with a show/hide button. Paste is allowed; nothing is autofilled. */
export function SecretInput({
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? "text" : "password"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        className={`${inputClass} pr-20 font-mono ${className}`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? "Hide the key" : "Show the key"}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 min-h-7 px-2 rounded-md text-xs text-zinc-400 hover:text-zinc-100 ${focusRing}`}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}
