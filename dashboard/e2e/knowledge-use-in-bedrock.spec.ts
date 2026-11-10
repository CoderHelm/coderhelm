import { expect, test, type Page, type Route } from "@playwright/test";

// Use in Bedrock: a knowledge key for AgentCore Gateway (shown once, with its
// client ID and the MCP address; revoking it), and copying chosen knowledge
// bases into a Bedrock knowledge base (the access warning must be confirmed,
// the status says what the last sync did, a role update is linked). Every API
// call is answered here; nothing reaches a real backend or AWS.

const ARN = "arn:aws:bedrock:us-east-1:111122223333:knowledge-base/ABCDE12345";
const CONNECT = {
  mcp_url: "https://api.example.org/mcp",
  scope: "knowledge:read",
  token_endpoint: "https://api.example.org/oauth/token",
  authorization_endpoint: "https://api.example.org/oauth/authorize",
  issuer: "https://api.example.org",
  discovery_url: "https://api.example.org/.well-known/oauth-authorization-server",
};
const TOKEN = "chkb_01jbkey0000000000000000001_" + "s".repeat(43);

interface Db {
  keys: Record<string, unknown>[];
  sync: Record<string, unknown>;
  selfHosted: boolean;
  roleUpdate: Record<string, unknown> | null;
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

async function mockApi(page: Page, init: Partial<Db> = {}): Promise<Db> {
  const db: Db = {
    keys: [],
    sync: { enabled: false, target: { kind: "none" }, bases: [], acknowledged_at: "", acknowledged_by: "", updated_at: "", updated_by: "", status: status() },
    selfHosted: false,
    roleUpdate: null,
    bodies: [],
    ...init,
  };
  const json = (route: Route, body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
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
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/knowledge/keys" && method === "GET")
      return json(route, {
        keys: db.keys,
        bases: [
          { id: "kb_ops", name: "Runbooks", named_readers: false },
          { id: "kb_legal", name: "Legal", named_readers: true },
        ],
        connect: CONNECT,
        limits: { max_keys: 25, max_expiry_days: 365 },
      });
    if (p === "/api/knowledge/keys" && method === "POST") {
      const key = {
        id: "01jbkey0000000000000000001",
        name: body?.name,
        hint: "chkb_01jbke...ssss",
        client_id: "chkbc_01jbkey0000000000000000001",
        bases: body?.bases,
        created_at: "2026-11-10T10:00:00Z",
        created_by: "admin@example.com",
        expires_at: null,
        last_used_at: null,
        revoked_at: null,
        revoked_by: null,
        status: "active",
      };
      db.keys = [key];
      return json(route, { key, token: TOKEN, connect: CONNECT });
    }
    if (p.startsWith("/api/knowledge/keys/") && method === "DELETE") {
      db.keys = db.keys.map((k) => ({ ...k, status: "revoked", revoked_at: "2026-11-10T10:05:00Z" }));
      return json(route, { status: "revoked", id: p.split("/").pop() });
    }
    if (p === "/api/knowledge/bedrock-sync" && method === "GET")
      return json(route, {
        sync: db.sync,
        bases: [
          { id: "kb_ops", name: "Runbooks", can_copy: true, named_readers: false, read_role: "member" },
          { id: "kb_aws", name: "In AWS already", can_copy: false, named_readers: false, read_role: "member" },
        ],
        self_hosted: db.selfHosted,
        warning: "A Bedrock knowledge base has no per-person access. Everyone with Bedrock access to it can read every document copied into it.",
        role_update: db.roleUpdate,
      });
    if (p === "/api/knowledge/bedrock-sync" && method === "PUT") {
      db.sync = { ...db.sync, enabled: body?.enabled, target: body?.target, bases: body?.bases, status: status({ syncing: false }) };
      db.roleUpdate = { url: "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate", stack_name: "CoderHelmLogReaderUpdate-x", account: "111122223333" };
      return json(route, { sync: db.sync, check: null, role_update: db.roleUpdate });
    }
    if (p === "/api/knowledge/bedrock-sync/run") return json(route, { status: "queued" });
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

test("a reply the page can't read shows an error, never a crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockApi(page);
  await page.route(
    (url) => url.pathname === "/api/knowledge/keys" || url.pathname === "/api/knowledge/bedrock-sync",
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ base: { id: "kb_x" } }) }),
  );
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("bedrock-page")).toBeVisible();
  await expect(page.getByText("answered in a form this page can't read").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a knowledge key is made for chosen bases, shown once with how to connect, and can be revoked", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("mcp-url")).toHaveText(CONNECT.mcp_url);
  await expect(page.getByTestId("no-keys")).toBeVisible();
  await page.getByTestId("new-key").click();
  const dialog = page.getByTestId("new-key-dialog");
  // Nothing to make until a base is picked; a base for named readers says who reads it then.
  await expect(dialog.getByRole("button", { name: "Make the key" })).toBeDisabled();
  await expect(dialog.getByText("Anyone who can use this key will read it.")).toBeVisible();
  await dialog.getByRole("checkbox", { name: /Runbooks/ }).check();
  await dialog.getByRole("button", { name: "Make the key" }).click();
  await expect(page.getByTestId("key-token")).toHaveText(TOKEN);
  await expect(page.getByTestId("key-made")).toContainText("chkbc_01jbkey0000000000000000001");
  expect(db.bodies.find((b) => b.call === "POST /api/knowledge/keys")?.body).toEqual({ name: "Bedrock agents", bases: ["kb_ops"], expires_in_days: 90 });
  await page.getByRole("button", { name: "Done" }).click();
  // The list never shows the key again, only its hint.
  await expect(page.getByTestId("key-row")).toContainText("chkb_01jbke...ssss");
  await expect(page.getByText(TOKEN)).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke" }).last().click();
  await expect(page.getByTestId("key-status")).toHaveText("Revoked");
});

test("copying needs the warning confirmed, sends only the chosen bases, and links the role update", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("sync-warning")).toContainText("no per-person access");
  // Hosted: no S3 folder, a custom data source.
  await expect(page.getByRole("radio", { name: /S3 folder/ })).toHaveCount(0);
  await page.getByTestId("custom-kb").fill(ARN);
  await page.getByTestId("custom-ds").fill("DS12345678");
  await page.getByRole("checkbox", { name: /Runbooks/ }).check();
  await expect(page.getByRole("checkbox", { name: /In AWS already/ })).toBeDisabled();
  await expect(page.getByTestId("sync-save")).toBeDisabled();
  await page.getByTestId("sync-ack").check();
  await page.getByTestId("sync-save").click();
  await expect(page.getByTestId("sync-note")).toContainText("The first sync has started.");
  expect(db.bodies.find((b) => b.call === "PUT /api/knowledge/bedrock-sync")?.body).toEqual({
    enabled: true,
    target: { kind: "custom", knowledge_base_arn: ARN, data_source_id: "DS12345678" },
    bases: ["kb_ops"],
    acknowledged: true,
  });
  await expect(page.getByTestId("role-update")).toContainText("SyncKnowledgeBases");
});

test("the status says what the last sync did, and its problems in plain words", async ({ page }) => {
  await mockApi(page, {
    sync: {
      enabled: true,
      target: { kind: "custom", knowledge_base_arn: ARN, data_source_id: "DS12345678" },
      bases: ["kb_ops"],
      acknowledged_at: "2026-11-10T09:00:00Z",
      acknowledged_by: "admin@example.com",
      updated_at: "2026-11-10T09:00:00Z",
      updated_by: "admin@example.com",
      status: status({ state: "partial", last_sync_at: new Date().toISOString(), documents: 41, added: 2, updated: 1, removed: 3, errors: ["runbook.md wasn't copied: Bedrock failed it (too large)."] }),
    },
  });
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByTestId("sync-state")).toHaveText("Synced, with problems");
  await expect(page.getByTestId("sync-documents")).toHaveText("41");
  await expect(page.getByText("2 added, 1 updated, 3 removed")).toBeVisible();
  await expect(page.getByTestId("sync-errors")).toContainText("runbook.md wasn't copied");
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("sync-note")).toContainText("A sync has started.");
});

test("a self-hosted install copies into an S3 folder its export stack makes", async ({ page }) => {
  const db = await mockApi(page, { selfHosted: true });
  await page.goto("/knowledge/bedrock/");
  await expect(page.getByRole("radio", { name: /S3 folder/ })).toBeChecked();
  await expect(page.getByTestId("template-link")).toHaveAttribute("href", /\/api\/knowledge\/bedrock-sync\/template$/);
  await page.getByTestId("s3-bucket").fill("coderhelm-prod-kb-export-111122223333");
  await page.getByRole("checkbox", { name: /Runbooks/ }).check();
  await page.getByTestId("sync-ack").check();
  await page.getByTestId("sync-save").click();
  await expect(page.getByTestId("sync-note")).toBeVisible();
  const sent = db.bodies.find((b) => b.call === "PUT /api/knowledge/bedrock-sync")?.body as Record<string, any>;
  expect(sent.target).toMatchObject({ kind: "s3", bucket: "coderhelm-prod-kb-export-111122223333", prefix: "coderhelm/" });
});
