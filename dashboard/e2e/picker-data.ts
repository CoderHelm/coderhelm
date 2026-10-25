import type { Page, Route } from "@playwright/test";
import { iso } from "./wide-data/long";

// Fixtures for the picker and dialog specs, layered over the wide-data
// backend (mockWideApi): many repos under one invented org, a second org for
// the mixed case, a repo's open pull requests, and a role table long enough
// that the role editor is taller than a laptop screen.

const NAMES = [
  "web", "api", "mobile-app", "design-system", "docs", "infra", "billing-service", "notifications",
  "search-indexer", "data-pipeline", "auth-gateway", "admin-console", "analytics", "edge-workers",
  "payments-reconciliation-service-and-nightly-importer-with-a-very-long-name",
];

export const ONE_ORG_REPOS = NAMES.map((n) => ({
  name: `acme/${n}`,
  enabled: true,
  ticket_source: "github",
  onboard_status: "ready",
  ...(n === "web" ? { role: "web" } : n === "api" ? { role: "backend" } : {}),
}));

export const TWO_ORG_REPOS = [
  ...ONE_ORG_REPOS.slice(0, 6),
  ONE_ORG_REPOS[ONE_ORG_REPOS.length - 1],
  { name: "globex/storefront", enabled: true, ticket_source: "github", onboard_status: "ready" },
  { name: "globex/web", enabled: true, ticket_source: "github", onboard_status: "ready" },
];

export const OPEN_PRS = [
  { number: 482, title: "Fix the login redirect loop on expired sessions", author: "dev-one", draft: false, updated_at: iso(12) },
  { number: 479, title: "Add retries to the payment client", author: "dev-two", draft: false, updated_at: iso(90) },
  { number: 471, title: "Move nightly jobs to the new queue", author: "dev-three", draft: true, updated_at: iso(60 * 26) },
  ...Array.from({ length: 14 }, (_, i) => ({
    number: 460 - i,
    title: `Refactor module ${i + 1} so the settings page loads its sections in parallel instead of one by one`,
    author: `dev-${i + 4}`,
    draft: false,
    updated_at: iso(60 * 48 + i * 60),
  })),
];

/** Enough abilities across groups that the role editor outgrows a 650px-high screen. */
const MANY_CAPS = Array.from({ length: 22 }, (_, i) => ({
  key: `cap_${i}`,
  label: `Ability number ${i + 1}: create, edit, approve and run the things this part of the workspace holds`,
  min_role: i < 8 ? "member" : "admin",
}));

export interface PickerMockOptions {
  repos?: typeof ONE_ORG_REPOS;
  /** null answers 404, as an older backend does. */
  openPrs?: typeof OPEN_PRS | null;
  /** Every request the page sends, for asserting on writes. */
  calls?: { method: string; path: string; body: unknown }[];
}

/** Registered after mockWideApi, so these answers win. */
export async function mockPickerApi(page: Page, opts: PickerMockOptions = {}) {
  const repos = opts.repos ?? ONE_ORG_REPOS;
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname === "localhost" && /^\/api\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    opts.calls?.push({ method: req.method(), path: `${p}${url.search}`, body });
    if (req.method() === "GET" && p === "/api/repos") return json(route, { repos });
    if (req.method() === "GET" && p === "/api/reviewer/open-prs") {
      if (opts.openPrs === null) return json(route, { error: "Not found" }, 404);
      return json(route, { prs: opts.openPrs ?? OPEN_PRS });
    }
    if (req.method() === "POST" && p === "/api/reviewer/re-review") return json(route, { status: "queued" });
    if (req.method() === "GET" && p === "/api/roles") {
      return json(route, {
        roles: [],
        can_manage: true,
        max_roles: 30,
        customizable: MANY_CAPS.map((c) => c.key),
        baseline: ["view"],
        yours: ["view", ...MANY_CAPS.map((c) => c.key)],
        templates: { viewer: [], member: MANY_CAPS.slice(0, 8).map((c) => c.key), admin: MANY_CAPS.map((c) => c.key) },
      });
    }
    if (req.method() === "GET" && p === "/api/users/permissions") {
      return json(route, {
        roles: [
          { key: "viewer", label: "Viewer", level: 0, summary: "Read-only.", assignable: true },
          { key: "member", label: "Member", level: 1, summary: "Works with Coderhelm.", assignable: true },
          { key: "admin", label: "Admin", level: 3, summary: "Runs the workspace.", assignable: true },
          { key: "owner", label: "Owner", level: 4, summary: "Everything.", assignable: true },
        ],
        capabilities: [{ key: "view", label: "See and search everything", min_role: "viewer" }, ...MANY_CAPS],
        your_role: "owner",
        grantable_roles: ["viewer", "member", "admin", "owner"],
        manageable_roles: ["viewer", "member", "admin", "owner"],
        can_manage_invites: true,
      });
    }
    return route.fallback();
  });
}
