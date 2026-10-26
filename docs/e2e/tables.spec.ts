import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Tables (components/table.tsx) and definition lists (app/global.css), at
// desktop and phone widths, in both themes.

const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/** Pages with the most, widest or longest tables and lists. */
const TABLE_PAGES = [
  '/self-host/backups/',
  '/self-host/options/',
  '/self-host/config-reference/',
  '/self-host/check-your-install/',
  '/self-host/domains/',
  '/self-host/troubleshooting/',
  '/self-host/hybrid/',
  '/self-host/knowledge-sources/',
  '/concepts/knowledge-sources/',
  '/concepts/agent-permissions/',
  '/api/errors/',
  '/api/pagination/',
  '/plugins/manifest-reference/',
];

/** What each table looks like on the page, for the checks below. */
async function tableFacts(page: Page) {
  return page.evaluate(() => {
    const lineHeight = (el: Element) => parseFloat(getComputedStyle(el).lineHeight) || 20;
    return [...document.querySelectorAll('#nd-page table')].map((table) => {
      const box = table.parentElement!;
      return {
        inBox: box.classList.contains('ch-table') && box.getAttribute('role') === 'region' && box.tabIndex === 0,
        boxScrolls: getComputedStyle(box).overflowX === 'auto',
        headersOnOneLine: [...table.querySelectorAll('th')].every((th) => th.getBoundingClientRect().height <= lineHeight(th) * 1.6 + 22),
        // An identifier in a key column never wraps.
        wrappedKeys: [...table.querySelectorAll('td[data-fit="key"] code')]
          .filter((c) => c.getClientRects().length > 1)
          .map((c) => c.textContent),
        // A text column never shrinks to a word a line.
        narrowText: [...table.querySelectorAll('td[data-fit="text"]')]
          .filter((td) => td.getBoundingClientRect().width < 110)
          .map((td) => td.textContent?.slice(0, 40)),
      };
    });
  });
}

for (const scheme of ['dark', 'light'] as const) {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test.describe(`tables at ${width}px in ${scheme}`, () => {
      test.use({ viewport: { width, height }, colorScheme: scheme, ...(width === 390 ? { isMobile: true, hasTouch: true } : {}) });

      for (const url of TABLE_PAGES) {
        test(`${url}: tables scroll in their box, the page never sideways`, async ({ page }) => {
          await page.goto(url);
          await page.waitForLoadState('networkidle');
          const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
          expect(scroll, `${url} is ${scroll}px wide on a ${inner}px screen`).toBeLessThanOrEqual(inner);
          for (const t of await tableFacts(page)) {
            expect(t.inBox, 'every table sits in a focusable scroll box').toBe(true);
            expect(t.boxScrolls).toBe(true);
            expect(t.headersOnOneLine, 'header cells stay on one line').toBe(true);
            expect(t.wrappedKeys, 'identifiers in key columns stay whole').toEqual([]);
            expect(t.narrowText, 'no text column is squeezed to a word a line').toEqual([]);
          }
          await shot(page, `${url.replace(/^\/|\/$/g, '').replace(/\//g, '_')}-${width}-${scheme}`);
        });
      }
    });
  }
}

test('settings, checks and fields read as definition lists, not wide tables', async ({ page }) => {
  // The self-host guides (options, config reference, backups, troubleshooting)
  // join this list once platform.lock.json pins the platform commit that
  // turned their tables into lists.
  for (const [url, term] of [
    ['/plugins/manifest-reference/', 'monthly_tokens'],
    ['/concepts/skills/', 'description'],
    ['/api/errors/', 'scope'],
  ] as const) {
    await page.goto(url);
    const item = page.locator('#nd-page li').filter({ has: page.locator('strong', { hasText: term }) }).first();
    await expect(item, `${url}: ${term}`).toBeVisible();
    const list = item.locator('xpath=..');
    expect(await list.evaluate((ul) => getComputedStyle(ul).listStyleType), `${url}: no bullets`).toBe('none');
    expect(await item.evaluate((li) => parseFloat(getComputedStyle(li).borderBottomWidth)), `${url}: a hairline between items`).toBeGreaterThan(0);
  }
});

test('an imported page shows no import comment, and its edit link opens the platform source', async ({ page }) => {
  for (const name of ['backups', 'email', 'options']) {
    await page.goto(`/self-host/${name}/`);
    await expect(page.locator('#nd-page')).not.toContainText('{/*');
    await expect(page.locator('#nd-page')).not.toContainText('Imported from');
    await expect(page.getByRole('link', { name: /edit on github/i })).toHaveAttribute(
      'href',
      `https://github.com/CoderHelm/coderhelm-platform/blob/main/docs/self-host/${name}.md`,
    );
  }
});
