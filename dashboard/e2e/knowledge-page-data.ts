import type { Page, Route } from "@playwright/test";

// A mock gateway for the knowledge base page: a base in each state the page
// designs for (healthy, first sync, an error, empty, connected in place),
// answering the page's own reads (the base without items, the sources poll,
// one page of items, how a source connects) and recording every call.

export const now = Date.now();
export const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

export const LIMITS = {
  max_file_bytes: 25 * 1024 * 1024,
  max_files: 500,
  max_items_per_import: 2500,
  max_items_per_source: 1000,
  extensions: ["pdf", "docx", "md", "txt"],
  agents: [
    { key: "planner", label: "Planner" },
    { key: "coder", label: "Coder" },
    { key: "reviewer", label: "Reviewer" },
    { key: "plan_chat", label: "Plan chat" },
  ],
  read_roles: ["viewer", "member", "admin"],
};

export type State = "healthy" | "first_sync" | "error" | "empty" | "in_place";

export interface Src {
  id: string;
  kind: string;
  label: string;
  name: string;
  selection: { id: string; title: string; kind: string; path: string[]; include_children: boolean }[];
  options: Record<string, unknown>;
  paused: boolean;
  status: "queued" | "syncing" | "ready" | "error";
  error: { message: string; fix: string; action: string; at: string } | null;
  progress: { phase: string; done: number; total: number } | null;
  items: number;
  failed_items: number;
  truncated: boolean;
  last_sync_at: string;
  last_success_at: string;
  next_sync_at: string;
  live_updates: boolean;
  created_at: string;
  created_by: string;
  connection: string;
  signin: { name: string; email: string; account: string } | null;
  via: string;
  account: string;
  webhook_seen_at: string;
  interval_mins: number;
  use_saved_key: boolean;
  connected_used_at: string;
}

export interface KItem {
  id: string;
  name: string;
  kind: string;
  size: number;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string;
  version: number;
  searchable: boolean;
  as_of: string;
  uploaded_at: string;
  uploaded_by: string;
  chunks: number;
  truncated: boolean;
  source_id: string;
  url: string | null;
  path: string;
  skipped?: string;
  indexed_at?: string;
}

export const source = (over: Partial<Src>): Src => ({
  id: "src_conf",
  kind: "confluence",
  label: "Confluence",
  name: "Data warehouse",
  selection: [
    { id: "space:DW", title: "Data Warehouse", kind: "space", path: [], include_children: true },
    { id: "space:AN", title: "Analytics", kind: "space", path: [], include_children: true },
    { id: "space:OPS", title: "Operations", kind: "space", path: [], include_children: true },
  ],
  options: { site: "https://acme.atlassian.net" },
  paused: false,
  status: "ready",
  error: null,
  progress: null,
  items: 412,
  failed_items: 2,
  truncated: false,
  last_sync_at: iso(4),
  last_success_at: iso(4),
  next_sync_at: iso(-56),
  live_updates: false,
  created_at: iso(60 * 24 * 40),
  created_by: "ada@example.com",
  connection: "",
  signin: null,
  via: "oauth",
  account: "https://acme.atlassian.net",
  webhook_seen_at: "",
  interval_mins: 60,
  use_saved_key: false,
  connected_used_at: iso(4),
  ...over,
});

export const kitem = (over: Partial<KItem>): KItem => ({
  id: "i1",
  name: "Backfills runbook",
  kind: "confluence",
  size: 3000,
  status: "ready",
  error: "",
  version: 1,
  searchable: true,
  as_of: new Date(now - 2 * 86_400_000).toISOString().slice(0, 10),
  uploaded_at: iso(600),
  uploaded_by: "Confluence sync",
  chunks: 24,
  truncated: false,
  source_id: "src_conf",
  url: "https://acme.atlassian.net/wiki/spaces/DW/pages/1",
  path: "Data Warehouse / Runbooks",
  indexed_at: iso(60),
  ...over,
});

function itemsFor(state: State): KItem[] {
  if (state === "empty" || state === "in_place") return [];
  const out: KItem[] = [
    kitem({ id: "i1" }),
    kitem({ id: "i2", name: "Snowflake key rotation", chunks: 11, as_of: "2026-09-01" }),
    kitem({ id: "i3", name: "Legacy export (PDF)", status: "failed", error: "No text found in this PDF. A scanned PDF needs text recognition, which isn't supported yet.", searchable: false, chunks: 0 }),
    kitem({ id: "i4", name: "Orders table", path: "Data Warehouse / Tables", chunks: 52, as_of: "2026-03-01" }),
    kitem({ id: "i5", name: "Customers table", path: "Data Warehouse / Tables", chunks: 31, truncated: true }),
    kitem({ id: "i6", name: "Empty page", path: "Analytics", status: "failed", error: "This page has no text to index.", skipped: "empty", chunks: 0 }),
    kitem({ id: "i7", name: "Weekly KPI definitions", path: "Analytics / Metrics", chunks: 9 }),
    kitem({ id: "i8", name: "Retention dashboard notes", path: "Analytics / Metrics", chunks: 6 }),
    kitem({ id: "u1", name: "Data contracts.pdf", kind: "pdf", source_id: "", url: null, path: "", size: 1_400_000, uploaded_by: "ben@example.com", chunks: 18 }),
  ];
  if (state === "first_sync") return out.slice(0, 4).map((i) => ({ ...i, status: i.status === "failed" ? "ready" : i.status, error: "" }));
  return out;
}

function sourcesFor(state: State): Src[] {
  switch (state) {
    case "healthy":
      return [
        source({}),
        source({
          id: "src_notion",
          kind: "notion",
          label: "Notion",
          name: "Engineering wiki",
          options: {},
          selection: [{ id: "page:eng", title: "Engineering", kind: "page", path: [], include_children: true }],
          items: 210,
          failed_items: 0,
          live_updates: true,
          webhook_seen_at: iso(12),
          interval_mins: 360,
          next_sync_at: iso(-300),
          via: "saved_key",
          account: "",
          use_saved_key: true,
        }),
        source({
          id: "src_sanity",
          kind: "sanity",
          label: "Sanity",
          name: "Marketing site",
          options: { project_id: "p1abc", dataset: "production" },
          selection: [{ id: "type:article", title: "Articles", kind: "type", path: [], include_children: true }],
          items: 96,
          failed_items: 0,
          live_updates: false,
          interval_mins: 15,
          next_sync_at: iso(-9),
          connection: "sign_in",
          signin: { name: "Ada Lovelace", email: "ada@example.com", account: "ada@sanity.example" },
          via: "sign_in",
          account: "ada@sanity.example",
        }),
      ];
    case "first_sync":
      return [source({ status: "syncing", progress: { phase: "fetching", done: 350, total: 1000 }, items: 350, failed_items: 0, last_success_at: "", last_sync_at: "" })];
    case "error":
      return [
        source({
          status: "error",
          error: {
            message: "Confluence refused the saved sign-in.",
            fix: "Ada's Atlassian sign-in expired. Reconnect Confluence to sign in again.",
            action: "reconnect",
            at: iso(30),
          },
          last_sync_at: iso(30),
          last_success_at: iso(60 * 26),
        }),
      ];
    default:
      return [];
  }
}

export interface Backend {
  role: string;
  state: State;
  calls: string[];
  bodies: Record<string, unknown>[];
  sources: Src[];
  items: KItem[];
  /** Answers the gateway gives the page, by route name (for the wide or odd cases). */
  over: Record<string, unknown>;
}

export function baseJson(db: Backend) {
  const it = db.items;
  return {
    id: "kb_dw",
    name: "Data warehouse docs",
    description: "Runbooks and table docs for the warehouse.",
    read_role: "member",
    attach_team: false,
    agents: ["coder", "reviewer"],
    authoritative: true,
    created_at: iso(60 * 24 * 60),
    updated_at: iso(60),
    files: it.length,
    ready: it.filter((i) => i.status === "ready").length,
    processing: it.filter((i) => i.status === "processing").length,
    failed: it.filter((i) => i.status === "failed" && !i.skipped).length,
    skipped: it.filter((i) => i.skipped).length,
    passages: it.filter((i) => i.status === "ready").reduce((a, i) => a + i.chunks, 0),
    uploads: it.filter((i) => !i.source_id).length,
    synced: it.filter((i) => i.source_id).length,
    kinds: [...new Set(db.sources.map((s) => s.kind))],
    sources: db.sources.map((s) => ({ id: s.id, kind: s.kind, name: s.name, status: s.status, paused: s.paused, items: s.items, last_success_at: s.last_success_at })),
    readers: [],
    agent_access_note: "Agents attached to it read its pages in every run, so anyone who starts a run reads its answers.",
    backend:
      db.state === "in_place"
        ? { kind: "remote", provider: "bedrock_kb", label: "Bedrock knowledge base", target: "arn:aws:bedrock:us-east-1:123456789012:knowledge-base/ABCDEFGHIJ", region: "us-east-1", account: "123456789012", access: "account", hybrid: true }
        : { kind: "local" },
  };
}

const stateOf = (i: KItem) => (i.skipped ? "skipped" : i.status === "failed" ? "failed" : i.status === "processing" || i.status === "uploading" ? "working" : i.truncated ? "cut_short" : "searchable");

/** The gateway's `/items`, worked out the same way. */
export function itemsPage(items: KItem[], q: URLSearchParams) {
  const term = (q.get("q") ?? "").trim().toLowerCase();
  const status = q.get("status") ?? "";
  const src = q.get("source") ?? "";
  const group = q.get("group") ?? "";
  const states: Record<string, number> = {};
  const groups = new Map<string, { key: string; source: string; top: string; items: number; failed: number; newest: string }>();
  const matching: KItem[] = [];
  for (const f of items) {
    const g = { source: f.source_id || "upload", top: (f.path || "").split(" / ")[0] };
    if (src && g.source !== src) continue;
    if (term && !term.split(/\s+/).every((w) => `${f.name} ${f.path}`.toLowerCase().includes(w))) continue;
    const s = stateOf(f);
    states[s] = (states[s] ?? 0) + 1;
    if (status && s !== status) continue;
    const key = `${g.source}|${g.top}`;
    const e = groups.get(key) ?? { key, ...g, items: 0, failed: 0, newest: "" };
    e.items += 1;
    if (s === "failed") e.failed += 1;
    if (f.as_of > e.newest) e.newest = f.as_of;
    groups.set(key, e);
    if (group && key !== group) continue;
    matching.push(f);
  }
  matching.sort((a, b) => `${a.path}\u0000${a.name}`.toLowerCase().localeCompare(`${b.path}\u0000${b.name}`.toLowerCase()));
  const limit = Number(q.get("limit") ?? 100);
  const start = Number(q.get("cursor") ?? 0);
  const page = matching.slice(start, start + limit);
  return {
    items: page,
    total: matching.length,
    next: start + page.length < matching.length ? String(start + page.length) : null,
    states,
    groups: [...groups.values()],
    all: items.length,
  };
}

export interface Run {
  kb_id: string;
  source_id: string;
  trigger: string;
  started_at: string;
  ended_at: string;
  took_secs: number;
  result: "done" | "problems" | "stopped";
  listed: number;
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  failed: number;
  skipped: number;
  embedded: number;
  reused: number;
  via: string;
  error?: { message: string; fix: string; action: string; at: string } | null;
  problems: { name: string; url: string; kind: string; error: string; fix: string }[];
}

export const run = (over: Partial<Run>): Run => ({
  kb_id: "kb_dw",
  source_id: "src_conf",
  trigger: "schedule",
  started_at: iso(4),
  ended_at: iso(3),
  took_secs: 41,
  result: "done",
  listed: 412,
  added: 0,
  updated: 3,
  unchanged: 409,
  removed: 0,
  failed: 0,
  skipped: 0,
  embedded: 18,
  reused: 402,
  via: "oauth",
  problems: [],
  ...over,
});

export function runsFor(db: Backend): Run[] {
  if (db.state === "empty" || db.state === "in_place") return [];
  if (db.state === "first_sync") return [];
  if (db.state === "error")
    return [
      run({ started_at: iso(30), ended_at: iso(30), took_secs: 0, result: "stopped", listed: 0, updated: 0, unchanged: 0, embedded: 0, reused: 0, error: { message: "Confluence refused the saved sign-in.", fix: "Reconnect Confluence to sign in again.", action: "reconnect", at: iso(30) } }),
      run({ started_at: iso(90), ended_at: iso(89) }),
    ];
  return [
    run({}),
    run({ started_at: iso(64), updated: 0, unchanged: 412, embedded: 0, took_secs: 12 }),
    run({ started_at: iso(124), updated: 0, unchanged: 412, embedded: 0, took_secs: 11 }),
    run({ started_at: iso(184), updated: 0, unchanged: 412, embedded: 0, took_secs: 13 }),
    run({ source_id: "src_notion", trigger: "change", started_at: iso(200), updated: 1, listed: 210, unchanged: 209, embedded: 4, reused: 30, took_secs: 6, via: "saved_key" }),
    run({
      started_at: iso(60 * 24 * 2),
      trigger: "added",
      took_secs: 372,
      result: "problems",
      added: 410,
      updated: 0,
      unchanged: 0,
      failed: 1,
      skipped: 1,
      embedded: 14_210,
      reused: 0,
      problems: [
        { name: "Legacy export (PDF)", url: "https://acme.atlassian.net/wiki/x", kind: "failed", error: "No text found in this PDF. A scanned PDF needs text recognition, which isn't supported yet.", fix: "Upload a version with selectable text (export it again, or run text recognition on it)." },
        { name: "Empty page", url: "https://acme.atlassian.net/wiki/y", kind: "skipped", error: "It has no text to read.", fix: "Nothing to search in it. Add text to the page, or leave it out." },
      ],
    }),
  ];
}

const passage = (rank: number, pct: number, title: string, loc: string, text: string) => ({
  rank,
  score_pct: pct,
  score: 0.0328 * (pct / 100),
  file_id: `f${rank}`,
  title,
  loc,
  as_of: "2026-10-02",
  text,
  url: `https://acme.atlassian.net/wiki/spaces/DW/pages/${rank}`,
  source_kind: "confluence",
  authoritative: rank === 1,
});

export const PASSAGES = [
  passage(1, 100, "Backfills runbook", "Steps", "Run the backfill job with --start set to the first missing day. It reads the raw events and rebuilds the orders table one day at a time. ".repeat(4)),
  passage(2, 81, "PII policy", "Staging", "Masking happens in the staging layer: every column tagged pii is hashed before it reaches the marts."),
  passage(3, 52, "Orders table", "Columns", "order_id, customer_id, placed_at, total."),
];

export const CITATIONS = PASSAGES.map((p, i) => ({
  id: `S${i + 1}`,
  kind: "knowledge",
  title: p.title,
  loc: p.loc,
  as_of: p.as_of,
  passage: p.text,
  url: p.url,
  authoritative: p.authoritative,
  base: "kb_dw",
  source_kind: "confluence",
}));

export function usageFor(db: Backend) {
  const manage = db.role === "admin" || db.role === "owner";
  if (db.state !== "healthy")
    return { week: 0, last_week: 0, by_day: [0, 0, 0, 0, 0, 0, 0], by_surface: {}, top_pages: [], never_found: 0, never_found_sample: [], used_in: [], no_answer: [], no_answer_count: 0, kept_days: 90 };
  return {
    week: 63,
    last_week: 53,
    by_day: [4, 7, 12, 9, 14, 11, 6],
    by_surface: { chat: 41, "run:coder": 15, mcp: 5, page: 2 },
    top_pages: [
      { file_id: "i1", title: "Backfills runbook", found: 40, cited: 31 },
      { file_id: "pii", title: "PII policy", found: 25, cited: 19 },
      { file_id: "i4", title: "Orders table", found: 30, cited: 8 },
    ],
    never_found: 212,
    never_found_sample: [
      { file_id: "x1", title: "Legacy export notes" },
      { file_id: "x2", title: "2019 offsite" },
    ],
    used_in: [
      { surface: "run:coder", actor: manage ? "ada@example.com" : "", href: "/runs/detail?id=r4812", at: iso(120) },
      { surface: "chat", actor: manage ? "ben@example.com" : "", href: null, at: iso(180) },
      { surface: "chat", actor: "admin@example.com", href: "/chat?thread=th_9", at: iso(240) },
    ],
    no_answer: manage
      ? [
          { question: "What is the retention for raw events?", times: 3, last_at: iso(60), why: "no_hits" },
          { question: "Who approves schema changes?", times: 1, last_at: iso(300), why: "rated_down" },
        ]
      : [],
    no_answer_count: 2,
    kept_days: 90,
  };
}

export function connectionFor(s: Src) {
  if (s.via === "sign_in") {
    return {
      via: "sign_in",
      owner: "member",
      by: "ada@example.com",
      account: "ada@sanity.example",
      connected_at: iso(60 * 24 * 20),
      used_at: iso(9),
      token: { status: "working", status_reason: "", expires_at: iso(-50), scopes: ["sanity.read"] },
      if_they_leave:
        "It uses Ada Lovelace's own Sanity sign-in. If Ada Lovelace leaves or the sign-in stops working, syncing stops (pages already here stay searchable), admins are told, and any admin can sign in again to take it over.",
      team: { connected: false, via: "", connected_by: "", reconnect_reason: "", can_sign_in: false, has_saved_key: false },
      switch: { oauth: false, saved_key: false, my_sign_in: true },
    };
  }
  if (s.via === "saved_key") {
    return {
      via: "saved_key",
      owner: "team",
      by: "",
      account: "",
      connected_at: "",
      used_at: iso(30),
      token: null,
      if_they_leave: "It uses the API token saved for the team, so it keeps working if the person who connected it leaves, until someone revokes that token in Notion.",
      team: { connected: true, via: "oauth", connected_by: "ada@example.com", reconnect_reason: "", can_sign_in: true, has_saved_key: true },
      switch: { oauth: true, saved_key: false, my_sign_in: false },
    };
  }
  const broken = s.status === "error";
  return {
    via: "oauth",
    owner: "team",
    by: "ada@example.com",
    account: "https://acme.atlassian.net",
    connected_at: iso(60 * 24 * 40),
    used_at: iso(4),
    token: broken
      ? { status: "stopped", status_reason: "The refresh token was revoked", expires_at: null, scopes: ["read:confluence-content.all", "read:confluence-space.summary", "offline_access"] }
      : { status: "working", status_reason: "", expires_at: iso(-45), scopes: ["read:confluence-content.all", "read:confluence-space.summary", "offline_access"] },
    if_they_leave: "It belongs to the team, so it keeps working if ada@example.com leaves. Reconnect only if Confluence stops accepting it.",
    team: { connected: !broken, via: "oauth", connected_by: "ada@example.com", reconnect_reason: broken ? "The refresh token was revoked" : "", can_sign_in: true, has_saved_key: true },
    switch: { oauth: false, saved_key: true, my_sign_in: false },
  };
}

export function newBackend(state: State, role = "admin"): Backend {
  return { role, state, calls: [], bodies: [], sources: sourcesFor(state), items: itemsFor(state), over: {} };
}

/** Routes every API call to `db`; nothing reaches a real backend. */
export async function mockKnowledge(page: Page, db: Backend, extra?: (p: string, method: string, url: URL, route: Route) => Promise<boolean> | boolean) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route(
    (url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname),
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();
      const p = url.pathname;
      db.calls.push(`${method} ${p}${url.search}`);
      if (method !== "GET") {
        try {
          db.bodies.push(JSON.parse(req.postData() || "{}"));
        } catch {
          db.bodies.push({});
        }
      }
      if (extra && (await extra(p, method, url, route))) return;
      if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
      if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
      if (p === "/api/banners") return json(route, { banners: [] });
      if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
      if (p === "/api/knowledge/connectors") return json(route, { connectors: [], visibility_note: "" });
      if (p === "/api/me/capabilities" || p === "/api/me/permissions") return json(route, { error: "Not mocked" }, 404);
      if (p === "/api/brain/token" && method === "POST") return json(route, { token: "tok" });
      if (p === "/api/brain/stream" && method === "POST") {
        const b = db.bodies[db.bodies.length - 1] as { question: string };
        if (db.over.askLimited) return json(route, { error: "You've asked 20 questions here in the last hour. Ask again at the top of the hour, or keep going in Chat.", code: "rate_limited" }, 429);
        const ev = (t: string, d: unknown) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`;
        const body =
          ev("thread", { id: "th_kb", title: b.question }) +
          ev("retrieved", { sources: CITATIONS }) +
          ev("answer", { text: "Run the backfill job with a start date [S1]. Masking happens in the staging layer [S2].", citations: CITATIONS.slice(0, 2), grounded: true }) +
          ev("done", {});
        return route.fulfill({ status: 200, contentType: "text/event-stream", body });
      }
      if (p === "/api/brain/threads/th_kb" && method === "GET")
        return json(route, { thread: { id: "th_kb", title: "q", shared: false, mine: true, owner_email: "admin@example.com", created_at: iso(0), updated_at: iso(0), messages: 2, origin: "kb_page" }, messages: [{ seq: 0, role: "user", content: "q", citations: [], grounded: true, attachments: [], used: [], at: iso(0) }, { seq: 1, role: "assistant", content: "a", citations: [], grounded: true, attachments: [], used: [], at: iso(0) }], can_ask: true });
      if (p.startsWith("/api/brain/threads/th_kb/messages/") && method === "PUT") return json(route, { ok: true, feedback: (db.bodies[db.bodies.length - 1] as { rating: string | null }).rating });
      const m = p.match(/^\/api\/knowledge\/([^/]+)(\/.*)?$/);
      if (m) {
        const rest = m[2] ?? "";
        const manage = db.role === "admin" || db.role === "owner";
        if (!rest && method === "GET")
          return json(route, {
            base: baseJson(db),
            ...(url.searchParams.get("items") === "none" ? {} : { files: db.items }),
            sources: db.sources,
            can_manage: manage,
            limits: LIMITS,
            visibility_note: "Everyone who can read this knowledge base can read what you add, even if they can't open it in the app it comes from.",
          });
        if (rest === "/sources" && method === "GET") return json(route, { base: baseJson(db), sources: db.sources, uploads_working: false });
        if (rest === "/usage" && method === "GET") return json(route, db.over.usage ?? usageFor(db));
        if (rest === "/suggestions" && method === "GET") return json(route, { questions: db.items.length ? ["How do we backfill the orders table?", "Where is PII masked?", "Who owns the dbt jobs?"] : [], from: "model", built_at: 0 });
        if (rest === "/search" && method === "POST") {
          if (db.over.askLimited) return json(route, { error: "You've asked 20 questions here in the last hour. Ask again at the top of the hour, or keep going in Chat.", code: "rate_limited" }, 429);
          return json(route, { passages: PASSAGES, reindexing: 0, unreached: [], asks_per_hour: 20 });
        }
        if (rest === "/items" && method === "GET") return json(route, db.over.items ?? itemsPage(db.items, url.searchParams));
        if (rest === "/runs" && method === "GET") {
          const src = url.searchParams.get("source");
          return json(route, { runs: (db.over.runs as Run[] | undefined ?? runsFor(db)).filter((r) => !src || r.source_id === src), kept_days: 90 });
        }
        const retry = rest.match(/^\/sources\/([^/]+)\/retry$/);
        if (retry && method === "POST") return json(route, { queued: ((db.bodies[db.bodies.length - 1] as { item_ids?: string[] }).item_ids ?? []).length });
        const conn = rest.match(/^\/sources\/([^/]+)\/connection$/);
        if (conn) {
          if (!manage) return json(route, { error: "Only admins manage knowledge bases." }, 403);
          const s = db.sources.find((x) => x.id === conn[1]);
          return s ? json(route, connectionFor(s)) : json(route, { error: "No such source." }, 404);
        }
        const one = rest.match(/^\/sources\/([^/]+)(\/sync)?$/);
        if (one) {
          const s = db.sources.find((x) => x.id === one[1]);
          if (!s) return json(route, { error: "No such source." }, 404);
          if (one[2]) {
            s.status = "syncing";
            s.progress = { phase: "listing", done: 0, total: 0 };
          } else if (method === "PUT") {
            const b = db.bodies[db.bodies.length - 1] as { via?: string; paused?: boolean };
            if (b.via) {
              s.use_saved_key = b.via === "saved_key";
              s.via = b.via;
            }
            if (typeof b.paused === "boolean") s.paused = b.paused;
          }
          return json(route, { source: s });
        }
      }
      return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
    },
  );
}
