import type { LivePr, MergeChecklistLine, Review } from "@/lib/api";

// What the reviewer is doing with each PR, in short words. The backend sends one
// status per PR (`/api/reviewer/live`); the reviews list adds the verdicts. A
// backend without the live endpoint still gets a working list: every PR then
// reads as reviewed.

export type Group = "active" | "waiting" | "done";

export interface StatusLook {
  label: string;
  dot: string;
  text: string;
  /** Still moving: the dot pulses and the page keeps refreshing. */
  live?: boolean;
}

const LOOKS: Record<string, StatusLook> = {
  reviewing: { label: "Reviewing", dot: "bg-sky-400", text: "text-sky-300", live: true },
  queued: { label: "Queued", dot: "bg-sky-400/60", text: "text-sky-300", live: true },
  retrying: { label: "Retrying", dot: "bg-amber-400", text: "text-amber-300", live: true },
  waiting_ci: { label: "Waiting for CI", dot: "bg-cyan-400", text: "text-cyan-300", live: true },
  waiting_people: { label: "Waiting for approval", dot: "bg-amber-400", text: "text-amber-300" },
  ci_failing: { label: "CI failing", dot: "bg-red-400", text: "text-red-300" },
  merge_blocked: { label: "Merge blocked", dot: "bg-red-400", text: "text-red-300" },
  paused: { label: "Auto-merge paused", dot: "bg-zinc-400", text: "text-zinc-300" },
  failed: { label: "Review failed", dot: "bg-red-400", text: "text-red-300" },
  stalled: { label: "Review stalled", dot: "bg-red-400", text: "text-red-300" },
  merged: { label: "Merged", dot: "bg-violet-400", text: "text-violet-300" },
  closed: { label: "Closed", dot: "bg-zinc-500", text: "text-zinc-400" },
  new_commits: { label: "New commits", dot: "bg-zinc-400", text: "text-zinc-300" },
  skipped: { label: "No review needed", dot: "bg-zinc-600", text: "text-zinc-400" },
  reviewed: { label: "Reviewed", dot: "bg-zinc-600", text: "text-zinc-400" },
};

export function statusLook(status: string): StatusLook {
  return LOOKS[status] ?? { label: sentence(status || "reviewed"), dot: "bg-zinc-600", text: "text-zinc-400" };
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
  if (/^Waiting for CoderHelm'?s review/i.test(t)) return "waiting for CoderHelm's review";
  if (/^Waiting for the PR to leave draft/i.test(t)) return "still a draft";
  if (/^CoderHelm approved/i.test(t)) return "";
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
