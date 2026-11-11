import { expect, test, type Page } from "@playwright/test";

// The header menus are <details> elements. Quick repeated clicks on a summary
// used to count as a triple click and select the whole block, which painted a
// selection highlight behind every label in the open panel.

const selection = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");

async function expectNoHighlight(page: Page, panelLinks: ReturnType<Page["locator"]>) {
  expect(await selection(page)).toBe("");
  const backgrounds = await panelLinks.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(backgrounds.length).toBeGreaterThan(0);
  for (const bg of backgrounds) expect(bg).toBe("rgba(0, 0, 0, 0)");
}

const cases = [
  { name: "Features menu", width: 1280, summary: (p: Page) => p.locator("summary", { hasText: "Features" }) },
  { name: "phone menu", width: 400, summary: (p: Page) => p.locator('summary[aria-label="Menu"]') },
];

for (const c of cases) {
  test.describe(c.name, () => {
    test.use({ viewport: { width: c.width, height: 800 } });

    test("clicks open it without selecting any text", async ({ page }) => {
      await page.goto("/");
      const summary = c.summary(page);
      const details = summary.locator("..");
      const links = details.locator("ul a");

      await summary.click();
      await expect(details).toHaveJSProperty("open", true);
      await expectNoHighlight(page, links);

      await summary.dblclick();
      await expectNoHighlight(page, links);

      // Open, close, open in quick succession from closed: the browser counts
      // the third click as a triple click.
      await details.evaluate((d) => ((d as HTMLDetailsElement).open = false));
      await summary.click({ clickCount: 3 });
      await expect(details).toHaveJSProperty("open", true);
      await expectNoHighlight(page, links);
    });

    test("Escape and a press outside close it", async ({ page }) => {
      await page.goto("/");
      const summary = c.summary(page);
      const details = summary.locator("..");

      await summary.click();
      await expect(details).toHaveJSProperty("open", true);
      await page.keyboard.press("Escape");
      await expect(details).toHaveJSProperty("open", false);

      await summary.click();
      await expect(details).toHaveJSProperty("open", true);
      await page.mouse.click(c.width - 5, 790);
      await expect(details).toHaveJSProperty("open", false);
    });

    test("works from the keyboard with a focus ring and no background", async ({ page }) => {
      await page.goto("/");
      const summary = c.summary(page);
      const details = summary.locator("..");

      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(details).toHaveJSProperty("open", true);

      // Focus moves by keyboard here, so :focus-visible applies. (Safari only
      // tabs to links with its "Press Tab to highlight each item" setting.)
      const first = details.locator("ul a").first();
      await first.focus();
      await expect(first).toBeFocused();
      const style = await first.evaluate((el) => {
        const s = getComputedStyle(el);
        return { outline: s.outlineStyle, bg: s.backgroundColor };
      });
      expect(style.outline).toBe("solid");
      expect(style.bg).toBe("rgba(0, 0, 0, 0)");
      expect(await selection(page)).toBe("");

      await page.keyboard.press("Escape");
      await expect(details).toHaveJSProperty("open", false);
      await expect(summary).toBeFocused();
    });
  });
}
