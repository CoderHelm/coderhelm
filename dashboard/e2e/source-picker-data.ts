import type { Page, Route } from "@playwright/test";

// A mock backend for the Knowledge source picker: a deep Notion workspace
// with emoji and image icons, child counts, a database, long titles, a page
// whose first opening fails, and a big folder; search answers carry each
// result's path. Every API call is answered here; nothing reaches a real
// backend (other hosts are refused).

export interface MockNode {
  id: string;
  title: string;
  kind: string;
  has_children: boolean;
  selectable?: boolean;
  detail?: string;
  icon?: string;
  child_count?: number;
  item_count?: number;
  bytes?: number;
  updated_at?: string;
  path?: string[];
}

const now = Date.now();
export const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

/** Served by the mock at this origin, standing in for a provider's icon address. */
const IMG = "/__icon/team.svg";

const many = (parent: string, n: number): MockNode[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `page:${parent}-${i + 1}`,
    title: `ADR ${String(i + 1).padStart(3, "0")}: ${["Use Postgres for the ledger", "Queue retries with jitter", "One repo per service", "Feature flags at the edge"][i % 4]}`,
    kind: "page",
    has_children: false,
    icon: "📄",
    updated_at: ago(i + 3),
  }));

export const NOTION: Record<string, MockNode[]> = {
  "": [
    { id: "page:handbook", title: "Company handbook", kind: "page", has_children: true, icon: "📘", child_count: 3, item_count: 9, updated_at: ago(2) },
    { id: "page:eng", title: "Engineering", kind: "page", has_children: true, icon: "🛠️", child_count: 3, item_count: 140, updated_at: ago(0.1) },
    { id: "database:roadmap", title: "Product roadmap", kind: "database", has_children: true, detail: "Database", icon: "🗺️", child_count: 18, item_count: 18, updated_at: ago(1) },
    { id: "page:design", title: "Design reviews", kind: "page", has_children: true, icon: IMG, child_count: 2, item_count: 3, updated_at: ago(6) },
    { id: "page:gtm", title: "GTM-ID", kind: "page", has_children: false, child_count: 0, item_count: 1, updated_at: ago(40) },
    {
      id: "page:test",
      title: "this is a test page, i want to check if coderhelm has access to it",
      kind: "page",
      has_children: false,
      child_count: 0,
      item_count: 1,
      updated_at: ago(3),
    },
    {
      id: "page:long",
      title: "Quarterly planning notes for the platform, payments and growth teams with every open question from the offsite",
      kind: "page",
      has_children: false,
      icon: "🗒️",
      child_count: 0,
      item_count: 1,
      updated_at: ago(12),
    },
  ],
  "page:handbook": [
    { id: "page:people", title: "People", kind: "page", has_children: true, icon: "🧑‍🤝‍🧑", updated_at: ago(4) },
    { id: "page:security", title: "Security policy", kind: "page", has_children: false, icon: "🔒", updated_at: ago(9) },
    { id: "page:travel", title: "Travel and expenses", kind: "page", has_children: false, icon: "✈️", updated_at: ago(30) },
  ],
  "page:people": [
    { id: "page:payroll", title: "Payroll", kind: "page", has_children: true, icon: "💸", updated_at: ago(5) },
    { id: "page:leave", title: "Leave policy", kind: "page", has_children: false, icon: "🌴", updated_at: ago(15) },
  ],
  "page:payroll": [{ id: "page:payroll-dates", title: "Payroll dates for 2027", kind: "page", has_children: false, icon: "📅", updated_at: ago(1) }],
  "page:eng": [
    { id: "page:runbooks", title: "Runbooks", kind: "page", has_children: true, icon: "📕", updated_at: ago(0.2) },
    { id: "page:onboarding", title: "Onboarding", kind: "page", has_children: false, icon: "👋", updated_at: ago(8) },
    { id: "page:adr", title: "Architecture decision records", kind: "page", has_children: true, icon: "🏛️", updated_at: ago(2) },
  ],
  "page:runbooks": [{ id: "page:deploy", title: "Deploy", kind: "page", has_children: true, icon: "🚀", updated_at: ago(0.3) }],
  "page:deploy": [{ id: "page:rollback", title: "Rolling back a bad release", kind: "page", has_children: true, icon: "⏪", updated_at: ago(1) }],
  "page:rollback": [{ id: "page:db-rollback", title: "Database migrations that can't be undone", kind: "page", has_children: false, icon: "🧯", updated_at: ago(2) }],
  "page:adr": many("adr", 136),
  "database:roadmap": Array.from({ length: 18 }, (_, i) => ({
    id: `page:road-${i + 1}`,
    title: `Roadmap item ${i + 1}`,
    kind: "page",
    has_children: false,
    updated_at: ago(i),
  })),
  "page:design": [
    { id: "page:design-1", title: "Checkout redesign", kind: "page", has_children: false, icon: "🛒", updated_at: ago(6) },
    { id: "page:design-2", title: "Settings navigation", kind: "page", has_children: false, icon: "🧭", updated_at: ago(7) },
  ],
};

/** Titles above each node, for search answers. */
function pathOf(id: string): string[] {
  for (const [parent, kids] of Object.entries(NOTION)) {
    if (!parent) continue;
    if (kids.some((k) => k.id === id)) {
      const all = Object.values(NOTION).flat();
      const p = all.find((n) => n.id === parent);
      return p ? [...pathOf(parent), p.title] : [];
    }
  }
  return [];
}

export interface PickerBackend {
  calls: string[];
  bodies: Record<string, unknown>[];
  /** Openings of a node that fail before one works. */
  failures: Record<string, number>;
  /** The top level is empty (nothing shared yet). */
  empty: boolean;
  /** Answer search and openings this much later (ms). */
  delay: number;
}

export async function mockPicker(page: Page, init: Partial<PickerBackend> = {}): Promise<PickerBackend> {
  const db: PickerBackend = { calls: [], bodies: [], failures: { "page:design": 1 }, empty: false, delay: 0, ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route(
    (url) => url.hostname === "localhost" && url.pathname.startsWith("/__icon/"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#7c3aed"/><path d="M5 13l3-6 3 4 2-2 2 4z" fill="#fff"/></svg>',
      }),
  );
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}${url.search}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/knowledge" && method === "GET") {
      return json(route, {
        bases: [],
        can_manage: true,
        limits: { max_file_bytes: 26214400, max_files: 500, extensions: ["pdf", "md"], agents: [], read_roles: ["viewer", "member", "admin"] },
      });
    }
    if (p === "/api/knowledge" && method === "POST") {
      return json(route, {
        base: { id: "kb_new", name: body.name, description: "", read_role: body.read_role, attach_team: true, agents: [], authoritative: false, created_at: ago(0), updated_at: ago(0), files: 0, ready: 0, processing: 0, failed: 0, uploads: 0, synced: 0, kinds: [], sources: [] },
        source: null,
        setup: null,
      });
    }
    if (p === "/api/knowledge/connectors") {
      const label: Record<string, string> = { notion: "Notion", confluence: "Confluence", google_drive: "Google Drive", sanity: "Sanity", github: "GitHub", web: "Website" };
      return json(route, {
        connectors: Object.keys(label).map((k) => ({
          kind: k,
          label: label[k],
          blurb: "",
          connected: true,
          via: "oauth",
          can_sign_in: true,
          reconnect_reason: "",
          connected_by: "",
          hint: "",
          live_updates: true,
          picker: k === "web" ? "address" : "tree",
          member_sign_in: false,
          signed_in: false,
          signed_in_as: "",
          has_saved_key: false,
        })),
        visibility_note: "Everyone who can read this knowledge base can read what you add.",
      });
    }
    const browse = p.match(/^\/api\/knowledge\/connectors\/([a-z_]+)\/browse$/);
    if (browse) {
      if (db.delay) await new Promise((r) => setTimeout(r, db.delay));
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const parent = url.searchParams.get("parent") ?? "";
      if (parent && db.failures[parent]) {
        db.failures[parent] -= 1;
        return json(route, { error: "Notion didn't answer in time.", fix: "", action: "retry" }, 502);
      }
      const full = (n: MockNode) => ({ selectable: true, url: "", updated_at: "", detail: "", ...n });
      if (q) {
        const hits = Object.values(NOTION)
          .flat()
          .filter((n) => n.title.toLowerCase().includes(q))
          .map((n) => full({ ...n, path: pathOf(n.id) }));
        return json(route, { nodes: hits, options: {} });
      }
      const nodes = db.empty && !parent ? [] : (NOTION[parent] ?? []);
      return json(route, { nodes: nodes.map(full), options: {} });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}
