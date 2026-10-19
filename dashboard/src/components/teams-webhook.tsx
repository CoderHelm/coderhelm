"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Field } from "./field";
import { focusRing, inputClass, secondaryButton } from "./ui";

/** Teams webhook hosts the API accepts (Workflows and older incoming webhooks). */
export function validTeamsUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      !u.username &&
      [".powerplatform.com", ".logic.azure.com", ".webhook.office.com"].some((s) => host.endsWith(s))
    );
  } catch {
    return false;
  }
}

type TestState = { state: "idle" } | { state: "sending" } | { state: "sent" } | { state: "failed"; message: string };

/**
 * A Teams webhook address with a "Send test card" button whose result shows
 * next to the field, not in a toast that disappears.
 */
export function TeamsWebhookField({
  id,
  label = "Teams webhook address",
  value,
  onChange,
  disabled,
  helper,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  helper?: React.ReactNode;
}) {
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const ok = validTeamsUrl(value);
  const showError = value.trim() !== "" && !ok;

  const send = async () => {
    setTest({ state: "sending" });
    try {
      const r = await api.testAlertNotify(value.trim());
      setTest(r.ok ? { state: "sent" } : { state: "failed", message: r.error ? `Teams refused it: ${r.error}` : "Teams refused the card." });
    } catch {
      setTest({ state: "failed", message: "That address is not a Teams webhook address." });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Field
        id={id}
        label={label}
        helper={helper}
        error={showError ? "Paste the address Teams Workflows shows (it ends in powerplatform.com, logic.azure.com or webhook.office.com)." : undefined}
      >
        {(props) => (
          <div className="flex flex-col items-start gap-2">
            <input
              {...props}
              value={value}
              disabled={disabled}
              onChange={(e) => {
                onChange(e.target.value);
                setTest({ state: "idle" });
              }}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…powerplatform.com/…/workflows/…"
              className={`${inputClass} min-w-0 font-mono text-xs disabled:opacity-60`}
            />
            <button
              type="button"
              onClick={send}
              disabled={disabled || !ok || test.state === "sending"}
              className={`${secondaryButton} shrink-0`}
            >
              {test.state === "sending" ? "Sending…" : "Send test card"}
            </button>
          </div>
        )}
      </Field>
      <p aria-live="polite" className="text-sm">
        {test.state === "sent" && <span className="text-emerald-400">Test card sent. Check the channel.</span>}
        {test.state === "failed" && <span className="text-red-400">{test.message}</span>}
      </p>
    </div>
  );
}

/** How to get a webhook address from Teams, as a short list. */
export function TeamsHowTo() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-400">
      <li>In the Teams channel, open the channel menu and choose Workflows.</li>
      <li>Pick &ldquo;Send webhook alerts to a channel&rdquo;.</li>
      <li>Name it, choose the team and channel, then copy the address it shows.</li>
      <li>Add a co-owner to the workflow so it keeps working if its creator leaves.</li>
    </ol>
  );
}

/** An on/off switch with a visible state word. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  onLabel = "On",
  offLabel = "Off",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Spoken name, e.g. "Send alerts to Teams". */
  label: string;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:opacity-50 ${
          checked ? "bg-emerald-500" : "bg-zinc-700"
        } ${focusRing}`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${checked ? "translate-x-5" : ""}`}
        />
      </button>
      <span aria-hidden="true" className="text-sm text-zinc-300">
        {checked ? onLabel : offLabel}
      </span>
    </span>
  );
}
