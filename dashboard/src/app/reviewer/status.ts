import type { LivePr, MergeChecklistLine, Review } from "@/lib/api";
import type { StatusLook } from "@/components/list/status";

// What the reviewer is doing with each PR, in short words. The backend sends one
// status per PR (`/api/reviewer/live`); the reviews list adds the verdicts. A
// backend without the live endpoint still gets a working list: every PR then
// reads as reviewed.

export type Group = "active" | "waiting" | "done";

// Colours are the shared list tones (components/list/status), so "waiting" is
// the same amber here as on Runs.
const LOOKS: Record<string, StatusLook> = {
  reviewing: { label: "Reviewing", tone: "live", live: true },
  queued: { label: "Queued", tone: "queued", live: true },
  retrying: { label: "Retrying", tone: "waiting", live: true },
  waiting_ci: { label: "Waiting for CI", tone: "waiting", live: true },
  waiting_people: { label: "Waiting for approval", tone: "waiting" },
  ci_failing: { label: "CI failing", tone: "danger" },
  merge_blocked: { label: "Merge blocked", tone: "danger" },
  paused: { label: "Auto-merge paused", tone: "neutral" },
  stopped: { label: "Auto-merge stopped", tone: "neutral" },
  failed: { label: "Review failed", tone: "danger" },
  stalled: { label: "Review stalled", tone: "danger" },
  merged: { label: "Merged", tone: "merged" },
  closed: { label: "Closed", tone: "muted" },
  new_commits: { label: "New commits", tone: "neutral" },
  skipped: { label: "No review needed", tone: "muted" },
  reviewed: { label: "Reviewed", tone: "muted" },
};

export function statusLook(status: string): StatusLook {
  return LOOKS[status] ?? { label: sentence(status || "reviewed"), tone: "muted" };
}

function sentence(code: string): string {
  const words = code.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One checklist line in a few words ("CI running: build, e2e" → "CI running"). */
function shortLine(line: MergeChecklistLine): string {
  const t = line.text.trim();
  if (/^CI green/i.test(t)) return "CI passing";
  if (/^CI running/i.test(t)) return "CI running";
  if (/^CI failing/i.test(t)) return t.replace(/^CI failing/i, "CI failing");
  if (/^Waiting for a person'?s approval/i.test(t)) return "waiting for 1 approval";
  if (/^Waiting for Coderhelm'?s review/i.test(t)) return "waiting for Coderhelm's review";
  if (/^Waiting for the PR to leave draft/i.test(t)) return "still a draft";
  if (/^Coderhelm approved/i.test(t)) return "";
  if (/^Approved by/i.test(t)) return "";
  if (/^Deploy label/i.test(t)) return "";
  if (/^Adding /i.test(t)) return "adding deploy labels";
  return t;
}

/** "Auto-merge armed · waiting for 1 approval · CI passing". */
function gateSummary(pr: LivePr): string {
  const lines = pr.gate?.checklist ?? [];
  // What it waits on first, then CI when it passes.
  const open = lines.filter((l) => l.mark !== "done").map(shortLine);
  const ci = lines.filter((l) => l.mark === "done").map(shortLine).filter((t) => t === "CI passing");
  const parts = [...open, ...ci].filter(Boolean);
  return ["Auto-merge armed", ...parts].join(" · ");
}

/** Who stopped auto-merge, as the team knows them. */
export function stopperName(st: { by: string; is_login?: boolean }): string {
  return st.is_login ? `@${st.by}` : st.by || "a team member";
}

/** Gate states a person can stop (the gate may still merge on its own). */
const STOPPABLE = new Set(["waiting_approval", "waiting_ci", "blocked_ci", "declined", "paused", "head_moved"]);

/** What a person can do with a PR's auto-merge now: stop it, re-arm it, or nothing. */
export function gateAction(state: string | undefined): "stop" | "rearm" | null {
  if (state === "stopped") return "rearm";
  return state && STOPPABLE.has(state) ? "stop" : null;
}

/** The dashboard page that stops or re-arms one PR's auto-merge (no secret: it asks before acting). */
export function gateHref(repo: string, pr: number, action?: "stop" | "rearm"): string {
  const q = new URLSearchParams({ repo, pr: String(pr) });
  if (action) q.set("do", action);
  return `/reviewer/pr?${q}`;
}

/** The PR's state in short words; empty when the verdict says it all. */
export function summaryLine(pr: LivePr | undefined): string {
  if (!pr) return "";
  const status = pr.status ?? "reviewed";
  const review = pr.review ?? {};
  const attempt = review.attempt ?? 0;
  switch (status) {
    case "reviewing":
      return review.kind === "question"
        ? "Answering a comment on the PR…"
        : `Reading the diff and writing the review…${attempt > 0 ? ` (try ${attempt + 1})` : ""}`;
    case "queued":
      return review.trigger === "synchronize"
        ? "Waits a minute in case more commits land"
        : "Starts in a moment";
    case "retrying":
      return "The review hit a service error · it runs again on its own";
    case "failed":
      return "The review did not finish after several tries · review it again";
    case "stalled":
      return "The review stopped without finishing · review it again";
    case "waiting_ci":
    case "waiting_people":
    case "ci_failing":
      return gateSummary(pr);
    case "merge_blocked":
      return `GitHub refused the merge${pr.gate?.detail ? ` · ${pr.gate.detail}` : ""}`;
    case "paused":
      return "Auto-merge paused · picks up on the next CI run or review";
    case "stopped": {
      const st = pr.gate?.stopped;
      return st ? `Auto-merge stopped by ${stopperName(st)} · waits for someone to re-arm it` : "Auto-merge stopped · waits for someone to re-arm it";
    }
    case "merged":
      return "Merged by auto-merge";
    case "closed":
      return "Closed without merging";
    case "new_commits":
      return "New commits since the last review";
    case "skipped":
      return review.reason || "The new commits change no code or data since the approval";
    default:
      return "";
  }
}

export interface PrRow {
  key: string;
  repo: string;
  pr_number: number;
  title: string;
  status: string;
  group: Group;
  /** Newest-first. Empty for a PR whose first review is still on its way. */
  reviews: Review[];
  live?: LivePr;
  /** Newest activity (ISO), for ordering and the relative time. */
  at: string;
}

function asGroup(g: string | undefined): Group {
  return g === "active" || g === "waiting" ? g : "done";
}

/**
 * One row per PR: the reviews (newest first, as the API pages them) joined
 * with the live status. A finished PR the review pages haven't reached yet is
 * left out, so "Load more" still means older; PRs in flight or waiting always
 * show.
 */
export function buildRows(reviews: Review[], live: LivePr[]): PrRow[] {
  const rows = new Map<string, PrRow>();
  for (const r of reviews) {
    const key = `${r.repo}#${r.pr_number}`;
    const row = rows.get(key);
    if (row) row.reviews.push(r);
    else rows.set(key, { key, repo: r.repo, pr_number: r.pr_number, title: "", status: "reviewed", group: "done", reviews: [r], at: r.created_at });
  }
  for (const pr of live) {
    const key = `${pr.repo}#${pr.pr_number}`;
    const group = asGroup(pr.group);
    let row = rows.get(key);
    if (!row) {
      if (group === "done") continue;
      row = { key, repo: pr.repo, pr_number: pr.pr_number, title: "", status: "reviewed", group: "done", reviews: [], at: "" };
      rows.set(key, row);
    }
    row.live = pr;
    row.title = pr.pr_title || "";
    row.status = pr.status || "reviewed";
    row.group = group;
    if (pr.updated_at && (!row.at || Date.parse(pr.updated_at) > Date.parse(row.at))) row.at = pr.updated_at;
  }
  const rank: Record<Group, number> = { active: 0, waiting: 1, done: 2 };
  return [...rows.values()].sort((a, b) => rank[a.group] - rank[b.group] || Date.parse(b.at || "0") - Date.parse(a.at || "0"));
}
