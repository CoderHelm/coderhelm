import { expect, test, type Page } from "@playwright/test";
import { ACCOUNT, API, ROLE_ARN, SLACK_HOOK, TOPIC, WEB, callsTo, mockApi, shot } from "./settings-mock";
import { pickOption, expectSelectValue } from "./select";

// The settings pages on the shared settings pieces: one save bar per page,
// labelled fields, plain words. Every request body is checked exactly, so the
// redesign sends what the pages always sent.

const saveBar = (page: Page) => page.getByRole("region", { name: "Save changes" });
const saveChanges = (page: Page) => saveBar(page).getByRole("button", { name: "Save changes" });

// ── Workflow ─────────────────────────────────────────────────────────

test("workflow: pull request and plan settings save with one bar, each through its own request", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/workflow/");
  await expect(page.getByRole("heading", { level: 1, name: "Workflow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pull requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
  await expect(page.getByText(/openspec/i)).toHaveCount(0);
  await expect(page.getByText(/Log Analyzer/i)).toHaveCount(0);
  await expect(saveBar(page)).toHaveCount(0);
  await shot(page, "settings-workflow");

  await page.getByRole("switch", { name: "Add the plan to the pull request" }).click();
  await pickOption(page.getByLabel("Where plan tasks go"), "jira");
  await page.getByLabel("Branch name").fill("feature/{ticket}-{slug}");
  await expect(page.getByTestId("git-branch-preview")).toContainText("feature/ABC-123-fix-the-login-redirect-after-single-sign");
  await expect(saveBar(page)).toContainText("3 unsaved changes");

  await saveChanges(page).click();
  await expect(saveBar(page)).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/settings\/workflow$/).map((c) => c.body)).toEqual([
    { commit_openspec: true, default_destination: "jira", allow_plan_log_analyzer: false },
  ]);
  expect(callsTo(db, "PUT", /\/api\/settings\/git-conventions$/).map((c) => c.body)).toEqual([
    { branch: "feature/{ticket}-{slug}", commit: "", pr_title: "" },
  ]);

  // Only what changed is sent; what the gateway refuses stays unsaved, on its field.
  await page.getByLabel("Branch name").fill("feature/{ticket}@{slug}");
  await saveChanges(page).click();
  await expect(page.getByText("That isn't a valid git branch name.").first()).toBeVisible();
  await expect(saveBar(page)).toContainText("1 unsaved change");
  expect(callsTo(db, "PUT", /\/api\/settings\/workflow$/)).toHaveLength(1);

  // A template with an unknown word is caught before any request.
  await page.getByLabel("Commit message").fill("{ticket}: {what}");
  await expect(page.getByText("`{what}` is not a token.")).toBeVisible();
});

test("workflow: AWS logs for plans needs a connected account", async ({ page }) => {
  await mockApi(page, { awsActive: false });
  await page.goto("/settings/workflow/");
  await expect(page.getByRole("switch", { name: "Let plans read your AWS logs" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Connect one" })).toBeVisible();
});

// ── Guardrails ───────────────────────────────────────────────────────

test("guardrails: your rules come first and each add or remove saves the whole list", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/guardrails/");
  await expect(page.getByRole("heading", { name: "Your rules" })).toBeVisible();
  await expect(page.getByText("Platform Security")).toHaveCount(0);
  await expect(page.getByText(/no shell/i)).toHaveCount(0);
  // Coderhelm's own rules are a read-only "Always on" list above the team's.
  await expect(page.getByRole("heading", { name: "Always on" })).toBeVisible();
  await expect(page.getByTestId("built-in-rules").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByTestId("built-in-rules")).toContainText("Never push to your default branch");
  await expect(page.getByTestId("built-in-rules").getByRole("button")).toHaveCount(0);
  await shot(page, "settings-guardrails");

  await page.getByLabel("Add a rule").fill("Keep migrations reversible");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect.poll(() => callsTo(db, "PUT", /\/api\/rules\/global$/).length).toBe(1);
  expect(callsTo(db, "PUT", /\/api\/rules\/global$/)[0].body).toEqual({ rules: ["Never edit generated files under src/gen", "Keep migrations reversible"] });

  await page.getByRole("button", { name: "Remove rule: Never edit generated files under src/gen" }).click();
  await expect.poll(() => callsTo(db, "PUT", /\/api\/rules\/global$/).length).toBe(2);
  expect(callsTo(db, "PUT", /\/api\/rules\/global$/)[1].body).toEqual({ rules: ["Keep migrations reversible"] });

  await page.getByRole("button", { name: "One repository" }).click();
  const list = page.getByRole("list", { name: `Rules for ${WEB}` });
  await expect(list).toContainText("Keep bundle size under 300 KB");
  await page.getByLabel("Add a rule").fill("Run the visual tests");
  await page.getByLabel("Add a rule").press("Enter");
  await expect.poll(() => callsTo(db, "PUT", /\/api\/rules\/repo\//).length).toBe(1);
  const put = callsTo(db, "PUT", /\/api\/rules\/repo\//)[0];
  expect(put.path).toBe(`/api/rules/repo/${WEB}`);
  expect(put.body).toEqual({ rules: ["Keep bundle size under 300 KB", "Run the visual tests"] });
});

test("guardrails: a failed load never looks like an empty list, so saved rules can't be overwritten", async ({ page }) => {
  const db = await mockApi(page);
  db.fail.add("/api/rules/global");
  await page.goto("/settings/guardrails/");
  const problem = page.getByTestId("rules-error");
  await expect(problem).toContainText("Couldn't load the rules for every repository");
  // Nothing that reads as "no rules", and nothing to add or remove with.
  await expect(page.getByText(/No rules for every repository yet/)).toHaveCount(0);
  await expect(page.getByLabel("Add a rule")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Remove rule/ })).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/rules\/global$/)).toHaveLength(0);

  // Try again loads the real list, and editing comes back.
  db.fail.delete("/api/rules/global");
  await problem.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("list", { name: "Rules for every repository" })).toContainText("Never edit generated files under src/gen");
  await expect(page.getByLabel("Add a rule")).toBeVisible();
});

test("guardrails: removing a rule can be undone from the toast", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/guardrails/");
  await page.getByRole("button", { name: "Remove rule: Never edit generated files under src/gen" }).click();
  const toast = page.getByTestId("toast").filter({ hasText: "Rule removed" });
  await expect(toast).toBeVisible();
  await expect.poll(() => callsTo(db, "PUT", /\/api\/rules\/global$/).length).toBe(1);
  expect(callsTo(db, "PUT", /\/api\/rules\/global$/)[0].body).toEqual({ rules: [] });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => callsTo(db, "PUT", /\/api\/rules\/global$/).length).toBe(2);
  expect(callsTo(db, "PUT", /\/api\/rules\/global$/)[1].body).toEqual({ rules: ["Never edit generated files under src/gen"] });
  await expect(page.getByRole("list", { name: "Rules for every repository" })).toContainText("Never edit generated files under src/gen");
});

// ── Voice and instructions ───────────────────────────────────────────

test("voice: a labelled editor, one save bar, and the same request for every repository or one", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/voice/");
  const editor = page.getByLabel("Voice", { exact: true });
  await expect(editor).toHaveValue("Short sentences. No emoji.");
  await expect(page.getByText(/description pass/i)).toHaveCount(0);
  await shot(page, "settings-voice");

  await editor.fill("Short sentences.");
  await expect(saveBar(page)).toContainText("1 unsaved change");
  await saveChanges(page).click();
  await expect(saveBar(page)).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/voice\/global$/).map((c) => c.body)).toEqual([{ content: "Short sentences." }]);

  // Leaving unsaved text asks first.
  await editor.fill("Draft");
  await page.getByRole("button", { name: "One repository" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();
  await expect(editor).toHaveValue("Explain UI changes with before and after.");
  await editor.fill("Explain UI changes with screenshots.");
  await saveChanges(page).click();
  await expect(saveBar(page)).toHaveCount(0);
  const put = callsTo(db, "PUT", /\/api\/voice\/repo\//);
  expect(put.map((c) => [c.path, c.body])).toEqual([[`/api/voice/repo/${WEB}`, { content: "Explain UI changes with screenshots." }]]);
});

test("instructions: a labelled editor, what Coderhelm learned folded away, one save bar", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/instructions/");
  const editor = page.getByLabel("Custom instructions (optional)");
  await expect(editor).toHaveValue("Prefer named exports.");
  await editor.fill("Prefer named exports.\n- Use kebab-case file names");
  await saveChanges(page).click();
  await expect(saveBar(page)).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/instructions\/global$/).map((c) => c.body)).toEqual([{ content: "Prefer named exports.\n- Use kebab-case file names" }]);

  await page.getByRole("button", { name: "One repository" }).click();
  await expect(page.getByText("What Coderhelm learned about this repository")).toBeVisible();
  await page.getByText("What Coderhelm learned about this repository").click();
  await expect(page.getByText("A Next.js app with Playwright tests.")).toBeVisible();
  await shot(page, "settings-instructions-repo");
  await editor.fill("Use the app router.");
  await saveChanges(page).click();
  await expect(saveBar(page)).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/instructions\/repo\//).map((c) => [c.path, c.body])).toEqual([[`/api/instructions/repo/${WEB}`, { content: "Use the app router." }]]);
});

test("voice: a failed load shows no editor, so nothing can be overwritten", async ({ page }) => {
  const db = await mockApi(page);
  db.fail.add("/api/voice/global");
  await page.goto("/settings/voice/");
  await expect(page.getByText("Couldn't load the voice")).toBeVisible();
  await expect(page.getByLabel("Voice", { exact: true })).toHaveCount(0);
  db.fail.clear();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Voice", { exact: true })).toHaveValue("Short sentences. No emoji.");
});

// ── Security ─────────────────────────────────────────────────────────

test("security: a narrow labelled form, and one name for two step sign in", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/security/");
  await expect(page.getByRole("heading", { name: "Two step sign in" })).toBeVisible();
  await expect(page.getByText(/2FA|MFA|two-factor|TOTP/i)).toHaveCount(0);
  await shot(page, "settings-security");

  await page.getByLabel("Current password").fill("old-password-1");
  await page.getByLabel("New password", { exact: true }).fill("new-password-2");
  await page.getByLabel("New password again").fill("new-password-3");
  await expect(page.getByText("The two new passwords are different.")).toBeVisible();
  await page.getByLabel("New password again").fill("new-password-2");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect.poll(() => callsTo(db, "PUT", /\/api\/users\/password$/).length).toBe(1);
  expect(callsTo(db, "PUT", /\/api\/users\/password$/)[0].body).toEqual({ current_password: "old-password-1", new_password: "new-password-2" });

  await page.getByRole("button", { name: "Turn on two step sign in" }).click();
  await page.getByLabel("Your password").fill("new-password-2");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
  expect(callsTo(db, "POST", /\/api\/users\/mfa\/setup$/)[0].body).toEqual({ password: "new-password-2" });
  await page.getByRole("button", { name: "Next: enter a code" }).click();
  await page.getByLabel("Code from the app").fill("123456");
  await page.getByRole("button", { name: "Turn on two step sign in" }).click();
  await expect(page.getByTestId("two-step-status")).toContainText("Two step sign in is on");
  expect(callsTo(db, "POST", /\/api\/users\/mfa\/verify$/)[0].body).toEqual({ password: "new-password-2", code: "123456", session: "sess_1" });
});

// ── Alert routes ─────────────────────────────────────────────────────

test("alerts: routes are list rows; the team channel and budget are rows saved by one bar", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/alerts/");
  const row = page.getByTestId("route-prod-alarms");
  await expect(row).toContainText("Chat: Team channel");
  await expect(row).toContainText("2 rules");
  await row.getByRole("button", { name: "Show rules of prod-alarms" }).click();
  await expect(row.getByRole("list", { name: "Rules, first match wins" })).toContainText("prod-api-5xx");
  await shot(page, "settings-alerts");

  // Connecting a topic is a live checklist: each step says what is really in place.
  await page.getByText(/^(Connecting a topic: done|How to connect a topic)$/).click();
  const steps = page.getByRole("list", { name: "Connecting a topic" });
  await expect(steps.locator('[data-step="route"]')).toHaveAttribute("data-state", "done");
  await expect(steps.locator('[data-step="subscription"]')).toContainText("the last alert arrived");
  // The endpoint to copy stays in view for the next topic, in monospace.
  await expect(page.locator("code", { hasText: "/webhooks/alerts/sns" })).toBeVisible();
  // What kinds of alerts work is a small note, collapsed.
  await expect(page.getByText(/CloudWatch alarm notifications/)).toBeHidden();

  const picker = page.getByTestId("team-channels");
  await picker.getByRole("checkbox", { name: "Slack" }).check();
  await picker.getByRole("textbox", { name: "Slack webhook address" }).fill(SLACK_HOOK);
  await page.getByLabel("Daily token budget for alert runs").fill("3M");
  await expect(saveBar(page)).toContainText("2 unsaved changes");
  await saveChanges(page).click();
  await expect(page.getByText("Alert settings saved")).toBeVisible();
  expect(callsTo(db, "PUT", /\/api\/alert-notify$/).map((c) => c.body)).toEqual([{ enabled: true, slack_webhook: { url: SLACK_HOOK } }]);
  expect(callsTo(db, "PUT", /\/api\/alert-budget$/).map((c) => c.body)).toEqual([{ daily_tokens: 3_000_000 }]);

  // Pausing a route still sends the whole route.
  await row.getByRole("switch", { name: "prod-alarms" }).click();
  await expect.poll(() => callsTo(db, "PUT", /\/api\/alert-routes$/).length).toBe(1);
  expect(callsTo(db, "PUT", /\/api\/alert-routes$/)[0].body).toEqual({
    topic_arn: TOPIC, enabled: false, notify_mode: "team", post_recoveries: true,
    rules: [
      { id: "r1", alarms: ["prod-api-5xx"], terms: [], repo: "your-team/api", instructions: "Roll back the last deploy." },
      { id: "r2", alarms: [], terms: ["disk full"], repo: "your-team/infra", instructions: "" },
    ],
  });
});

test("alerts: a budget that isn't a number keeps the bar up with the reason", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/alerts/");
  await page.getByLabel("Daily token budget for alert runs").fill("lots");
  await expect(page.getByText("Enter a number such as 500k or 2M, up to 100M.")).toBeVisible();
  await saveChanges(page).click();
  await expect(saveBar(page)).toContainText("Enter a daily budget such as 500k or 2M");
  expect(callsTo(db, "PUT", /\/api\/alert-budget$/)).toHaveLength(0);
});

// ── AWS ──────────────────────────────────────────────────────────────

test("aws: account settings are rows with one save; actions sit in the account's menu", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations/aws/");
  const account = page.getByRole("article", { name: `AWS account ${ACCOUNT}` });
  // The saved role reads as words, with no error on load; Change opens the raw ARN.
  await expect(account.getByText("CoderHelmLogReader", { exact: true })).toBeVisible();
  await expect(account.getByText(/The role must be named/)).toHaveCount(0);
  await account.getByRole("button", { name: "Change" }).click();
  await expect(account.getByLabel("Role")).toHaveValue(ROLE_ARN);
  await expect(account.getByRole("button", { name: "Disconnect" })).toHaveCount(0);
  await shot(page, "settings-aws");

  await pickOption(account.getByLabel("Region"), "eu-west-1");
  await account.getByRole("button", { name: "Choose log groups" }).click();
  await account.getByRole("checkbox", { name: "/ecs/worker" }).check();
  await account.getByRole("switch", { name: "Metrics" }).click();
  await account.getByRole("checkbox", { name: "staging-airflow" }).uncheck();
  await expect(saveBar(page)).toContainText("4 unsaved changes");
  await saveChanges(page).click();
  await expect(saveBar(page)).toHaveCount(0);
  expect(callsTo(db, "PUT", new RegExp(`/api/aws-connections/${ACCOUNT}$`)).map((c) => c.body)).toEqual([
    { role_arn: ROLE_ARN, region: "eu-west-1" },
    { log_groups: ["/ecs/api", "/ecs/worker"] },
  ]);
  expect(callsTo(db, "PUT", /\/abilities$/).map((c) => c.body)).toEqual([{ metrics: false }, { airflow_environments: ["prod-airflow"] }]);

  await account.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Test connection" }).click();
  await expect(account.getByText("The connection works")).toBeVisible();

  await account.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Disconnect" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("heading", { name: "Connect your AWS account" })).toBeVisible();
  expect(callsTo(db, "DELETE", new RegExp(`/api/aws-connections/${ACCOUNT}$`))).toHaveLength(1);
});

test("aws: a role name that is wrong keeps the save bar up and sends nothing", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations/aws/");
  const account = page.getByRole("article", { name: `AWS account ${ACCOUNT}` });
  await account.getByRole("button", { name: "Change" }).click();
  await account.getByLabel("Role").fill(`arn:aws:iam::${ACCOUNT}:role/SomethingElse`);
  await saveChanges(page).click();
  await expect(saveBar(page)).toContainText("must be named CoderHelmLogReader");
  expect(callsTo(db, "PUT", /aws-connections/)).toHaveLength(0);
});

test("aws: members read the settings without inputs or a save bar", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/settings/integrations/aws/");
  const account = page.getByRole("article", { name: `AWS account ${ACCOUNT}` });
  await expect(account.getByText(ROLE_ARN)).toBeVisible();
  await expect(account.getByRole("textbox")).toHaveCount(0);
  await expect(account.getByRole("button", { name: "Actions" })).toHaveCount(0);
  await expect(account.getByRole("switch", { name: "Metrics" })).toBeDisabled();
});

// ── Jira ─────────────────────────────────────────────────────────────

test("jira: projects, their repositories and the default project save with one bar", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations/jira/");
  await expect(page.getByRole("switch", { name: "Website (WEB)" })).toHaveAttribute("aria-checked", "true");
  await shot(page, "settings-jira");

  await page.getByRole("switch", { name: "Operations (OPS)" }).click();
  await pickOption(page.getByTestId("project-WEB").getByLabel("Repository"), WEB);
  await pickOption(page.getByLabel("Default project for tickets made from plans"), "OPS");
  await expect(saveBar(page)).toContainText("3 unsaved changes");
  expect(callsTo(db, "PUT", /jira\/(projects|config)$/)).toHaveLength(0);

  await saveChanges(page).click();
  await expect(saveBar(page)).toHaveCount(0);
  expect(callsTo(db, "PUT", /jira\/projects$/).map((c) => c.body)).toEqual([
    { projects: [{ key: "WEB", name: "Website", enabled: true, repo: WEB }, { key: "OPS", name: "Operations", enabled: true, repo: "" }] },
  ]);
  expect(callsTo(db, "PUT", /jira\/config$/).map((c) => c.body)).toEqual([{ default_project: "OPS" }]);

  // Discard puts the saved choices back.
  await pickOption(page.getByTestId("project-OPS").getByLabel("Repository"), API);
  await saveBar(page).getByRole("button", { name: "Discard" }).click();
  await expectSelectValue(page.getByTestId("project-OPS").getByLabel("Repository"), "");
});
