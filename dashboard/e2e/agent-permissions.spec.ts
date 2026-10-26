import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Agent permissions: the settings page (presets, rules, the "test a call"
// box, pause all agents), approval cards on the run page and in the plan
// chat, and the sign-in card with its popup. Every API call is answered
// here; the OAuth sign-in page is this dashboard's own callback page, so
// nothing leaves the machine.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const RUN_ID = "01RUNAGENTS0000000000000001";
const AGENT_ROWS = [
  ["planner", "Planner"], ["coder", "Coder"], ["reviewer", "Reviewer"], ["plan_chat", "Plan chat"],
  ["brain_chat", "Chat"], ["alert_fixer", "Alert fixer"], ["log_autofix", "Log auto-fix"], ["plugin", "Plugin runs"],
] as const;

interface Rule {
  id: string;
  scope: string;
  decision: string;
  [k: string]: unknown;
}

interface Backend {
  version: number;
  autonomy: string;
  preset: string | null;
  rules: Rule[];
  paused: { reason: string; by: string; at: string; until?: string } | null;
  teamOff: string[];
  approvals: Record<string, unknown>[];
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
  chatPosts: { messages: { role: string; content: string }[] }[];
  connected: boolean;
}

const standardRules = (): Rule[] => [
  { id: "preset_write_allow", scope: "team", risk: "write", decision: "allow", source: "preset", note: "Standard: work on the agent's branch runs on its own." },
  { id: "preset_consequential_ask", scope: "team", risk: "consequential", decision: "ask", source: "preset", note: "Standard: actions that reach people ask." },
];

const approval = (over: Record<string, unknown> = {}) => ({
  id: "ap_1",
  status: "pending",
  agent: "coder",
  kind: "mcp",
  tool: "linear__create_issue",
  server: "linear",
  repo: "acme/web",
  run_id: RUN_ID,
  args: { title: "Flaky checkout test", team: "WEB", api_token: "(hidden)" },
  args_hash: "h1",
  risk: "write",
  why: "Track the flaky test so it gets fixed.",
  asked_because: { by: "default", risk: "write" },
  reason: "Changes ask by default.",
  created_at: new Date(Date.now() - 60_000).toISOString(),
  expires_at: new Date(Date.now() + 14 * 60_000).toISOString(),
  ...over,
});

function view(db: Backend, role: string) {
  const edit = role === "admin" || role === "owner";
  return {
    policy: {
      version: db.version,
      autonomy: db.autonomy,
      rules: db.rules,
      switches: { team_off: db.teamOff, repo_off: {} },
      pause: db.paused,
      sandbox: {
        commands: { "acme/web": [{ command: "npm run build", added_by: "admin@example.com", origin: "manual" }] },
        suggestions: { "acme/web": [{ command: "npm run test:unit", origin: "CI workflow" }] },
        egress: ["registry.npmjs.org", "github.com"],
        limit_egress: true,
      },
      ask_timeout_secs: 900,
    },
    agents: AGENT_ROWS.map(([key, label]) => ({ key, label, summary: `What the ${label.toLowerCase()} does.`, on: !db.teamOff.includes(key), repos_off: [] })),
    preset: db.preset,
    paused: db.paused,
    pending: db.approvals.filter((a) => a.status === "pending").length,
    kinds: ["tool", "mcp", "data_source", "command", "egress", "outbound"],
    default_egress: ["registry.npmjs.org", "pypi.org", "github.com"],
    can: { edit, approve: role !== "viewer" },
  };
}

async function mockApi(page: Page, role = "admin", init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    version: 3, autonomy: "standard", preset: "standard", rules: standardRules(), paused: null, teamOff: [],
    approvals: [approval()], calls: [], chatPosts: [], connected: false, ...init,
  };
  const caps =
    role === "viewer"
      ? ["view", "view_team", "own_account"]
      : role === "member"
        ? ["view", "view_team", "own_account", "plans", "runs", "mcp_connect", "agents.approve"]
        : ["view", "view_team", "own_account", "plans", "runs", "mcp_connect", "agents.approve", "agents.permissions", "integrations"];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  // On the context, so the sign-in popup is answered too.
  await page.context().route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.context().route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method: m, path: p, body });
    if (p === "/api/me") return json(route, { user_id: "u1", team_id: "t_1", github_login: null, email: `${role}@example.com`, avatar_url: "", role, capabilities: caps });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web", enabled: true, ticket_source: "github" }, { name: "acme/api", enabled: true, ticket_source: "github" }] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/integrations/jira/check") return json(route, { ready: false, secret_configured: false, configured_repos: { total: 0, enabled: 0 }, enabled_repos: [], jira_events_seen: false, installation_id: 1 });
    if (p === "/api/settings/workflow") return json(route, { commit_openspec: false, default_destination: "github", allow_plan_log_analyzer: false });
    if (p === "/api/templates" || p === "/api/plans/templates") return json(route, { templates: [] });

    // Agent permissions.
    const bump = () => {
      db.version += 1;
      return json(route, view(db, role));
    };
    if (p === "/api/agents/policy" && m === "GET") return json(route, view(db, role));
    if (p === "/api/agents/policy/preset" && m === "POST") {
      db.preset = String(body?.preset);
      db.rules = db.rules.filter((r) => r.source !== "preset");
      if (db.preset === "cautious") db.rules.push({ id: "preset_write_ask", scope: "team", risk: "write", decision: "ask", source: "preset", note: "Cautious: every change asks." });
      else db.rules.push(...standardRules());
      return bump();
    }
    if (p === "/api/agents/policy/rules" && m === "POST") {
      db.rules.push({ ...(body?.rule as Rule), id: `r_${db.rules.length}`, source: "manual", created_by: `${role}@example.com` });
      return bump();
    }
    if (p.startsWith("/api/agents/policy/rules/") && m === "DELETE") {
      db.rules = db.rules.filter((r) => r.id !== decodeURIComponent(p.split("/").pop() ?? ""));
      return bump();
    }
    if (p === "/api/agents/policy/switches" && m === "PUT") {
      const a = String(body?.agent);
      db.teamOff = body?.on ? db.teamOff.filter((x) => x !== a) : [...db.teamOff, a];
      return bump();
    }
    if (p === "/api/agents/policy" && m === "PUT") {
      if (body?.autonomy) db.autonomy = String(body.autonomy);
      return bump();
    }
    if (p === "/api/agents/pause" && m === "POST") {
      db.paused = { reason: String(body?.reason ?? ""), by: `${role}@example.com`, at: new Date().toISOString(), until: (body?.until as string) || undefined };
      return bump();
    }
    if (p === "/api/agents/pause" && m === "DELETE") {
      db.paused = null;
      db.version += 1;
      return json(route, { ...view(db, role), resumed: 2 });
    }
    if (p === "/api/agents/policy/test" && m === "POST") {
      const tool = String(body?.tool ?? "");
      const linear = tool.startsWith("linear__");
      return json(route, {
        call: { agent: body?.agent, kind: linear ? "mcp" : "tool", tool, server: linear ? "linear" : undefined, repo: body?.repo },
        risk: "write",
        verdict: linear
          ? { decision: "deny", risk: "write", decided_by: { by: "rule", id: "r_x", scope: "repo", label: "Rule for acme/web: deny MCP tools on linear named create_*" }, reason: "Rule for acme/web: deny MCP tools on linear named create_*" }
          : { decision: "allow", risk: "write", decided_by: { by: "rule", id: "preset_write_allow", scope: "team", label: "Team rule: allow everything of write risk" }, reason: "Team rule: allow everything of write risk" },
        considered: [
          { id: "preset_write_allow", label: "Team rule: allow everything of write risk", matched: true, note: "matches: allow" },
          { id: "r_x", label: "Rule for acme/web: deny MCP tools on linear named create_*", matched: linear, note: linear ? "matches: deny" : "no match: another tool" },
        ],
      });
    }
    if (p === "/api/agents/approvals" && m === "GET") {
      const runId = url.searchParams.get("run_id");
      const status = url.searchParams.get("status");
      const list = db.approvals.filter((a) => (!runId || a.run_id === runId) && (status === "all" || a.status === "pending"));
      return json(route, { approvals: list, can: { approve: role !== "viewer", always: role === "admin" || role === "owner" } });
    }
    const decide = p.match(/^\/api\/agents\/approvals\/([^/]+)\/decide$/);
    if (decide && m === "POST") {
      const a = db.approvals.find((x) => x.id === decide[1]);
      if (!a) return json(route, { error: "That approval doesn't exist." }, 404);
      Object.assign(a, { status: body?.approve ? "approved" : "denied", choice: body?.choice ?? "once", decided_by: `${role}@example.com`, decided_via: body?.via, note: body?.note ?? "" });
      return json(route, { approval: a });
    }
    if (p.startsWith("/api/agents/approvals/") && m === "GET") {
      const a = db.approvals.find((x) => x.id === p.split("/").pop());
      return a ? json(route, { approval: a, can: { approve: true, always: true } }) : json(route, { error: "Not found" }, 404);
    }
    if (p === "/api/agents/activity") return json(route, { events: [{ id: "e1", at: new Date().toISOString(), actor: "agent:coder", actor_kind: "agent", action: "tool.queued_for_approval", tool: "linear__create_issue", result: "waiting", detail: "Changes ask by default.", policy: { decision: "ask" } }] });
    if (p === "/api/agents/sign-in/decline" && m === "POST") return json(route, { declined: true });

    // The run page.
    if (p === `/api/runs/${RUN_ID}`) {
      return json(route, {
        run_id: RUN_ID, title: "Fix the flaky checkout test", status: "running", repo: "acme/web", ticket_id: "WEB-12", ticket_source: "github",
        created_at: new Date(Date.now() - 600_000).toISOString(), current_pass: "implement", pass_history: [], sign_in_prompts: [],
      });
    }
    if (p.startsWith(`/api/runs/${RUN_ID}/`)) return json(route, { traces: [], log: [], openspec: null });

    // The plan chat, and the MCP sign-in its card starts.
    if (p === "/api/plans/chat/token") return json(route, { token: "t" });
    if (p === "/api/plans/chat/stream" && m === "POST") {
      const chat = (body ?? { messages: [] }) as { messages: { role: string; content: string }[] };
      db.chatPosts.push(chat);
      const last = (chat.messages[chat.messages.length - 1]?.content ?? "").toLowerCase();
      const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      const stream = (s: string) => route.fulfill({ status: 200, contentType: "text/event-stream", body: s });
      if (last.includes("approved it")) return stream(ev("text_delta", { text: "Done: I filed the issue." }) + ev("done", {}));
      if (last.includes("connected figma")) return stream(ev("text_delta", { text: "Thanks. The design uses a two-column grid." }) + ev("done", {}));
      if (last.includes("design")) {
        return stream(
          ev("tool_start", { id: "s1", name: "request_sign_in" }) +
            ev("sign_in", { thread_id: "chat-1", prompt: { server_id: "figma", server_name: "Figma", need: "personal", message: "Sign in to Figma to let me read this file.", action_label: "Connect", action_path: "/api/mcp-servers/figma/connect", link_path: "/settings/integrations/#mcp-servers" } }) +
            ev("tool_result", { id: "s1", name: "request_sign_in", status: "error", summary: "Sign-in needed" }) +
            ev("text_delta", { text: "I'll continue once you connect Figma." }) +
            ev("done", {}),
        );
      }
      if (last.includes("file")) {
        db.approvals = [approval({ id: "ap_chat", run_id: undefined, thread_id: "chat-1", agent: "plan_chat", repo: undefined })];
        return stream(
          ev("tool_start", { id: "t1", name: "linear__create_issue" }) +
            ev("approval", { approval: db.approvals[0] }) +
            ev("tool_result", { id: "t1", name: "linear__create_issue", status: "error", summary: "Needs approval" }) +
            ev("text_delta", { text: "I'd like to file an issue in Linear. Approve the card and I'll go ahead." }) +
            ev("done", {}),
        );
      }
      return stream(ev("text_delta", { text: "Hello." }) + ev("done", {}));
    }
    if (p === "/api/mcp-servers/figma/connect" && m === "POST") {
      // The "authorization server" is the dashboard's own callback page.
      return json(route, { authorize_url: `${url.origin}/settings/integrations/mcp-callback/?state=st_1&code=c_1` });
    }
    if (p === "/api/mcp-servers/oauth/callback" && m === "POST") {
      db.connected = true;
      return json(route, { server: { id: "figma", name: "Figma", catalog_id: "figma" }, tools_error: null });
    }
    return json(route, { error: `Not mocked: ${m} ${p}` }, 404);
  });
  return db;
}

function shot(name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  return path.join(SHOTS_DIR, name);
}

test("the permissions page shows agents, presets, rules and a working test box", async ({ page }) => {
  const db = await mockApi(page, "admin");
  await page.goto("/settings/agents?tab=agents");
  await expect(page.getByTestId("agent-permissions-page")).toBeVisible();
  await expect(page.getByTestId("agent-switches").getByRole("switch")).toHaveCount(8);
  await expect(page.getByTestId("presets").getByText("In use")).toBeVisible();

  // A preset replaces only the preset rules.
  await page.getByRole("button", { name: "Use Cautious" }).click();
  await expect.poll(() => db.calls.some((c) => c.path === "/api/agents/policy/preset" && c.body?.preset === "cautious" && c.body?.version === 3)).toBe(true);

  // Switching an agent off sends the version read.
  await page.getByRole("switch", { name: "Plugin runs on for the team" }).click();
  await expect.poll(() => db.calls.some((c) => c.path === "/api/agents/policy/switches" && c.body?.agent === "plugin" && c.body?.on === false)).toBe(true);
  await expect(page.getByRole("switch", { name: "Plugin runs off for the team" })).toHaveAttribute("aria-checked", "false");

  // Rules, the test box and the sandbox are under Advanced.
  await page.getByRole("navigation", { name: "Agent permissions" }).getByRole("link", { name: "Advanced" }).click();
  await expect(page).toHaveURL(/tab=advanced/);
  await expect(page.getByTestId("rules-list").getByText("Cautious: every change asks.")).toBeVisible();

  // Add a repository rule.
  await page.getByTestId("add-rule").click();
  const dialog = page.getByRole("dialog", { name: "Add a rule" });
  await dialog.getByRole("button", { name: "Repository", exact: true }).click();
  await dialog.getByRole("button", { name: /Repository/ }).nth(1).click();
  await dialog.getByRole("option", { name: "acme/web", exact: true }).click();
  await dialog.getByLabel("Server or data source").fill("linear");
  await dialog.getByLabel("Tool name").fill("create_*");
  await dialog.getByRole("button", { name: "Deny" }).click();
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await expect.poll(() => db.calls.find((c) => c.path === "/api/agents/policy/rules")?.body?.rule).toMatchObject({ scope: "repo", repo: "acme/web", server: "linear", tool: "create_*", decision: "deny" });

  await expect(dialog).toBeHidden();
  await page.getByRole("group", { name: "Rules for" }).getByRole("button", { name: "Repository" }).click();
  await expect(page.getByTestId("rules-list").getByTestId("rule-row")).toHaveCount(1);
  await expect(page.getByTestId("rules-list")).toContainText("named create_*");

  // The test box names the rule that decides.
  const box = page.getByTestId("test-call");
  await box.getByLabel("Tool name").fill("linear__create_issue");
  await expect(box.getByLabel("Tool name")).toHaveValue("linear__create_issue");
  await box.getByRole("button", { name: "Test" }).click();
  const result = box.getByTestId("test-result");
  await expect(result).toHaveAttribute("data-decision", "deny");
  await expect(result).toContainText("Decided by: Rule for acme/web: deny MCP tools on linear named create_*");
  await result.getByText(/Every rule looked at/).click();
  await expect(result.getByText("no match", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: shot("agent-permissions-desktop.png"), fullPage: true });
});

test("a viewer sees the page read only and can still test a call", async ({ page }) => {
  await mockApi(page, "viewer");
  await page.goto("/settings/agents");
  await expect(page.getByText("Changing them needs permission to edit agent permissions.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause all agents" })).toHaveCount(0);
  await expect(page.getByTestId("approval-queue").getByText("Someone who can approve agent actions needs to answer this.")).toBeVisible();
  await page.goto("/settings/agents?tab=agents");
  await expect(page.getByRole("switch").first()).toBeDisabled();
  await page.goto("/settings/agents?tab=advanced");
  await expect(page.getByTestId("add-rule")).toHaveCount(0);
  const box = page.getByTestId("test-call");
  await box.getByLabel("Tool name").fill("write_file");
  await box.getByRole("button", { name: "Test" }).click();
  await expect(box.getByTestId("test-result")).toHaveAttribute("data-decision", "allow");
});

test("the page splits into Approvals, Agents and Advanced, and a switch can be undone", async ({ page }) => {
  const db = await mockApi(page, "admin");
  await page.goto("/settings/agents");
  const tabs = page.getByRole("navigation", { name: "Agent permissions" });
  await expect(tabs.getByRole("link", { name: /Approvals/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("approval-queue")).toBeVisible();
  // Rules and the sandbox are out of the way until Advanced is opened.
  await expect(page.getByTestId("rules-list")).toHaveCount(0);
  await expect(page.getByTestId("agent-switches")).toHaveCount(0);

  await tabs.getByRole("link", { name: "Agents" }).click();
  await expect(page.getByTestId("agent-switches")).toBeVisible();
  await page.getByRole("switch", { name: "Plugin runs on for the team" }).click();
  const toast = page.getByTestId("toast").filter({ hasText: "Plugin runs is off for the team." });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() => db.calls.filter((c) => c.path === "/api/agents/policy/switches" && c.body?.agent === "plugin").map((c) => c.body?.on))
    .toEqual([false, true]);

  // The sandbox saves its commands, domains and timeout with one bar.
  await tabs.getByRole("link", { name: "Advanced" }).click();
  await page.getByLabel("Approval timeout (minutes)").fill("30");
  const bar = page.getByRole("region", { name: "Save changes" });
  await expect(bar).toContainText("1 unsaved change");
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => db.calls.find((c) => c.path === "/api/agents/policy" && c.method === "PUT")?.body?.ask_timeout_secs).toBe(1800);
});

test("pause all agents shows the banner, and resume lifts it", async ({ page }) => {
  const db = await mockApi(page, "admin");
  await page.goto("/settings/agents");
  await page.getByTestId("pause-open").click();
  const dialog = page.getByRole("dialog", { name: "Pause all agents" });
  await dialog.getByLabel("Reason").fill("Release freeze");
  await dialog.getByRole("button", { name: "Pause all agents" }).click();
  await expect.poll(() => db.calls.find((c) => c.path === "/api/agents/pause" && c.method === "POST")?.body?.reason).toBe("Release freeze");
  const banner = page.getByTestId("pause-banner");
  await expect(banner).toContainText("All agents are paused");
  await expect(banner).toContainText("Release freeze");
  await expect(banner).toContainText("nothing is dropped");
  await banner.getByRole("button", { name: "Resume all agents" }).click();
  await expect(page.getByTestId("pause-banner")).toHaveCount(0);
  await expect(page.getByText("All agents are running.")).toBeVisible();
});

test("an approval card on the run page approves once, and a member can't choose always", async ({ page }) => {
  const db = await mockApi(page, "member");
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  const card = page.getByTestId("run-agent-asks").getByTestId("approval-card");
  await expect(card).toHaveAttribute("data-status", "pending");
  // Plain words first; the tool's own name is under Show details.
  await expect(card.getByTestId("approval-headline")).toHaveText("Coderhelm wants to create issue in Linear");
  await expect(card).toContainText("Why: Track the flaky test so it gets fixed.");
  await card.getByText("Show details").click();
  await expect(card).toContainText("Use create_issue on linear");
  await expect(card).toContainText("(hidden)");
  await expect(card.getByRole("button", { name: "Always allow this action" })).toHaveCount(0);
  await card.getByRole("button", { name: "Allow once" }).click();
  await expect.poll(() => db.calls.find((c) => /\/decide$/.test(c.path))?.body).toMatchObject({ approve: true, choice: "once", via: "run_page" });
  await expect(card.getByTestId("approval-decision")).toContainText("Approved once by member@example.com from the run page.");
});

test("an admin can deny with a note, or approve always from the queue", async ({ page }) => {
  const db = await mockApi(page, "admin", { approvals: [approval(), approval({ id: "ap_2", tool: "write_file", kind: "tool", server: undefined })] });
  await page.goto("/settings/agents?approval=ap_2");
  const queue = page.getByTestId("approval-queue");
  // By id, not position: the queue reloads after each answer and drops the answered card.
  const [first, second] = [queue.locator('[data-approval-id="ap_1"]'), queue.locator('[data-approval-id="ap_2"]')];
  await first.getByRole("button", { name: "Deny…" }).click();
  await first.getByLabel("Tell the agent why (optional)").fill("Not in this sprint");
  await first.getByRole("button", { name: "Deny", exact: true }).click();
  await expect.poll(() => db.calls.find((c) => c.path === "/api/agents/approvals/ap_1/decide")?.body).toMatchObject({ approve: false, note: "Not in this sprint" });
  await second.getByRole("button", { name: "Always allow in this project" }).click();
  await expect.poll(() => db.calls.find((c) => c.path === "/api/agents/approvals/ap_2/decide")?.body).toMatchObject({ approve: true, choice: "always_repo" });
});

test("the plan chat shows an approval card and carries on once it's approved", async ({ page }) => {
  const db = await mockApi(page, "member");
  await page.goto("/plans/new");
  await page.getByRole("textbox").first().fill("File an issue for the flaky test");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("approval-card");
  await expect(card.getByTestId("approval-headline")).toHaveText("Coderhelm wants to create issue in Linear");
  await card.getByRole("button", { name: "Allow once" }).click();
  await expect.poll(() => db.calls.find((c) => c.path === "/api/agents/approvals/ap_chat/decide")?.body).toMatchObject({ approve: true, via: "chat" });
  // The conversation is sent on by itself.
  await expect.poll(() => db.chatPosts.length).toBe(2);
  expect(db.chatPosts[1].messages.at(-1)?.content).toBe("I approved it. Go ahead.");
  await expect(page.getByText("Done: I filed the issue.")).toBeVisible();
});

test("the sign-in card connects in a popup and the chat continues by itself", async ({ page }) => {
  const db = await mockApi(page, "member");
  await page.goto("/plans/new");
  await page.getByRole("textbox").first().fill("Read the design file for the new page");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("sign-in-card");
  await expect(card).toContainText("Sign in to Figma to let me read this file.");
  await page.screenshot({ path: shot("agent-sign-in-card-desktop.png"), fullPage: true });
  const popupPromise = page.waitForEvent("popup");
  await card.getByRole("button", { name: "Connect Figma" }).click();
  const popup = await popupPromise;
  await popup.waitForEvent("close", { timeout: 30_000 });
  expect(db.connected).toBe(true);
  await expect(card).toHaveAttribute("data-state", "connected");
  await expect.poll(() => db.chatPosts.length).toBe(2);
  expect(db.chatPosts[1].messages.at(-1)?.content).toBe("I've connected Figma. Please continue.");
  await expect(page.getByText("The design uses a two-column grid.")).toBeVisible();
});

test("not now on a sign-in card is remembered for the conversation", async ({ page }) => {
  const db = await mockApi(page, "member");
  await page.goto("/plans/new");
  await page.getByRole("textbox").first().fill("Read the design file");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("sign-in-card");
  await card.getByRole("button", { name: "Not now" }).click();
  await expect.poll(() => db.calls.find((c) => c.path === "/api/agents/sign-in/decline")?.body).toMatchObject({ thread_id: "chat-1", server_id: "figma" });
  await expect(card).toContainText("You won't be asked again in this conversation.");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the permissions page and the cards fit a phone without sideways scrolling", async ({ page }) => {
    await mockApi(page, "admin", { paused: { reason: "Release freeze", by: "admin@example.com", at: new Date().toISOString() } });
    await page.goto("/settings/agents");
    await expect(page.getByTestId("pause-banner")).toBeVisible();
    await expect(page.getByTestId("approval-queue").getByTestId("approval-card")).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide).toBeLessThanOrEqual(1);
    await page.screenshot({ path: shot("agent-permissions-phone.png"), fullPage: true });

    await page.goto(`/runs/detail?id=${RUN_ID}`);
    await expect(page.getByTestId("run-agent-asks").getByTestId("approval-card")).toBeVisible();
    const wideRun = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wideRun).toBeLessThanOrEqual(1);
    await page.screenshot({ path: shot("agent-approval-run-phone.png"), fullPage: true });
  });
});
