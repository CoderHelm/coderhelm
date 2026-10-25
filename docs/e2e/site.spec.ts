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
  await page.goto('/api/');
  const block = page.locator('figure').filter({ hasText: 'curl https://api.coderhelm.com/api/me' }).first();
  await block.hover();
  await block.getByRole('button', { name: /copy/i }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Authorization: Bearer $CODERHELM_API_KEY');
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
  '/api/',
  '/api/authentication/',
  '/api/errors/',
  '/api/webhooks/',
  '/api/reference/runs/list-runs/',
  '/api/reference/plans/create-plan/',
  '/api/reference/reviews/get-review/',
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

// ── API reference ────────────────────────────────────────────────────

test('the API section lists the guides, then every endpoint grouped by resource', async ({ page }) => {
  await page.goto('/api/');
  await expect(page.getByRole('heading', { level: 1, name: 'API introduction' })).toBeVisible();
  const nav = page.locator('aside');
  for (const name of ['Authentication', 'Errors', 'Pagination', 'Rate limits', 'Versioning and idempotency', 'Webhooks']) {
    await expect(nav.getByRole('link', { name, exact: true }).first()).toBeAttached();
  }
  for (const group of ['Runs', 'Plans', 'Reviews', 'Usage', 'CI']) {
    await expect(nav.getByText(group, { exact: true }).first()).toBeAttached();
  }
  // The old dump of every gateway route is gone, internal routes with it.
  const old = await page.request.get('/api/routes/');
  expect(old.status()).toBe(404);
  await shot(page, 'api-intro-desktop-dark');
});

test('an endpoint page shows its scope, parameters, response fields and samples in three languages', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/api/reference/runs/list-runs/');
  await expect(page.getByRole('heading', { level: 1, name: 'List runs' })).toBeVisible();
  const main = page.locator('#nd-page');
  await expect(main.getByText('Scope', { exact: false }).first()).toBeVisible();
  // Query parameters with their descriptions.
  await expect(main.getByText('Runs per page, 1 to 100. Default 50.')).toBeVisible();
  // Response fields with types and descriptions.
  await expect(main.getByText('How many runs were read to fill this page', { exact: false })).toBeVisible();
  // cURL, TypeScript and Python, and no other languages.
  for (const tab of ['cURL', 'TypeScript', 'Python']) await expect(main.getByRole('tab', { name: tab }).first()).toBeVisible();
  await expect(main.getByRole('tab', { name: 'Go' })).toHaveCount(0);
  await expect(main.getByText('Authorization: Bearer $CODERHELM_API_KEY').first()).toBeVisible();
  await main.getByRole('tab', { name: 'TypeScript' }).first().click();
  await expect(main.getByText('process.env.CODERHELM_API_KEY', { exact: false }).first()).toBeVisible();
  await main.getByRole('tab', { name: 'Python' }).first().click();
  await expect(main.getByText("os.environ['CODERHELM_API_KEY']", { exact: false }).first()).toBeVisible();
  // Example response from the schema's own examples.
  await expect(main.getByText('"01JB8X6F4M2C9QZ3T7V5W1K0HA"', { exact: false }).first()).toBeAttached();
  // No try-it console that would send a key from this site.
  await expect(main.getByRole('button', { name: /^send$/i })).toHaveCount(0);
  await shot(page, 'api-endpoint-desktop-dark');
});

test('a request body is documented field by field', async ({ page }) => {
  await page.goto('/api/reference/plans/create-plan/');
  const main = page.locator('#nd-page');
  await expect(main.getByText('What the plan is for. 1 to 500 characters.')).toBeVisible();
  await expect(main.getByText('The plan and its tasks start as', { exact: false }).first()).toBeVisible();
});

test('search finds an endpoint', async ({ page }) => {
  await page.goto('/api/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('dialog').getByRole('textbox').or(page.getByRole('dialog').getByRole('combobox')).first();
  await input.fill('cancel a run');
  const hit = page.getByRole('dialog').getByText('Cancel a run').first();
  await expect(hit).toBeVisible({ timeout: 15_000 });
  await hit.click();
  await expect(page).toHaveURL(/\/api\/reference\/runs\/cancel-run\/?/);
});

test('the OpenAPI document is published, and endpoints have Markdown twins in llms.txt', async ({ request }) => {
  const spec = await request.get('/openapi.json');
  expect(spec.ok()).toBe(true);
  const doc = await spec.json();
  expect(doc.openapi).toBe('3.1.0');
  expect(doc.paths['/api/runs'].get.operationId).toBe('listRuns');
  // Internal dashboard routes are not in it.
  expect(doc.paths['/api/admin/teams']).toBeUndefined();
  expect(doc.paths['/api/users/invite']).toBeUndefined();

  const md = await (await request.get('/api/reference/runs/list-runs.md')).text();
  expect(md).toMatch(/^# List runs/);
  expect(md).toContain('`GET /api/runs`');
  expect(md).toContain('The key needs the `view` scope.');
  expect(md).toContain('| `runs[].run_id` |');
  for (const lang of ['cURL:', 'TypeScript:', 'Python:']) expect(md).toContain(lang);
  const llms = await (await request.get('/llms.txt')).text();
  expect(llms).toContain('https://docs.coderhelm.com/api/reference/runs/list-runs.md');
  expect(llms).toContain('/openapi.json');
});

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`API pages in ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`the intro and an endpoint read well in ${scheme} at desktop width`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/api/');
      await page.evaluate((t) => localStorage.setItem('theme', t), scheme);
      await page.reload();
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*dark)/);
      await shot(page, `api-intro-desktop-${scheme}`);
      await page.goto('/api/reference/runs/get-run/');
      await expect(page.getByRole('heading', { level: 1, name: 'Get a run' })).toBeVisible();
      await shot(page, `api-endpoint-desktop-${scheme}`);
    });
  });
  test.describe(`API pages in ${scheme} at 390px`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test(`the intro and an endpoint fit a phone in ${scheme}`, async ({ page }) => {
      await page.goto('/api/');
      await page.evaluate((t) => localStorage.setItem('theme', t), scheme);
      for (const url of ['/api/', '/api/reference/runs/get-run/']) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
        expect(scroll, `${url} is ${scroll}px wide`).toBeLessThanOrEqual(width);
        await shot(page, `${url === '/api/' ? 'api-intro' : 'api-endpoint'}-390-${scheme}`);
      }
    });
  });
}
