"use client";

import { useEffect, useId, useState } from "react";
import type { CloseRunRequest } from "@/lib/api";
import { Modal, ModalFooter } from "./modal";
import { Field, Switch } from "./settings";
import { primaryButton, secondaryButton } from "./ui";

// The one dialog for closing runs, from the run page or for a selection on the
// runs list: why (a preset and an optional note), and whether to also close the
// pull request on GitHub. The pull request stays open unless that is turned on.

export const CLOSE_REASONS = ["Not needed", "Duplicate", "Done by hand", "Wrong ticket"] as const;
type CloseReason = (typeof CLOSE_REASONS)[number];

/** What each reason means, in a line, and an example note for it. */
const REASON: Record<CloseReason, { help: string; example: string }> = {
  "Not needed": { help: "No longer wanted.", example: "e.g. Dropped from this release" },
  Duplicate: { help: "Name the other ticket in the note.", example: "e.g. Same as ABC-12" },
  "Done by hand": { help: "Someone did it already.", example: "e.g. Fixed in pull request #212" },
  "Wrong ticket": { help: "Picked up by mistake.", example: "e.g. Meant for the mobile app" },
};

/** The ticket a run came from: where it lives and its key. */
export interface CloseTicket {
  source?: string | null;
  id?: string | null;
}

/** The reason as the server keeps it: the preset, then the note. */
export function closeReason(preset: string, note: string): string {
  const n = note.trim().replace(/\s+/g, " ");
  if (preset && n) return `${preset}: ${n}`;
  return preset || n;
}

/**
 * Where the reason ends up besides the run. Only a Jira ticket gets a comment
 * (the server posts "Closed by X: reason" there); an issue or an alert is left
 * as it is, so say so rather than promise a note nobody will see.
 */
export function noteGoesTo(tickets: CloseTicket[]): string {
  const jira = tickets.filter((t) => t.source === "jira" && t.id);
  const n = tickets.length;
  if (n <= 1) {
    const t = tickets[0];
    if (t?.source === "jira" && t.id) return `Jira ticket ${t.id} gets a comment saying who closed it and why.`;
    if (t?.source === "github") return "Kept with the run. The GitHub issue isn't changed.";
    if (t?.source === "alert") return "Kept with the run. The alert isn't changed.";
    return "Kept with the run.";
  }
  if (jira.length === n) return `Their ${n} Jira tickets each get a comment saying who closed it and why.`;
  if (jira.length === 1) return `Jira ticket ${jira[0].id} gets a comment saying who closed it and why. The others keep it with the run.`;
  if (jira.length > 1) return `Their ${jira.length} Jira tickets each get a comment saying who closed it and why. The others keep it with the run.`;
  return "Kept with each run. Their issues aren't changed.";
}

export function CloseRunDialog({
  open,
  onOpenChange,
  count,
  prNumbers,
  tickets = [],
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many runs close. */
  count: number;
  /** Open pull requests of those runs; the "also close" option shows only when there are some. */
  prNumbers: number[];
  /** The tickets the runs came from, to say where the note goes. */
  tickets?: CloseTicket[];
  busy: boolean;
  onConfirm: (req: CloseRunRequest) => void;
}) {
  const [preset, setPreset] = useState<CloseReason>(CLOSE_REASONS[0]);
  const [note, setNote] = useState("");
  const [closePr, setClosePr] = useState(false);
  const ids = useId();
  const prId = `${ids}-pr`;

  // Each opening starts fresh: the PR option is never left on from before.
  useEffect(() => {
    if (open) {
      setPreset(CLOSE_REASONS[0]);
      setNote("");
      setClosePr(false);
    }
  }, [open]);

  const many = count > 1;
  const hasPrs = prNumbers.length > 0;
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
      testId="close-run-dialog"
      sheet
      wide="md"
      title={many ? `Close ${count} runs?` : "Close this run?"}
      description={
        many
          ? "Work stops and their tickets are free for new runs. You can reopen each one later."
          : "Work stops and the ticket is free for a new run. You can reopen it later."
      }
      // Focus the picked reason, not the dialog's close button: arrows move through the reasons.
      initialFocus="input[name=close-reason]:checked"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm({ reason: closeReason(preset, note) || undefined, close_pr: hasPrs && closePr });
        }}
        id="close-run-form"
        className="space-y-4"
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-200">
            Why
          </legend>
          <div className="space-y-1 rounded-xl border border-zinc-800 bg-zinc-950/40 p-1">
            {CLOSE_REASONS.map((r, i) => {
              const checked = preset === r;
              return (
                <label
                  key={r}
                  data-testid="close-reason"
                  data-checked={checked || undefined}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-colors motion-reduce:transition-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-zinc-400 ${
                    checked ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="close-reason"
                    value={r}
                    checked={checked}
                    onChange={() => setPreset(r)}
                    aria-labelledby={`${ids}-r${i}`}
                    aria-describedby={`${ids}-r${i}-help`}
                    className="mt-0.5 h-4 w-4 shrink-0 appearance-none rounded-full border border-zinc-600 bg-zinc-900 transition-[border] motion-reduce:transition-none checked:border-[5px] checked:border-zinc-100 focus:outline-none"
                  />
                  <span className="min-w-0">
                    <span id={`${ids}-r${i}`} className={`block text-sm font-medium ${checked ? "text-zinc-100" : "text-zinc-200"}`}>
                      {r}
                    </span>
                    <span id={`${ids}-r${i}-help`} className="mt-0.5 block text-sm text-zinc-400">
                      {REASON[r].help}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Field
          label={
            <>
              Note <span className="font-normal text-zinc-400">(optional)</span>
            </>
          }
          help={noteGoesTo(tickets)}
          value={note}
          maxLength={160}
          onChange={(e) => setNote(e.target.value)}
          placeholder={REASON[preset].example}
          autoComplete="off"
        />

        {hasPrs && (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-zinc-800 px-4 py-3">
            <div className="min-w-0">
              <label id={`${prId}-label`} htmlFor={prId} className="block cursor-pointer text-sm font-medium text-zinc-200">
                {prLabel}
              </label>
              <p id={`${prId}-help`} className="mt-0.5 text-sm text-zinc-400">
                {closePr
                  ? "Closed with a comment giving the reason."
                  : `Off: ${prNumbers.length > 1 ? "they stay" : "it stays"} open on GitHub.`}
              </p>
            </div>
            <span className="mt-0.5">
              <Switch id={prId} checked={closePr} onChange={setClosePr} labelledBy={`${prId}-label`} describedBy={`${prId}-help`} disabled={busy} />
            </span>
          </div>
        )}

        <ModalFooter>
          <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className={secondaryButton}>
            Keep {many ? "them" : "it"} open
          </button>
          <button type="submit" form="close-run-form" disabled={busy} className={primaryButton}>
            {busy ? "Closing…" : many ? `Close ${count} runs` : "Close run"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
