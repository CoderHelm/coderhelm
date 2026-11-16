// The one plain line at the top of a run page: what the run's pull request
// waits on now, and whether it is ready for review. The gateway writes it
// (`waiting_line`, from the merge standing, the draft hold and the preview);
// a run from an older gateway gets the same sentence built here from the
// merge standing and the draft hold.

import type { RunChecks, RunDraftHold, RunMergeStanding, RunPreview } from "@/lib/api";

export interface WaitingInput {
  waiting_line?: string | null;
  merge_standing?: RunMergeStanding | null;
  draft_hold?: RunDraftHold | null;
  preview?: RunPreview | null;
  checks?: RunChecks | null;
  pr_number?: number | null;
}

const clean = (s: string) => s.trim().replace(/[.;:\s]+$/, "");
const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Plain words for where the preview stands. */
export function previewWords(stage: string): string {
  switch (stage) {
    case "triggered":
      return "Preview started; waiting for its deploy";
    case "deploying":
      return "Preview deploying and its end-to-end checks running";
    case "ready":
      return "Preview up; its pages are being captured";
    case "checked":
      return "Preview checked: deployed, end-to-end passed, pages captured";
    case "failed":
      return "Preview checks failed; Coderhelm fixes them like any failing check";
    case "blocked":
      return "Preview not run";
    default:
      return "No preview needed for this change";
  }
}

/** What the pull request waits on, from its merge standing. */
function fromStanding(s: RunMergeStanding, pr: string): string {
  switch (s.code) {
    case "needs_person_approval":
      return `Waiting on: an approving review from a person on ${pr} (this repo requires one before Coderhelm merges).`;
    case "auto_merge_off":
      return `Waiting on: a person on your team to merge ${pr} (auto-merge is off for this repo).`;
    case "repo_requires_person_review":
      return `Waiting on: the branch rules on GitHub for ${pr} (they require an approving review from a person, or another rule GitHub enforces).`;
    case "reviewing":
      return `Waiting on: Coderhelm's review of the newest commit on ${pr}.`;
    case "fixing_review":
      return `Waiting on: Coderhelm's fix round for its review's findings on ${pr}.`;
    case "review_changes_requested":
      return `Waiting on: the changes Coderhelm's review asked for on ${pr}.`;
    case "checks_running":
      return `Waiting on: the checks still running on ${pr}.`;
    case "checks_failing":
      return `Waiting on: a fix for the checks failing on ${pr}.`;
    case "conflict":
      return `Waiting on: a fix for ${pr}'s conflict with its base branch.`;
    case "draft":
      return `Waiting on: what keeps ${pr} a draft (its description says why at the top).`;
    case "merging":
      return `Waiting on: nothing; Coderhelm merges ${pr}.`;
    case "merged":
      return `Nothing: ${pr} is merged.`;
    case "closed":
      return `Nothing: ${pr} was closed without merging.`;
    default:
      return s.text ? `Waiting on: ${lower(clean(s.text))}.` : "";
  }
}

/** "Ready for review: checks passed, preview checked." when that is true; empty otherwise. */
function readiness(input: WaitingInput): string {
  const s = input.merge_standing;
  if (!s || !["needs_person_approval", "auto_merge_off", "repo_requires_person_review", "merging"].includes(s.code)) return "";
  const c = input.checks?.counts;
  if (!c || c.failed > 0 || c.running > 0 || c.queued > 0 || c.passed === 0) return "";
  const stage = input.preview?.stage ?? "not_needed";
  if (["triggered", "deploying", "ready", "failed", "blocked"].includes(stage)) return "";
  return stage === "checked" ? "Ready for review: checks passed, preview checked." : "Ready for review: checks passed.";
}

/** The run page's top line, or empty when there is nothing to say. */
export function waitingLine(input: WaitingInput): string {
  const given = input.waiting_line?.trim();
  if (given) return given;
  const pr = input.pr_number ? `#${input.pr_number}` : "the pull request";
  const hold = input.draft_hold;
  if (hold) {
    const first = hold.reasons?.[0]?.what?.trim();
    if (hold.kind === "waiting") return `Waiting on: ${lower(clean(first || hold.summary))} (Coderhelm checks again by itself).`;
    if (first) return `Waiting on: ${lower(clean(first))}, on ${pr}${hold.reasons.length > 1 ? ` (and ${hold.reasons.length - 1} more)` : ""}.`;
    if (hold.summary) return `Waiting on: ${lower(clean(hold.summary))}.`;
  }
  const s = input.merge_standing;
  if (!s) return "";
  const line = fromStanding(s, pr);
  const ready = readiness(input);
  return [line, ready].filter(Boolean).join(" ");
}
