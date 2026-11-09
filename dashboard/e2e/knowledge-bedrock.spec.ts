import { expect, test, type Page, type Route } from "@playwright/test";

// A Bedrock knowledge base connected in place: the tile in the add flow,
// pasting an ARN (hosted) or picking one of the install's own (self-hosted),
// the test search's failures in plain words (with the one-click grant), and
// the base page that says it is searched live and holds no files. Every API
// call is answered here; nothing reaches a real backend or AWS.

const ARN = "arn:aws:bedrock:us-east-1:111122223333:knowledge-base/ABCDE12345";
const OWN_ARN = "arn:aws:bedrock:us-east-1:444455556666:knowledge-base/RUNBOOKS01";

const LIMITS = {
  max_file_bytes: 25 * 1024 * 1024,
  max_files: 500,
  extensions: ["pdf", "md"],
  agents: [{ key: "coder", label: "Coder" }],
  read_roles: ["viewer", "member", "admin"],
};

interface Mock {
  /** A self-hosted install listing its own account. */
  install: boolean;
  /** What each POST /api/knowledge with `connect` answers, in turn. */
  answers: { status: number; body: Record<string, unknown> }[];
  /** What a connection check answers. */
  check: { status: number; body: Record<string, unknown> };
  bases: Record<string, unknown>[];
  bodies: Record<string, unknown>[];
  calls: string[];
}

const remoteBase = (over: Record<string, unknown> = {}) => ({
  id: "kb_aws",
  name: "Runbooks in AWS",
  description: "",
  read_role: "viewer",
  attach_team: true,
  agents: [],
  authoritative: false,
  created_at: "2026-11-08T10:00:00Z",
  updated_at: "2026-11-08T10:00:00Z",
  files: 0,
  ready: 0,
  processing: 0,
  failed: 0,
  uploads: 0,
  synced: 0,
  kinds: [],
  sources: [],
  backend: { kind: "remote", provider: "bedrock_kb", label: "Bedrock knowledge base", target: ARN, region: "us-east-1", account: "111122223333", access: "account", hybrid: true },
  ...over,
});

async function mockApi(page: Page, init: Partial<Mock> = {}): Promise<Mock> {
  const db: Mock = {
    install: false,
    answers: [],
    check: { status: 200, body: { ok: true, hybrid: true, checked_at: "2026-11-08T10:05:00Z" } },
    bases: [],
    bodies: [],
    calls: [],
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/knowledge" && method === "GET") return json(route, { bases: db.bases, can_manage: true, limits: LIMITS });
    if (p === "/api/knowledge" && method === "POST") {
      const a = db.answers.shift() ?? { status: 200, body: {} };
      if (a.status !== 200) return json(route, a.body, a.status);
      const b = remoteBase({ name: body.name, ...(db.install ? { backend: { ...remoteBase().backend, target: OWN_ARN, account: "444455556666", access: "install" } } : {}) });
      db.bases.push(b);
      return json(route, { base: b, source: null, setup: null });
    }
    if (p === "/api/knowledge/bedrock") {
      return json(route, {
        install: db.install,
        install_account: db.install ? "444455556666" : "",
        region: "us-east-1",
        bases: db.install
          ? [
              { arn: OWN_ARN, id: "RUNBOOKS01", name: "Ops runbooks", description: "On-call and incident runbooks", status: "ACTIVE", updated_at: "2026-11-01T00:00:00Z" },
              { arn: "arn:aws:bedrock:us-east-1:444455556666:knowledge-base/POLICIES01", id: "POLICIES01", name: "Policies", description: "", status: "ACTIVE", updated_at: "2026-10-01T00:00:00Z" },
            ]
          : null,
        list_error: null,
        accounts: db.install ? [] : [{ account: "111122223333", region: "us-east-1" }],
        connected: db.bases.map((b) => (b.backend as { target: string }).target),
      });
    }
    if (p === "/api/knowledge/connectors") return json(route, { connectors: [], visibility_note: "" });
    const one = p.match(/^\/api\/knowledge\/([^/]+)$/);
    if (one && method === "GET") {
      const b = db.bases.find((x) => x.id === one[1]);
      if (!b) return json(route, { error: "No such knowledge base." }, 404);
      return json(route, { base: b, files: [], sources: [], can_manage: true, limits: LIMITS, visibility_note: "" });
    }
    if (/^\/api\/knowledge\/[^/]+\/check$/.test(p)) return json(route, db.check.body, db.check.status);
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

test.describe("a Bedrock knowledge base, connected in place", () => {
  test("hosted: paste the ARN, the role's refusal comes back in plain words with the grant, then it connects", async ({ page }) => {
    const db = await mockApi(page, {
      answers: [
        {
          status: 400,
          body: {
            error: "The role in your account does not allow Retrieve on this knowledge base.",
            fix: "Give the role bedrock:Retrieve and bedrock:GetDocumentContent on this knowledge base (the CoderHelmLogReader update does it), then try again.",
            code: "access",
            grant: { url: "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=CoderHelmLogReaderUpdate-abcd1234-kb0a1b2c", stack_name: "CoderHelmLogReaderUpdate-abcd1234-kb0a1b2c", account: "111122223333" },
          },
        },
      ],
    });
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    const flow = page.getByTestId("add-flow");
    const tile = flow.getByTestId("tile-bedrock_kb");
    await expect(tile).toContainText("Bedrock knowledge base");
    await expect(tile).toContainText("searched live in your AWS account, nothing copied");
    await tile.click();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "bedrock");
    // Hosted: nothing to list, the ARN is pasted.
    await expect(flow.getByTestId("bedrock-list")).toHaveCount(0);
    const input = flow.getByTestId("bedrock-arn");
    await input.fill("arn:aws:bedrock:us-east-1:111122223333:agent/ABCDE12345");
    await expect(flow.getByTestId("bedrock-arn-bad")).toContainText("That isn't a knowledge base ARN");
    await expect(page.getByTestId("flow-continue")).toBeDisabled();
    // An account nobody connected is said before anything is sent.
    await input.fill("arn:aws:bedrock:us-east-1:999988887777:knowledge-base/ABCDE12345");
    await expect(flow.getByTestId("bedrock-account-missing")).toContainText("AWS account 999988887777 isn't connected");
    await input.fill(ARN);
    await expect(flow.getByTestId("bedrock-account-missing")).toHaveCount(0);
    await page.getByTestId("flow-continue").click();

    await expect(page.getByTestId("connect-summary")).toContainText("Connected in place: searched live in your AWS account, nothing copied.");
    await expect(page.getByTestId("visibility-note")).toContainText("sees what a search of it returns");
    await page.getByTestId("flow-name").fill("Runbooks in AWS");
    await page.getByTestId("flow-finish").click();
    const problem = page.getByTestId("connect-problem");
    await expect(problem).toHaveAttribute("data-code", "access");
    await expect(problem).toContainText("The role in your account does not allow Retrieve on this knowledge base.");
    await expect(problem.getByTestId("connect-grant")).toHaveAttribute("href", /stackName=CoderHelmLogReaderUpdate-abcd1234-kb0a1b2c/);
    await expect(problem).toContainText("Sign in to AWS account 111122223333");
    const sent = db.bodies.find((b) => b.call === "POST /api/knowledge")!;
    expect(sent.connect).toEqual({ provider: "bedrock_kb", target: ARN });
    expect(sent.source).toBeUndefined();

    // After the update stack, connecting again works and opens the base.
    await page.getByTestId("flow-finish").click();
    await expect(page).toHaveURL(/\/knowledge\/base\/\?id=kb_aws/);
    await expect(page.getByTestId("connected-line")).toHaveText("Connected in place: searched live in your AWS account, nothing copied");
  });

  test("self-hosted: the install's own knowledge bases are listed, and an unapplied access stack is said plainly", async ({ page }) => {
    await mockApi(page, {
      install: true,
      answers: [
        {
          status: 400,
          body: {
            error: "This install's permission limit doesn't allow searching Bedrock knowledge bases yet: the release that searches them needs a permission change an AWS admin hasn't applied.",
            fix: "An AWS admin applies the pending permission change: Settings, System, Version, Permissions (one link to the AWS console). Nothing else waits on it.",
            code: "boundary",
            grant: null,
          },
        },
      ],
    });
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await page.getByTestId("tile-bedrock_kb").click();
    const list = page.getByTestId("bedrock-list");
    await expect(list).toContainText("In this install's account (us-east-1)");
    await expect(list.getByTestId("bedrock-option")).toHaveCount(2);
    await list.getByTestId("bedrock-option").filter({ hasText: "Ops runbooks" }).click();
    await expect(page.getByTestId("bedrock-arn")).toHaveValue(OWN_ARN);
    await page.getByTestId("flow-continue").click();
    // Named after the knowledge base picked.
    await expect(page.getByTestId("flow-name")).toHaveValue("Ops runbooks");
    await page.getByTestId("flow-finish").click();
    const problem = page.getByTestId("connect-problem");
    await expect(problem).toHaveAttribute("data-code", "boundary");
    await expect(problem).toContainText("an AWS admin hasn't applied");
    await expect(problem).toContainText("Settings, System, Version, Permissions");
    await expect(problem.getByTestId("connect-grant")).toHaveCount(0);
  });

  test("the base page: searched live, no files, no adding, and a connection check", async ({ page }) => {
    const db = await mockApi(page, { bases: [remoteBase()] });
    await page.goto("/knowledge/");
    await expect(page.getByTestId("knowledge-size")).toHaveText("Connected in place, searched live in AWS");
    await page.goto("/knowledge/base/?id=kb_aws");
    const card = page.getByTestId("connected-in-place");
    await expect(card.getByTestId("connected-line")).toHaveText("Connected in place: searched live in your AWS account, nothing copied");
    await expect(card.getByTestId("connected-arn")).toHaveText(ARN);
    await expect(card.getByTestId("connected-access")).toContainText("CoderHelmLogReader role in that account, with your team's private ID");
    // No file list, no uploads, no adding apps.
    await expect(page.getByTestId("items")).toHaveCount(0);
    await expect(page.getByTestId("items-empty")).toHaveCount(0);
    await expect(page.getByTestId("uploads-card")).toHaveCount(0);
    await expect(page.getByTestId("add-source")).toHaveCount(0);
    await expect(page.getByTestId("upload-input")).toHaveCount(0);

    await card.getByTestId("check-connection").click();
    await expect(card.getByTestId("check-ok")).toContainText("The connection works.");
    expect(db.calls).toContain("POST /api/knowledge/kb_aws/check");
    // A check that fails says why and what to do.
    db.check = { status: 400, body: { error: "The role in your account does not allow Retrieve on this knowledge base.", fix: "Give the role bedrock:Retrieve.", code: "access", grant: null } };
    await card.getByTestId("check-connection").click();
    await expect(card.getByTestId("connect-problem")).toContainText("does not allow Retrieve on this knowledge base");
  });

  test("adding to an existing knowledge base never offers Bedrock (it is a whole base, connected in place)", async ({ page }) => {
    await mockApi(page, {
      bases: [{ ...remoteBase(), id: "kb_local", name: "Handbook", backend: { kind: "local" } }],
    });
    await page.goto("/knowledge/base/?id=kb_local");
    await page.getByTestId("add-source").click();
    await expect(page.getByTestId("choose-step")).toBeVisible();
    await expect(page.getByTestId("tile-bedrock_kb")).toHaveCount(0);
  });

  test("phone width: the connected page and the ARN step never scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mockApi(page, { bases: [remoteBase()] });
    await page.goto("/knowledge/base/?id=kb_aws");
    await expect(page.getByTestId("connected-in-place")).toBeVisible();
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await over()).toBeLessThanOrEqual(0);
    await page.goto("/knowledge/");
    await page.getByTestId("new-knowledge").click();
    await page.getByTestId("tile-bedrock_kb").click();
    await page.getByTestId("bedrock-arn").fill(ARN);
    expect(await over()).toBeLessThanOrEqual(0);
  });
});
