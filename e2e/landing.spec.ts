import { expect, test } from "@playwright/test";

// The home page: three claims, the real pull request behind them, and links
// that all lead somewhere. It has to read at phone and desktop width.

const widths = [390, 1440];

for (const width of widths) {
  test.describe(`home at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("shows each section in order with no sideways scroll", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Give it a ticket/);
      const headings = await page.locator("main h2").allTextContents();
      expect(headings).toEqual([
        "From ticket to pull request",
        "Here is one you can check.",
        "Then it stays on the pull request.",
        "It can run in your own AWS account.",
        "What else it does",
      ]);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(sideways).toBeLessThanOrEqual(0);
    });

    test("keeps the sign in and get started buttons", async ({ page }) => {
      await page.goto("/");
      const header = page.locator("header");
      if (width < 1024) await header.locator('summary[aria-label="Menu"]').click();
      await expect(header.getByRole("link", { name: "Sign in" }).locator("visible=true")).toHaveAttribute("href", /app\.coderhelm\.com/);
      await expect(header.getByRole("link", { name: "Get started" }).locator("visible=true")).toHaveAttribute("href", /app\.coderhelm\.com/);
      await expect(page.locator("main").getByRole("link", { name: "Get started" }).first()).toBeVisible();
    });
  });
}

test("quotes the real pull request and links to it", async ({ page }) => {
  await page.goto("/");
  const pr = page.locator("#a-real-one");
  await expect(pr.getByRole("link", { name: "Add GA4 gtag.js to Next.js marketing site" })).toHaveAttribute("href", "https://github.com/CoderHelm/coderhelm/pull/7");
  await expect(pr.getByText("we should remove this too no?")).toBeVisible();
  await expect(pr.getByRole("link", { name: "5b016f4" })).toHaveAttribute("href", "https://github.com/CoderHelm/coderhelm/commit/5b016f4");
});

test("has no eyebrow labels, gradient text or decorative grid", async ({ page }) => {
  await page.goto("/");
  const decorated = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].filter((el) => {
      const s = getComputedStyle(el);
      return s.backgroundImage.includes("gradient") || (s.textTransform === "uppercase" && (el.textContent ?? "").trim().length > 0);
    }).length,
  );
  expect(decorated).toBe(0);
});

test("every link on the page leads to a page or anchor that exists", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  for (const href of new Set(hrefs)) {
    if (href.startsWith("#")) {
      expect(await page.locator(href).count(), href).toBe(1);
    } else if (href.startsWith("/")) {
      const path = href.split("#")[0];
      const res = await request.get(path.endsWith("/") || path.includes(".") ? path : `${path}/`);
      expect(res.status(), href).toBe(200);
    }
  }
});
