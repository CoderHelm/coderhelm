import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Diagrams are inline SVG drawn at build time (components/diagram.tsx). These
// tests open the built pages the way a reader does: desktop and phone, dark
// and light, and with JavaScript off.

const PAGES = [
  { url: '/concepts/', id: 'how-it-works', title: 'How work moves through CoderHelm' },
  { url: '/plugins/', id: 'plugin-run', title: 'How a plugin run works' },
  { url: '/concepts/chat/', id: 'chat-answers', title: 'How Chat answers a question' },
];
const SHOTS = process.env.E2E_SHOTS;

/** Rendered size over drawn size: below 1 the drawing has been shrunk to fit. */
async function scale(page: Page, id: string) {
  return page.locator(`svg.ch-dg-svg[data-diagram="${id}"]:visible`).evaluate((svg) => {
    const vb = (svg as SVGSVGElement).viewBox.baseVal;
    return svg.getBoundingClientRect().width / vb.width;
  });
}

/** Every label and detail line that runs past its box, in the visible drawing. */
async function overflowingText(page: Page, id: string) {
  return page.locator(`svg.ch-dg-svg[data-diagram="${id}"]:visible`).evaluate((svg) => {
    const out: string[] = [];
    for (const g of svg.querySelectorAll('g.ch-dg-node')) {
      const rect = g.querySelector('rect') as SVGRectElement;
      const right = rect.x.baseVal.value + rect.width.baseVal.value;
      for (const t of g.querySelectorAll('text')) {
        const x = (t as SVGTextElement).x.baseVal[0].value;
        const end = x + (t as SVGTextElement).getComputedTextLength();
        if (end > right - 6) out.push(`${g.getAttribute('data-node')}: "${t.textContent}" ends at ${end.toFixed(1)}, box at ${right}`);
      }
    }
    for (const g of svg.querySelectorAll('g.ch-dg-edge-label')) {
      const rect = g.querySelector('rect') as SVGRectElement;
      const t = g.querySelector('text') as SVGTextElement;
      if (t.getComputedTextLength() > rect.width.baseVal.value - 4) out.push(`edge label "${t.textContent}" is wider than its pill`);
    }
    return out;
  });
}

for (const p of PAGES) {
  test(`${p.url}: the diagram is an SVG image with a title and a description, and no copy button`, async ({ page }) => {
    await page.goto(p.url);
    const figure = page.locator(`figure.ch-dg[data-diagram="${p.id}"]`);
    await expect(figure).toHaveCount(1);
    const svg = figure.locator('svg[role="img"]:visible');
    await expect(svg).toHaveCount(1);
    await expect(svg.locator('title')).toHaveText(p.title);
    expect((await svg.locator('desc').textContent())?.length ?? 0).toBeGreaterThan(40);
    // The accessible name is the title and the description.
    await expect(page.getByRole('img', { name: new RegExp(`^${p.title}`) })).toBeVisible();
    // Not a code block: nothing to copy, no monospace picture left behind.
    await expect(figure.locator('button')).toHaveCount(0);
    await expect(figure.locator('pre, code')).toHaveCount(0);
    expect(await page.locator('#nd-page pre').allTextContents()).not.toContainEqual(expect.stringMatching(/[─│└►▶]/));
    // The same diagram as text, one click away.
    await figure.locator('summary', { hasText: 'Diagram as text' }).click();
    await expect(figure.locator('details ol li').first()).toBeVisible();
  });

  test(`${p.url}: every label fits its box, and the drawing is near full size on desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(p.url);
    await page.evaluate(() => document.fonts.ready);
    expect(await overflowingText(page, p.id)).toEqual([]);
    expect(await scale(page, p.id)).toBeGreaterThanOrEqual(0.85);
    await expect(page.locator(`svg.ch-dg-wide[data-diagram="${p.id}"]`)).toBeVisible();
  });

  test(`${p.url}: at 390px the stacked drawing shows at full size, with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(p.url);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(`svg.ch-dg-narrow[data-diagram="${p.id}"]`)).toBeVisible();
    await expect(page.locator(`svg.ch-dg-wide[data-diagram="${p.id}"]`)).toBeHidden();
    expect(await scale(page, p.id)).toBeGreaterThanOrEqual(0.98);
    expect(await overflowingText(page, p.id)).toEqual([]);
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
    const box = await page.locator(`figure.ch-dg[data-diagram="${p.id}"]`).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });
}

test('diagrams follow the theme: dark and light differ, and text stays readable in both', async ({ browser }) => {
  const seen: Record<string, { node: string; label: string; png: Buffer }> = {};
  for (const scheme of ['dark', 'light'] as const) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((s) => localStorage.setItem('theme', s), scheme);
    await page.goto('/concepts/');
    await expect(page.locator('html')).toHaveClass(new RegExp(scheme === 'dark' ? '\\bdark\\b' : '^(?!.*\\bdark\\b)'));
    const figure = page.locator('figure.ch-dg').first();
    await figure.scrollIntoViewIfNeeded();
    const colors = await figure.locator('svg:visible g.ch-dg-node[data-node="gateway"]').evaluate((g) => ({
      node: getComputedStyle(g.querySelector('rect')!).fill,
      label: getComputedStyle(g.querySelector('text.ch-dg-label')!).fill,
    }));
    const png = await figure.screenshot();
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(path.join(SHOTS, `diagram-${scheme}.png`), png);
    }
    seen[scheme] = { ...colors, png };
    await ctx.close();
  }
  expect(seen.dark.node).not.toBe(seen.light.node);
  expect(seen.dark.label).not.toBe(seen.light.label);
  expect(Buffer.compare(seen.dark.png, seen.light.png)).not.toBe(0);
  for (const s of Object.values(seen)) expect(contrast(s.label, s.node)).toBeGreaterThanOrEqual(7);
});

test('diagrams need no JavaScript to show', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/concepts/');
  const svg = page.locator('svg.ch-dg-wide[data-diagram="how-it-works"]');
  await expect(svg).toBeVisible();
  await expect(svg.locator('g.ch-dg-node')).toHaveCount(15);
  await ctx.close();
});

test('the Markdown twin carries each diagram as its title and steps', async ({ request }) => {
  for (const p of PAGES) {
    const md = await (await request.get(`${p.url.replace(/\/$/, '')}.md`)).text();
    expect(md).toContain(`**Diagram: ${p.title}**`);
    expect(md).toMatch(/\n1\. .+\n2\. /);
    expect(md).not.toMatch(/<\/?Diagram/);
  }
  const full = await (await request.get('/llms-full.txt')).text();
  for (const p of PAGES) expect(full).toContain(`**Diagram: ${p.title}**`);
});

/** WCAG contrast of two computed colors (rgb(), or color(srgb ...) from color-mix). */
function contrast(a: string, b: string) {
  const lum = (c: string) => {
    const nums = (c.match(/[\d.]+/g) ?? []).map(Number);
    const [r, g, bl] = c.startsWith('color(') ? nums.slice(0, 3) : nums.slice(0, 3).map((n) => n / 255);
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
