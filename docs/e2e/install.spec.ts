// The browser install guide (/self-host/install/) end to end, with the AWS
// progress file, the install's own endpoints and GitHub mocked: the happy
// path, every failure with its fix, and resume. E2E_SHOTS=<dir> also saves
// a screenshot of every screen at 1440 and 390 wide.
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const INSTALL = 'https://d111test.cloudfront.net';
const SITE = `http://localhost:${process.env.E2E_PORT ?? 3460}`;
const SHOTS = process.env.E2E_SHOTS;
const CORS = { 'access-control-allow-origin': '*' };
const ID = 'abcd1234efgh5678';
const TOKEN = 'Tk'.repeat(20);

type Json = Record<string, unknown>;
interface Mock {
  status: Json | null;
  setup: Json | number | null;
  posted?: string;
  requests: string[];
}

/**
 * The install's GET /api/setup/status in its exact shape
 * (docs/self-host/check-your-install.md): no ids or URLs, the guide makes
 * its own links. Overrides are per check id.
 */
const LABELS: Record<string, string> = {
  api: 'CoderHelm answers', github_app: 'GitHub App created', github_installed: 'GitHub App installed on your repositories',
  models: 'Claude access', email: 'Email', admin: 'First admin signed up',
};
function setupDoc(over: Record<string, Json> = {}, extra: Json = {}) {
  const base: Json[] = [
    { id: 'api', status: 'pass', code: 'ok' },
    { id: 'github_app', status: 'pass', code: 'ok' },
    { id: 'github_installed', status: 'pass', code: 'ok' },
    { id: 'models', status: 'pass', code: 'ok' },
    { id: 'email', status: 'warn', code: 'sandbox', required: false },
    { id: 'admin', status: 'wait', code: 'not_signed_up' },
  ];
  const checks = base.map((c) => {
    const o = { ...(over[c.id as string] ?? {}) };
    delete o.detail;
    return { id: c.id, label: LABELS[c.id as string], ...c, ...o };
  });
  const manifest = (over.github_app?.status ?? 'pass') !== 'pass' && over.github_app?.code !== 'missing_no_setup_key';
  return { schema: 1, service: 'coderhelm', self_hosted: true, setup_open: true, version: 'v0.7.0', checked_at: '2026-10-25T12:00:00Z', ready: false, github_manifest_ready: manifest, checks, ...extra };
}
const CLOSED = { schema: 1, service: 'coderhelm', self_hosted: true, setup_open: false, version: 'v0.7.0', ready: true, github_manifest_ready: false, checks: [{ id: 'admin', label: 'First admin signed up', status: 'pass', code: 'ok' }] };
const NO_APP = { github_app: { status: 'fail', code: 'missing' }, github_installed: { status: 'wait', code: 'needs_app' } };

async function mock(page: Page, m: Mock) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__CH_POLL_MS = 150;
    w.__CH_NO_SIGN_MS = 1200;
    w.__CH_NOT_ANSWERING_MS = 1200;
    w.__opened = [];
    window.open = ((u: string) => {
      (w.__opened as string[]).push(u);
      return null;
    }) as typeof window.open;
  });
  page.on('request', (r) => m.requests.push(r.url()));
  await page.route('https://coderhelm-public.s3.amazonaws.com/launch/latest.json', (r) =>
    r.fulfill({ json: { version: 'v0.7.0', templateUrl: 'https://coderhelm-public.s3.amazonaws.com/launch/v0.7.0/coderhelm-launch.yaml' }, headers: CORS }),
  );
  await page.route(/^https:\/\/coderhelm-setup-[a-z0-9]{16}\.s3\.[a-z0-9-]+\.amazonaws\.com\/status\.json/, (r) =>
    m.status ? r.fulfill({ json: m.status, headers: CORS }) : r.fulfill({ status: 403, body: 'AccessDenied', headers: CORS }),
  );
  await page.route(`${INSTALL}/api/setup/status**`, (r) => {
    if (m.setup === null) return r.abort('connectionrefused');
    if (typeof m.setup === 'number') return r.fulfill({ status: m.setup, body: '', headers: CORS });
    return r.fulfill({ json: m.setup, headers: CORS });
  });
  // GitHub's manifest flow: the form post, then GitHub's redirect to the
  // install, then the install's redirect back to the guide.
  await page.route('https://github.com/settings/apps/new**', async (r: Route) => {
    m.posted = r.request().postData() ?? '';
    const state = new URL(r.request().url()).searchParams.get('state');
    // (A page that moves on, rather than a 302: redirects the browser follows skip page.route.)
    const next = `${INSTALL}/api/setup/github/callback?code=abc123def456&state=${state}`;
    await r.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(next)})</script>` });
  });
  await page.route(`${INSTALL}/api/setup/github/callback**`, (r) => {
    m.setup = setupDoc({ github_installed: { status: 'wait', code: 'not_installed' } });
    const back = `${SITE}/self-host/install/?github=created&app=coderhelm-prod-abcd`;
    return r.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(back)})</script>` });
  });
}

/** Opens the guide already launched (as if this browser had started an install). */
async function seeded(page: Page, m: Mock, over: Json = {}) {
  await mock(page, m);
  const state = {
    statusId: ID, setupToken: TOKEN, region: 'us-east-1', stage: 'prod', email: 'ada@example.com', provider: 'bedrock', org: '',
    version: 'v0.7.0', url: '', launchedAt: Date.now() - 6 * 60_000, attempt: 1, ...over,
  };
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(`coderhelm-install:${s.statusId}`, JSON.stringify(s));
      localStorage.setItem('coderhelm-install:last', s.statusId);
      sessionStorage.setItem('seeded', '1');
    }
  }, state);
  await page.goto('/self-host/install/');
}

const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
const newMock = (over: Partial<Mock> = {}): Mock => ({ status: null, setup: null, requests: [], ...over });

/** Only AWS, GitHub, the install and this site: never CoderHelm's hosted servers. */
function assertPrivate(m: Mock) {
  for (const u of m.requests) {
    const h = new URL(u).hostname;
    const ok = h === 'localhost' || h.endsWith('.amazonaws.com') || h === 'github.com' || h === new URL(INSTALL).hostname;
    expect(ok, `unexpected request to ${u}`).toBe(true);
  }
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

test('happy path: launch, follow the install, GitHub, models, ready', async ({ page }) => {
  const m = newMock();
  await mock(page, m);
  await page.goto('/self-host/install/');
  await expect(page.getByTestId('step-title')).toHaveText('Install CoderHelm in your AWS account');
  await expect(page.getByTestId('privacy')).toContainText('Nothing about your install goes to CoderHelm');

  // Validation speaks plainly, then the console opens with everything filled in.
  await page.getByTestId('launch').click();
  await expect(page.getByText('Enter the email you will sign in with.')).toBeVisible();
  await page.getByLabel('Your email').fill('ada@example.com');
  await page.getByLabel('AWS region').selectOption('eu-west-1');
  await page.getByTestId('launch').click();
  const [link] = await opened(page);
  const u = new URL(link);
  expect(u.hostname).toBe('eu-west-1.console.aws.amazon.com');
  const q = new URLSearchParams(u.hash.split('?')[1]);
  expect(u.hash).toContain('#/stacks/create/review?');
  expect(q.get('templateURL')).toBe('https://coderhelm-public.s3.amazonaws.com/launch/v0.7.0/coderhelm-launch.yaml');
  expect(q.get('param_AdminEmail')).toBe('ada@example.com');
  expect(q.get('param_StatusId')).toMatch(/^[a-z0-9]{16}$/);
  expect(q.get('param_SetupToken')).toMatch(/^[A-Za-z0-9]{40}$/);

  // Waiting for the person to press Create stack.
  await expect(page.getByTestId('step-title')).toHaveText('Waiting for AWS');
  await expect(page.getByText('I acknowledge that AWS CloudFormation might create IAM resources')).toBeVisible();
  // The address bar can resume this install, and holds no secret.
  expect(page.url()).toContain(`id=${q.get('param_StatusId')}`);
  expect(page.url()).not.toContain(q.get('param_SetupToken')!);

  m.status = { schema: 1, phase: 'starting', message: 'Starting the installer' };
  await expect(page.getByTestId('step-title')).toHaveText('Creating your CoderHelm');
  await expect(page.locator('[data-row-status]').nth(0)).toHaveAttribute('data-row-status', 'pass');
  m.status = { schema: 1, phase: 'deploying', step: 3, steps: 10 };
  await expect(page.getByText('Part 3 of 10')).toBeVisible();
  m.status = { schema: 1, phase: 'done', url: INSTALL, step: 10, steps: 10 };
  m.setup = setupDoc(NO_APP);

  // GitHub: the manifest goes to GitHub; GitHub's code goes to the install.
  await expect(page.getByTestId('screen-github')).toBeVisible();
  await expect(page.getByTestId('step-title')).toHaveText('Connect GitHub');
  await page.getByTestId('create-app').click();
  await expect(page.getByText('GitHub App created. Its keys went straight to your CoderHelm.')).toBeVisible();
  const manifest = JSON.parse(new URLSearchParams(m.posted!).get('manifest')!);
  expect(manifest.redirect_url).toBe(`${INSTALL}/api/setup/github/callback`);
  expect(manifest.hook_attributes.url).toBe(`${INSTALL}/webhooks/github`);
  expect(manifest.default_permissions.workflows).toBe('write');
  await expect(page.getByTestId('step-title')).toHaveText('Install the app on your repositories');
  await expect(page.getByTestId('install-app')).toHaveAttribute('href', 'https://github.com/apps/coderhelm-prod-abcd/installations/new');

  // Installed; Bedrock needs the one-time form.
  m.setup = setupDoc({
    models: { status: 'fail', code: 'use_case_required', detail: { provider: 'bedrock', region: 'eu-west-1', console_url: 'https://eu-west-1.console.aws.amazon.com/bedrock/home?region=eu-west-1#/providers?provider=anthropic',
      models: [{ id: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0', status: 'fail', code: 'use_case_required' }] } },
  });
  await expect(page.getByTestId('screen-models')).toBeVisible();
  await expect(page.getByTestId('models-status')).toContainText('AWS needs a one-time form');
  await expect(page.getByTestId('models-status')).toHaveAttribute('data-tone', 'todo');
  await expect(page.getByTestId('models-status')).toContainText('eu.anthropic.claude-opus-5-5');
  await expect(page.getByTestId('open-bedrock')).toHaveAttribute('href', /bedrock\/home\?region=eu-west-1/);

  // Access granted: ready, with the first sign-in.
  m.setup = setupDoc();
  await expect(page.getByTestId('step-title')).toHaveText('Your CoderHelm is ready');
  await expect(page.getByTestId('admin-email')).toHaveText('ada@example.com');
  await expect(page.getByTestId('open-coderhelm')).toHaveAttribute('href', `${INSTALL}/?signup=1`);
  await expect(page.getByTestId('ready-checks')).toContainText('Optional');
  await expect(page.getByTestId('waiting-signup')).toBeVisible();
  m.setup = setupDoc({ admin: { status: 'pass', code: 'ok' } });
  await expect(page.getByTestId('complete')).toContainText('Setup is complete.');
  assertPrivate(m);
});

test('a failed install shows why, with the fix, and launches again under a new name', async ({ page }) => {
  const m = newMock({ status: { schema: 1, phase: 'failed', step: 4, steps: 10, message: 'Something with the same name is already in this account.', fix: 'Launch again with a different install name.', logUrl: 'https://us-east-1.console.aws.amazon.com/cloudwatch/home' } });
  await seeded(page, m);
  await expect(page.getByTestId('step-title')).toHaveText('The install stopped');
  await expect(page.getByTestId('failure')).toContainText('Something with the same name');
  await expect(page.getByTestId('failure')).toContainText('Launch again with a different install name.');
  await expect(page.locator('[data-row-status="fail"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Open the log' })).toHaveAttribute('href', /cloudwatch/);
  await page.getByTestId('relaunch').click();
  const [link] = await opened(page);
  const q = new URLSearchParams(new URL(link).hash.split('?')[1]);
  expect(q.get('stackName')).toBe('coderhelm-prod-2');
  expect(q.get('param_StatusId')).not.toBe(ID);
  expect(q.get('param_SetupToken')).not.toBe(TOKEN);
});

test('no progress file (private by account policy): paste the URL and carry on', async ({ page }) => {
  const m = newMock();
  await seeded(page, m, { launchedAt: Date.now() });
  await expect(page.getByTestId('no-sign')).toBeVisible();
  await expect(page.getByTestId('no-sign')).toContainText('S3 Block Public Access');
  await page.getByLabel('Your CoderHelm address').fill('not a url');
  await page.getByTestId('paste-use').click();
  await expect(page.getByText('doesn’t look like a web address')).toBeVisible();
  m.setup = setupDoc(NO_APP);
  await page.getByLabel('Your CoderHelm address').fill(`{"install":"${INSTALL}"}`);
  await page.getByTestId('paste-use').click();
  await expect(page.getByTestId('screen-github')).toBeVisible();
});

test('deployed but not answering: keeps trying, then moves on', async ({ page }) => {
  const m = newMock({ status: { schema: 1, phase: 'done', url: INSTALL }, setup: 503 });
  await seeded(page, m);
  await expect(page.getByTestId('not-answering')).toBeVisible();
  await expect(page.locator('[data-row-status]').nth(3)).toHaveAttribute('data-row-status', 'active');
  // The page keeps asking; once the install answers it moves on by itself.
  m.setup = setupDoc(NO_APP);
  await expect(page.getByTestId('screen-github')).toBeVisible();
});

test('GitHub failures: a refused key, no setup key, a rejected app', async ({ page }) => {
  const m = newMock({ setup: setupDoc(NO_APP) });
  await seeded(page, m, { url: INSTALL });
  await page.goto('/self-host/install/?github=bad_state');
  await expect(page.getByTestId('github-outcome')).toContainText('did not recognize this request');

  // No setup key on the install: the terminal command, ready to copy.
  m.setup = setupDoc({ github_app: { status: 'fail', code: 'missing_no_setup_key' } }, { github_manifest_ready: false });
  await page.getByTestId('check-again').or(page.getByTestId('create-app')).first().waitFor();
  await page.reload();
  await expect(page.getByTestId('github-cli')).toBeVisible();
  await expect(page.getByTestId('cli-command')).toHaveText('npx -y github:CoderHelm/coderhelm-platform pull --stage prod --region us-east-1 && npx -y github:CoderHelm/coderhelm-platform github-app');

  // The app exists but GitHub rejects its key.
  m.setup = setupDoc({ github_installed: { status: 'fail', code: 'app_rejected' } });
  await page.getByTestId('check-again').click();
  await expect(page.locator('[data-row-status="fail"]')).toContainText('GitHub does not accept');
});

test('model failures each get their own fix', async ({ page }) => {
  const m = newMock({ setup: setupDoc({ models: { status: 'warn', code: 'subscription_pending', detail: { console_url: 'https://x.console.aws.amazon.com/bedrock/', models: [] } } }) });
  await seeded(page, m, { url: INSTALL });
  await expect(page.getByTestId('models-status')).toContainText('up to 15 minutes');
  await expect(page.getByTestId('open-bedrock')).toHaveCount(0);
  m.setup = setupDoc({ models: { status: 'fail', code: 'marketplace_failed', detail: { console_url: 'https://x.console.aws.amazon.com/bedrock/', models: [] } } });
  await page.getByTestId('check-again').click();
  await expect(page.getByTestId('models-status')).toContainText('payment method');
  await expect(page.getByTestId('models-status')).toHaveAttribute('data-tone', 'fail');
  m.setup = setupDoc({ models: { status: 'fail', code: 'not_available', detail: { models: [] } } });
  await page.getByTestId('check-again').click();
  await expect(page.getByTestId('models-status')).toContainText('not offered in this region');
});

test('resume: a refresh keeps the place; another device resumes from the link and the install', async ({ page, browser }) => {
  const m = newMock({ status: { schema: 1, phase: 'deploying', step: 5, steps: 10 } });
  await seeded(page, m);
  await expect(page.getByText('Part 5 of 10')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Part 5 of 10')).toBeVisible();
  expect(page.url()).toContain(`id=${ID}`);

  // The stack's InstallGuide output, opened on another device (no local memory).
  const other = await browser.newPage();
  const m2 = newMock({ status: { schema: 1, phase: 'done', url: INSTALL }, setup: setupDoc(NO_APP, { github_manifest_ready: true }) });
  await mock(other, m2);
  await other.goto(`/self-host/install/?id=${ID}&region=us-east-1&stage=prod`);
  await expect(other.getByTestId('screen-github')).toBeVisible();
  // Without this browser's setup key, the terminal command is offered instead.
  await expect(other.getByTestId('github-cli')).toBeVisible();
  await other.close();
});

test('once someone has signed up (setup window closed), the guide shows the install as ready', async ({ page }) => {
  const m = newMock({ setup: setupDoc(NO_APP) });
  await seeded(page, m, { url: INSTALL });
  await expect(page.getByTestId('screen-github')).toBeVisible();
  m.setup = CLOSED;
  await expect(page.getByTestId('step-title')).toHaveText('Your CoderHelm is ready');
});

test('screenshots of every screen at 1440 and 390', async ({ page }) => {
  test.skip(!SHOTS, 'set E2E_SHOTS=<dir> to save screenshots');
  test.setTimeout(120_000);
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    const at = (n: string) => shot(page, `${w}-${n}`);
    const m = newMock();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.context().clearCookies();
    await mock(page, m);
    await page.goto('/self-host/install/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/self-host/install/');
    await at('01-start');
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByLabel('Your email').fill('ada@example.com');
    await at('02-start-more-options');
    await page.getByTestId('launch').click();
    await expect(page.getByTestId('step-title')).toHaveText('Waiting for AWS');
    await at('03-waiting-for-aws');
    m.status = { schema: 1, phase: 'deploying', step: 4, steps: 10 };
    await expect(page.getByText('Part 4 of 10')).toBeVisible();
    await at('04-deploying');
    m.status = { schema: 1, phase: 'failed', step: 4, steps: 10, message: 'Something with the same name is already in this account, probably from an earlier install with this install name.', fix: 'Launch again with a different install name, or delete the old CoderHelm stacks in CloudFormation first.', logUrl: 'https://x' };
    await expect(page.getByTestId('failure')).toBeVisible();
    await at('05-failed');
    m.status = { schema: 1, phase: 'done', url: INSTALL };
    m.setup = 503;
    await page.evaluate(() => localStorage.clear());
    await page.goto('/self-host/install/');
    await page.getByLabel('Your email').fill('ada@example.com');
    await page.getByTestId('launch').click();
    await expect(page.getByTestId('not-answering')).toBeVisible();
    await at('06-not-answering');
    m.setup = setupDoc(NO_APP);
    await expect(page.getByTestId('screen-github')).toBeVisible();
    await at('07-github');
    await page.getByTestId('create-app').click();
    await expect(page.getByTestId('install-app')).toBeVisible();
    await at('08-github-install-app');
    m.setup = setupDoc({ models: { status: 'fail', code: 'use_case_required', detail: { console_url: 'https://x', models: [{ id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', status: 'fail' }, { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', status: 'fail' }] } } });
    await expect(page.getByTestId('screen-models')).toBeVisible();
    await at('09-models');
    m.setup = setupDoc();
    await expect(page.getByTestId('screen-ready')).toBeVisible();
    await at('10-ready');
    m.setup = setupDoc(NO_APP, { github_manifest_ready: false });
    await page.goto('/self-host/install/?github=github_refused');
    await expect(page.getByTestId('github-outcome')).toBeVisible();
    await at('11-github-error-cli');
    // No progress file: the paste fallback.
    m.status = null;
    m.setup = null;
    await page.evaluate(() => localStorage.clear());
    await page.goto('/self-host/install/');
    await page.getByLabel('Your email').fill('ada@example.com');
    await page.getByTestId('launch').click();
    await expect(page.getByTestId('no-sign')).toBeVisible();
    await at('12-no-sign-paste');
  }
  // Light mode: the status colors and the primary button keep their contrast.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.reload();
    await expect(page.getByTestId('no-sign')).toBeVisible();
    await shot(page, `${w}-13-light`);
  }
});
