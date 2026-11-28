import { expect, test } from "@playwright/test";

// The home page: the headline beside the product itself, the parts of the
// platform each with its own screen, the real pull request, and links that all
// lead somewhere. It has to read at phone and desktop width.

const widths = [390, 1440];

for (const width of widths) {
  test.describe(`home at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("shows each section in order with no sideways scroll", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/An engineering platform/);
      const headings = await page.locator("main h2").allTextContents();
      expect(headings).toEqual([
        "What the platform does",
        "From ticket to pull request",
        "An example pull request",
        "After the pull request opens",
        "Run it in your own AWS account",
        "What else it does",
      ]);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(sideways).toBeLessThanOrEqual(0);
    });

    test("shows the product in the hero, loaded first, with alt text", async ({ page }) => {
      await page.goto("/");
      const img = page.locator("section[aria-labelledby=hero-h] img");
      await expect(img).toHaveCount(1);
      await expect(img).toBeVisible();
      expect((await img.getAttribute("alt"))?.length ?? 0).toBeGreaterThan(30);
      await expect(img).toHaveAttribute("loading", "eager");
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const box = (await img.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
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

test("each part of the platform has its own screenshot, sized and lazy", async ({ page }) => {
  await page.goto("/");
  const parts = page.locator("#platform li");
  await expect(parts).toHaveCount(6);
  await expect(page.locator("#platform h3")).toHaveText(["Tickets to pull requests", "Code review", "Alerts", "Releases", "Chat and knowledge", "App map"]);
  const imgs = await page.locator("#platform img").evaluateAll((els) =>
    els.map((el) => ({ alt: el.getAttribute("alt") ?? "", loading: el.getAttribute("loading"), width: el.getAttribute("width"), height: el.getAttribute("height") })),
  );
  expect(imgs).toHaveLength(6);
  for (const i of imgs) {
    expect(i.alt.length).toBeGreaterThan(30);
    expect(i.loading).toBe("lazy");
    expect(Number(i.width)).toBeGreaterThan(0);
    expect(Number(i.height)).toBeGreaterThan(0);
  }
  // Every picture loads, in AVIF or WebP where the browser takes them.
  for (const img of await page.locator("main img").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
});

test("every section shares one container width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const lefts = await page.locator("main > section > div").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
  expect(new Set(lefts).size, lefts.join(",")).toBe(1);
});

test("the footer and nav describe the platform", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("footer")).toContainText("An engineering platform");
  await expect(page.locator("footer")).not.toContainText("AI engineer");
  const nav = page.locator("header nav > ul");
  await expect(nav.getByRole("link", { name: "Trust" })).toHaveAttribute("href", "/security/");
  await expect(nav.getByRole("link", { name: "Security", exact: true })).toHaveCount(0);
});

test("the link preview shows the platform headline", async ({ page, request }) => {
  await page.goto("/");
  const meta = (key: string) => page.locator(`meta[property="${key}"], meta[name="${key}"]`).first().getAttribute("content");
  for (const key of ["og:image:alt", "twitter:image:alt"]) {
    expect(await meta(key), key).toContain("An engineering platform for your tickets, pull requests, alerts and releases.");
  }
  expect(await meta("og:image:width")).toBe("1200");
  expect(await meta("og:image:height")).toBe("630");
  const png = await (await request.get("/og-image.png")).body();
  // PNG header: width and height as big-endian numbers at bytes 16 and 20.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});

test("the generated text versions name no account in the thread", async ({ request }) => {
  for (const path of ["/llms.txt", "/llms-full.txt", "/index.md"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect((await res.text()).toLowerCase(), path).not.toContain("nambok");
  }
  expect(await (await request.get("/index.md")).text()).toContain("**Developer** on `.env.example`: we should remove this too no?");
});

test("quotes the real pull request and links to it", async ({ page }) => {
  await page.goto("/");
  const pr = page.locator("#a-real-one");
  await expect(pr.getByRole("link", { name: "Add GA4 gtag.js to Next.js marketing site" })).toHaveAttribute("href", "https://github.com/CoderHelm/coderhelm/pull/7");
  await expect(pr.getByText("we should remove this too no?")).toBeVisible();
  await expect(pr.getByRole("link", { name: "5b016f4" })).toHaveAttribute("href", "https://github.com/CoderHelm/coderhelm/commit/5b016f4");
  // The person in the thread is labelled by role, never by account name.
  await expect(pr.getByText("Developer", { exact: true })).toHaveCount(2);
  await expect(pr.getByText("coderhelm[bot]", { exact: true })).toHaveCount(2);
  expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("nambok");
  expect((await page.content()).toLowerCase()).not.toContain("nambok");
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
