"use client";

import type { NativeUpdate } from "@/lib/api";
import { Callout } from "@/components/callout";
import { primaryButton } from "@/components/ui";

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
  const total = n ? n.add + n.modify + n.remove : 0;
  const parts = p.parts ?? [];
  const replacements = p.replacements ?? [];
  const waiting = p.status === "review";
  return (
    <div className="px-4 py-3" data-testid="native-update">
      <Callout variant={waiting ? "warning" : "neutral"} title={waiting ? `${p.version ?? "The update"} is ready for you to review` : p.status === "preparing" ? `Preparing ${p.version ?? "the update"}` : `Updating to ${p.version ?? "the new release"}`}>
        {n ? (
          <p data-testid="native-update-summary">
            A stack update to <code className="font-mono">{native.stack}</code>: {total} change{total === 1 ? "" : "s"} ({n.add} to add, {n.modify} to change, {n.remove} to remove)
            {parts.length ? <> in {parts.join(", ")}</> : null}.
            {replacements.length ? <> Replaced: {replacements.join(", ")}.</> : <> Nothing is replaced.</>}
          </p>
        ) : null}
        {waiting ? (
          <p className="mt-2">
            {native.auto_apply ? "Auto-update applies it in the maintenance window." : "One step left: open it in the AWS console, check the changes, and choose Execute. It runs with your own AWS permissions."}
          </p>
        ) : p.status === "preparing" ? (
          <p className="mt-2">Nothing to do yet. Preparing takes a few minutes; then this says it is ready to apply.</p>
        ) : null}
        {p.reason && p.status !== "review" ? <p className="mt-2 text-zinc-400">{p.reason}</p> : null}
        {p.link ? (
        <p className="mt-3">
          {waiting && !native.auto_apply ? (
            <a href={p.link} target="_blank" rel="noopener noreferrer" className={primaryButton} data-testid="native-update-link">Review and apply in AWS</a>
          ) : (
            <a href={p.link} target="_blank" rel="noopener noreferrer" className="font-medium underline" data-testid="native-update-link">Open the change set in the AWS console</a>
          )}
        </p>
        ) : null}
      </Callout>
    </div>
  );
}
