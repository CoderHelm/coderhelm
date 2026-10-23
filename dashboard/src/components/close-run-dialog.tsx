"use client";

import { useEffect, useId, useState } from "react";
import type { CloseRunRequest } from "@/lib/api";
import { Modal } from "./modal";
import { inputClass, primaryButton, secondaryButton } from "./ui";

// The one dialog for closing runs, from the run page or for a selection on the
// runs list: why (a preset and an optional note), and whether to also close the
// pull request on GitHub. The pull request stays open unless that box is ticked.

export const CLOSE_REASONS = ["Not needed", "Duplicate", "Done by hand", "Wrong ticket"] as const;

/** The reason as the server keeps it: the preset, then the note. */
export function closeReason(preset: string, note: string): string {
  const n = note.trim().replace(/\s+/g, " ");
  if (preset && n) return `${preset}: ${n}`;
  return preset || n;
}

export function CloseRunDialog({
  open,
  onOpenChange,
  count,
  prNumbers,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many runs close. */
  count: number;
  /** Open pull requests of those runs; the "also close" box shows only when there are some. */
  prNumbers: number[];
  busy: boolean;
  onConfirm: (req: CloseRunRequest) => void;
}) {
  const [preset, setPreset] = useState<string>(CLOSE_REASONS[0]);
  const [note, setNote] = useState("");
  const [closePr, setClosePr] = useState(false);
  const noteId = useId();
  const groupId = useId();

  // Each opening starts fresh: the PR box is never left ticked from before.
  useEffect(() => {
    if (open) {
      setPreset(CLOSE_REASONS[0]);
      setNote("");
      setClosePr(false);
    }
  }, [open]);

  const many = count > 1;
  const prLabel =
    prNumbers.length === 1
      ? many
        ? `Also close pull request #${prNumbers[0]} on GitHub`
        : `Also close PR #${prNumbers[0]} on GitHub`
      : `Also close their ${prNumbers.length} pull requests on GitHub`;

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !busy && onOpenChange(v)}
      title={many ? `Close ${count} runs?` : "Close this run?"}
      description={
        many
          ? "Work on them stops and their tickets are free for a new run. Nothing restarts them by itself; you can reopen each one."
          : "Work on it stops and its ticket is free for a new run. Nothing restarts it by itself; you can reopen it."
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm({ reason: closeReason(preset, note) || undefined, close_pr: prNumbers.length > 0 && closePr });
        }}
        className="space-y-4"
        data-testid="close-run-dialog"
      >
        <fieldset aria-labelledby={groupId}>
          <legend id={groupId} className="mb-2 text-sm font-medium text-zinc-200">
            Why
          </legend>
          <div className="flex flex-wrap gap-2">
            {CLOSE_REASONS.map((r) => (
              <label
                key={r}
                className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-100 ${
                  preset === r ? "border-zinc-400 bg-zinc-800 text-zinc-100" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <input
                  type="radio"
                  name="close-reason"
                  value={r}
                  checked={preset === r}
                  onChange={() => setPreset(r)}
                  className="accent-zinc-100"
                />
                {r}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={noteId} className="mb-1 block text-sm font-medium text-zinc-200">
            Note <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id={noteId}
            type="text"
            value={note}
            maxLength={160}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Duplicate of ABC-12"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">A Jira ticket gets a note saying who closed it and why.</p>
        </div>
        {prNumbers.length > 0 && (
          <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={closePr}
              onChange={(e) => setClosePr(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-zinc-100"
            />
            <span>
              {prLabel}
              <span className="block text-xs text-zinc-500">
                Left open unless ticked. Coderhelm leaves a comment saying who closed it and why.
              </span>
            </span>
          </label>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className={secondaryButton}>
            Keep {many ? "them" : "it"} open
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Closing…" : many ? `Close ${count} runs` : "Close run"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
