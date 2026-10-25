import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockWideApi } from "./wide-data";
import { mockPickerApi, ONE_ORG_REPOS, OPEN_PRS, TWO_ORG_REPOS, type PickerMockOptions } from "./picker-data";

// The shared repo picker (components/combobox.tsx + repo-combobox.tsx) and the
// "Review a PR" dialog built on it.

const SHOTS_DIR = path.join(__dirname, "..", "test-results", "repo-picker");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function openReviewDialog(page: Page, opts: PickerMockOptions = {}) {
  await mockWideApi(page);
  await mockPickerApi(page, opts);
  await page.goto("/reviewer");
  // On a phone the header's actions fold into a menu; the address opens it too.
  const opener = page.getByRole("button", { name: "Review a PR…" });
  if (await opener.isVisible()) await opener.click();
  else await page.goto("/reviewer?review=1");
  const dialog = page.getByTestId("review-pr-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("the picker opens above the dialog, never clipped, with search first", async ({ page }) => {
  const dialog = await openReviewDialog(page);
  const trigger = dialog.getByTestId("repo-picker");
  // Same size as the other inputs: text-sm, input height.
  const paste = dialog.getByLabel("Or paste a PR link or number");
  const size = (l: typeof trigger) => l.evaluate((el) => getComputedStyle(el).fontSize);
  expect(await size(trigger)).toBe(await size(paste));
  const [tb, pb] = [(await trigger.boundingBox())!, (await paste.boundingBox())!];
  expect(Math.abs(tb.height - pb.height)).toBeLessThanOrEqual(2);

  await trigger.click();
  const pop = page.getByTestId("combo-popover");
  await expect(pop).toBeVisible();
  // The search box is first and has focus.
  await expect(pop.getByTestId("combo-search")).toBeFocused();
  // The whole list box is on screen, even though it is taller than the dialog's body.
  const box = (await pop.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  // More than a handful of rows show, and the list scrolls inside.
  const visibleRows = await pop.getByTestId("combo-option").evaluateAll((els) => {
    const list = els[0].closest("[cmdk-list]")!.getBoundingClientRect();
    return els.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= list.top - 1 && r.bottom <= list.bottom + 1;
    }).length;
  });
  expect(visibleRows).toBeGreaterThanOrEqual(8);
  // A tap on a row isn't swallowed by the dialog.
  await expect(pop.getByTestId("combo-option").first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS_DIR, "picker-open-1280.png") });
});

test("one org: the owner is a group heading, not repeated on every row", async ({ page }) => {
  const dialog = await openReviewDialog(page, { repos: ONE_ORG_REPOS });
  await dialog.getByTestId("repo-picker").click();
  const pop = page.getByTestId("combo-popover");
  await expect(pop.locator("[cmdk-group-heading]").filter({ hasText: /^acme$/ })).toHaveCount(1);
  const web = pop.locator('[data-testid="combo-option"][data-option="acme/web"]');
  await expect(web).toContainText("web");
  await expect(web).not.toContainText("acme");
  // The repo's role is the hint; the full name is the tooltip.
  await expect(web).toContainText("web");
  await expect(pop.locator('[data-option="acme/api"]')).toContainText("backend");
  await expect(web).toHaveAttribute("title", "acme/web");
});

test("two orgs: rows show the name with the owner muted beside it", async ({ page }) => {
  const dialog = await openReviewDialog(page, { repos: TWO_ORG_REPOS });
  await dialog.getByTestId("repo-picker").click();
  const pop = page.getByTestId("combo-popover");
  await expect(pop.locator("[cmdk-group-heading]").filter({ hasText: "Repositories" })).toHaveCount(1);
  await expect(pop.locator('[data-option="globex/web"]')).toContainText("globex");
  await expect(pop.locator('[data-option="acme/web"]')).toContainText("acme");
});

test("search is fuzzy over name and owner, and long names truncate with a tooltip", async ({ page }) => {
  const dialog = await openReviewDialog(page, { repos: TWO_ORG_REPOS });
  await dialog.getByTestId("repo-picker").click();
  const pop = page.getByTestId("combo-popover");
  const search = pop.getByTestId("combo-search");
  await search.fill("glbx");
  await expect(pop.getByTestId("combo-option")).toHaveCount(2);
  await search.fill("dsys");
  await expect(pop.getByTestId("combo-option")).toHaveCount(1);
  await expect(pop.getByTestId("combo-option")).toHaveAttribute("data-option", "acme/design-system");
  await search.fill("zzzz");
  await expect(pop.getByText("No repos match “zzzz”")).toBeVisible();
  await search.fill("payments");
  const long = pop.locator('[data-option^="acme/payments"]');
  const truncated = await long.locator("span").first().evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(truncated).toBe(true);
  await expect(long).toHaveAttribute("title", /payments-reconciliation-service/);
});

test("keyboard: type to open, arrows, Home/End, Enter picks, Escape closes back to the trigger", async ({ page }) => {
  const dialog = await openReviewDialog(page);
  const trigger = dialog.getByTestId("repo-picker");
  await trigger.focus();
  // Typing on the closed trigger opens it already searched.
  await page.keyboard.press("d");
  const pop = page.getByTestId("combo-popover");
  await expect(pop.getByTestId("combo-search")).toHaveValue("d");
  await page.keyboard.press("Backspace");
  // ARIA: a combobox driving a listbox of options.
  const input = pop.getByRole("combobox");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(pop.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("End");
  const active = () => pop.locator('[data-testid="combo-option"][data-selected="true"]');
  await expect(active()).toHaveAttribute("data-option", "acme/web");
  await page.keyboard.press("Home");
  await expect(active()).toHaveAttribute("data-option", "acme/admin-console");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(active()).toHaveAttribute("data-option", "acme/api");
  await expect(input).toHaveAttribute("aria-activedescendant", (await active().getAttribute("id"))!);
  await page.keyboard.press("Enter");
  await expect(pop).toHaveCount(0);
  await expect(trigger).toContainText("acme/api");
  await expect(trigger).toBeFocused();
  // Escape closes the list only, not the dialog.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("combo-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("combo-popover")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("Recent lists repos picked before, newest first, while nothing is typed", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("coderhelm.recent-repos", JSON.stringify(["acme/docs", "acme/web"])));
  const dialog = await openReviewDialog(page);
  await dialog.getByTestId("repo-picker").click();
  const pop = page.getByTestId("combo-popover");
  const recent = pop.getByTestId("combo-recent");
  await expect(recent.locator("[cmdk-group-heading]")).toHaveText("Recent");
  await expect(recent.getByTestId("combo-option")).toHaveCount(2);
  await expect(recent.getByTestId("combo-option").first()).toHaveAttribute("data-option", "acme/docs");
  // Picking one moves it to the top for next time.
  await pop.locator('[data-testid="combo-group"] [data-option="acme/infra"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("coderhelm.recent-repos") ?? "[]"))).toEqual(["acme/infra", "acme/docs", "acme/web"]);
  // Searching hides Recent so each repo shows once.
  await dialog.getByTestId("repo-picker").click();
  await page.getByTestId("combo-search").fill("web");
  await expect(page.getByTestId("combo-recent")).toHaveCount(0);
});

test("the toolbar's repo filter is the same picker", async ({ page }) => {
  await mockWideApi(page);
  await mockPickerApi(page);
  await page.goto("/reviewer");
  const filter = page.getByTestId("repo-filter");
  await expect(filter).toContainText("All repos");
  await filter.click();
  const pop = page.getByTestId("combo-popover");
  await pop.getByTestId("combo-search").fill("billing");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/repo=acme%2Fbilling-service/);
  await expect(filter).toContainText("billing-service");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test("the picker is a bottom sheet inside the screen", async ({ page }) => {
    const dialog = await openReviewDialog(page);
    await dialog.getByTestId("repo-picker").click();
    const sheet = page.getByTestId("combo-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("combo-search")).toBeFocused();
    const box = (await sheet.boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(0.5);
    expect(box.width).toBeGreaterThanOrEqual(389);
    expect(Math.round(box.y + box.height)).toBe(664);
    await page.screenshot({ path: path.join(SHOTS_DIR, "picker-sheet-390.png") });
    await sheet.getByTestId("combo-search").fill("web");
    await sheet.locator('[data-option="acme/web"]').click();
    await expect(sheet).toHaveCount(0);
    await expect(dialog.getByTestId("repo-picker")).toContainText("acme/web");
    await expect(dialog).toBeVisible();
  });
});

// ── Review a PR ─────────────────────────────────────────────────────

test("review a PR: pick a repo, pick one of its open PRs, review it", async ({ page }) => {
  const calls: NonNullable<PickerMockOptions["calls"]> = [];
  const dialog = await openReviewDialog(page, { calls });
  await expect(dialog.getByRole("heading", { name: "Review a PR" })).toBeVisible();
  // No repo yet: the PR picker waits.
  await expect(dialog.getByTestId("pr-picker")).toBeDisabled();
  await dialog.getByTestId("repo-picker").click();
  await page.getByTestId("combo-search").fill("web");
  await page.keyboard.press("Enter");
  await expect.poll(() => calls.some((c) => c.path === "/api/reviewer/open-prs?repo=acme%2Fweb")).toBe(true);

  const prPicker = dialog.getByTestId("pr-picker");
  await expect(prPicker).toBeEnabled();
  await prPicker.click();
  const pop = page.getByTestId("combo-popover");
  await expect(pop.getByTestId("combo-option")).toHaveCount(OPEN_PRS.length);
  const first = pop.getByTestId("combo-option").first();
  await expect(first).toContainText("Fix the login redirect loop on expired sessions");
  await expect(first).toContainText("dev-one");
  await expect(first).toContainText("#482");
  await expect(pop.locator('[data-option="471"]')).toContainText("draft");
  // Searchable by number and author.
  await pop.getByTestId("combo-search").fill("479");
  await expect(pop.getByTestId("combo-option")).toHaveCount(1);
  await pop.getByTestId("combo-search").fill("dev-three");
  await expect(pop.getByTestId("combo-option").first()).toHaveAttribute("data-option", "471");
  await pop.getByTestId("combo-search").fill("payment client");
  await page.keyboard.press("Enter");
  await expect(prPicker).toContainText("#479");
  await expect(prPicker).toContainText("Add retries to the payment client");
  await page.screenshot({ path: path.join(SHOTS_DIR, "review-picked-1280.png") });

  await dialog.getByRole("button", { name: "Review now" }).click();
  await expect(dialog).toHaveCount(0);
  const post = calls.find((c) => c.method === "POST" && c.path === "/api/reviewer/re-review");
  expect(post?.body).toEqual({ repo: "acme/web", pr: 479 });
  await expect(page.getByText("Review queued for acme/web #479")).toBeVisible();
});

test("review a PR: a pasted link sets the repo and the number", async ({ page }) => {
  const calls: NonNullable<PickerMockOptions["calls"]> = [];
  const dialog = await openReviewDialog(page, { calls });
  await dialog.getByLabel("Or paste a PR link or number").fill("https://github.com/acme/api/pull/77/files");
  await expect(dialog.getByTestId("repo-picker")).toContainText("acme/api");
  await expect(dialog.getByTestId("review-target")).toHaveText("Reviews acme/api #77");
  // Enter submits the form.
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  expect(calls.find((c) => c.method === "POST" && c.path === "/api/reviewer/re-review")?.body).toEqual({ repo: "acme/api", pr: 77 });
});

test("review a PR: a bare number works, and nonsense is refused in words", async ({ page }) => {
  const calls: NonNullable<PickerMockOptions["calls"]> = [];
  const dialog = await openReviewDialog(page, { calls, openPrs: null });
  await dialog.getByRole("button", { name: "Review now" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Pick a repo.");
  await dialog.getByTestId("repo-picker").click();
  await page.getByTestId("combo-search").fill("docs");
  await page.keyboard.press("Enter");
  // An older backend can't list PRs: the dialog says so and keeps the paste box.
  await expect(dialog.getByText("Open pull requests can't be listed for this repo.", { exact: false })).toBeVisible();
  const paste = dialog.getByLabel("Or paste a PR link or number");
  await paste.fill("not a pr");
  await dialog.getByRole("button", { name: "Review now" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("That isn't a pull request link or number.");
  await paste.fill("#15");
  await dialog.getByRole("button", { name: "Review now" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.find((c) => c.method === "POST" && c.path === "/api/reviewer/re-review")?.body).toEqual({ repo: "acme/docs", pr: 15 });
});

test("review a PR on a phone: full-height sheet, buttons pinned at the bottom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const dialog = await openReviewDialog(page);
  const box = (await dialog.boundingBox())!;
  expect(Math.round(box.height)).toBe(664);
  const primary = dialog.getByRole("button", { name: "Review now" });
  const pb = (await primary.boundingBox())!;
  expect(pb.y + pb.height).toBeLessThanOrEqual(664);
  expect(pb.y).toBeGreaterThan(500);
  await page.screenshot({ path: path.join(SHOTS_DIR, "review-dialog-390.png") });
});
