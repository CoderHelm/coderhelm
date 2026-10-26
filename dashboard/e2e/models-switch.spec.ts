import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Settings, System, Models on a self-hosted install: switching between
// Claude on Amazon Bedrock and Anthropic API keys (every model answers a
// test call first), a switch refused with its fix, and the update held by a
// refused model ("Update to vX needs your action") on System and Setup.
// Every call is answered here; nothing reaches AWS or a model.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const SELF = { apiUrl: "", streamUrl: "", selfHosted: true, version: "v1.2.0" };
const ME = { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.org", avatar_url: "", role: "owner", auth_provider: "email", mfa_enabled: false, platform_admin: true };
const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"];
const MODEL_ACCESS = "https://console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess";

function models(provider: "anthropic" | "bedrock", prefix = "us.", by: string | null = null) {
  return {
    provider,
    inference_prefix: prefix,
    model_ids: {},
    source: by ? "settings" : "deploy",
    updated_at: by ? "2026-10-26T09:00:00Z" : null,
    updated_by: by,
    deploy_default: { provider: "anthropic", inference_prefix: "us." },
    region: "us-east-1",
    models: MODELS,
    bedrock_ids: Object.fromEntries(MODELS.map((m) => [m, `${prefix}anthropic.${m}`])),
    prefixes: ["us.", "eu.", "apac.", "global.", ""],
  };
}

const pass = (m: string, id = `us.anthropic.${m}`) => ({ model: m, id, status: "pass", code: "ok", detail: `${id} answered through Amazon Bedrock.` });
const useCase = (m: string) => ({
  model: m, id: `us.anthropic.${m}`, status: "fail", code: "use_case_required", required: true,
  detail: `Bedrock refused us.anthropic.${m}: Anthropic's use case details haven't been submitted for this AWS account.`,
  fix: "Submit the use case details on the Bedrock console's Model access page (a person fills in the form once per account), then check again.",
  url: MODEL_ACCESS,
});
const terms = (m: string) => ({
  model: m, id: `us.anthropic.${m}`, status: "fail", code: "marketplace_failed", required: true,
  detail: `Bedrock refused us.anthropic.${m}: Anthropic's terms for this model haven't been accepted in AWS Marketplace.`,
  fix: `Have someone allowed to subscribe in AWS Marketplace accept the terms for ${m} on the Bedrock console's Model access page, then check again.`,
  url: MODEL_ACCESS,
});

interface Opts {
  /** The switch to Bedrock is refused (use case form missing). */
  refuse?: boolean;
  /** The next release calls a model whose terms aren't accepted. */
  blocked?: boolean;
  /** The release's signature is still being checked. */
  pending?: boolean;
}

async function setup(page: Page, opts: Opts = {}) {
  const state = { models: models("anthropic"), refuse: !!opts.refuse, blocked: !!opts.blocked, pending: !!opts.pending };
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const modelCheck = () => ({
    version: "v1.3.0", checked_at: "2026-10-26T08:00:00Z", ok: !state.blocked && !state.pending, pending: state.pending, provider: "bedrock", region: "us-east-1",
    results: state.blocked ? [pass("claude-opus-5-5"), terms("claude-sonnet-5-5")] : MODELS.map((m) => pass(m)),
  });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify(SELF)};` }));
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const body = JSON.parse(req.postData() || "{}");
    if (req.method() !== "GET") calls.push({ method: req.method(), path: p, body });
    if (p === "/api/me") return json(route, ME);
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/system/version") {
      return json(route, {
        self_hosted: true,
        current: { version: "v1.2.0", commit: "abc1234def", released_at: "2026-10-01T00:00:00Z", config_fingerprint: "0123456789ab" },
        latest: { version: "v1.3.0", notes: "## Changes\n\n- Faster reviews.", url: "https://example.org/r", breaking: false },
        update_available: true, running: false,
        settings: { auto: true, channel: "stable", day: "sun", hour: 3, timezone: "UTC", majors: "ask" },
        history: [],
        model_check: modelCheck(),
      });
    }
    if (p === "/api/system/preflight") {
      const mc = modelCheck();
      return json(route, {
        checked_at: "2026-10-26T08:00:00Z", ready: mc.ok, current: "v1.2.0", latest: "v1.3.0",
        blockers: mc.results.filter((r) => r.status === "fail").map((r) => ({
          key: `model:${r.model}`, severity: "block", detail: `Update to v1.3.0 needs your action: ${r.detail}`, fix: { text: (r as unknown as { fix: string }).fix, url: MODEL_ACCESS },
        })),
        checks: [],
      });
    }
    if (p === "/api/system/update-check") return json(route, { model_check: modelCheck() });
    if (p === "/api/system/update") {
      const mc = modelCheck();
      if (!mc.ok) return json(route, { error: `Update to v1.3.0 needs your action: ${terms("claude-sonnet-5-5").detail}`, model_check: mc }, 400);
      return json(route, { version: "v1.3.0", actor: "owner@example.org", status: "running" });
    }
    if (p === "/api/system/checks") {
      const mc = modelCheck();
      const c = mc.ok
        ? [{ key: "update_models", group: "Claude", label: "The next release's models answer", status: "pass", detail: "Every model v1.3.0 calls answered a test call." }]
        : [{ key: "update_models", group: "Claude", label: "The next release's models answer", status: "fail", detail: `Update to v1.3.0 needs your action: ${terms("claude-sonnet-5-5").detail}`, why: "v1.3.0 calls claude-sonnet-5-5; it won't be applied until it answers. The check runs again daily.", fix: { text: terms("claude-sonnet-5-5").fix, url: MODEL_ACCESS } }];
      return json(route, { checked_at: "2026-10-26T08:00:00Z", summary: { pass: mc.ok ? 1 : 0, warn: 0, fail: mc.ok ? 0 : 1, skip: 0, ready: mc.ok }, checks: c });
    }
    if (p === "/api/system/models" && req.method() === "GET") return json(route, state.models);
    if (p === "/api/system/models/check" || (p === "/api/system/models" && req.method() === "PUT")) {
      const prefix = String(body.inference_prefix ?? "us.");
      const results = body.provider === "bedrock"
        ? state.refuse
          ? [pass("claude-opus-5-5", `${prefix}anthropic.claude-opus-5-5`), useCase("claude-sonnet-5-5")]
          : MODELS.map((m) => pass(m, `${prefix}anthropic.${m}`))
        : MODELS.map((m) => ({ model: m, id: m, status: "pass", code: "ok", detail: `${m} answered through the Anthropic API.` }));
      const ok = results.every((r) => r.status !== "fail");
      if (p.endsWith("/check")) return json(route, { ok, results });
      if (!ok) return json(route, { error: "Not switched: claude-sonnet-5-5 didn't answer. Fix it and check again.", results }, 409);
      state.models = models(body.provider as "bedrock" | "anthropic", prefix, "owner@example.org");
      return json(route, { ...state.models, results });
    }
    return json(route, {});
  });
  return { state, calls };
}

async function shot(page: Page, name: string, width: number) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
}

async function noSidewaysScroll(page: Page, width: number) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(width);
}

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width > 600 ? 900 : 844 } });

    test("switch to Bedrock: every model answers, then it is saved", async ({ page }) => {
      const { calls, state } = await setup(page);
      await page.goto("/settings/system/#models");
      const section = page.getByTestId("models-section");
      await expect(section.getByTestId("models-current")).toContainText("Anthropic API keys");
      await expect(section.getByTestId("models-current")).toContainText("From the install config");
      await section.getByRole("radio", { name: /Claude on Amazon Bedrock/ }).check();
      await section.getByRole("combobox", { name: "Inference profile prefix" }).selectOption("eu.");
      await section.getByText("Advanced: exact Bedrock ids").click();
      await expect(section.getByRole("textbox", { name: /Bedrock id for claude-opus-5-5/ })).toHaveAttribute("placeholder", "eu.anthropic.claude-opus-5-5");
      await section.getByRole("button", { name: "Check and switch to Claude on Amazon Bedrock" }).click();
      await expect(section.getByTestId("models-results")).toContainText("Every model answered");
      await expect(section.getByTestId("model-result-claude-sonnet-5-5")).toHaveAttribute("data-status", "pass");
      await expect(section.getByTestId("models-current")).toContainText("Claude on Amazon Bedrock");
      await expect(section.getByTestId("models-current")).toContainText("Changed here by owner@example.org");
      const put = calls.find((c) => c.method === "PUT" && c.path === "/api/system/models");
      expect(put?.body).toEqual({ provider: "bedrock", inference_prefix: "eu.", model_ids: {} });
      expect(state.models.provider).toBe("bedrock");
      await noSidewaysScroll(page, width);
      await section.scrollIntoViewIfNeeded();
      await shot(page, "models-switch-success", width);
    });

    test("switch refused: the model, the fix and the console link; nothing changes", async ({ page }) => {
      const { state } = await setup(page, { refuse: true });
      await page.goto("/settings/system/#models");
      const section = page.getByTestId("models-section");
      await section.getByRole("radio", { name: /Claude on Amazon Bedrock/ }).check();
      await section.getByRole("button", { name: /Check and switch/ }).click();
      const results = section.getByTestId("models-results");
      await expect(results).toContainText("Not switched: claude-sonnet-5-5 didn't answer");
      const bad = section.getByTestId("model-result-claude-sonnet-5-5");
      await expect(bad).toHaveAttribute("data-status", "fail");
      await expect(bad).toContainText("use case details haven't been submitted");
      await expect(bad).toContainText("Submit the use case details");
      await expect(bad.getByRole("link", { name: "Open the AWS console" })).toHaveAttribute("href", MODEL_ACCESS);
      await expect(section.getByTestId("model-result-claude-opus-5-5")).toHaveAttribute("data-status", "pass");
      await expect(section.getByTestId("models-current")).toContainText("Anthropic API keys");
      expect(state.models.provider).toBe("anthropic");
      // Fixed in the console: Check again passes.
      state.refuse = false;
      await section.getByRole("button", { name: "Check again" }).click();
      await expect(results).toContainText("Every model answered");
      state.refuse = true;
      await section.getByRole("button", { name: "Check access" }).click();
      await expect(results).toContainText("a model was refused");
      await noSidewaysScroll(page, width);
      await shot(page, "models-switch-refused", width);
    });

    test("update blocked: Update to v1.3.0 needs your action, on System and Setup", async ({ page }) => {
      const { state, calls } = await setup(page, { blocked: true });
      await page.goto("/settings/system/");
      const banner = page.getByTestId("update-needs-action");
      await expect(banner).toContainText("Update to v1.3.0 needs your action");
      await expect(banner.getByTestId("model-result-claude-sonnet-5-5")).toContainText("terms for this model haven't been accepted");
      await expect(banner.getByRole("link", { name: "Open the AWS console" })).toHaveAttribute("href", MODEL_ACCESS);
      await expect(banner).toContainText("Coderhelm only checks");
      // No override for a model the release calls.
      await expect(banner.getByRole("button", { name: "Skip this check" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Update now to v1.3.0" })).toBeDisabled();
      await expect(page.getByTestId("update-readiness")).toContainText("Update to v1.3.0 needs your action");
      await noSidewaysScroll(page, width);
      await shot(page, "update-blocked-system", width);

      await page.goto("/settings/setup/");
      const onSetup = page.getByTestId("update-needs-action");
      await expect(onSetup).toContainText("Update to v1.3.0 needs your action");
      await noSidewaysScroll(page, width);
      await shot(page, "update-blocked-setup", width);

      // Accepted in the console: Check again clears it.
      state.blocked = false;
      await onSetup.getByRole("button", { name: "Check again" }).click();
      await expect(page.getByTestId("update-needs-action")).toHaveCount(0);
      expect(calls.some((c) => c.path === "/api/system/update-check")).toBe(true);
    });
  });
}

test("while the release's signature is checked, the update waits and says so", async ({ page }) => {
  const { state } = await setup(page, { pending: true });
  await page.goto("/settings/system/");
  await expect(page.getByTestId("update-checking")).toContainText("Checking v1.3.0 before it can be applied");
  await expect(page.getByTestId("update-needs-action")).toHaveCount(0);
  state.pending = false;
  await page.getByTestId("update-checking").getByRole("button", { name: "Check again" }).click();
  await expect(page.getByTestId("update-checking")).toHaveCount(0);
});
