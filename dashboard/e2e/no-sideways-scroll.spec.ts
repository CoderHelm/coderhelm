import { expect, test, type Page } from "@playwright/test";
import { ROUTES } from "../src/lib/routes";
import { mockWideApi } from "./wide-data";
import { SAMPLE_QUERY } from "./wide-data/addresses";

// No page scrolls sideways on a phone. Every page in the route map
// (lib/routes.ts) is opened at phone widths with records full of long,
// unbroken strings (wide-data/long.ts): shas, URLs, branch names, file paths,
// tables and code. A page fails if the document is wider than the screen, and
// the failure names the elements that stick out past the right edge.
//
// A new page is covered as soon as it is in the route map. An item's page
// (`detail: true`) also needs a sample address in wide-data/addresses.ts, and
// any data it loads needs an answer in wide-data/: the spec fails and names
// what is missing.

const WIDTHS = [375, 390];

/** Every page in the route map, and the not-found page. */
const PAGES = [...Object.keys(ROUTES), "/no-such-page"];

/**
 * The widest offenders: elements whose box ends past the screen's right edge
 * (or starts left of 0), and text that spills out of its element, when not
 * inside a box that scrolls or clips them. Only the outermost of a nested run
 * of elements is listed.
 */
async function offenders(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const contained = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX !== "visible" || cs.position === "fixed") return true;
      }
      return getComputedStyle(el).position === "fixed";
    };
    const sticksOut = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5) && !contained(el);
    };
    const all = Array.from(document.body.querySelectorAll("*")).filter(sticksOut);
    const set = new Set(all);
    const outermost = all.filter((el) => !el.parentElement || !set.has(el.parentElement));
    // Text can spill out of a box that itself fits (an unbroken token in a
    // narrow <p>): name the text's parent, at the text's right edge.
    const spilled = new Map<Element, number>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || !n.textContent?.trim() || set.has(parent) || getComputedStyle(parent).overflowX !== "visible") continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 0.5 && !contained(parent)) spilled.set(parent, Math.max(spilled.get(parent) ?? 0, r.right));
    }
    return [...outermost.map((el) => ({ el, right: el.getBoundingClientRect().right })), ...[...spilled].map(([el, right]) => ({ el, right }))]
      .map(({ el, right }) => {
        const id = el.getAttribute("data-testid");
        const cls = (el.getAttribute("class") || "").split(/\s+/).slice(0, 8).join(".");
        const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
        return { right: Math.round(right), el: `${el.tagName.toLowerCase()}${id ? `[data-testid=${id}]` : ""}${cls ? `.${cls}` : ""}`, text };
      })
      .sort((a, b) => b.right - a.right)
      .slice(0, 8);
  });
}

test.describe.configure({ mode: "parallel" });

for (const path of PAGES) {
  test(`no sideways scroll: ${path}`, async ({ page }) => {
    const info = ROUTES[path];
    if (info?.detail) {
      expect(SAMPLE_QUERY[path], `${path} is an item's page: add a sample address for it to e2e/wide-data/addresses.ts`).toBeTruthy();
    }
    const { unanswered } = await mockWideApi(page);
    // The dev overlay's badge is not part of the page.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal{display:none!important}";
        document.head.appendChild(s);
      });
    });
    const problems: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path + (SAMPLE_QUERY[path] ?? ""));
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page.getByTestId("topbar")).toBeVisible();
      // Let charts and late layouts settle.
      await page.waitForTimeout(300);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (scrollWidth > clientWidth) {
        const list = (await offenders(page)).map((o) => `    right=${o.right}px  ${o.el}  "${o.text}"`).join("\n");
        problems.push(`${path} at ${width}px is ${scrollWidth - clientWidth}px wider than the screen:\n${list}`);
      }
    }
    const missing = [...new Set(unanswered)];
    if (missing.length) problems.push(`${path} loads data e2e/wide-data/ does not answer; add it there:\n    ${missing.join("\n    ")}`);
    expect(problems.join("\n"), `${path} scrolls sideways on a phone, or is drawn without its data`).toBe("");
  });
}
