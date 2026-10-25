import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockWideApi } from "./wide-data";
import { SAMPLE_QUERY } from "./wide-data/addresses";
import { mockPickerApi } from "./picker-data";

// Every dialog in the dashboard, opened on a laptop and on a phone with the
// long wide-data records: its main button must be on screen and the topmost
// thing at its centre (not cut off by the screen's edge, not under anything).
// The dialog itself must fit the screen, and only its body scrolls.
//
// A new dialog gets a line in DIALOGS: where it lives, how it opens, and its
// main button.

const SHOTS_DIR = path.join(__dirname, "..", "test-results", "dialogs");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const SIZES = [
  { width: 1280, height: 720 },
  { width: 390, height: 664 },
];

interface DialogCase {
  name: string;
  url: string;
  open: (page: Page) => Promise<void>;
  /** The footer's main button. */
  primary: string | RegExp;
}

const DIALOGS: DialogCase[] = [
  { name: "review-a-pr", url: "/reviewer?review=1", open: async () => {}, primary: "Review now" },
  {
    name: "write-release-notes",
    url: "/releases",
    open: (p) => p.getByRole("button", { name: "Write notes for a tag…" }).click(),
    primary: "Write notes",
  },
  {
    name: "create-fix-pr",
    url: "/logs",
    open: (p) => p.getByRole("button", { name: /^Create fix PR for/ }).first().click(),
    primary: "Start fix run",
  },
  {
    name: "save-as-template",
    url: `/plans/detail${SAMPLE_QUERY["/plans/detail"]}`,
    open: async (p) => {
      await p.getByRole("button", { name: "More" }).first().click();
      await p.getByRole("menuitem", { name: "Save as template" }).click();
    },
    primary: "Save template",
  },
  {
    name: "try-agent",
    url: `/skills/agent${SAMPLE_QUERY["/skills/agent"]}`,
    open: (p) => p.getByRole("button", { name: "Try it" }).click(),
    primary: /^Ask /,
  },
  {
    name: "close-run",
    url: `/runs/detail${SAMPLE_QUERY["/runs/detail"]}`,
    open: async (p) => {
      const direct = p.getByRole("button", { name: "Close run", exact: true });
      if (await direct.isVisible()) return direct.click();
      await p.getByRole("button", { name: "More" }).first().click();
      await p.getByRole("menuitem", { name: "Close run…" }).click();
    },
    primary: "Close run",
  },
  {
    name: "add-mcp-server",
    url: "/settings/integrations",
    open: (p) => p.getByTestId("add-mcp-server-button").click(),
    primary: "Check address",
  },
  {
    name: "new-custom-role",
    url: "/settings/team",
    open: (p) => p.getByTestId("custom-roles").getByRole("button", { name: "New role" }).click(),
    primary: "Create role",
  },
  {
    name: "teach-memory",
    url: "/memory",
    open: (p) => p.getByRole("button", { name: "Teach it something" }).first().click(),
    primary: "Remember this",
  },
  {
    name: "reset-all-data",
    url: "/settings",
    open: (p) => p.getByRole("button", { name: "Reset all data" }).click(),
    primary: "Delete everything",
  },
];

/** The main button is inside the screen and is what a tap at its centre hits. */
async function expectReachable(page: Page, button: Locator, label: string) {
  await expect(button, `${label}: main button`).toBeVisible();
  const box = await button.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, `${label}: main button has a box`).not.toBeNull();
  expect(box!.y, `${label}: main button below the top`).toBeGreaterThanOrEqual(0);
  expect(box!.x, `${label}: main button right of the left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${label}: main button above the bottom edge`).toBeLessThanOrEqual(vp.height);
  expect(box!.x + box!.width, `${label}: main button left of the right edge`).toBeLessThanOrEqual(vp.width);
  const hit = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  });
  expect(hit, `${label}: nothing covers the main button`).toBe(true);
}

/** The dialog fits the screen, its footer is pinned, and the page behind can't scroll. */
async function expectWellFormed(page: Page, dialog: Locator, label: string) {
  const vp = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.y, `${label}: dialog top on screen`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${label}: dialog bottom on screen`).toBeLessThanOrEqual(vp.height + 0.5);
  const scroll = await dialog.evaluate((el) => ({
    dialogScrolls: el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY),
    bodyLocked: getComputedStyle(document.body).overflow === "hidden" || document.body.hasAttribute("data-scroll-locked"),
  }));
  expect(scroll.dialogScrolls, `${label}: the dialog box itself never scrolls (only its body)`).toBe(false);
  expect(scroll.bodyLocked, `${label}: the page behind is locked`).toBe(true);
}

for (const size of SIZES) {
  test.describe(`dialogs at ${size.width}x${size.height}`, () => {
    for (const d of DIALOGS) {
      test(`${d.name}: fits and its main button is reachable`, async ({ page }) => {
        await mockWideApi(page);
        await mockPickerApi(page);
        // Opened from the laptop layout (a phone folds some openers into a
        // menu), then drawn at the size under test.
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto(d.url);
        await d.open(page);
        await page.setViewportSize(size);
        const dialog = page.locator("[data-modal]").last();
        await expect(dialog).toBeVisible();
        const footer = dialog.locator("[data-modal-footer]");
        await expect(footer).toBeVisible();
        const primary = footer.getByRole("button", { name: d.primary });
        const label = `${d.name} @${size.width}`;
        await expectReachable(page, primary, label);
        await expectWellFormed(page, dialog, label);
        // Scrolled to the end of a long body, the button is still there.
        await dialog.locator("[data-modal-body]").evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await expectReachable(page, primary, `${label} (body scrolled)`);
        await page.screenshot({ path: path.join(SHOTS_DIR, `${d.name}-${size.width}.png`) });
        // Escape closes it.
        await page.keyboard.press("Escape");
        await expect(page.locator("[data-modal]")).toHaveCount(0);
      });
    }
  });
}

test("the role editor on a short laptop screen keeps Cancel and Create role on screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await mockWideApi(page);
  await mockPickerApi(page);
  await page.goto("/settings/team");
  const opener = page.getByTestId("custom-roles").getByRole("button", { name: "New role" });
  await opener.click();
  const editor = page.getByTestId("role-editor");
  await expect(editor).toBeVisible();
  // The fixture's 22 abilities make the form far taller than the screen.
  const body = editor.locator("[data-modal-body]");
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expectReachable(page, editor.getByRole("button", { name: "Create role" }), "role editor");
  await expectReachable(page, editor.getByRole("button", { name: "Cancel" }), "role editor cancel");
  // Focus starts in the form and stays in the dialog.
  await expect(editor.getByLabel("Name")).toBeFocused();
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  expect(await editor.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // The page behind doesn't scroll while it is open.
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(100, 300);
  await page.mouse.wheel(0, 800);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await page.screenshot({ path: path.join(SHOTS_DIR, "role-editor-1280x650.png") });
  // Cancel closes it and focus goes back to the button that opened it.
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("a confirm dialog uses the shared dialog: Cancel first, Escape cancels", async ({ page }) => {
  await mockWideApi(page);
  await mockPickerApi(page);
  await page.goto("/memory");
  await page.getByRole("button", { name: /Actions for/ }).first().click();
  await page.getByRole("menuitem", { name: /Forget/ }).click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "alertdialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectReachable(page, dialog.locator("[data-modal-footer] button").last(), "confirm");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
