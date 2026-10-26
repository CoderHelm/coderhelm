import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { MODELS, MODEL_ROLES } from "../src/lib/models";

// Settings → AI models. Every API call is answered here with invented data;
// nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

interface Saved {
  api_key: string | null;
  primary_model: string | null;
  heavy_model: string | null;
}

interface Backend {
  saved: Saved;
  /** Keys Anthropic refuses: the gateway answers 200 with an error field. */
  badKeys: string[];
  failGet: boolean;
  puts: Record<string, unknown>[];
  gets: number;
}

const mask = (k: string | null) => (k ? `sk-ant-...${k.slice(-4)}` : null);

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    saved: { api_key: "sk-ant-api03-invented-test-key-x7Qd", primary_model: "claude-sonnet-5-5", heavy_model: "claude-opus-5-5" },
    badKeys: [],
    failGet: false,
    puts: [],
    gets: 0,
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/settings/model-provider" && method === "GET") {
      db.gets += 1;
      if (db.failGet) return json(route, { error: "boom" }, 500);
      return json(route, { provider: "anthropic", api_key_masked: mask(db.saved.api_key), primary_model: db.saved.primary_model, heavy_model: db.saved.heavy_model });
    }
    if (p === "/api/settings/model-provider" && method === "PUT") {
      const body = JSON.parse(req.postData() || "{}") as Record<string, unknown>;
      db.puts.push(body);
      const key = (body.api_key as string | undefined) ?? db.saved.api_key;
      if (!key) return route.fulfill({ status: 400, body: "" });
      if (db.badKeys.includes(key)) return json(route, { error: "Invalid API key" });
      db.saved = { api_key: key, primary_model: body.primary_model as string, heavy_model: body.heavy_model as string };
      return json(route, { status: "ok", provider: "anthropic" });
    }
    return json(route, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: true });
}

/** All words on the page except the inside of the selects (their options are the list itself). */
const prose = (page: Page) =>
  page.locator("[data-page]").evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll("select").forEach((s) => s.remove());
    return c.textContent || "";
  });

const keyRow = (page: Page) => page.getByTestId("key-row");
const select = (page: Page, label: string) => page.getByRole("combobox", { name: label });

test("a saved key shows as one status line, models are named once, nothing stale", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/models/");
  await expect(page.getByRole("heading", { name: "AI models", level: 1 })).toBeVisible();

  const status = page.getByTestId("key-status");
  await expect(status).toContainText("Key saved");
  await expect(status).toContainText("ends x7Qd");
  // The hint appears exactly once, and there is no key box until asked for.
  expect((await prose(page)).match(/x7Qd/g)?.length).toBe(1);
  await expect(keyRow(page).locator("input")).toHaveCount(0);
  // The KMS note once, and no old "How it works" card.
  expect((await prose(page)).match(/AWS KMS/g)?.length).toBe(1);
  await expect(page.getByText("How it works")).toHaveCount(0);

  // One row per role, labelled from the role list, set to the saved models.
  for (const role of MODEL_ROLES) {
    const row = page.getByTestId(`model-row-${role.key}`);
    await expect(row).toContainText(role.label);
    await expect(row).toContainText(role.does);
  }
  await expect(select(page, "Planning & reviews")).toHaveValue("claude-sonnet-5-5");
  await expect(select(page, "Writing code")).toHaveValue("claude-opus-5-5");
  await expect(page.getByTestId("model-row-heavy_model").getByText("Recommended", { exact: true })).toBeVisible();

  // Options are plain model names: no dash-joined taglines.
  const options = await page.locator("select option").allTextContents();
  expect(options.length).toBeGreaterThan(0);
  for (const o of options) expect(o).not.toMatch(/—|-\s/);
  expect(options).toEqual(expect.arrayContaining(MODELS.map((m) => m.name)));

  // No model is named in the prose unless it is one that is selected or recommended.
  const text = await prose(page);
  const allowed = new Set(["Claude Sonnet 5.5", "Claude Opus 5.5"]);
  for (const m of MODELS) if (!allowed.has(m.name)) expect(text, `${m.name} named in prose`).not.toContain(m.name);
  expect(text).not.toMatch(/Sonnet 4\.6|Opus 4\.8/);

  // Nothing changed: no save bar.
  await expect(page.getByTestId("save-bar")).toHaveCount(0);
  await shot(page, "models-saved-1280.png");
});

test("changing a model shows the save bar and PUTs exactly the same body as before", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/models/");
  await select(page, "Writing code").selectOption("claude-fable-5-1");
  const bar = page.getByTestId("save-bar");
  await expect(bar).toContainText("1 unsaved change");
  await expect(page.getByTestId("model-row-heavy_model").getByText("Unsaved")).toBeVisible();

  // Discard puts it back and the bar goes away.
  await bar.getByRole("button", { name: "Discard" }).click();
  await expect(select(page, "Writing code")).toHaveValue("claude-opus-5-5");
  await expect(bar).toHaveCount(0);

  await select(page, "Writing code").selectOption("claude-fable-5-1");
  await select(page, "Planning & reviews").selectOption("claude-haiku-4-5");
  await expect(bar).toContainText("2 unsaved changes");
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar).toHaveCount(0);
  // No key typed: the body has the two models and no api_key, as before.
  expect(db.puts).toEqual([{ primary_model: "claude-haiku-4-5", heavy_model: "claude-fable-5-1" }]);
  expect(JSON.stringify(db.puts[0])).toBe('{"primary_model":"claude-haiku-4-5","heavy_model":"claude-fable-5-1"}');
  await expect(select(page, "Writing code")).toHaveValue("claude-fable-5-1");
  await expect(page.getByTestId("key-status")).toContainText("last tested");
});

test("replace key reveals the box, and saving sends the new key with the models", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/models/");
  await keyRow(page).getByRole("button", { name: "Replace key" }).click();
  const input = keyRow(page).getByLabel("API key");
  await expect(input).toBeVisible();
  await input.fill("sk-ant-api03-invented-new-key-Zz42");
  await page.getByTestId("save-bar").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("key-status")).toContainText("ends Zz42");
  expect(db.puts).toEqual([{ primary_model: "claude-sonnet-5-5", heavy_model: "claude-opus-5-5", api_key: "sk-ant-api03-invented-new-key-Zz42" }]);
  await expect(keyRow(page).locator("input")).toHaveCount(0);
});

test("test key: passes inline, and a refused key fails inline without changing what is saved", async ({ page }) => {
  const db = await mockApi(page, { badKeys: ["sk-ant-api03-invented-wrong-key-0000"] });
  await page.goto("/settings/models/");
  await expect(page.getByTestId("key-status")).toContainText("Key saved");
  const getsBefore = db.gets;

  await keyRow(page).getByRole("button", { name: "Save and test key" }).click();
  const result = page.getByTestId("key-test-result");
  await expect(result).toContainText("The key works");
  await expect(page.getByTestId("key-status")).toContainText(/last tested ✓\s*passed\s*just now|last tested.*just now/);
  // Same call as before: the saved models, no key.
  expect(db.puts).toEqual([{ primary_model: "claude-sonnet-5-5", heavy_model: "claude-opus-5-5" }]);
  // ...followed by one re-read, as before.
  expect(db.gets).toBe(getsBefore + 1);

  await keyRow(page).getByRole("button", { name: "Replace key" }).click();
  await keyRow(page).getByLabel("API key").fill("sk-ant-api03-invented-wrong-key-0000");
  await keyRow(page).getByRole("button", { name: "Save and test key" }).click();
  await expect(result).toContainText("Anthropic did not accept this key");
  expect(db.puts[1]).toEqual({ primary_model: "claude-sonnet-5-5", heavy_model: "claude-opus-5-5", api_key: "sk-ant-api03-invented-wrong-key-0000" });
  // The saved key is untouched and still shown.
  await expect(page.getByTestId("key-status")).toContainText("ends x7Qd");
  await expect(keyRow(page).getByLabel("API key")).toHaveValue("sk-ant-api03-invented-wrong-key-0000");
  await shot(page, "models-test-failed-1280.png");
});

test("no key yet: the box is open, Test waits for a key, Save refuses without one", async ({ page }) => {
  const db = await mockApi(page, { saved: { api_key: null, primary_model: null, heavy_model: null } });
  await page.goto("/settings/models/");
  await expect(page.getByTestId("key-status")).toContainText("No key saved");
  await expect(keyRow(page).getByLabel("API key")).toBeVisible();
  await expect(keyRow(page).getByRole("button", { name: "Save and test key" })).toBeDisabled();
  // Unchosen models start on the recommended ones.
  await expect(select(page, "Planning & reviews")).toHaveValue("claude-sonnet-5-5");
  await expect(select(page, "Writing code")).toHaveValue("claude-opus-5-5");

  await select(page, "Writing code").selectOption("claude-sonnet-5-5");
  await page.getByTestId("save-bar").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("save-bar")).toContainText("Add your Anthropic API key first");
  expect(db.puts).toEqual([]);
  // The "Use recommended" link puts the role back on its recommended model.
  await page.getByTestId("model-row-heavy_model").getByRole("button", { name: /Use recommended/ }).click();
  await expect(select(page, "Writing code")).toHaveValue("claude-opus-5-5");
  await shot(page, "models-no-key-1280.png");
});

test("a failed load shows an error with a retry, never a blank form", async ({ page }) => {
  const db = await mockApi(page, { failGet: true });
  await page.goto("/settings/models/");
  await expect(page.getByText(/Could(n't| not) load your AI model settings/)).toBeVisible();
  await expect(page.locator("main [data-page] select")).toHaveCount(0);
  db.failGet = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("key-status")).toContainText("Key saved");
});

test("phone width: no sideways scroll, and the save bar fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/settings/models/");
  await expect(page.getByTestId("key-status")).toContainText("Key saved");
  await shot(page, "models-saved-390.png");
  await select(page, "Writing code").selectOption("claude-fable-5-1");
  await keyRow(page).getByRole("button", { name: "Replace key" }).click();
  await expect(page.getByTestId("save-bar")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, "models-editing-390.png");
});
