// Analytics, held to what the install guide promises (lib/analytics.ts,
// GUIDE_TRUST): Google's real tag runs on docs.coderhelm.com under the CSP
// CloudFront sends, and every hit it makes is read here. No hit may carry a
// query string, a fragment, an email, the setup key, the progress id or
// anything typed. The pages come from the built site (the e2e server), served
// as https://docs.coderhelm.com; hits are answered here and never reach Google.
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { GA_ID, GUIDE_TRUST } from '../lib/analytics';

const SITE = `http://localhost:${process.env.E2E_PORT ?? 3460}`;
const DOCS = 'https://docs.coderhelm.com';

type Hit = { url: string; body: string };

/** Everything sent to Google, as one string per hit (URL plus body, decoded). */
function text(h: Hit): string {
  let t = `${h.url}\n${h.body}`;
  try {
    t = decodeURIComponent(t.replace(/\+/g, ' '));
  } catch {
    /* keep it as sent */
  }
  return t;
}

/** The fields of every event in a hit: the URL's, merged into each body line. */
function events(h: Hit): URLSearchParams[] {
  const head = new URL(h.url).searchParams;
  const lines = h.body.split('\n').filter(Boolean);
  if (!lines.length) return [head];
  return lines.map((l) => {
    const p = new URLSearchParams(head);
    for (const [k, v] of new URLSearchParams(l)) p.set(k, v);
    return p;
  });
}

async function docsContext(context: BrowserContext, hits: Hit[], tagRequests: string[]) {
  // docs.coderhelm.com is the built site, with the headers the e2e server sends (the production CSP).
  await context.route(`${DOCS}/**`, async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({ url: `${SITE}${u.pathname}${u.search}` });
    await route.fulfill({ response });
  });
  // Google's real tag, then its hits answered here.
  await context.route('https://www.googletagmanager.com/gtag/js*', async (route) => {
    tagRequests.push(route.request().url());
    await route.continue();
  });
  const collect = async (route: { request(): Request; fulfill(o: { status: number }): Promise<void> }) => {
    hits.push({ url: route.request().url(), body: route.request().postData() ?? '' });
    await route.fulfill({ status: 204 });
  };
  await context.route(/^https:\/\/([a-z0-9-]+\.)*(google-analytics\.com|analytics\.google\.com|googletagmanager\.com)\/.*collect/, collect);
  // Nothing else leaves: AWS, GitHub and the install answer from here or not at all.
  await context.route(/^https:\/\/[^/]*amazonaws\.com\//, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/launch/latest.json') {
      return route.fulfill({ json: { version: 'v0.7.0', templateUrl: 'https://coderhelm-public.s3.amazonaws.com/launch/v0.7.0/coderhelm.json' }, headers: { 'access-control-allow-origin': '*' } });
    }
    if (u.pathname === '/launch/v0.7.0/coderhelm.json') return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    // No progress file yet: the guide keeps its "Open AWS again" link up.
    return route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } });
  });
  await context.route(/^https:\/\/([a-z0-9-]+\.)*(aws\.amazon\.com|github\.com)\//, (route) => route.fulfill({ status: 200, body: 'ok' }));
}

function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  return violations;
}

/** Every field value in a hit that is a URL with a query string or a fragment. */
function urlsWithQuery(h: Hit): string[] {
  return events(h).flatMap((e) => [...e.values()]).filter((v) => /^[a-z][a-z0-9+.-]*:\/\/[^?#]*[?#]/i.test(v));
}

/** Waits for the tag to send at least `n` hits with this event name. */
async function waitFor(hits: Hit[], name: string, n = 1) {
  await expect.poll(() => hits.flatMap(events).filter((e) => e.get('en') === name).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(n);
}

test('docs pages: page views with origin and path only, client-side navigation counted, no CSP violations', async ({ browser }) => {
  const context = await browser.newContext();
  const hits: Hit[] = [];
  const tag: string[] = [];
  await docsContext(context, hits, tag);
  const page = await context.newPage();
  const violations = watchCsp(page);

  await page.goto(`${DOCS}/getting-started/?utm_source=x&secret=1#frag`);
  await page.mouse.move(10, 10);
  await page.keyboard.press('Shift'); // an interaction loads the tag before the idle timer would
  await waitFor(hits, 'page_view');
  expect(tag).toEqual([`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`]);

  // A client-side navigation is a page view of its own.
  const link = page.locator('#nd-page a[href^="/"]').first();
  const to = await link.getAttribute('href');
  expect(to).toMatch(/^\/[^?#]*$/);
  const target = to!.endsWith('/') ? to! : `${to}/`;
  await link.click();
  await expect(page).toHaveURL(`${DOCS}${target}`);
  await waitFor(hits, 'page_view', 2);
  // Still the same document: the navigation happened in the page.
  expect(tag).toHaveLength(1);

  const views = hits.flatMap(events).filter((e) => e.get('en') === 'page_view');
  expect(views.map((e) => e.get('dl'))).toEqual([`${DOCS}/getting-started/`, `${DOCS}${target}`]);
  expect(views.every((e) => e.get('tid') === GA_ID)).toBe(true);
  for (const h of hits) {
    const t = text(h);
    expect(t).not.toContain('secret=1');
    expect(t).not.toContain('utm_source');
    expect(t).not.toContain('#frag');
  }
  expect(violations).toEqual([]);
  await context.close();
});

test('docs pages: search, copy and outbound clicks are counted by name, never by what was typed or the full link', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const hits: Hit[] = [];
  await docsContext(context, hits, []);
  const page = await context.newPage();
  const violations = watchCsp(page);
  await page.goto(`${DOCS}/self-host/quick-start/`);
  await page.keyboard.press('Shift');
  await waitFor(hits, 'page_view');

  await page.getByRole('button', { name: 'Copy Markdown' }).first().click();
  await page.getByRole('button', { name: 'Copy Text' }).first().click();

  await page.locator('button[data-search-full]').first().click();
  await page.getByPlaceholder(/search/i).fill('bedrockquerysecret');
  await page.keyboard.press('Escape');

  // An outbound link: only its host is sent.
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'https://github.com/CoderHelm/coderhelm-platform/releases?tab=secretquery#x';
    a.textContent = 'releases';
    a.target = '_blank';
    a.id = 'out';
    document.body.appendChild(a);
  });
  const popup = context.waitForEvent('page');
  await page.locator('#out').click();
  await (await popup).close();

  await waitFor(hits, 'copy_markdown');
  await waitFor(hits, 'copy_code');
  await waitFor(hits, 'docs_search');
  await waitFor(hits, 'outbound_click');
  const out = hits.flatMap(events).find((e) => e.get('en') === 'outbound_click')!;
  expect(out.get('ep.link_domain')).toBe('github.com');
  for (const h of hits) {
    const t = text(h);
    expect(t).not.toContain('bedrockquerysecret');
    expect(t).not.toContain('secretquery');
    expect(urlsWithQuery(h)).toEqual([]);
  }
  expect(violations).toEqual([]);
  await context.close();
});

test('install guide: the trust line is what the code does; no hit carries a query string, an email, the setup key, the progress id or a form value', async ({ browser }) => {
  const context = await browser.newContext();
  const hits: Hit[] = [];
  await docsContext(context, hits, []);
  await context.addInitScript(() => {
    window.open = (() => null) as typeof window.open;
  });
  const page = await context.newPage();
  const violations = watchCsp(page);

  await page.goto(`${DOCS}/self-host/install/`);
  await expect(page.getByTestId('privacy')).toHaveText(GUIDE_TRUST.private);
  await page.keyboard.press('Shift');
  await waitFor(hits, 'page_view');

  // Type everything the start screen asks for, then launch: the guide puts its progress id in the address bar.
  const email = 'ada.lovelace@example.org';
  await page.getByLabel('Your email').fill(email);
  await page.getByLabel('AWS region').selectOption('eu-west-1');
  await page.getByTestId('launch').click();
  await expect(page.getByTestId('screen-aws')).toBeVisible();
  await expect(page).toHaveURL(/\?/);
  const state = await page.evaluate(() => {
    const id = localStorage.getItem('coderhelm-install:last')!;
    return JSON.parse(localStorage.getItem(`coderhelm-install:${id}`)!) as { statusId: string; setupToken: string; region: string };
  });

  // The AWS link carries the email and the setup key in its address; clicking it must not send them.
  const aws = page.getByTestId('reopen-aws').first();
  await expect(aws).toHaveAttribute('href', /param_AdminEmail=/);
  const popup = context.waitForEvent('page');
  await aws.click();
  await (await popup).close();

  await waitFor(hits, 'install_step', 2);
  await waitFor(hits, 'outbound_click');
  const all = hits.flatMap(events);
  expect(all.filter((e) => e.get('en') === 'install_step').map((e) => e.get('ep.step'))).toEqual(expect.arrayContaining(['start', 'aws']));
  // One page view for the guide, however often the address bar changes.
  expect(all.filter((e) => e.get('en') === 'page_view').map((e) => e.get('dl'))).toEqual([`${DOCS}/self-host/install/`]);
  for (const h of hits) {
    const t = text(h);
    expect(urlsWithQuery(h)).toEqual([]);
    expect(t).not.toContain(email);
    expect(t).not.toMatch(/@example\.org/);
    expect(t).not.toContain(state.setupToken);
    expect(t).not.toContain(state.statusId);
    expect(t).not.toContain('param_');
    expect(t).not.toContain('eu-west-1');
  }
  expect(violations).toEqual([]);
  await context.close();
});

test('localhost (previews, self-hosted builds of the docs): Google’s tag never loads', async ({ page }) => {
  const tag: string[] = [];
  await page.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/, (route) => {
    tag.push(route.request().url());
    return route.abort();
  });
  await page.goto('/getting-started/');
  await page.keyboard.press('Shift');
  await page.waitForTimeout(1500);
  expect(tag).toEqual([]);
  expect(await page.evaluate(() => 'gtag' in window)).toBe(false);
});
