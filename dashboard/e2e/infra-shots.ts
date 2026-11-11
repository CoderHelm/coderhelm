import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Screenshots for the infrastructure screens, when E2E_SHOTS_DIR is set: at
// 1280 and 400 wide, one viewport-high shot per screenful from the top (a
// full-page capture stitches the fixed sidebar and header into the middle),
// with toasts and the dev overlay hidden. Each width is also checked for
// sideways scroll.

export async function shoot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const hide = await page.addStyleTag({ content: "nextjs-portal,[data-testid=toast]{display:none!important}" });
  for (const [width, height] of [[1280, 900], [400, 860]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide, `${name} at ${width} scrolls sideways`).toBeLessThanOrEqual(0);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const parts = Math.min(8, Math.max(1, Math.ceil(total / height)));
    for (let i = 0; i < parts; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * height);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(dir, `${name}-${width}-${i + 1}.png`) });
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await hide.evaluate((el) => (el as Element).remove());
  await page.setViewportSize({ width: 1280, height: 800 });
}
