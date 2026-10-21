import type { DataSource, DataSourceCheck, DataSourceKind } from "./api";
import type { CheckItem } from "@/components/check-list";

/** Field names hidden from the reviewer unless the team changes the list. */
export const DEFAULT_HIDDEN_FIELDS = [
  "password", "secret", "token", "api_key", "ssn", "card", "cvv", "email", "phone", "address", "birthday",
];

type CheckLabel = { id: DataSourceCheck["id"]; label: string };

/** The four checks for an API, in the order they run. Used while waiting for the real results. */
export const CHECK_LABELS: CheckLabel[] = [
  { id: "reach", label: "Reach the address" },
  { id: "sign_in", label: "The key is accepted" },
  { id: "read", label: "Read the list of data" },
  { id: "read_only", label: "Only reads are possible" },
];

const ROLE_CHECK: CheckLabel = { id: "role", label: "Use the role in your AWS account" };

/** Checks when connecting an AWS account, before choosing what to share. */
export const AWS_CONNECT_CHECKS: CheckLabel[] = [ROLE_CHECK, { id: "logs", label: "See your log groups" }];

/** Checks for a logs source. */
export const LOGS_CHECKS: CheckLabel[] = [ROLE_CHECK];

/** Checks for a database, in the order they run. */
export const DATABASE_CHECKS: CheckLabel[] = [
  ROLE_CHECK,
  { id: "sign_in", label: "Sign in to the database" },
  { id: "read_only", label: "The database user can only read" },
  { id: "read", label: "Read the list of tables" },
];

export const WAREHOUSE_CHECKS: CheckLabel[] = [
  ROLE_CHECK,
  { id: "sign_in", label: "Sign in to the warehouse" },
  { id: "read_only", label: "The user can only read, in every database" },
  { id: "read", label: "Read the list of tables" },
];

/** True for a Redshift data warehouse source. */
export function isWarehouse(source: Pick<DataSource, "aws">): boolean {
  return source.aws?.engine === "redshift";
}

/** A REST API or OpenSearch cluster: one read with the key shows it works. */
export const READER_CHECKS: CheckLabel[] = [{ id: "read", label: "Read with the key" }];

export function checksFor(kind: DataSourceKind, warehouse = false): CheckLabel[] {
  if (kind === "rest" || kind === "search") return READER_CHECKS;
  if (kind === "database") return warehouse ? WAREHOUSE_CHECKS : DATABASE_CHECKS;
  return kind === "logs" ? LOGS_CHECKS : CHECK_LABELS;
}

/** What a failed lookup step is called, for each kind of source. */
const STEP_LABELS: Record<DataSourceKind, Record<string, string>> = {
  api: Object.fromEntries(CHECK_LABELS.map((c) => [c.id, c.label])),
  database: {
    reach: "Reach the database",
    role: ROLE_CHECK.label,
    sign_in: "Sign in to the database",
    read: "Run the lookup",
    read_only: "Only reads are possible",
  },
  logs: {
    reach: "Reach your logs",
    role: ROLE_CHECK.label,
    sign_in: ROLE_CHECK.label,
    read: "Run the search",
    read_only: "Only reads are possible",
  },
  rest: {
    reach: "Reach the API",
    sign_in: "Sign in with the key",
    read: "Read with the key",
    read_only: "Only reads are possible",
  },
  search: {
    reach: "Reach the cluster",
    sign_in: "Sign in to the cluster",
    read: "Read with the key",
    read_only: "Only reads are possible",
  },
};

/**
 * The server names a step by id (`reach`, `sign_in`, …). People see the label.
 * An id we don't know is never printed raw.
 */
export function stepLabel(step: string, kind: DataSourceKind = "api"): string {
  const label = STEP_LABELS[kind][step];
  if (label) return label;
  return /^[a-z0-9_.-]*$/.test(step) ? "This step" : step;
}

export function runningChecks(expected: CheckLabel[] = CHECK_LABELS): CheckItem[] {
  return expected.map((c) => ({ ...c, state: "running" as const }));
}

/**
 * Turn the server's checks into list items. Checks run in order, so anything
 * after the first failure that the server did not report is shown as not run.
 */
export function toCheckItems(checks: DataSourceCheck[], expected: CheckLabel[] = CHECK_LABELS): CheckItem[] {
  const labels: Record<string, string> = Object.fromEntries(expected.map((c) => [c.id, c.label]));
  const items: CheckItem[] = checks.map((c) => ({
    id: c.id,
    label: labels[c.id] ?? c.label,
    state: c.ok ? "passed" : "failed",
    detail: c.detail,
    fix: c.fix,
  }));
  const seen = new Set(checks.map((c) => c.id));
  for (const c of expected) {
    if (!seen.has(c.id)) items.push({ ...c, state: "pending", detail: "Not run, because an earlier check failed." });
  }
  return items;
}

// ── Kinds of source ───────────────────────────────────────────────

/** Setup steps for a logs or database source. The last three are shared with an API. */
export const AWS_FLOW_STEPS = [
  { id: "access", label: "Give read-only access" },
  { id: "pick", label: "Choose what to share" },
  { id: "choose", label: "Choose what it may use" },
  { id: "try", label: "Try it" },
  { id: "review", label: "Check and turn on" },
];

export const KIND_LABEL: Record<DataSourceKind, string> = {
  api: "API",
  logs: "Logs",
  database: "Database",
  rest: "REST API",
  search: "OpenSearch",
};

/** "API", "Logs", "Database" or "Redshift warehouse". */
export function kindLabel(source: Pick<DataSource, "kind" | "aws">): string {
  return isWarehouse(source) ? "Redshift warehouse" : KIND_LABEL[source.kind];
}

/** The product a source talks to, for the short tag on its row: "GraphQL", "PostgreSQL", "Redshift"… */
export function engineLabel(source: Pick<DataSource, "kind" | "aws">): string {
  switch (source.kind) {
    case "api": return "GraphQL";
    case "rest": return "REST";
    case "search": return "OpenSearch";
    case "logs": return "CloudWatch Logs";
    case "database": return isWarehouse(source) ? "Redshift" : "PostgreSQL";
  }
}

export type SourceGroupId = "apis" | "databases" | "search" | "logs";

/** How the hub groups connected sources, in display order. */
export const SOURCE_GROUPS: { id: SourceGroupId; title: string; kinds: DataSourceKind[] }[] = [
  { id: "apis", title: "APIs", kinds: ["api", "rest"] },
  { id: "databases", title: "Databases and warehouses", kinds: ["database"] },
  { id: "search", title: "Search", kinds: ["search"] },
  { id: "logs", title: "Logs", kinds: ["logs"] },
];

/**
 * Sources split into their groups, each sorted by name so pairs like
 * "orders staging" and "orders prod" sit next to each other. Empty groups are left out.
 */
export function groupSources<T extends Pick<DataSource, "kind" | "name">>(sources: T[]): { id: SourceGroupId; title: string; list: T[] }[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  return SOURCE_GROUPS
    .map((g) => ({ id: g.id, title: g.title, list: sources.filter((s) => g.kinds.includes(s.kind)).sort(byName) }))
    .filter((g) => g.list.length > 0);
}

/** A source that needs someone: its last check failed, or its setup was never finished. */
export function needsAttention(source: Pick<DataSource, "status" | "setup_complete">): boolean {
  return source.status === "error" || !source.setup_complete;
}

/** "14 kinds of data", "3 log groups", "42 tables". Empty when unknown. */
export function countLabel(source: Pick<DataSource, "kind" | "kinds"> & Partial<Pick<DataSource, "aws">>): string {
  const n = source.kinds;
  if (typeof n !== "number") return "";
  const dbs = source.aws?.engine === "redshift" ? source.aws.databases?.length ?? 0 : 0;
  if (dbs > 0) {
    return `${n} ${n === 1 ? "table" : "tables"} in ${dbs} ${dbs === 1 ? "database" : "databases"}`;
  }
  const [one, many] =
    source.kind === "database" ? ["table", "tables"] : source.kind === "logs" ? ["log group", "log groups"] : ["kind of data", "kinds of data"];
  return `${n} ${n === 1 ? one : many}`;
}

/** Where a source reads from, in one line: the address, or the AWS account and what in it. */
export function whereLabel(source: Pick<DataSource, "kind" | "url" | "aws">): string {
  if (source.kind === "api" || source.kind === "rest" || source.kind === "search" || !source.aws) return source.url;
  const acct = `AWS account ${source.aws.account}, ${source.aws.region}`;
  if (source.kind === "database" && source.aws.engine === "redshift") {
    const dbs = source.aws.databases ?? [];
    return `${source.aws.cluster}${dbs.length ? ` / ${dbs.join(", ")}` : ""} · ${acct}`;
  }
  if (source.kind === "database") {
    return `${source.aws.cluster}${source.aws.database ? ` / ${source.aws.database}` : ""} · ${acct}`;
  }
  return acct;
}

/** What hidden names are called for this kind: columns in a database, fields elsewhere. */
export function hiddenNoun(kind: DataSourceKind): { one: string; many: string } {
  return kind === "database" ? { one: "column", many: "columns" } : { one: "field", many: "fields" };
}

export function formatSize(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return "empty";
  if (mb < 1) return "under 1 MB";
  if (mb < 1000) return `${Math.round(mb)} MB`;
  return `${(mb / 1000).toFixed(1)} GB`;
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

/** "just now", "12m ago", "3h ago", "4d ago": for tight spaces like a list row. */
export function shortAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!iso || Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
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
