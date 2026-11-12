// Stale pull requests, read for the Stale PRs page and the line on the
// Reviewer page: which pull requests are marked, which the next sweep would
// mark or close, and when each one closes. Pure, so both read it the same way.

import type { StaleActivity, StaleConfig, StaleKeptOpen, StalePlan, StalePlanItem } from "./api";

export type StaleState = "off" | "dry_run" | "on";

export function staleState(c: Pick<StaleConfig, "enabled" | "dry_run"> | null | undefined): StaleState {
  if (!c?.enabled) return "off";
  return c.dry_run ? "dry_run" : "on";
}

/** The three modes, in the same words everywhere: the page, the tabs and the settings. */
export const STATE_WORD: Record<StaleState, string> = { off: "Off", dry_run: "Preview only", on: "On" };

/** One plain line under each mode in the settings. */
export function modeHelp(mode: StaleState, c: Pick<StaleConfig, "stale_days" | "close_days" | "max_closes_per_run">): string {
  if (mode === "off") return "Nothing happens. Coderhelm never labels, comments on or closes a pull request.";
  if (mode === "dry_run")
    return "Coderhelm lists which pull requests it would mark and close in the Would mark or close tab. Nothing is labeled, commented on or closed on GitHub.";
  return `After ${plural(c.stale_days, "day")} with no activity Coderhelm labels the pull request stale and comments; if nothing happens in the next ${plural(c.close_days, "day")} it closes it. Up to ${c.max_closes_per_run} an hour per repository.`;
}

/** The settings with a mode picked: Off, Preview only (enabled, dry run) or On. */
export function withMode<C extends Pick<StaleConfig, "enabled" | "dry_run">>(c: C, mode: StaleState): C {
  if (mode === "off") return { ...c, enabled: false };
  return { ...c, enabled: true, dry_run: mode === "dry_run" };
}

/** "7 days quiet + 7 days to close = closed after 14 days with no activity." */
export function timingLine(c: Pick<StaleConfig, "stale_days" | "close_days">): string {
  return `${plural(c.stale_days, "day")} quiet + ${plural(c.close_days, "day")} to close = closed after ${plural(c.stale_days + c.close_days, "day")} with no activity.`;
}

/** Repositories whose own settings put them in another mode than `base`, by mode. */
export function otherRepoModes(
  configs: { repo: string; config: Pick<StaleConfig, "enabled" | "dry_run"> }[] | undefined,
  base: StaleState,
): { state: StaleState; repos: string[] }[] {
  const by = new Map<StaleState, string[]>();
  for (const { repo, config } of configs ?? []) {
    const st = staleState(config);
    if (st === base) continue;
    by.set(st, [...(by.get(st) ?? []), repo]);
  }
  return (["on", "dry_run", "off"] as StaleState[]).filter((st) => by.has(st)).map((state) => ({ state, repos: by.get(state)! }));
}

/** One plan item with the repository and whether its plan was a dry run. */
export interface StaleRow extends StalePlanItem {
  repo: string;
  dry_run: boolean;
}

/** Every repository's plan, from a new or an older backend (one `plan`). */
export function plansOf(a: StaleActivity | null | undefined): StalePlan[] {
  if (!a) return [];
  if (a.plans) return a.plans;
  return a.plan ? [a.plan] : [];
}

export function rowsOf(a: StaleActivity | null | undefined, fallbackRepo = ""): StaleRow[] {
  return plansOf(a).flatMap((p) =>
    p.items.map((i) => ({ ...i, repo: i.repo || p.repo || fallbackRepo, dry_run: p.dry_run })),
  );
}

/** Marked stale now: waiting out the grace period, or closing on this sweep for real. */
export function isMarked(r: StaleRow): boolean {
  return r.action === "wait" || (r.action === "close" && !r.dry_run);
}

/** What the next sweep would do: mark it, or (in a dry run) close it. */
export function isUpNext(r: StaleRow): boolean {
  return r.action === "mark" || (r.action === "close" && r.dry_run);
}

/** Exempt and not already listed as kept open. */
export function exemptRows(rows: StaleRow[], kept: StaleKeptOpen[]): StaleRow[] {
  const keptKeys = new Set(kept.map((k) => `${k.repo ?? ""}#${k.pr}`));
  return rows.filter((r) => r.action === "exempt" && !keptKeys.has(`${r.repo}#${r.pr}`) && !keptKeys.has(`#${r.pr}`));
}

const DAY = 86_400_000;

/** Whole days since the last activity: the backend's count, else worked out here. */
export function daysQuiet(r: Pick<StalePlanItem, "days_quiet" | "last_activity">, now = Date.now()): number | null {
  if (typeof r.days_quiet === "number") return r.days_quiet;
  const t = Date.parse(r.last_activity);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / DAY));
}

/** When it closes: the backend's date, else the plan's next step. */
export function closesAt(r: Pick<StalePlanItem, "closes_at" | "next_at" | "action">): string | null {
  if (r.closes_at) return r.closes_at;
  if (r.next_at && (r.action === "wait" || r.action === "mark" || r.action === "close")) return r.next_at;
  return null;
}

/** Days until it closes, counted in calendar days from today (0: today or already due). */
export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(t);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY));
}

/** "Closes today", "Closes tomorrow", "Closes in 4 days". */
export function closesWords(days: number | null, would = false): string {
  const verb = would ? "Would close" : "Closes";
  if (days === null) return verb;
  if (days <= 0) return `${verb} today`;
  if (days === 1) return `${verb} tomorrow`;
  return `${verb} in ${days} days`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The one line on the Reviewer page: "3 pull requests marked stale, 1 closing
 * tomorrow", or in Preview only "Stale pull requests, preview only: would mark 4 and close 1 pull requests". Null when
 * there is nothing to say.
 */
export function summaryLine(state: StaleState, a: StaleActivity | null | undefined, now = Date.now()): string | null {
  if (state === "off" || !a) return null;
  const rows = rowsOf(a);
  if (state === "dry_run") {
    const mark = rows.filter((r) => r.action === "mark").length;
    const close = rows.filter((r) => r.action === "close").length;
    if (!mark && !close) return null;
    const bits = [mark ? `mark ${mark}` : "", close ? `close ${close}` : ""].filter(Boolean).join(" and ");
    return `Stale pull requests, preview only: would ${bits} ${mark + close === 1 ? "pull request" : "pull requests"}`;
  }
  const marked = rows.filter(isMarked);
  if (!marked.length) return null;
  const soon = marked.filter((r) => (daysUntil(closesAt(r), now) ?? 99) <= 1);
  const today = soon.filter((r) => daysUntil(closesAt(r), now) === 0).length;
  const head = `${plural(marked.length, "pull request")} marked stale`;
  if (!soon.length) return head;
  const when = today === soon.length ? "today" : today ? "today or tomorrow" : "tomorrow";
  return `${head}, ${soon.length} closing ${when}`;
}
