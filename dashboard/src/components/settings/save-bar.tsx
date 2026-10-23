"use client";

import type { ReactNode } from "react";
import { Callout } from "../callout";
import { primaryButton, secondaryButton } from "../ui";

export interface SaveBarProps {
  /** Unsaved changes; the bar shows "N unsaved changes". 0 means nothing to save. */
  count: number;
  onSave: () => void;
  onDiscard: () => void;
  /** A save is in flight: both buttons are off and Save reads "Saving…". */
  saving?: boolean;
  /** Something else is in flight (a key test): both buttons are off. */
  busy?: boolean;
  /** Why the last save did not happen, shown above the buttons. Keeps the bar up. */
  problem?: ReactNode;
  /** Added after the count: "3 unsaved changes on your-team/web". */
  context?: string;
  /** Save button text. Default "Save changes". */
  saveLabel?: string;
  /**
   * Keep a quiet bar in place when nothing is unsaved (it then says
   * `idleText`). By default the bar only appears while there are changes.
   */
  persistent?: boolean;
  /** What a persistent (or problem-only) bar says with nothing unsaved. Default "All changes saved". */
  idleText?: string;
  testId?: string;
}

/**
 * The one way to save a settings form: a bar stuck to the bottom of the
 * screen while there are unsaved changes, with their count, Discard and Save.
 * Pair it with `useDirtyForm`, which also asks before leaving the page.
 */
export function SaveBar({
  count,
  onSave,
  onDiscard,
  saving = false,
  busy = false,
  problem,
  context,
  saveLabel = "Save changes",
  persistent = false,
  idleText = "All changes saved",
  testId = "save-bar",
}: SaveBarProps) {
  const dirty = count > 0;
  const raised = dirty || !!problem;
  if (!raised && !persistent) return null;
  return (
    <div
      role="region"
      aria-label="Save changes"
      data-testid={testId}
      className={`mt-8 rounded-lg border px-4 py-3 ${
        raised ? "sticky bottom-4 z-10 border-zinc-600 bg-zinc-900/95 shadow-xl backdrop-blur" : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      {problem && (
        <div className="mb-3">
          <Callout variant="error" title="Not saved">
            <p>{problem}</p>
          </Callout>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className={`text-sm ${dirty ? "text-amber-300" : "text-zinc-500"}`}>
          {dirty ? `${count} unsaved change${count === 1 ? "" : "s"}${context ? ` on ${context}` : ""}` : idleText}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onDiscard} disabled={saving || busy || !raised} className={secondaryButton}>
            Discard
          </button>
          <button type="button" onClick={onSave} disabled={saving || busy || !dirty} className={primaryButton}>
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
