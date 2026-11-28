import { expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Shared by the landing-shots specs: the pictures of the dashboard on
// coderhelm.com, taken from made up data only (team Acme, acme/web, acme/api,
// ACME tickets, invented people). They run only with LANDING_SHOTS_DIR set:
//   LANDING_SHOTS_DIR=/tmp/landing E2E_STATIC=1 npx playwright test e2e/landing-shots
// Each picture is written twice: `<name>.png` in the light colors of the
// public site (brand/BRAND.md: ink on paper) and `<name>-dark.png` as the
// dashboard ships. The light one is the same page with its color variables
// mirrored, nothing redrawn.

export const SHOTS_DIR = process.env.LANDING_SHOTS_DIR;

// The dashboard's neutrals, mirrored onto the site's paper tones.
const ZINC: Record<string, string> = {
  "950": "#ffffff",
  "900": "#f7f6f2",
  "800": "#e6e4dd",
  "700": "#d3d1c9",
  "600": "#a2a19b",
  "500": "#73737b",
  "400": "#5b5b63",
  "300": "#46464e",
  "200": "#2f2f34",
  "100": "#202024",
  "50": "#18181b",
};

/** Mirrors every Tailwind color variable on the page: dark shades become light ones and back. */
async function mirrorColors(page: Page) {
  await page.evaluate((zinc) => {
    const root = document.documentElement;
    const vars = new Map<string, string>();
    const visit = (rules: CSSRuleList) => {
      for (const r of Array.from(rules)) {
        if ("cssRules" in r && (r as CSSGroupingRule).cssRules && !(r instanceof CSSStyleRule)) visit((r as CSSGroupingRule).cssRules);
        if (r instanceof CSSStyleRule && /:root|:host/.test(r.selectorText)) {
          for (const name of Array.from(r.style)) if (name.startsWith("--color-")) vars.set(name, r.style.getPropertyValue(name).trim());
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        visit(sheet.cssRules);
      } catch {
        /* a sheet from another origin */
      }
    }
    for (const [name, value] of vars) {
      const shade = /^--color-([a-z]+)-(\d+)$/.exec(name);
      if (shade && (shade[1] === "zinc" || shade[1] === "neutral")) {
        if (zinc[shade[2]]) root.style.setProperty(name, zinc[shade[2]]);
        continue;
      }
      const m = /^oklch\(([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\)$/.exec(value);
      if (!shade || !m) continue;
      const l = Number(m[1]) / (m[2] ? 100 : 1);
      const mirrored = Math.min(0.97, Math.max(0.3, 1.25 - l));
      root.style.setProperty(name, `oklch(${(mirrored * 100).toFixed(1)}% ${m[3]} ${m[4]})`);
    }
    root.style.setProperty("--color-white", "#18181b");
    root.style.setProperty("--color-black", "#ffffff");
    // The logo's two outer strokes are drawn in white on purpose.
    for (const el of Array.from(document.querySelectorAll('svg [fill="white"]'))) el.setAttribute("fill", "#18181b");
    root.style.colorScheme = "light";
    root.classList.remove("dark");
  }, ZINC);
}

/** Before the page loads: the system font in place of the test font, no dev overlays. */
export async function prepare(page: Page) {
  await page.route("**/__e2e/fonts.css", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.addInitScript(() => {
    const style = document.createElement("style");
    // The top bar is see-through over a scrolled page; in a still picture that
    // reads as smudged text, so it is set solid.
    style.textContent = "nextjs-portal,[data-testid=toast]{display:none!important}*{scrollbar-width:none}.sticky.top-0{backdrop-filter:none!important;background-color:var(--color-zinc-950)!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
}

/**
 * Saves `<name>-dark.png`, then `<name>.png` in the site's light colors.
 * `target` crops to one element; without it the viewport is taken. The page
 * must not scroll sideways.
 */
export async function capture(page: Page, name: string, target?: Locator) {
  fs.mkdirSync(SHOTS_DIR!, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, `${name} scrolls sideways`).toBeLessThanOrEqual(1);
  const shot = (file: string) => (target ? target.screenshot({ path: file, animations: "disabled" }) : page.screenshot({ path: file, animations: "disabled" }));
  await shot(path.join(SHOTS_DIR!, `${name}-dark.png`));
  await mirrorColors(page);
  await page.waitForTimeout(200);
  await shot(path.join(SHOTS_DIR!, `${name}.png`));
}
