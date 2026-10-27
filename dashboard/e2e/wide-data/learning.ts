import type { Handler } from "./index";
import { FILE, iso, REPO, REPO_2, SENTENCE, TITLE, TOKEN } from "./long";

// The Learning page: rewards from outcomes, finding categories, behavior
// changes with their evidence, examples, variants and signal weights. The
// variants and default weights match the platform's (common::rewards).
// `learningFixture` is shared with learning.spec.ts, which passes short names.

export const SIGNALS: [string, string, number][] = [
  ["finding_accepted", "Review comment acted on", 1],
  ["finding_dismissed", "Review comment dismissed or argued", -1],
  ["finding_ignored", "Review comment left open at close", -0.25],
  ["rating_up", "Thumbs up", 1],
  ["rating_down", "Thumbs down", -1],
  ["pr_merged_unchanged", "PR merged as written", 1.5],
  ["pr_merged_edited", "PR merged after people's edits", 1],
  ["pr_closed_unmerged", "PR closed without merging", -1],
  ["pr_reverted", "Merged change reverted", -2],
  ["ci_first_try", "CI passed first try", 0.5],
  ["ci_fix_rounds", "CI needed fix rounds", -0.75],
  ["plan_task_approved", "Plan task approved", 0.5],
  ["plan_task_rejected", "Plan task rejected", -0.75],
  ["time_to_merge", "Time to merge", 0.5],
  ["rereview_requested", "Re-review requested", 0],
  ["incident_linked", "Alert tied to a merged change", -2.5],
];

export interface LearningOpts {
  repo: string;
  repo2: string;
  text: string;
  file: string;
  canManage: boolean;
  empty?: boolean;
  /** Ids of changes currently turned off. */
  reverted?: Set<string>;
  pinned?: string;
  weights?: Record<string, number>;
}

const DAY = 24 * 60;

export function learningFixture(o: LearningOpts) {
  const defaults = Object.fromEntries(SIGNALS.map(([k, , w]) => [k, w]));
  const weights = { ...defaults, ...(o.weights ?? {}) };
  const off = o.reverted ?? new Set<string>();
  const trend = o.empty
    ? []
    : Array.from({ length: 14 }).flatMap((_, i) => {
        const date = iso((13 - i) * DAY).slice(0, 10);
        return [
          { date, agent: "reviewer", repo: o.repo, reward: Math.round((0.1 + i * 0.03) * 100) / 100, events: 6 + (i % 3) },
          { date, agent: "coder", repo: o.repo2, reward: Math.round((-0.2 + i * 0.04) * 100) / 100, events: 2 + (i % 2) },
          { date, agent: "planner", repo: o.repo, reward: 0.4, events: 1 },
        ];
      });
  const change = (id: string, repo: string, kind: string, key: string, from: string, to: string, reason: string) => ({
    id,
    repo,
    kind,
    key,
    from,
    to,
    reason,
    evidence: [
      { kind: "finding_dismissed", at: iso(3 * DAY), pr: 12345, run_id: "", detail: o.text },
      { kind: "finding_dismissed", at: iso(2 * DAY), pr: 12346, run_id: "", detail: `${o.file}:120` },
      { kind: "rating_down", at: iso(DAY), pr: 12347, run_id: "01RUN", detail: "" },
    ],
    at: iso(DAY),
    reverted: off.has(id),
    reverted_by: off.has(id) ? "an-admin" : "",
    reverted_at: off.has(id) ? iso(10) : "",
  });
  return {
    days: 30,
    repo: "",
    min_samples: 8,
    can_manage: o.canManage,
    weights,
    default_weights: defaults,
    signals: SIGNALS.map(([kind, label]) => ({ kind, label, weight: weights[kind], count: o.empty ? 0 : kind.length * 3 })),
    totals: o.empty ? { events: 0, reward: 0 } : { events: 312, reward: 0.31 },
    trend,
    agents: o.empty
      ? []
      : [
          { agent: "reviewer", reward: 0.38, events: 210, positive: 150, negative: 40 },
          { agent: "coder", reward: 0.12, events: 80, positive: 40, negative: 22 },
          { agent: "planner", reward: 0.4, events: 22, positive: 14, negative: 2 },
        ],
    repos: o.empty
      ? []
      : [
          { repo: o.repo, reward: 0.35, events: 232, positive: 164, negative: 42 },
          { repo: o.repo2, reward: 0.12, events: 80, positive: 40, negative: 22 },
        ],
    categories: o.empty
      ? []
      : [
          { repo: o.repo, category: "style", accepted: 2, dismissed: 9, ignored: 3, accept_rate: 0.17, adjustment: "suppress", exempt: false, reverted: off.has("chg_style"), reason: "Dismissed 9 of 14 times in this repository" },
          { repo: o.repo, category: "security", accepted: 1, dismissed: 6, ignored: 1, accept_rate: 0.14, adjustment: "none", exempt: true, reverted: false, reason: "Always kept, however often dismissed" },
          { repo: o.repo, category: "tests", accepted: 18, dismissed: 1, ignored: 1, accept_rate: 0.9, adjustment: "raise", exempt: false, reverted: false, reason: "Acted on 18 of 20 times" },
          { repo: o.repo2, category: "naming", accepted: 3, dismissed: 5, ignored: 2, accept_rate: 0.33, adjustment: "downgrade", exempt: false, reverted: false, reason: "Dismissed 5 of 10 times" },
          { repo: o.repo2, category: "correctness", accepted: 11, dismissed: 2, ignored: 0, accept_rate: 0.85, adjustment: "none", exempt: true, reverted: false, reason: "" },
        ],
    changes: o.empty
      ? []
      : [
          change("chg_style", o.repo, "calibration", "style", "none", "suppress", `Dismissed 9 of 14 style comments in this repository (accept rate 17%). ${o.text}`),
          change("chg_tests", o.repo, "calibration", "tests", "none", "raise", "Acted on 18 of 20 test comments in this repository (accept rate 90%)."),
          change("chg_naming", o.repo2, "calibration", "naming", "none", "downgrade", "Dismissed 5 of 10 naming comments in this repository."),
        ],
    exemplars: o.empty ? [] : exemplarsFixture(o),
    bandit: [
      {
        agent: "reviewer",
        pinned: o.pinned ?? "",
        default_arm: "standard",
        exploration_cap: 0.1,
        arms: [
          { key: "standard", label: "Standard", pulls: o.empty ? 0 : 40, mean: 0.31, ucb: 0.52, eligible: true },
          { key: "evidence_first", label: "Evidence first", pulls: o.empty ? 0 : 9, mean: 0.44, ucb: 0.9, eligible: true },
          { key: "focused", label: "Focused", pulls: o.empty ? 0 : 3, mean: -0.1, ucb: 1.1, eligible: false },
        ],
      },
    ],
  };
}

/**
 * Examples as the gateway sends them: a clean title, a short summary, the
 * reason, uses. `ex_legacy` is one kept before titles were stored (only
 * `text`, with the markup GitHub bodies carry), read by the page the same way.
 */
export function exemplarsFixture(o: Pick<LearningOpts, "repo" | "repo2" | "text" | "file">) {
  const run = "01JRUNEXAMPLE0000000000042";
  const base = [
    {
      id: "ex1", repo: o.repo, kind: "finding", polarity: "good", category: "tests", area: o.file,
      title: o.text, summary: "The retry path in the payments client had **no test**.\n\n- Add a test that fails the first call\n- Assert the second call reuses the `idempotency_key`",
      reason: "The author changed the code it pointed at", text: o.text, reward: 1.6, events: 2, uses: 4, created_at: iso(5 * DAY), pr: 12345,
      last_used_at: iso(DAY / 4), used_by: [{ at: iso(3 * DAY), agent: "reviewer", pr: 12350 }, { at: iso(DAY / 4), agent: "reviewer", pr: 12361 }],
    },
    {
      id: "ex2", repo: o.repo2, kind: "fix", polarity: "good", category: "", area: "services/payments",
      title: "Retry the import once with the same key", summary: "Retries the import once with the same idempotency key, then stops and reports the failure.\n\n```ts\nawait importOnce(key);\n```",
      reason: "CI passed on the first try, merged without changes", text: "Retry the import once with the same key", reward: 1.5, events: 3, uses: 6, created_at: iso(6 * DAY), pr: 12340, run_id: run,
      last_used_at: iso(DAY / 2), used_by: [{ at: iso(DAY / 2), agent: "coder", run_id: "01JRUNUSEDBY00000000000007" }],
    },
    {
      id: "ex3", repo: o.repo, kind: "finding", polarity: "avoid", category: "style", area: "src/app",
      title: "Asked to rename a variable the team names this way on purpose", summary: "The team keeps `ctx` for request context across the app.",
      reason: "The team pushed back and the comment was judged wrong", text: "Asked to rename a variable the team names this way on purpose.", reward: -1.2, events: 1, uses: 2, created_at: iso(7 * DAY), pr: 12330,
    },
    {
      id: "ex_legacy", repo: o.repo2, kind: "fix", polarity: "avoid", category: "", area: "web/checkout",
      text: "fix(checkout): cache the cart: Source ticket: OPS-7\n\n<!-- coderhelm:unverified -->\n> [!WARNING]\n> **Not yet verified**\n<!-- /coderhelm:unverified -->\n\n## Summary\n**Summary** Cache the cart for five minutes.",
      reward: -1.8, uses: 1, created_at: iso(9 * DAY), pr: 12301,
    },
  ];
  // More to follow than one page holds, so "Show more" has work to do.
  const more = Array.from({ length: 11 }, (_, i) => ({
    id: `exm${i}`, repo: i % 2 ? o.repo2 : o.repo, kind: i % 3 ? "finding" : "fix", polarity: "good", category: i % 3 ? "correctness" : "", area: `src/module${i}`,
    title: `Check the return value of step ${i + 1}`, summary: `Step ${i + 1} can fail quietly; the comment asked for the error to be returned.`,
    reason: i % 3 ? "The author changed the code it pointed at" : "Merged after people changed 20% of it", text: `Check the return value of step ${i + 1}`,
    reward: 1 + i / 10, events: 1, uses: i % 4 === 0 ? 0 : 1, created_at: iso((10 + i) * DAY), pr: 12200 + i,
  }));
  return [...base, ...more];
}

export const learningData: Handler = ({ method, path }) => {
  if (path === "/api/learning" && method === "GET") {
    return learningFixture({ repo: REPO, repo2: REPO_2, text: `${TITLE} ${SENTENCE} ${TOKEN}`, file: FILE, canManage: true });
  }
  if (path === "/api/learning/pin" && method === "POST") return { ok: true };
  if (path === "/api/learning/revert" && method === "POST") return { reverted: 1 };
  if (path === "/api/learning/restore" && method === "POST") return { ok: true };
  if (path === "/api/learning/weights" && method === "PUT") return { weights: Object.fromEntries(SIGNALS.map(([k, , w]) => [k, w])) };
  return undefined;
};
