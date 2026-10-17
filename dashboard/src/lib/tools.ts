// A team's own tools: named, typed, reviewed reads its agents can call.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

export type ToolKind = "sql" | "graphql" | "logs" | "http";
export type InputType = "string" | "integer" | "date";

export interface ToolInput {
  type: InputType;
  pattern?: string;
  allowed?: string[];
  min?: number;
  max?: number;
  example: string | number;
  description?: string;
}

export interface ToolDef {
  name: string;
  use_when: string;
  source: string;
  kind: ToolKind;
  read: string;
  inputs: Record<string, ToolInput>;
  max_rows?: number;
  ask_me_first?: boolean;
  repos?: string[];
  log_groups?: string[];
  since?: string;
  database?: string;
  runs_per_hour?: number;
}

export interface ToolRunResult {
  ok: boolean;
  sent?: string;
  result?: string;
  hidden_count?: number;
  ms?: number;
  note?: string;
  refused?: boolean;
  step?: string;
  message?: string;
  fix?: string;
}

export interface ToolVersion {
  hash: string;
  def: ToolDef;
  author: string;
  /** `dashboard`, or `repo owner/name@sha path`. */
  origin: string;
  created_at: string;
  /** JSON of a ToolRunResult: what the example run returned. */
  example: string;
  example_ok: boolean;
}

export interface Tool {
  name: string;
  enabled: boolean;
  /** The version agents run. Empty until approved. */
  approved: string;
  approved_by: string;
  approved_at: string;
  latest: string;
  created_by: string;
  created_at: string;
  awaiting_approval: boolean;
  latest_version?: ToolVersion | null;
  /** Set when an older version is still the approved one. */
  approved_version?: ToolVersion | null;
}

export interface ToolAsk {
  id: string;
  tool: string;
  hash: string;
  inputs: Record<string, unknown>;
  actor: string;
  repo: string;
  pr: number;
  why: string;
  status: "pending" | "approved" | "denied" | "expired";
  created_at: string;
  decided_by: string;
  expires_in_s: number;
}

export interface ToolCheck {
  ok: boolean;
  problems?: string[];
  sent?: string;
  hash?: string;
  function?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const err = new Error(typeof body.error === "string" ? body.error : `API ${res.status}`) as Error & { problems?: string[] };
    if (Array.isArray(body.problems)) err.problems = body.problems as string[];
    throw err;
  }
  return body as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const toolsApi = {
  list: () => call<{ tools: Tool[]; pending_asks: number }>("/api/tools"),
  get: (name: string) => call<{ tool: Tool; versions: ToolVersion[] }>(`/api/tools/${encodeURIComponent(name)}`),
  check: (def: ToolDef | string) => call<ToolCheck>("/api/tools/validate", post(typeof def === "string" ? { definition: def } : { def })),
  save: (def: ToolDef | string) =>
    call<{ tool: Tool; version: ToolVersion; example: ToolRunResult }>("/api/tools", post(typeof def === "string" ? { definition: def } : { def })),
  approve: (name: string, hash: string) => call<{ tool: Tool }>(`/api/tools/${encodeURIComponent(name)}/approve`, post({ hash })),
  setEnabled: (name: string, enabled: boolean) =>
    call<{ tool: Tool }>(`/api/tools/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
  remove: (name: string) => call<{ ok: true }>(`/api/tools/${encodeURIComponent(name)}`, { method: "DELETE" }),
  preview: (name: string, inputs: Record<string, unknown>, hash?: string) =>
    call<ToolRunResult>(`/api/tools/${encodeURIComponent(name)}/preview`, post({ inputs, hash })),
  asks: () => call<{ asks: ToolAsk[] }>("/api/tools/asks"),
  decide: (id: string, approve: boolean) => call<{ ok: true }>(`/api/tools/asks/${encodeURIComponent(id)}`, post({ approve })),
};

export function parseExample(v: ToolVersion | null | undefined): ToolRunResult | null {
  if (!v?.example) return null;
  try {
    return JSON.parse(v.example) as ToolRunResult;
  } catch {
    return null;
  }
}

export const KIND_LABEL: Record<ToolKind, string> = {
  sql: "SQL",
  graphql: "GraphQL",
  logs: "Log search",
  http: "HTTP GET",
};

/** A definition as readable text, for showing and diffing versions. */
export function defText(d: ToolDef): string {
  const lines = [
    `name: ${d.name}`,
    `use_when: ${d.use_when}`,
    `source: ${d.source}`,
    `kind: ${d.kind}`,
    "read: |",
    ...d.read.split("\n").map((l) => `  ${l}`),
  ];
  const names = Object.keys(d.inputs || {}).sort();
  if (names.length) {
    lines.push("inputs:");
    for (const n of names) lines.push(`  ${n}: ${JSON.stringify(d.inputs[n])}`);
  }
  if (d.max_rows) lines.push(`max_rows: ${d.max_rows}`);
  if (d.ask_me_first) lines.push("ask_me_first: true");
  if (d.repos?.length) lines.push(`repos: ${d.repos.join(", ")}`);
  if (d.log_groups?.length) lines.push(`log_groups: ${d.log_groups.join(", ")}`);
  if (d.since) lines.push(`since: ${d.since}`);
  if (d.database) lines.push(`database: ${d.database}`);
  if (d.runs_per_hour) lines.push(`runs_per_hour: ${d.runs_per_hour}`);
  return lines.join("\n");
}

export interface DiffLine {
  kind: "same" | "added" | "removed";
  text: string;
}

/** A line diff (longest common subsequence), small inputs only. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "removed", text: a[i++] });
    else out.push({ kind: "added", text: b[j++] });
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++] });
  while (j < b.length) out.push({ kind: "added", text: b[j++] });
  return out;
}
