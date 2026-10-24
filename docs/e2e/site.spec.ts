import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

test('home page shows the sections and links into each', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('CoderHelm Docs');
  await expect(page.getByRole('heading', { level: 1, name: 'CoderHelm documentation' })).toBeVisible();
  const main = page.locator('#nd-page');
  for (const name of ['Quickstart', 'How it works', 'Build a plugin', 'Self-hosting', 'API', 'Changelog']) {
    await expect(main.locator('a[data-card]').filter({ hasText: new RegExp(`^${name}`) })).toBeVisible();
  }
  await shot(page, 'home-desktop');
});

test('search finds the plugin manifest reference', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('dialog').getByRole('textbox').or(page.getByRole('dialog').getByRole('combobox')).first();
  await expect(input).toBeVisible();
  await input.fill('manifest');
  const hit = page.getByRole('dialog').getByText('Manifest reference').first();
  await expect(hit).toBeVisible({ timeout: 15_000 });
  await shot(page, 'search');
  await hit.click();
  await expect(page).toHaveURL(/\/plugins\/manifest-reference\/?$/);
});

test('a plugin page shows its Coming soon badge, the field table and the edit link', async ({ page }) => {
  await page.goto('/plugins/manifest-reference/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Manifest reference');
  await expect(page.locator('h1 .ch-badge')).toHaveText('Coming soon');
  await expect(page.getByRole('cell', { name: 'name', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /edit on github/i })).toHaveAttribute('href', /CoderHelm\/coderhelm\/blob\/main\/docs\/schemas\/plugin-manifest\.schema\.json/);
  // The sidebar marks unreleased pages too.
  await expect(page.locator('aside .ch-badge').first()).toHaveText('Coming soon');
  await shot(page, 'plugin-manifest-desktop');
});

test('the walkthrough includes the real example files', async ({ page }) => {
  await page.goto('/plugins/walkthrough/');
  await expect(page.getByText('name: marketing').first()).toBeVisible();
  await expect(page.getByText('You write launch content').first()).toBeVisible();
  await expect(page.getByText('Never call').first()).toBeVisible();
});

test('the self-host section is served from the platform import', async ({ page }) => {
  await page.goto('/self-host/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/self-host/i);
  await expect(page.getByRole('link', { name: /edit on github/i })).toHaveAttribute('href', /CoderHelm\/coderhelm-platform\/(tree|blob)\/main\/docs\/self-host/);
  await shot(page, 'self-host-desktop');
});

test('code blocks have a copy button and tabs switch', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/getting-started/jira/');
  await page.getByRole('tab', { name: 'Jira webhook' }).click();
  await expect(page.getByText('If you can’t install apps').or(page.getByText("If you can't install apps"))).toBeVisible();
  await page.goto('/api/authentication/');
  const block = page.locator('figure').filter({ hasText: 'POST /api/teams/switch' }).first();
  await block.hover();
  await block.getByRole('button', { name: /copy/i }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/api/teams/switch');
});

test('dark by default, matching the dashboard, and the theme can switch', async ({ page }) => {
  await page.goto('/concepts/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(10, 10, 10)');
  await page.getByRole('button', { name: /toggle theme/i }).first().click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('an unknown page gets the 404 page', async ({ page }) => {
  const res = await page.goto('/plugins/no-such-page/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This page does not exist' })).toBeVisible();
});

test('pages offer Markdown, and agents can ask for it', async ({ page, request }) => {
  await page.goto('/concepts/token-limits/');
  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute('href', /\/concepts\/token-limits\.md$/);
  const md = await request.get('/concepts/token-limits/', { headers: { Accept: 'text/markdown' } });
  expect(md.headers()['content-type']).toContain('text/markdown');
  expect(await md.text()).toMatch(/^# Token limits/);
  const llms = await request.get('/llms.txt');
  expect(await llms.text()).toContain('https://docs.coderhelm.com/plugins/walkthrough.md');
});

const PHONE_PAGES = [
  '/',
  '/getting-started/',
  '/getting-started/reviewer/',
  '/concepts/skills/',
  '/concepts/roles/',
  '/plugins/',
  '/plugins/manifest-reference/',
  '/plugins/walkthrough/',
  '/self-host/',
  '/api/webhooks/',
  '/api/routes/',
  '/changelog/',
];

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const url of PHONE_PAGES) {
    test(`${url} never scrolls sideways`, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const { scroll, width } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: window.innerWidth,
      }));
      expect(scroll, `${url} is ${scroll}px wide on a ${width}px screen`).toBeLessThanOrEqual(width);
      if (url === '/plugins/manifest-reference/') await shot(page, 'plugin-manifest-390');
      if (url === '/') await shot(page, 'home-390');
      if (url === '/self-host/') await shot(page, 'self-host-390');
    });
  }

  test('the menu opens the sidebar', async ({ page }) => {
    await page.goto('/concepts/');
    await page.getByRole('button', { name: /open sidebar|menu/i }).first().click();
    await expect(page.getByRole('link', { name: 'Token limits' }).last()).toBeVisible();
    await page.waitForTimeout(400); // let the drawer finish sliding in
    await shot(page, 'menu-390');
  });
});
