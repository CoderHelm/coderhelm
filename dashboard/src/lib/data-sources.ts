import type { DataSourceCheck } from "./api";
import type { CheckItem } from "@/components/check-list";

/** Field names hidden from the reviewer unless the team changes the list. */
export const DEFAULT_HIDDEN_FIELDS = [
  "password", "secret", "token", "api_key", "ssn", "card", "cvv", "email", "phone", "address", "birthday",
];

/** The four checks, in the order they run. Used while waiting for the real results. */
export const CHECK_LABELS: { id: DataSourceCheck["id"]; label: string }[] = [
  { id: "reach", label: "Reach the address" },
  { id: "sign_in", label: "The key is accepted" },
  { id: "read", label: "Read the list of data" },
  { id: "read_only", label: "Only reads are possible" },
];

const LABEL_BY_ID: Record<string, string> = Object.fromEntries(CHECK_LABELS.map((c) => [c.id, c.label]));

/**
 * The server names a step by id (`reach`, `sign_in`, …). People see the label.
 * An id we don't know is never printed raw.
 */
export function stepLabel(step: string): string {
  if (LABEL_BY_ID[step]) return LABEL_BY_ID[step];
  return /^[a-z0-9_.-]*$/.test(step) ? "This step" : step;
}

export function runningChecks(): CheckItem[] {
  return CHECK_LABELS.map((c) => ({ ...c, state: "running" as const }));
}

/**
 * Turn the server's checks into list items. Checks run in order, so anything
 * after the first failure that the server did not report is shown as not run.
 */
export function toCheckItems(checks: DataSourceCheck[]): CheckItem[] {
  const items: CheckItem[] = checks.map((c) => ({
    id: c.id,
    label: LABEL_BY_ID[c.id] ?? c.label,
    state: c.ok ? "passed" : "failed",
    detail: c.detail,
    fix: c.fix,
  }));
  const seen = new Set(checks.map((c) => c.id));
  for (const c of CHECK_LABELS) {
    if (!seen.has(c.id)) items.push({ ...c, state: "pending", detail: "Not run, because an earlier check failed." });
  }
  return items;
}

// ── Setup progress hint ───────────────────────────────────────────
// The server knows whether setup is complete, not how far an unfinished setup
// got. This per-browser hint lets "Continue setup" reopen the right step. It is
// a convenience only: every step also works from a cold `?id=` link, and it
// never decides whether a source is on. Only the server's `enabled` does.

export type SetupStage = "choose" | "try" | "review";
export interface SetupHint {
  stage: SetupStage;
}

const hintKey = (id: string) => `coderhelm:data-source-setup:${id}`;

export function readSetupHint(id: string): SetupHint | null {
  try {
    const raw = localStorage.getItem(hintKey(id));
    if (!raw) return null;
    const v = JSON.parse(raw);
    const stage: SetupStage = v.stage === "try" || v.stage === "review" ? v.stage : "choose";
    return { stage };
  } catch {
    return null;
  }
}

export function writeSetupHint(id: string, hint: SetupHint) {
  try {
    localStorage.setItem(hintKey(id), JSON.stringify(hint));
  } catch {
    // Storage can be blocked; setup still works without the hint.
  }
}

export function clearSetupHint(id: string) {
  try {
    localStorage.removeItem(hintKey(id));
  } catch {}
}

// ── Formatting ────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!iso || Number.isNaN(then)) return iso || "never";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(then).toLocaleDateString();
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Agents that look things up, by the name the activity log records. */
const AGENT_NAMES: Record<string, string> = {
  reviewer: "Reviewer",
  planner: "Planner",
  coder: "Coding agent",
};

/** Who ran a lookup: an agent and where it was working, or a person's email. */
export function actorLabel(ev: { actor: string; repo?: string; pr?: number }): string {
  const agent = AGENT_NAMES[ev.actor];
  if (!agent) return ev.actor;
  if (!ev.repo) return agent;
  return `${agent} on ${ev.repo}${ev.pr ? ` #${ev.pr}` : ""}`;
}
