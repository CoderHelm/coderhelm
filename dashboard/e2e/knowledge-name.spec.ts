import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { cleanTitle, distinctName, nameSuggestions, type NameItem } from "../src/lib/kb-name";

// The name a new knowledge base is offered: read from where the picked pages
// sit and what their titles share, never "first title and 6 more". Unit
// checks on realistic picks, then the dialog with its suggestion chips.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const SPACE = "Data Engineering";
const page_ = (title: string, ...path: string[]): NameItem => ({ title, kind: "page", path });
const confluence = (picked: NameItem[], taken: string[] = []) => nameSuggestions({ kind: "confluence", label: "Confluence", picked, taken });

test.describe("naming a knowledge base from what was picked", () => {
  test("seven Confluence pages in one space: the space, then what the titles share", () => {
    const picked = [
      page_("ACME Data Warehouse", SPACE),
      page_("ACME Data Warehouse Runbook", SPACE),
      page_("ACME dbt models", SPACE),
      page_("ACME Airflow DAGs", SPACE),
      page_("ACME Data Warehouse access requests", SPACE),
      page_("ACME Snowflake costs 2024", SPACE),
      page_("ACME Looker dashboards 📊", SPACE),
    ];
    const names = confluence(picked);
    expect(names).toEqual(["Data Engineering space", "Data Warehouse"]);
    expect(names.join(" ")).not.toMatch(/\bmore\b/);
  });

  test("pages under one parent page: the parent first, without its Home", () => {
    const names = confluence([
      page_("Onboarding", SPACE, "Data Warehouse Home"),
      page_("Access requests", SPACE, "Data Warehouse Home"),
      page_("Nightly loads", SPACE, "Data Warehouse Home"),
    ]);
    expect(names).toEqual(["Data Warehouse", "Data Engineering space"]);
  });

  test("pages from different spaces: the shared theme, then the spaces together", () => {
    const names = confluence([
      page_("Incident runbook: database failover", "Platform"),
      page_("Incident runbook: queue backlog", "Support"),
      page_("Deploy runbook", "Platform"),
    ]);
    expect(names).toEqual(["Incident runbooks", "Platform and Support spaces"]);
  });

  test("a tag every title starts with is dropped", () => {
    const names = confluence([{ title: "ACME Data Warehouse" }, { title: "ACME Data Warehouse Runbook" }, { title: "ACME dbt models" }]);
    expect(names[0]).toBe("Data Warehouse");
    expect(names.join(" ")).not.toContain("ACME");
  });

  test("whole spaces picked: named together, plural", () => {
    expect(confluence([{ title: "Engineering", kind: "space" }, { title: "Product", kind: "space" }])).toEqual(["Engineering and Product spaces"]);
    expect(confluence([{ title: "Engineering", kind: "space" }])).toEqual(["Engineering space"]);
  });

  test("Notion pages under one top page", () => {
    const names = nameSuggestions({
      kind: "notion",
      label: "Notion",
      picked: [
        page_("🚀 Onboarding checklist", "Engineering Handbook"),
        page_("Code review guide", "Engineering Handbook"),
        page_("On-call v2", "Engineering Handbook", "Operations"),
      ],
    });
    expect(names).toEqual(["Engineering Handbook"]);
  });

  test("Notion top-level pages: named together while it stays short", () => {
    const picked = ["Engineering", "Product", "Design"].map((t) => page_(t));
    expect(nameSuggestions({ kind: "notion", label: "Notion", picked })).toEqual(["Engineering, Product and Design"]);
    const many = ["Engineering", "Product", "Design", "Sales"].map((t) => page_(t));
    expect(nameSuggestions({ kind: "notion", label: "Notion", picked: many })).toEqual(["Notion docs"]);
  });

  test("Drive folders: the folder they sit in, or the folder itself", () => {
    const inTeam = nameSuggestions({
      kind: "google_drive",
      label: "Google Drive",
      picked: [
        { title: "Security policies", kind: "folder", path: ["People Ops"] },
        { title: "Benefits", kind: "folder", path: ["People Ops"] },
      ],
    });
    expect(inTeam[0]).toBe("People Ops");
    const one = nameSuggestions({ kind: "google_drive", label: "Google Drive", picked: [{ title: "Sales Playbooks", kind: "folder", path: [] }] });
    expect(one).toEqual(["Sales Playbooks"]);
    const files = nameSuggestions({
      kind: "google_drive",
      label: "Google Drive",
      picked: [
        { title: "Q3 2025 Pricing review.docx", kind: "file", path: ["Finance", "Pricing"] },
        { title: "Pricing review notes v2.pdf", kind: "file", path: ["Finance", "Pricing"] },
      ],
    });
    expect(files).toEqual(["Pricing docs", "Finance docs", "Pricing Review"]);
  });

  test("a GitHub repository drops its owner", () => {
    expect(nameSuggestions({ kind: "github", label: "GitHub", picked: [{ title: "acme/design-system", kind: "repo", path: [] }] })).toEqual(["Design System docs"]);
  });

  test("a single page: its own title, cleaned, then where it sits", () => {
    expect(confluence([page_("📘 Data Warehouse Overview (2024-03-01)", SPACE)])).toEqual(["Data Warehouse", "Data Engineering space"]);
    expect(confluence([page_("Billing", SPACE)])).toEqual(["Billing docs", "Data Engineering space"]);
  });

  test("uploads are named from their file names", () => {
    expect(nameSuggestions({ kind: "upload", label: "Upload", picked: [], files: [{ name: "Benefits 2026.pdf" }] })).toEqual(["Benefits docs"]);
    expect(
      nameSuggestions({ kind: "upload", label: "Upload", picked: [], files: [{ name: "release_checklist_v3.md" }, { name: "release-notes-2025-10.md" }] }),
    ).toEqual(["Release docs"]);
    expect(nameSuggestions({ kind: "upload", label: "Upload", picked: [], files: [{ name: "a.pdf" }, { name: "b.pdf" }] })).toEqual(["Team documents"]);
  });

  test("websites are named by their address", () => {
    expect(nameSuggestions({ kind: "web", label: "Website", picked: [{ title: "https://docs.example.com/sitemap.xml", kind: "sitemap" }] })).toEqual([
      "docs.example.com",
    ]);
  });

  test("a name the team already has gets the app's name, then a number", () => {
    const picked = [page_("Loads", SPACE), page_("Costs", SPACE)];
    expect(confluence(picked, ["data engineering space"])).toEqual(["Data Engineering space (Confluence)"]);
    expect(distinctName("Data Warehouse", ["Data Warehouse", "Data Warehouse (Confluence)"], "Confluence")).toBe("Data Warehouse (Confluence) 2");
    expect(distinctName("Data Warehouse", [], "Confluence")).toBe("Data Warehouse");
  });

  test("every suggestion is short: at most five words, at most three suggestions", () => {
    const picked = Array.from({ length: 12 }, (_, i) => page_(`How the team runs the very long weekly planning meeting number ${i}`, "A very long space name that keeps going on"));
    const names = confluence(picked);
    expect(names.length).toBeLessThanOrEqual(3);
    for (const n of names) expect(n.replace(/ \(Confluence\)$/, "").split(" ").length).toBeLessThanOrEqual(6);
  });

  test("cleaning takes out emoji, dates, versions and filler", () => {
    expect(cleanTitle("🚀 Release process v2.3 - Draft")).toBe("Release process");
    expect(cleanTitle("Roadmap Q3 2025")).toBe("Roadmap");
    expect(cleanTitle("Team Home")).toBe("Team");
    expect(cleanTitle("security_incident-response.docx", true)).toBe("security incident response");
  });
});

// ── The dialog ────────────────────────────────────────────────────────

const PAGES = [
  "ACME Data Warehouse",
  "ACME Data Warehouse Runbook",
  "ACME dbt models",
  "ACME Airflow DAGs",
  "ACME Data Warehouse access requests",
  "ACME Snowflake costs",
  "ACME Looker dashboards",
];

async function mockApi(page: Page, taken: string[]) {
  const bodies: Record<string, unknown>[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const base = (id: string, name: string) => ({
    id,
    name,
    description: "",
    read_role: "viewer",
    attach_team: true,
    agents: [],
    authoritative: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    files: 0,
    ready: 0,
    processing: 0,
    failed: 0,
    uploads: 0,
    synced: 0,
    kinds: ["confluence"],
    sources: [],
  });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) bodies.push({ call: `${req.method()} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/knowledge" && req.method() === "GET") {
      return json(route, {
        bases: taken.map((n, i) => base(`kb_${i}`, n)),
        can_manage: true,
        limits: { max_file_bytes: 25 << 20, max_files: 500, extensions: ["pdf", "md"], agents: [], read_roles: ["viewer", "member", "admin"] },
      });
    }
    if (p === "/api/knowledge" && req.method() === "POST") return json(route, { base: base("kb_new", body.name), source: null, setup: null });
    if (p === "/api/knowledge/connectors") {
      return json(route, {
        connectors: [
          {
            kind: "confluence",
            label: "Confluence",
            blurb: "Spaces and pages",
            connected: true,
            via: "oauth",
            can_sign_in: true,
            reconnect_reason: "",
            connected_by: "",
            hint: "",
            live_updates: true,
            picker: "tree",
            member_sign_in: false,
            signed_in: false,
            signed_in_as: "admin@example.com",
            has_saved_key: false,
          },
        ],
        visibility_note: "Everyone who can read this knowledge base can read what you add.",
      });
    }
    if (/^\/api\/knowledge\/connectors\/confluence\/browse$/.test(p)) {
      const parent = url.searchParams.get("parent") ?? "";
      const node = (id: string, title: string, kind: string, has_children: boolean) => ({ id, title, kind, has_children, selectable: true, url: "", updated_at: "", detail: "" });
      if (!parent) return json(route, { nodes: [node("space:1", SPACE, "space", true)], options: {} });
      if (parent === "space:1") return json(route, { nodes: PAGES.map((t, i) => node(`page:${i}@1`, t, "page", false)), options: {} });
      return json(route, { nodes: [], options: {} });
    }
    return json(route, { error: `Not mocked: ${req.method()} ${p}` }, 404);
  });
  return bodies;
}

async function shots(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 400]) {
    await page.setViewportSize({ width, height: width === 400 ? 860 : 800 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`) });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test.describe("the Name your knowledge base dialog", () => {
  test("pre-fills the best name, selected, with the others as chips", async ({ page }) => {
    const bodies = await mockApi(page, ["Data Warehouse"]);
    await page.goto("/knowledge/");
    await page.getByTestId("new-knowledge").click();
    const flow = page.getByTestId("add-flow");
    await flow.getByTestId("tile-confluence").click();
    await flow.getByRole("button", { name: `Open ${SPACE}` }).click();
    const tree = flow.getByTestId("picker-tree");
    for (let i = 0; i < PAGES.length; i++) await tree.locator(`[data-id="page:${i}@1"]`).getByTestId("picker-check").check();
    await page.getByTestId("flow-continue").click();

    await expect(page.getByRole("heading", { name: "Name your knowledge base" })).toBeVisible();
    const name = page.getByTestId("flow-name");
    await expect(name).toHaveValue("Data Engineering space");
    // A base called "Data Warehouse" exists, so the theme chip says where it is from.
    const chips = page.getByTestId("name-chip");
    await expect(chips).toHaveText(["Data Engineering space", "Data Warehouse (Confluence)"]);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    // The whole name is selected: typing replaces it.
    const selected = await name.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length]);
    expect(selected).toEqual([0, "Data Engineering space".length, "Data Engineering space".length]);
    await shots(page, "kbname-dialog");

    await chips.nth(1).click();
    await expect(name).toHaveValue("Data Warehouse (Confluence)");
    await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");
    await shots(page, "kbname-chip-picked");

    await name.press("ControlOrMeta+a");
    await name.pressSequentially("Warehouse docs");
    await expect(name).toHaveValue("Warehouse docs");
    await expect(page.getByTestId("name-chips").locator('[aria-pressed="true"]')).toHaveCount(0);
    await page.getByTestId("flow-finish").click();
    await expect.poll(() => bodies.find((b) => b.call === "POST /api/knowledge")).toBeTruthy();
    const sent = bodies.find((b) => b.call === "POST /api/knowledge")! as { name: string; source: { name: string } };
    expect(sent.name).toBe("Warehouse docs");
    // The source is named the same way, not "ACME Data Warehouse and 6 more".
    expect(sent.source.name).toBe("Data Engineering space");
  });
});
