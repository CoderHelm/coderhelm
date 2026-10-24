import { expect, test, type Page } from "@playwright/test";
import { ROUTES } from "../src/lib/routes";
import { mockWideApi } from "./wide-data";
import { SAMPLE_QUERY } from "./wide-data/addresses";

// No word is cut in two across lines. Every page in the route map
// (lib/routes.ts) is opened at desktop, tablet and phone widths with the
// wide-data records, and every word of visible text is measured: a word whose
// pieces sit on more than one line was broken inside it, like a "Route" label
// drawn as "Rout" over "e". The failure names the element and the word.
//
// Long unbroken strings (shas, URLs, paths, emails, ids) may wrap anywhere:
// that is what keeps a phone from scrolling sideways (no-sideways-scroll.spec.ts).
// They are told apart from words by shape, not by where they appear: a run of
// text with a digit, a URL, path or code character, or more than 32 letters is
// a token and is skipped. Everything else is a word and must stay whole; a
// hyphenated phrase may break after its hyphen.

const WIDTHS = [1280, 1024, 768, 390];

/** Every page in the route map, and the not-found page. */
const PAGES = [...Object.keys(ROUTES), "/no-such-page"];

interface Break {
  word: string;
  el: string;
  kind: string;
  text: string;
}

async function brokenWords(page: Page): Promise<Break[]> {
  return page.evaluate(() => {
    // A word: letters, with an apostrophe inside, 2 to 20 long.
    const WORD = /^\p{L}[\p{L}'\u2019]*\p{L}$/u;
    const out: Break[] = [];
    const seen = new Set<string>();
    const kindOf = (el: Element): string => {
      for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
        const tag = a.tagName.toLowerCase();
        const role = a.getAttribute("role");
        if (role === "tab") return "tab";
        if (tag === "button" || role === "button") return "button";
        if (tag === "label" || tag === "legend") return "label";
        if (/^h[1-6]$/.test(tag)) return "heading";
        if (tag === "th") return "table header";
        if (role === "option" || role === "menuitem") return "menu item";
        if (tag === "a") return "link";
        if (/\brounded-full\b/.test(a.getAttribute("class") || "") && getComputedStyle(a).display.includes("inline")) return "chip";
      }
      return "text";
    };
    const describe = (el: Element) => {
      const id = el.getAttribute("data-testid");
      const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 6).join(".");
      return `${el.tagName.toLowerCase()}${id ? `[data-testid=${id}]` : ""}${cls ? `.${cls}` : ""}`;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      const text = n.textContent ?? "";
      if (!parent || !text.trim()) continue;
      if (parent.closest("script, style, svg, nextjs-portal, [aria-hidden='true']")) continue;
      // Code keeps its own wrapping; a <pre> only wraps when it is told to.
      if (parent.closest("pre, code, textarea")) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const chunks = /[^\s\u00a0]+/g;
      for (let c = chunks.exec(text); c; c = chunks.exec(text)) {
        // Strip sentence punctuation; what is left is a word, a hyphenated
        // phrase ("sign-in"), or a token. A token is never measured.
        const chunk = c[0].replace(/[.,:;!?)"\u201d\u2019]+$/u, "").replace(/^[("\u201c\u2018]+/u, "");
        if (chunk.length > 32 || !/^[\p{L}'\u2019-]+$/u.test(chunk)) continue;
        const base = c.index + c[0].indexOf(chunk);
        const parts = /[^-]+/g;
        for (let m = parts.exec(chunk); m; m = parts.exec(chunk)) {
          const word = m[0];
          if (word.length < 2 || word.length > 20 || !WORD.test(word)) continue;
          range.setStart(n, base + m.index);
          range.setEnd(n, base + m.index + word.length);
          const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
          if (rects.length < 2) continue;
          const lineHeight = Math.min(...rects.map((r) => r.height));
          const tops = rects.map((r) => r.top).sort((a, b) => a - b);
          if (tops[tops.length - 1] - tops[0] < lineHeight / 2) continue;
          const el = describe(parent);
          const key = `${el}|${word}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ word, el, kind: kindOf(parent), text: (parent.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60) });
        }
      }
    }
    return out;
  });
}

test.describe.configure({ mode: "parallel" });

for (const path of PAGES) {
  test(`no mid-word breaks: ${path}`, async ({ page }) => {
    await mockWideApi(page);
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal{display:none!important}";
        document.head.appendChild(s);
      });
    });
    const problems: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path + (SAMPLE_QUERY[path] ?? ""));
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page.getByTestId("topbar")).toBeVisible();
      await page.waitForTimeout(300);
      for (const b of await brokenWords(page)) {
        problems.push(`${path} at ${width}px: the ${b.kind} word "${b.word}" is split across lines in ${b.el}  "${b.text}"`);
      }
    }
    expect(problems.join("\n"), `${path} breaks a word in the middle`).toBe("");
  });
}
