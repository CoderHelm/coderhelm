"use client";

import type { NativeUpdate } from "@/lib/api";
import { Callout } from "@/components/callout";

/**
 * A native install updates as a CloudFormation stack update. The updater
 * prepares each release as a change set on the install's stack; this shows
 * what it changes and links to it in the AWS console, where an admin
 * reviews and executes it (or the updater applies it, with auto-update on).
 */
export function NativeUpdateCard({ native }: { native: NativeUpdate }) {
  const p = native.pending;
  if (!p) return null;
  const n = p.counts;
  const total = n.add + n.modify + n.remove;
  const waiting = p.status === "review";
  return (
    <div className="px-4 py-3" data-testid="native-update">
      <Callout variant={waiting ? "warning" : "neutral"} title={waiting ? `${p.version ?? "The update"} is ready for you to review` : p.status === "preparing" ? `Preparing ${p.version ?? "the update"}` : `Updating to ${p.version ?? "the new release"}`}>
        <p data-testid="native-update-summary">
          A stack update to <code className="font-mono">{native.stack}</code>: {total} change{total === 1 ? "" : "s"} ({n.add} to add, {n.modify} to change, {n.remove} to remove)
          {p.parts.length ? <> in {p.parts.join(", ")}</> : null}.
          {p.replacements.length ? <> Replaced: {p.replacements.join(", ")}.</> : <> Nothing is replaced.</>}
        </p>
        {waiting ? (
          <p className="mt-2">
            {native.auto_apply ? "Auto-update applies it in the maintenance window." : "Open it in the AWS console, check the changes, and choose Execute. It runs with your own AWS permissions."}
          </p>
        ) : null}
        {p.reason && p.status !== "review" ? <p className="mt-2 text-zinc-400">{p.reason}</p> : null}
        <p className="mt-2">
          <a href={p.link} target="_blank" rel="noopener noreferrer" className="font-medium underline" data-testid="native-update-link">Open the change set in the AWS console</a>
        </p>
      </Callout>
    </div>
  );
}
