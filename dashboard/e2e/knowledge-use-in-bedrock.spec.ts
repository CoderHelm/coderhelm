import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

// Use in Bedrock: two goals, each with its own guided flow.
// - Live: a connection (client ID and secret) for AgentCore Gateway, made for
//   chosen knowledge bases, shown once with the gateway's setup filled in,
//   tested the way the gateway signs in, listed and revoked.
// - Copied: choose the bases, confirm the warning, one button. On a
//   self-hosted install the button opens the export stack and the page
//   follows its reports; an existing knowledge base, a custom data source
//   and entering the outputs by hand stay available.
// Every API call is answered here; nothing reaches a real backend or AWS.

const ARN = "arn:aws:bedrock:us-east-1:111122223333:knowledge-base/ABCDE12345";
const CONNECT = {
  mcp_url: "https://api.example.org/mcp",
  scope: "knowledge:read",
  token_endpoint: "https://api.example.org/oauth/token",
  authorization_endpoint: "https://api.example.org/oauth/authorize",
  issuer: "https://api.example.org",
  discovery_url:
    "https://api.example.org/.well-known/oauth-authorization-server",
};
const TOKEN = "chkb_01jbkey0000000000000000001_" + "s".repeat(43);
const CLIENT = "chkbc_01jbkey0000000000000000001";
const LAUNCH =
  "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=coderhelm-prod-bedrock-export";

type Setup = Record<string, unknown> | null;

interface Db {
  keys: Record<string, unknown>[];
  sync: Record<string, unknown>;
  selfHosted: boolean;
  oneClick: Record<string, unknown> | null;
  roleUpdate: Record<string, unknown> | null;
  setup: Setup;
  /** Setup states the next reads go through, one per read. */
  setupSteps: Setup[];
  accountBases: Record<string, unknown>;
  bodies: { call: string; body: Record<string, unknown> | null }[];
}

const status = (over: Record<string, unknown> = {}) => ({
  state: "never",
  last_sync_at: "",
  last_success_at: "",
  documents: 0,
  added: 0,
  updated: 0,
  removed: 0,
  errors: [],
  ingestion_job_id: "",
  needs_ingestion: false,
  syncing: false,
  ...over,
});

const setupView = (state: string, over: Record<string, unknown> = {}) => ({
  state,
  message: "",
  stack_name: "coderhelm-prod-bedrock-export",
  region: "us-east-1",
  created_at: new Date(Date.now() - 120_000).toISOString(),
  created_by: "admin@example.com",
  expires_at: new Date(Date.now() + 7_000_000).toISOString(),
  creates_knowledge_base: true,
  updated_at: new Date().toISOString(),
  ...over,
});

const OFF = {
  enabled: false,
  target: { kind: "none" },
  bases: [],
  acknowledged_at: "",
  acknowledged_by: "",
  updated_at: "",
  updated_by: "",
  status: status(),
};

const KNOWLEDGE = [
  {
    id: "kb_ops",
    name: "Runbooks",
    kinds: ["confluence"],
    files: 128,
    sources: [
      {
        id: "s1",
        kind: "confluence",
        name: "Ops space",
        status: "ready",
        paused: false,
        items: 128,
        last_success_at: "",
      },
    ],
  },
  {
    id: "kb_legal",
    name: "Legal",
    kinds: ["google_drive"],
    files: 12,
    sources: [],
  },
  {
    id: "kb_cms",
    name: "sanity",
    kinds: ["sanity"],
    files: 431,
    sources: [
      {
        id: "s2",
        kind: "sanity",
        name: "Marketing site content",
        status: "ready",
        paused: false,
        items: 431,
        last_success_at: "",
      },
    ],
  },
].map((b) => ({
  description: "",
  read_role: "member",
  attach_team: false,
  agents: [],
  authoritative: false,
  created_at: "",
  updated_at: "",
  ready: b.files,
  processing: 0,
  failed: 0,
  uploads: 0,
  synced: b.files,
  ...b,
}));

async function mockApi(page: Page, init: Partial<Db> = {}): Promise<Db> {
  const db: Db = {
    keys: [],
    sync: OFF,
    selfHosted: false,
    oneClick: null,
    roleUpdate: null,
    setup: null,
    setupSteps: [],
    accountBases: {
      install: true,
      install_account: "111122223333",
      region: "us-east-1",
      bases: [],
      list_error: null,
      accounts: [],
      connected: [],
    },
    bodies: [],
    ...init,
  };
  const json = (route: Route, body: unknown, code = 200) =>
    route.fulfill({
      status: code,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  await page.route(
    (url) => url.hostname !== "localhost",
    (route) => route.abort(),
  );
  await page.route(
    (url) =>
      url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname),
    async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const method = req.method();
      let body: Record<string, unknown> | null = null;
      try {
        body = req.postDataJSON();
      } catch {
        body = null;
      }
      db.bodies.push({ call: `${method} ${p}`, body });
      if (p === "/api/me")
        return json(route, {
          user_id: "u_1",
          team_id: "t_1",
          github_login: null,
          email: "admin@example.com",
          avatar_url: "",
          role: "admin",
        });
      if (p === "/api/usage")
        return json(route, {
          month: "2026-11",
          total_tokens: 0,
          tokens_in: 0,
          tokens_out: 0,
          total_runs: 0,
          max_tokens: 0,
        });
      if (p === "/api/banners") return json(route, { banners: [] });
      if (p === "/api/teams")
        return json(route, {
          teams: [
            { team_id: "t_1", org: "acme", status: "active", current: true },
          ],
        });
      if (p === "/api/knowledge" && method === "GET")
        return json(route, { bases: KNOWLEDGE, can_manage: true, limits: {} });
      if (p === "/api/knowledge/bedrock" && method === "GET")
        return json(route, db.accountBases);
      if (p === "/api/knowledge/keys" && method === "GET")
        return json(route, {
          keys: db.keys,
          bases: [
            { id: "kb_ops", name: "Runbooks", named_readers: false },
            { id: "kb_legal", name: "Legal", named_readers: true },
            { id: "kb_cms", name: "sanity", named_readers: false },
          ],
          connect: CONNECT,
          limits: { max_keys: 25, max_expiry_days: 365 },
        });
      if (p === "/api/knowledge/keys" && method === "POST") {
        const key = {
          id: "01jbkey0000000000000000001",
          name: body?.name,
          hint: "chkb_01jbke...ssss",
          client_id: CLIENT,
          bases: body?.bases,
          created_at: new Date().toISOString(),
          created_by: "admin@example.com",
          expires_at: body?.expires_in_days
            ? new Date(
                Date.now() + Number(body.expires_in_days) * 86_400_000,
              ).toISOString()
            : null,
          last_used_at: null,
          revoked_at: null,
          revoked_by: null,
          status: "active",
        };
        db.keys = [key];
        return json(route, { key, token: TOKEN, connect: CONNECT });
      }
      if (p.startsWith("/api/knowledge/keys/") && method === "DELETE") {
        db.keys = db.keys.map((k) => ({
          ...k,
          status: "revoked",
          revoked_at: "2026-11-10T10:05:00Z",
        }));
        return json(route, { status: "revoked", id: p.split("/").pop() });
      }
      if (p === "/api/knowledge/bedrock-sync" && method === "GET") {
        if (db.setupSteps.length) db.setup = db.setupSteps.shift() ?? null;
        return json(route, {
          sync: db.sync,
          bases: [
            {
              id: "kb_ops",
              name: "Runbooks",
              can_copy: true,
              named_readers: false,
              read_role: "member",
            },
            {
              id: "kb_cms",
              name: "sanity",
              can_copy: true,
              named_readers: false,
              read_role: "member",
            },
            {
              id: "kb_aws",
              name: "In AWS already",
              can_copy: false,
              named_readers: false,
              read_role: "member",
            },
          ],
          self_hosted: db.selfHosted,
          warning:
            "A Bedrock knowledge base has no per-person access. Everyone with Bedrock access to it can read every document copied into it.",
          role_update: db.roleUpdate,
          setup: db.setup,
          one_click: db.oneClick ?? {
            available: false,
            reason:
              "Setting up in AWS with one button is for self-hosted installs.",
          },
        });
      }
      if (p === "/api/knowledge/bedrock-sync" && method === "PUT") {
        db.sync = {
          ...db.sync,
          enabled: body?.enabled,
          target: body?.target,
          bases: body?.bases,
          status: status({ syncing: false }),
        };
        db.roleUpdate = {
          url: "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate",
          stack_name: "CoderHelmLogReaderUpdate-x",
          account: "111122223333",
        };
        return json(route, {
          sync: db.sync,
          check: null,
          role_update: db.roleUpdate,
        });
      }
      if (p === "/api/knowledge/bedrock-sync/setup" && method === "POST") {
        db.setup = setupView("waiting", {
          creates_knowledge_base: body?.create_knowledge_base === true,
        });
        return json(route, { setup: db.setup, launch_url: LAUNCH });
      }
      if (p === "/api/knowledge/bedrock-sync/setup" && method === "DELETE") {
        db.setup = null;
        db.setupSteps = [];
        return json(route, { status: "cancelled" });
      }
      if (p === "/api/knowledge/bedrock-sync/run")
        return json(route, { status: "queued" });
      return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
    },
  );
  // The connection test: the token address and the MCP server, as the gateway reaches them.
  await page.route(
    (url) => url.hostname === "api.example.org",
    async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      };
      if (req.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: cors });
      db.bodies.push({ call: `${req.method()} ${p}`, body: null });
      if (p === "/oauth/token") {
        const form = new URLSearchParams(req.postData() ?? "");
        if (
          form.get("client_secret") !== TOKEN ||
          form.get("grant_type") !== "client_credentials"
        ) {
          return route.fulfill({
            status: 401,
            headers: cors,
            contentType: "application/json",
            body: JSON.stringify({
              error: "invalid_client",
              error_description: "The client id or secret is wrong",
            }),
          });
        }
        return route.fulfill({
          status: 200,
          headers: cors,
          contentType: "application/json",
          body: JSON.stringify({
            access_token: "at_1",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        });
      }
      if (p === "/mcp") {
        const ok = req.headers()["authorization"] === "Bearer at_1";
        const rpc = req.postDataJSON() as { params?: { name?: string } };
        if (!ok || rpc.params?.name !== "knowledge_search")
          return route.fulfill({ status: 401, headers: cors, body: "" });
        const found = {
          passages: [
            { title: "Deploying to production", base: "Runbooks" },
            { title: "Rollbacks", base: "Runbooks" },
          ],
        };
        return route.fulfill({
          status: 200,
          headers: cors,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              content: [{ type: "text", text: JSON.stringify(found) }],
              structuredContent: found,
            },
          }),
        });
      }
      return route.fulfill({ status: 404, headers: cors });
    },
  );
  return db;
}

const SELF = {
  selfHosted: true,
  oneClick: { available: true, region: "us-east-1", account: "111122223333" },
};

test("a reply the page can't read shows an error, never a crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockApi(page);
  await page.route(
    (url) =>
      url.pathname === "/api/knowledge/keys" ||
      url.pathname === "/api/knowledge/bedrock-sync",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ base: { id: "kb_x" } }),
      }),
  );
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("bedrock-page")).toBeVisible();
  await expect(
    page.getByText("answered in a form this page can't read").first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("the page leads with the two goals and says why the gateway needs a connection", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("goal-live")).toContainText(
    "Let Bedrock agents search your knowledge live",
  );
  await expect(page.getByTestId("goal-copy")).toContainText(
    "Copy into a Bedrock knowledge base",
  );
  await expect(page.getByTestId("goal-live-status")).toHaveText(
    "Not connected yet",
  );
  await expect(page.getByTestId("goal-copy-status")).toHaveText(
    "Not set up yet",
  );
  await expect(page.getByTestId("why-credential")).toContainText(
    "signs in to Coderhelm as a program",
  );
  // The gateway setup is there before any connection, with blanks.
  await expect(page.getByTestId("gateway-console")).toContainText(
    CONNECT.discovery_url,
  );
  await expect(page.getByTestId("gateway-console")).toContainText(
    "<client secret>",
  );
  await page.getByRole("button", { name: "AWS CLI" }).click();
  await expect(page.getByTestId("gateway-cli")).toContainText(
    "create-gateway-target",
  );
});

test("a connection is made for chosen bases, shown once with the gateway setup filled in, tested, and revoked", async ({
  page,
}) => {
  const db = await mockApi(page);
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("no-keys")).toBeVisible();
  await page.getByTestId("new-key").click();
  const dialog = page.getByTestId("new-key-dialog");
  // Each base by its own name, with its sources' icons and its pages.
  await expect(
    dialog.getByText("431 pages from Marketing site content"),
  ).toBeVisible();
  await expect(dialog.getByText("128 pages from Ops space")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Create connection" }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("The gateway's agents will read it too."),
  ).toBeVisible();
  await expect(dialog.getByTestId("expiry-help")).toContainText(
    "the gateway's searches start failing",
  );
  // Select all, then one off; the name follows what is picked.
  await dialog.getByTestId("kb-all").check();
  await dialog.getByRole("checkbox", { name: /Legal/ }).uncheck();
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
    "AgentCore Gateway: Runbooks and sanity",
  );
  await dialog.getByRole("button", { name: "Create connection" }).click();
  const made = page.getByTestId("key-made");
  await expect(page.getByTestId("key-token")).toHaveText(TOKEN);
  await expect(page.getByTestId("key-client-id")).toHaveText(CLIENT);
  await expect(made).toContainText(CONNECT.token_endpoint);
  expect(
    db.bodies.find((b) => b.call === "POST /api/knowledge/keys")?.body,
  ).toEqual({
    name: "AgentCore Gateway: Runbooks and sanity",
    bases: ["kb_ops", "kb_cms"],
    expires_in_days: 90,
  });
  // The setup carries the real client ID and secret.
  await made.getByRole("button", { name: "JSON" }).click();
  await expect(made.getByTestId("gateway-json")).toContainText(CLIENT);
  await expect(made.getByTestId("gateway-json")).toContainText(TOKEN);
  // Tested the way the gateway signs in: client credentials, then knowledge_search.
  await made.getByTestId("test-connection").click();
  await expect(made.getByTestId("test-result")).toContainText(
    "It works: knowledge_search found 2 passages.",
  );
  await expect(made.getByTestId("test-result")).toContainText(
    "Deploying to production",
  );
  expect(db.bodies.map((b) => b.call)).toEqual(
    expect.arrayContaining(["POST /oauth/token", "POST /mcp"]),
  );
  await page.getByRole("button", { name: "Done" }).click();
  // The list never shows the secret again: what it reads, who made it, use and expiry.
  const row = page.getByTestId("key-row");
  await expect(row).toContainText("chkb_01jbke...ssss");
  await expect(row).toContainText("Reads Runbooks, sanity");
  await expect(row).toContainText("Made by admin@example.com");
  await expect(row).toContainText("Not used yet");
  await expect(row.getByTestId("key-expiry")).toContainText("Expires");
  await expect(page.getByText(TOKEN)).toHaveCount(0);
  await expect(page.getByTestId("goal-live-status")).toHaveText(
    "1 active connection",
  );
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke" }).last().click();
  await expect(page.getByTestId("key-status")).toHaveText("Revoked");
});

test("a failed test says what failed in plain words", async ({ page }) => {
  await mockApi(page);
  await page.route(
    (url) =>
      url.hostname === "api.example.org" && url.pathname === "/oauth/token",
    (route) =>
      route.fulfill({
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_client",
          error_description: "The key was revoked",
        }),
      }),
  );
  await page.goto("/knowledge/bedrock/");
  await page.getByTestId("new-key").click();
  await page.getByRole("checkbox", { name: /Runbooks/ }).check();
  await page.getByRole("button", { name: "Create connection" }).click();
  await page.getByTestId("test-connection").click();
  await expect(page.getByTestId("test-result")).toContainText(
    "Signing in with the client ID and secret failed: The key was revoked.",
  );
});

test("hosted: copying needs the warning confirmed, sends only the chosen bases, and links the role update", async ({
  page,
}) => {
  const db = await mockApi(page);
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("sync-warning")).toContainText(
    "no per-person access",
  );
  // Hosted: a custom data source, no one-click stack.
  await expect(page.getByTestId("setup-aws")).toHaveCount(0);
  await page.getByTestId("custom-kb").fill(ARN);
  await page.getByTestId("custom-ds").fill("DS12345678");
  await page.getByRole("checkbox", { name: /Runbooks/ }).check();
  await expect(
    page.getByRole("checkbox", { name: /In AWS already/ }),
  ).toBeDisabled();
  await expect(page.getByTestId("sync-save")).toBeDisabled();
  await expect(page.getByTestId("setup-needs")).toHaveText(
    "Confirm the warning first.",
  );
  await page.getByTestId("sync-ack").check();
  await page.getByTestId("sync-save").click();
  await expect(page.getByTestId("sync-note")).toContainText(
    "The first sync has started.",
  );
  expect(
    db.bodies.find((b) => b.call === "PUT /api/knowledge/bedrock-sync")?.body,
  ).toEqual({
    enabled: true,
    target: {
      kind: "custom",
      knowledge_base_arn: ARN,
      data_source_id: "DS12345678",
    },
    bases: ["kb_ops"],
    acknowledged: true,
  });
  await expect(page.getByTestId("role-update")).toContainText(
    "SyncKnowledgeBases",
  );
});

test("the status says what the last sync did, and its problems in plain words", async ({
  page,
}) => {
  await mockApi(page, {
    sync: {
      enabled: true,
      target: {
        kind: "custom",
        knowledge_base_arn: ARN,
        data_source_id: "DS12345678",
      },
      bases: ["kb_ops"],
      acknowledged_at: "2026-11-10T09:00:00Z",
      acknowledged_by: "admin@example.com",
      updated_at: "2026-11-10T09:00:00Z",
      updated_by: "admin@example.com",
      status: status({
        state: "partial",
        last_sync_at: new Date().toISOString(),
        documents: 41,
        added: 2,
        updated: 1,
        removed: 3,
        errors: ["runbook.md wasn't copied: Bedrock failed it (too large)."],
      }),
    },
  });
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("sync-state")).toHaveText(
    "Synced, with problems",
  );
  await expect(page.getByTestId("sync-documents")).toHaveText("41");
  await expect(page.getByText("2 added, 1 updated, 3 removed")).toBeVisible();
  await expect(page.getByTestId("sync-errors")).toContainText(
    "runbook.md wasn't copied",
  );
  await expect(page.getByTestId("goal-copy-status")).toHaveText(
    "Synced, with problems",
  );
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("sync-note")).toContainText(
    "A sync has started.",
  );
});

test("self-hosted: one button opens the stack and the page follows it to the first sync", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // The new tab the button opens: recorded, never navigated.
    const opened: { href: string }[] = [];
    (window as unknown as { __opened: typeof opened }).__opened = opened;
    window.open = (() => {
      const w = { opener: {}, location: { href: "" }, close() {} };
      opened.push(w.location);
      return w as unknown as Window;
    }) as typeof window.open;
  });
  const db = await mockApi(page, SELF);
  await page.goto("/knowledge/bedrock/");
  // The order: choose, confirm, one button. A new knowledge base is the default.
  await expect(
    page.getByRole("button", { name: "A new knowledge base" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("new-kb-summary")).toContainText("S3 Vectors");
  await expect(page.getByTestId("new-kb-summary")).toContainText(
    "under $1 a month",
  );
  await expect(page.getByTestId("setup-aws")).toBeDisabled();
  await page.getByRole("checkbox", { name: /Runbooks/ }).check();
  await expect(page.getByTestId("setup-aws")).toBeDisabled();
  await page.getByTestId("sync-ack").check();
  // The stack's reports, one per read of the page while it waits.
  db.setupSteps = [
    setupView("waiting"),
    setupView("started"),
    setupView("bucket"),
  ];
  await page.getByTestId("setup-aws").click();
  expect(
    db.bodies.find((b) => b.call === "POST /api/knowledge/bedrock-sync/setup")
      ?.body,
  ).toEqual({
    bases: ["kb_ops"],
    acknowledged: true,
    create_knowledge_base: true,
  });
  // The tab opens on the press and gets its address when the setup call
  // answers: wait for it rather than read it at once.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __opened: { href: string }[] }).__opened.map(
          (o) => o.href,
        ),
      ),
    )
    .toEqual([LAUNCH]);
  const progress = page.getByTestId("setup-progress");
  await expect(progress).toContainText("Waiting for the stack");
  await expect(page.getByTestId("setup-open")).toHaveAttribute("href", LAUNCH);
  await expect(page.getByTestId("goal-copy-status")).toHaveText(
    "Setting up in AWS",
  );
  await expect(page.getByTestId("setup-step-1")).toHaveAttribute(
    "data-state",
    "current",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("setup-step-0")).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(page.getByTestId("setup-step-2")).toHaveAttribute(
    "data-state",
    "current",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("setup-step-2")).toContainText(
    "Bedrock is creating it",
  );
  // Ready: the stack's outputs became the target and the first sync started.
  db.sync = {
    ...OFF,
    enabled: true,
    bases: ["kb_ops"],
    target: {
      kind: "s3",
      bucket: "coderhelm-prod-kb-export-111122223333",
      prefix: "coderhelm/",
      region: "us-east-1",
      knowledge_base_arn: ARN,
      data_source_id: "DS12345678",
    },
    status: status({ syncing: true }),
  };
  db.setupSteps = [setupView("ready")];
  await expect(page.getByTestId("setup-step-3")).toHaveAttribute(
    "data-state",
    "done",
    { timeout: 20_000 },
  );
  await expect(progress).toContainText("First sync started");
  await expect(progress).toContainText("Coderhelm is copying the documents");
  await expect(page.getByTestId("sync-state")).toHaveText("Syncing now");
  await expect(page.getByTestId("sync-status")).toContainText(
    "ABCDE12345 through s3://coderhelm-prod-kb-export-111122223333/coderhelm/",
  );
  // Nothing was pasted: the page never saved a target itself.
  expect(
    db.bodies.some((b) => b.call === "PUT /api/knowledge/bedrock-sync"),
  ).toBe(false);
});

test("self-hosted: a failed stack says why in plain words, and can be tried again or entered by hand", async ({
  page,
}) => {
  await mockApi(page, {
    ...SELF,
    setup: setupView("failed", {
      message:
        "The stack failed: VectorBucket: S3 Vectors isn't available in eu-west-3. S3 Vectors may not be available in this region.",
    }),
  });
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("setup-error")).toContainText(
    "The stack failed: VectorBucket: S3 Vectors isn't available in eu-west-3.",
  );
  await expect(page.getByTestId("setup-step-0")).toHaveAttribute(
    "data-state",
    "upcoming",
  );
  await page.getByRole("button", { name: "Enter it yourself" }).first().click();
  await expect(page.getByTestId("manual-fields")).toBeVisible();
  await expect(page.getByTestId("template-link")).toHaveAttribute(
    "href",
    /\/api\/knowledge\/bedrock-sync\/template$/,
  );
});

test("self-hosted: an expired link and a cancelled setup", async ({ page }) => {
  const db = await mockApi(page, { ...SELF, setup: setupView("expired") });
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("setup-error")).toContainText(
    "The setup link expired",
  );
  db.setup = setupView("started");
  await page.reload();
  await page.getByTestId("setup-cancel").click();
  await expect(page.getByTestId("setup-progress")).toHaveCount(0);
  expect(
    db.bodies.some(
      (b) => b.call === "DELETE /api/knowledge/bedrock-sync/setup",
    ),
  ).toBe(true);
});

test("self-hosted: an existing knowledge base is picked from the account's list", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = (() =>
      ({
        opener: {},
        location: { href: "" },
        close() {},
      }) as unknown as Window) as typeof window.open;
  });
  const db = await mockApi(page, {
    ...SELF,
    accountBases: {
      install: true,
      install_account: "111122223333",
      region: "us-east-1",
      bases: [
        {
          arn: ARN,
          id: "ABCDE12345",
          name: "support-answers",
          description: "Support articles",
          status: "ACTIVE",
          updated_at: "",
        },
      ],
      list_error: null,
    },
  });
  await page.goto("/knowledge/bedrock/");
  await page.getByRole("checkbox", { name: /Runbooks/ }).check();
  await page.getByTestId("sync-ack").check();
  await page.getByRole("button", { name: "An existing one" }).click();
  await expect(page.getByTestId("setup-needs")).toHaveText(
    "Pick a knowledge base from the list.",
  );
  await page.getByRole("radio", { name: /support-answers/ }).check();
  await page.getByTestId("setup-aws").click();
  expect(
    db.bodies.find((b) => b.call === "POST /api/knowledge/bedrock-sync/setup")
      ?.body,
  ).toEqual({
    bases: ["kb_ops"],
    acknowledged: true,
    create_knowledge_base: false,
    knowledge_base_id: "ABCDE12345",
  });
  await expect(page.getByTestId("setup-step-2")).toContainText(
    "Data source ready",
  );
});

test("self-hosted: when the list can't be read, the fields stay available", async ({
  page,
}) => {
  await mockApi(page, {
    ...SELF,
    accountBases: {
      install: true,
      install_account: "111122223333",
      region: "us-east-1",
      bases: null,
      list_error: {
        message: "This install's role can't list knowledge bases yet.",
        fix: "It arrives with the next version update.",
        code: "access",
      },
    },
  });
  await page.goto("/knowledge/bedrock/");
  await page.getByRole("button", { name: "An existing one" }).click();
  await expect(page.getByTestId("existing-error")).toContainText(
    "can't list knowledge bases yet",
  );
  await page
    .getByTestId("existing-error")
    .getByRole("button", { name: "Enter it yourself" })
    .click();
  await expect(page.getByTestId("manual-fields")).toBeVisible();
});

test("self-hosted without the one-click stack: the outputs are entered by hand", async ({
  page,
}) => {
  const db = await mockApi(page, {
    selfHosted: true,
    oneClick: {
      available: false,
      reason:
        "This install's release doesn't publish the export stack's template.",
    },
  });
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("one-click-unavailable")).toContainText(
    "doesn't publish the export stack's template",
  );
  await expect(
    page.getByRole("button", { name: "Enter it yourself" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByTestId("s3-bucket")
    .fill("coderhelm-prod-kb-export-111122223333");
  await page.getByRole("checkbox", { name: /Runbooks/ }).check();
  await page.getByTestId("sync-ack").check();
  await page.getByTestId("sync-save").click();
  await expect(page.getByTestId("sync-note")).toBeVisible();
  const sent = db.bodies.find(
    (b) => b.call === "PUT /api/knowledge/bedrock-sync",
  )?.body as Record<string, unknown>;
  expect(sent.target).toMatchObject({
    kind: "s3",
    bucket: "coderhelm-prod-kb-export-111122223333",
    prefix: "coderhelm/",
  });
});

// Screenshots of every state, at 1280 and 400 wide: only when E2E_SHOTS_DIR is set.
const SHOTS = process.env.E2E_SHOTS_DIR;
test("screenshots of every state", async ({ page }) => {
  test.skip(!SHOTS, "E2E_SHOTS_DIR not set");
  test.setTimeout(240_000);
  fs.mkdirSync(SHOTS!, { recursive: true });
  const db = await mockApi(page, SELF);
  const shoot = async (name: string) => {
    for (const width of [1280, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      await page.screenshot({
        path: path.join(SHOTS!, `${name}-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  };
  const shootDialog = async (name: string, testId: string) => {
    for (const width of [1280, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      if (testId === "setup-progress") await unstick();
      await page
        .getByTestId(testId)
        .screenshot({ path: path.join(SHOTS!, `${name}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  };
  const shootSection = async (name: string, selector: string) => {
    for (const width of [1280, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      await unstick();
      await page
        .locator(selector)
        .screenshot({ path: path.join(SHOTS!, `${name}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  };
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("gateway-setup")).toBeVisible();
  // The top bar stays at the top of a stitched element screenshot.
  const unstick = () =>
    page.addStyleTag({ content: ".sticky{position:relative!important}" });
  await shoot("01-page");
  await page.getByTestId("new-key").click();
  await page.getByTestId("kb-all").check();
  await page.getByRole("checkbox", { name: /Legal/ }).uncheck();
  await shootDialog("02-new-connection", "new-key-dialog");
  await page.getByRole("button", { name: "Create connection" }).click();
  await page.getByTestId("test-connection").click();
  await expect(page.getByTestId("test-result")).toBeVisible();
  await shootDialog("03-connection-made", "key-made");
  await page.getByRole("button", { name: "Done" }).click();
  await shootSection("04-connections", "#live");
  await page
    .getByRole("checkbox", { name: /Runbooks/ })
    .last()
    .check();
  await page.getByTestId("sync-ack").check();
  await shootSection("05-copy-ready", "#copy");
  for (const st of ["waiting", "started", "bucket"]) {
    db.setup = setupView(st);
    await page.reload();
    await expect(page.getByTestId("setup-progress")).toBeVisible();
    await shootDialog(`06-progress-${st}`, "setup-progress");
  }
  db.sync = {
    ...OFF,
    enabled: true,
    bases: ["kb_ops"],
    target: {
      kind: "s3",
      bucket: "coderhelm-prod-kb-export-111122223333",
      prefix: "coderhelm/",
      region: "us-east-1",
      knowledge_base_arn: ARN,
      data_source_id: "DS12345678",
    },
    status: status({ syncing: true }),
  };
  db.setup = setupView("ready");
  await page.reload();
  await shootSection("07-ready", "#copy");
  db.sync = OFF;
  db.setup = setupView("failed", {
    message:
      "The stack failed: VectorBucket: S3 Vectors isn't available in eu-west-3. S3 Vectors may not be available in this region: choose Use an existing knowledge base, or run the install in a region that has it.",
  });
  await page.reload();
  await shootDialog("08-failed", "setup-progress");
  db.setup = null;
  db.accountBases = {
    install: true,
    install_account: "111122223333",
    region: "us-east-1",
    bases: [
      {
        arn: ARN,
        id: "ABCDE12345",
        name: "support-answers",
        description: "Support articles",
        status: "ACTIVE",
        updated_at: "",
      },
    ],
    list_error: null,
  };
  await page.reload();
  await page.getByRole("button", { name: "An existing one" }).click();
  await expect(page.getByTestId("existing-picker")).toBeVisible();
  await shootSection("09-existing", "#copy");
  await page.getByRole("button", { name: "Enter it yourself" }).click();
  await shootSection("10-manual", "#copy");
});
