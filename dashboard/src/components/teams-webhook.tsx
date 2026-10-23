"use client";

import { focusRing } from "./ui";

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
