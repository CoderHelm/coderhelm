import { expect, test, type Page } from "@playwright/test";
import { ROUTES } from "../src/lib/routes";
import { mockWideApi } from "./wide-data";
import { SAMPLE_QUERY } from "./wide-data/addresses";
import { NOTES, REPO } from "./wide-data/long";

// Long saved text reads like text: instructions show formatted (real bullets,
// headings, code) until someone edits them, the box grows with what it holds
// up to most of the screen and then scrolls inside, and no page prints raw
// markdown. Records come from wide-data/, whose instructions are a long
// bulleted list (NOTES).

const CONFIG = `/reviewer/config${SAMPLE_QUERY["/reviewer/config"]}`;

/** The wide-data backend, with saves recorded and the signed-in role chosen. */
async function mock(page: Page, role = "owner") {
  await mockWideApi(page);
  const puts: { path: string; body: unknown }[] = [];
  // Registered after the wide-data routes, so these answer first.
  await page.route(
    (url) => url.pathname === "/api/me",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ user_id: "u_self", team_id: "t_1", github_login: "dana", email: "dana@example.com", avatar_url: "", role, mfa_enabled: false }),
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/reviewer/"),
    async (route) => {
      const req = route.request();
      if (req.method() !== "PUT") return route.fallback();
      puts.push({ path: new URL(req.url()).pathname, body: req.postDataJSON() });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    },
  );
  return { puts };
}

const focusField = (page: Page) => page.getByTestId("review-focus-field");

test("a long review focus shows as formatted bullets, with body-size muted text and a reading-width line", async ({ page }) => {
  await mock(page);
  await page.goto(CONFIG);
  const field = focusField(page);
  const reading = field.getByTestId("md-reading");
  await expect(reading).toBeVisible();
  await expect(field).toHaveAttribute("data-mode", "view");

  // Real bullets, a heading and code, not "- " and "##" and backticks.
  await expect(reading.getByRole("heading", { name: "Pay close attention to" })).toBeVisible();
  const items = reading.getByRole("listitem");
  expect(await items.count()).toBeGreaterThanOrEqual(12);
  await expect(items.first()).toContainText("Auth changes: any edit under src/auth/");
  await expect(reading.locator("code").first()).toHaveText("src/auth/");
  await expect(reading).not.toContainText("- Auth changes");
  await expect(reading).not.toContainText("## Pay");
  await expect(reading).not.toContainText("`");

  // Body size like the rest of the settings, not white, lines no longer than ~80 characters.
  const look = await items.first().evaluate((li) => {
    const ul = li.parentElement!;
    const help = document.querySelector("#reviews p") ?? document.body;
    return {
      size: getComputedStyle(li).fontSize,
      helpSize: getComputedStyle(help).fontSize,
      color: getComputedStyle(li).color,
      lineHeight: parseFloat(getComputedStyle(li).lineHeight) / parseFloat(getComputedStyle(li).fontSize),
      width: ul.getBoundingClientRect().width,
      ch: (() => {
        const probe = document.createElement("span");
        probe.style.cssText = "position:absolute;visibility:hidden;width:80ch";
        ul.appendChild(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return w;
      })(),
    };
  });
  expect(look.size).toBe(look.helpSize);
  expect(look.color).not.toBe("rgb(255, 255, 255)");
  expect(look.lineHeight).toBeGreaterThanOrEqual(1.5);
  expect(look.width).toBeLessThanOrEqual(look.ch + 1);

  // Nothing is cut at the top: the first line starts inside the box.
  const top = await reading.evaluate((el) => {
    const first = el.querySelector("h1, h2, h3, p, ul, ol")!;
    return { box: el.getBoundingClientRect().top, first: first.getBoundingClientRect().top, scrolled: el.scrollTop };
  });
  expect(top.scrolled).toBe(0);
  expect(top.first).toBeGreaterThanOrEqual(top.box);
});

test("editing the review focus still saves, keeps the marks, and goes back to the formatted view", async ({ page }) => {
  const { puts } = await mock(page);
  await page.goto(CONFIG);
  const field = focusField(page);
  await expect(field.getByTestId("md-reading")).toBeVisible();
  // Only unsaved edits are marked; "differs from the default" is not repeated on every row.
  await expect(page.getByText("Not default")).toHaveCount(0);

  await field.getByRole("button", { name: "Edit" }).click();
  const box = page.getByLabel("Review focus");
  await expect(box).toBeFocused();
  await expect(box).toHaveValue(NOTES);
  await expect(field).toHaveAttribute("data-mode", "edit");
  await expect(field.getByRole("tab", { name: "Preview" })).toBeVisible();
  // Prose, not code: no monospace while writing.
  expect(await box.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/mono/i);

  const next = "## Focus\n\n- Auth changes\n- Database migrations";
  await box.fill(next);
  await expect(field.locator("xpath=ancestor::div[contains(@class,'py-4')][1]").getByText("Unsaved", { exact: true })).toBeVisible();

  // Preview shows it formatted before saving.
  await field.getByRole("tab", { name: "Preview" }).click();
  await expect(field.getByTestId("md-preview").getByRole("listitem")).toHaveCount(2);

  // Focus leaves the box: it shows the unsaved text formatted, still marked unsaved.
  await page.getByRole("heading", { name: "Reviews" }).click();
  await expect(field).toHaveAttribute("data-mode", "view");
  await expect(field.getByTestId("md-reading").getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Reviewer settings saved")).toBeVisible();
  const saved = puts.filter((p) => p.path === `/api/reviewer/config/${REPO}`);
  expect(saved).toHaveLength(1);
  expect((saved[0].body as { instructions: string }).instructions).toBe(next);

  // The label still reaches the box from the formatted view (keyboard and tests alike).
  await page.getByText("Review focus", { exact: true }).click();
  await expect(box).toBeFocused();
  await expect(field).toHaveAttribute("data-mode", "edit");
});

test("the box grows with the text, then scrolls inside at about 60% of the screen, in whole lines with a soft edge", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(CONFIG);
  const field = focusField(page);
  await field.getByRole("button", { name: "Edit" }).click();
  const box = page.getByLabel("Review focus");

  await box.fill("One line.");
  const small = (await box.boundingBox())!.height;
  await box.fill(Array.from({ length: 8 }, (_, i) => `- rule ${i + 1}`).join("\n"));
  const grown = (await box.boundingBox())!.height;
  expect(grown).toBeGreaterThan(small + 80);
  expect(await box.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(false);

  await box.fill(`${NOTES}\n\n${NOTES}\n\n${NOTES}`);
  const m = await box.evaluate((el) => {
    const cs = getComputedStyle(el);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return { h: el.clientHeight, sh: el.scrollHeight, pad, line: parseFloat(cs.lineHeight), vh: window.innerHeight, overflow: cs.overflowY };
  });
  expect(m.h).toBeLessThanOrEqual(m.vh * 0.6 + 1);
  expect(m.h).toBeGreaterThan(m.vh * 0.6 - m.line - m.pad - 2);
  expect(m.sh).toBeGreaterThan(m.h);
  expect(m.overflow).toBe("auto");
  // Whole lines: the box is padding plus a whole number of lines.
  const rest = (m.h - m.pad) % m.line;
  expect(Math.min(rest, m.line - rest)).toBeLessThan(1);

  // Scrolled part way, the top edge fades instead of cutting a line in half.
  await box.evaluate((el) => {
    el.scrollTop = 37;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(box).toHaveAttribute("data-faded", "true");
  expect(await box.evaluate((el) => getComputedStyle(el).maskImage)).toContain("linear-gradient");

  // The formatted view has the same limit and scrolls inside too.
  await page.getByRole("heading", { name: "Reviews" }).click();
  const reading = field.getByTestId("md-reading");
  await expect(reading).toBeVisible();
  const r = await reading.evaluate((el) => ({ h: el.clientHeight, sh: el.scrollHeight, vh: window.innerHeight }));
  expect(r.h).toBeLessThanOrEqual(r.vh * 0.6 + 1);
  expect(r.sh).toBeGreaterThan(r.h);
});

test("viewers see the formatted text only, with no box and no Edit", async ({ page }) => {
  await mock(page, "member");
  await page.goto(CONFIG);
  const field = focusField(page);
  await expect(field).toHaveAttribute("data-mode", "read");
  await expect(field.getByTestId("md-reading").getByRole("listitem").first()).toContainText("Auth changes");
  await expect(field.locator("textarea")).toHaveCount(0);
  await expect(field.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(field.getByRole("toolbar")).toHaveCount(0);

  // The team standards too, in their own view.
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Every repository" }).click();
  const standards = page.getByTestId("org-standards-field");
  await expect(standards).toHaveAttribute("data-mode", "read");
  await expect(standards.getByTestId("md-reading").getByRole("listitem").first()).toContainText("Auth changes");
  await expect(standards.locator("textarea")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save standards" })).toHaveCount(0);
});

test("on a phone the formatted view fits the screen and the Edit button is in reach", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CONFIG);
  const field = focusField(page);
  const reading = field.getByTestId("md-reading");
  await expect(reading.getByRole("listitem").first()).toBeVisible();
  const b = (await field.boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(390);
  const r = await reading.evaluate((el) => ({ h: el.clientHeight, vh: window.innerHeight }));
  expect(r.h).toBeLessThanOrEqual(r.vh * 0.6 + 1);
  const edit = (await field.getByRole("button", { name: "Edit" }).boundingBox())!;
  expect(edit.x + edit.width).toBeLessThanOrEqual(390);
  expect(edit.height).toBeGreaterThanOrEqual(32);
});

// Every page, cheaply: text people read is never raw markdown. A line on the
// page that starts with "- ", "* " or "## " outside code and text boxes is a
// list or heading that was printed instead of drawn.
test.describe("no page prints raw markdown", () => {
  test.describe.configure({ mode: "parallel" });
  const REDIRECTS = new Set(["/settings/aws", "/settings/github", "/settings/jira", "/settings/plugins"]);
  for (const path of Object.keys(ROUTES).filter((p) => !REDIRECTS.has(p))) {
    test(`raw markdown: ${path}`, async ({ page }) => {
      await mockWideApi(page);
      await page.goto(path + (SAMPLE_QUERY[path] ?? ""));
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page.getByTestId("topbar")).toBeVisible();
      const raw = await page.evaluate(() => {
        const skip = (el: Element | null) => !!el?.closest("textarea, pre, code, [data-raw-text], .sr-only, [aria-hidden='true'], [hidden]");
        const hits: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          // Code and logs (monospace) are shown as written, on purpose.
          if (skip(el) || !el?.checkVisibility() || /mono/i.test(getComputedStyle(el).fontFamily)) continue;
          for (const line of (n.textContent ?? "").split("\n")) {
            if (/^\s*(?:[-*] \S|#{1,4} \S)/.test(line)) hits.push(line.trim().slice(0, 80));
          }
        }
        return hits;
      });
      expect(raw, `${path} shows raw markdown`).toEqual([]);
    });
  }
});
