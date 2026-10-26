// The browser install guide (/self-host/install/) end to end, with the AWS
// progress file, the install's own endpoints and GitHub mocked: the happy
// path, every failure with its fix, and resume. E2E_SHOTS=<dir> also saves
// a screenshot of every screen at 1440 and 390 wide.
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const INSTALL = 'https://d111test.cloudfront.net';
const DOMAIN = 'https://coderhelm.example.com';
const SITE = `http://localhost:${process.env.E2E_PORT ?? 3460}`;
const SHOTS = process.env.E2E_SHOTS;
const CORS = { 'access-control-allow-origin': '*' };
const ID = 'abcd1234efgh5678';
const TOKEN = 'Tk'.repeat(20);

type Json = Record<string, unknown>;
interface Mock {
  status: Json | null;
  setup: Json | number | null;
  /** The install's answer on the person's own domain, once it is live there (default: the same). */
  domainSetup?: Json | number | null;
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
  domain: 'Your domain', google_sign_in: 'Sign in with Google', updates: 'Automatic updates',
};
/** The optional checks a newer install adds after email (domain, Google sign-in, updates). */
function withOptional(doc: Json, domain: Json = { status: 'skip', code: 'none' }, more: Record<string, Json> = {}) {
  const checks = [...(doc.checks as Json[])];
  const at = checks.findIndex((c) => c.id === 'admin');
  const add = [
    { id: 'domain', label: LABELS.domain, required: false, ...domain },
    { id: 'google_sign_in', label: LABELS.google_sign_in, status: 'skip', code: 'off', required: false, ...(more.google_sign_in ?? {}) },
    { id: 'updates', label: LABELS.updates, status: 'skip', code: 'auto_off', required: false, ...(more.updates ?? {}) },
  ];
  checks.splice(at, 0, ...add);
  return { ...doc, checks };
}
const RECORDS = [
  { purpose: 'certificate', name: '_a1b2c3.coderhelm.example.com', type: 'CNAME', value: '_d4e5f6.xyz.acm-validations.aws' },
  { purpose: 'address', name: 'coderhelm.example.com', type: 'CNAME', value: 'd111test.cloudfront.net' },
];
const EXTERNAL = { hostname: 'coderhelm.example.com', mode: 'external', state: 'validating', records: RECORDS };
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
  await page.route(`${DOMAIN}/api/setup/status**`, (r) => {
    const v = m.domainSetup === undefined ? m.setup : m.domainSetup;
    if (v === null) return r.abort('connectionrefused');
    if (typeof v === 'number') return r.fulfill({ status: v, body: '', headers: CORS });
    return r.fulfill({ json: v, headers: CORS });
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
    const ok = h === 'localhost' || h.endsWith('.amazonaws.com') || h === 'github.com' || h === new URL(INSTALL).hostname || h === new URL(DOMAIN).hostname;
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
  await expect(page.getByTestId('privacy')).toContainText('Nothing you type and nothing about your install is sent to CoderHelm or Google.');

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
  await expect(page.getByTestId('optional-setup').locator('[data-optional="email"]')).toHaveAttribute('data-state', 'todo');
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
  await page.getByLabel('Your install’s address').fill('not a url');
  await page.getByTestId('paste-use').click();
  await expect(page.getByText('doesn’t look like a web address')).toBeVisible();
  m.setup = setupDoc(NO_APP);
  await page.getByLabel('Your install’s address').fill(`{"install":"${INSTALL}"}`);
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

test('more options: the name in your AWS account is explained, checked in one sentence and named in the stack', async ({ page }) => {
  const m = newMock();
  await mock(page, m);
  await page.goto('/self-host/install/');
  await page.getByLabel('Your email').fill('ada@example.com');
  await page.getByRole('button', { name: 'More options' }).click();
  const name = page.getByLabel('Name in your AWS account');
  await expect(name).toHaveValue('prod');
  await expect(page.getByText('Names the AWS resources this install creates, so you can find them in the AWS console. Keep it unless this AWS account already has a CoderHelm; each install in one account needs its own name.')).toBeVisible();
  await expect(page.getByText('Install name')).toHaveCount(0);
  await name.fill('2nd_install');
  await page.getByTestId('launch').click();
  await expect(page.getByText('Use 1 to 20 lowercase letters, digits or hyphens, starting with a letter.')).toBeVisible();
  expect(await opened(page)).toEqual([]);
  await name.fill('helm-two');
  await page.getByText('What happens in AWS').click();
  await expect(page.getByText('Everything it creates is named after the name in your AWS account, helm-two: the stack is coderhelm-helm-two')).toBeVisible();
  await page.getByTestId('launch').click();
  const [link] = await opened(page);
  expect(new URLSearchParams(new URL(link).hash.split('?')[1]).get('param_Stage')).toBe('helm-two');
  await page.getByText('What is happening').click();
  await expect(page.getByText('Stack name: coderhelm-helm-two (from the name in your AWS account, helm-two)')).toBeVisible();
});

test('more options: domain, sender, sign-up and updates go to AWS; a bad hostname opens More options with the sentence', async ({ page }) => {
  const m = newMock();
  await mock(page, m);
  await page.goto('/self-host/install/');
  await page.getByLabel('Your email').fill('ada@example.com');
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByLabel('My own domain').check();
  await page.getByLabel('Your domain').fill('coderhelm');
  await page.getByRole('button', { name: 'Fewer options' }).click();
  await page.getByTestId('launch').click();
  // The problem is inside More options: it opens, with the sentence.
  await expect(page.getByText('Enter a hostname such as coderhelm.example.com.')).toBeVisible();
  expect(await opened(page)).toEqual([]);
  await page.getByLabel('Your domain').fill('https://CoderHelm.example.com/');
  await page.getByLabel('Send email from').fill('helm@example.com');
  await page.getByLabel('Who else may sign up').fill('example.com');
  await page.getByTestId('auto-update').check();
  await page.getByLabel('Day').selectOption('daily');
  await page.getByLabel('Hour').selectOption('02:00');
  await page.getByLabel('Time zone').fill('Europe/Berlin');
  await page.getByTestId('launch').click();
  const [link] = await opened(page);
  const q = new URLSearchParams(new URL(link).hash.split('?')[1]);
  expect(q.get('param_Hostname')).toBe('coderhelm.example.com');
  expect(q.get('param_EmailFrom')).toBe('helm@example.com');
  expect(q.get('param_SignupDomain')).toBe('example.com');
  expect(q.get('param_AutoUpdate')).toBe('on');
  expect(q.get('param_UpdateWindow')).toBe('daily 02:00');
  expect(q.get('param_UpdateTimezone')).toBe('Europe/Berlin');
  // The steps now include the domain.
  await expect(page.getByRole('list', { name: 'Install steps' })).toContainText('Domain');
});

test('another DNS provider: the records to copy, a hint for the provider, each failure\'s fix, then the guide follows CoderHelm to the domain', async ({ page }) => {
  const m = newMock({ status: { schema: 1, phase: 'done', url: INSTALL, domain: EXTERNAL } });
  m.setup = withOptional(setupDoc(NO_APP), { status: 'wait', code: 'validating' });
  await seeded(page, m, { domainChoice: 'own', hostname: 'coderhelm.example.com' });
  await expect(page.getByTestId('screen-domain')).toBeVisible();
  await expect(page.getByTestId('step-title')).toHaveText('Point your domain at CoderHelm');
  await expect(page.getByTestId('domain-status')).toContainText('Waiting for the certificate record');
  await expect(page.getByTestId('record-certificate-name')).toHaveText('_a1b2c3.coderhelm.example.com');
  await expect(page.getByTestId('record-certificate-value')).toHaveText('_d4e5f6.xyz.acm-validations.aws');
  await expect(page.getByTestId('record-address-value')).toHaveText('d111test.cloudfront.net');
  await expect(page.getByTestId('record-certificate')).toContainText('_a1b2c3.coderhelm');
  await expect(page.locator('[data-testid="domain-progress"] [data-row-status]').first()).toHaveAttribute('data-row-status', 'active');
  // Where to add them, for the provider they pick.
  await page.getByTestId('dns-provider').selectOption('cloudflare');
  await expect(page.getByText('Set Proxy status to DNS only')).toBeVisible();
  await expect(page.getByTestId('open-provider')).toHaveAttribute('href', 'https://dash.cloudflare.com/');

  // A record with the wrong value, then CAA, each with its own fix.
  m.setup = withOptional(setupDoc(NO_APP), { status: 'fail', code: 'validation_wrong_value' });
  await page.getByTestId('check-again').click();
  await expect(page.getByTestId('domain-status')).toContainText('The certificate record has a different value');
  await expect(page.getByTestId('domain-status')).toHaveAttribute('data-tone', 'fail');
  await expect(page.locator('[data-testid="domain-progress"] [data-row-status="fail"]')).toHaveCount(1);
  m.setup = withOptional(setupDoc(NO_APP), { status: 'fail', code: 'caa_blocked' });
  await page.getByTestId('check-again').click();
  await expect(page.getByTestId('domain-status')).toContainText('0 issue "amazon.com"');
  m.setup = withOptional(setupDoc(NO_APP), { status: 'fail', code: 'cname_at_apex' });
  await page.getByTestId('check-again').click();
  await expect(page.getByTestId('domain-status')).toContainText('ALIAS or ANAME');

  // Issued, moving, then waiting for the address record.
  m.setup = withOptional(setupDoc(NO_APP), { status: 'wait', code: 'attaching' });
  await expect(page.getByTestId('domain-status')).toContainText('Moving CoderHelm to your domain');
  m.setup = withOptional(setupDoc(NO_APP), { status: 'wait', code: 'dns_missing' });
  await expect(page.getByTestId('domain-status')).toContainText('Waiting for the address record');
  // A refresh keeps the records (this browser remembers them).
  await page.reload();
  await expect(page.getByTestId('record-address-value')).toHaveText('d111test.cloudfront.net');

  // Live: the guide moves to the domain, and the GitHub App gets its URLs.
  m.setup = withOptional(setupDoc(NO_APP), { status: 'pass', code: 'ok' });
  await expect(page.getByTestId('screen-github')).toBeVisible();
  await expect.poll(() => page.url()).toContain(encodeURIComponent(DOMAIN));
  await page.getByTestId('create-app').click();
  const manifest = JSON.parse(new URLSearchParams(m.posted!).get('manifest')!);
  expect(manifest.hook_attributes.url).toBe(`${DOMAIN}/webhooks/github`);
  expect(manifest.redirect_url).toBe(`${DOMAIN}/api/setup/github/callback`);
  assertPrivate(m);
});

test('a Route 53 zone in the account: set up by the install, nothing to add', async ({ page }) => {
  const m = newMock({ status: { schema: 1, phase: 'done', url: DOMAIN, domain: { hostname: 'coderhelm.example.com', mode: 'route53', state: 'live', records: [] } } });
  m.setup = withOptional(setupDoc(NO_APP), { status: 'wait', code: 'dns_missing' });
  await seeded(page, m, { domainChoice: 'own', hostname: 'coderhelm.example.com' });
  await expect(page.getByTestId('step-title')).toHaveText('Setting up your domain');
  await expect(page.getByTestId('dns-records')).toHaveCount(0);
  await expect(page.getByTestId('domain-progress')).toContainText('Route 53');
  m.setup = withOptional(setupDoc(NO_APP), { status: 'pass', code: 'ok' });
  await expect(page.getByTestId('screen-github')).toBeVisible();
});

test('skip the domain: finish on the AWS address, with the way back', async ({ page }) => {
  const m = newMock({ status: { schema: 1, phase: 'done', url: INSTALL, domain: EXTERNAL } });
  m.setup = withOptional(setupDoc(), { status: 'wait', code: 'validating' });
  await seeded(page, m, { domainChoice: 'own', hostname: 'coderhelm.example.com' });
  await expect(page.getByTestId('screen-domain')).toBeVisible();
  await page.getByTestId('skip-domain').click();
  await expect(page.getByTestId('screen-ready')).toBeVisible();
  await expect(page.getByTestId('domain-later')).toContainText('coderhelm.example.com');
  await page.getByTestId('back-to-domain').click();
  await expect(page.getByTestId('screen-domain')).toBeVisible();
});

test('a private progress file: the domain step says where the records are', async ({ page }) => {
  const m = newMock({ status: null });
  m.setup = withOptional(setupDoc(NO_APP), { status: 'wait', code: 'validating' });
  await seeded(page, m, { domainChoice: 'own', hostname: 'coderhelm.example.com', url: INSTALL });
  await expect(page.getByTestId('domain-no-records')).toContainText('Settings, System, Domain');
});

test('ready: the optional setup list, each with its check and one action', async ({ page }) => {
  const m = newMock({ setup: withOptional(setupDoc(), { status: 'skip', code: 'none' }, { updates: { status: 'pass', code: 'ok' } }) });
  await seeded(page, m, { url: INSTALL, region: 'eu-west-1' });
  await expect(page.getByTestId('screen-ready')).toBeVisible();
  const list = page.getByTestId('optional-setup');
  await expect(list.locator('[data-optional]')).toHaveCount(10);
  await expect(list.locator('[data-optional="domain"]')).toHaveAttribute('data-state', 'todo');
  await expect(page.getByTestId('optional-domain-action')).toHaveAttribute('href', `${INSTALL}/settings/system/#domain`);
  await expect(list.locator('[data-optional="email"]')).toHaveAttribute('data-state', 'todo');
  await expect(list.locator('[data-optional="email"]')).toContainText('Request production access');
  await expect(page.getByTestId('optional-email-action')).toHaveAttribute('href', 'https://eu-west-1.console.aws.amazon.com/ses/home?region=eu-west-1#/account');
  await expect(list.locator('[data-optional="updates"]')).toHaveAttribute('data-state', 'done');
  await expect(list.locator('[data-optional="backups"]')).toContainText('Done by the install');
  await expect(page.getByTestId('optional-invite-action')).toHaveAttribute('href', `${INSTALL}/settings/people/`);
  assertPrivate(m);
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
    // Your own domain: the options, the records, a failure, Route 53, optional setup.
    await page.evaluate(() => localStorage.clear());
    await page.goto('/self-host/install/');
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByLabel('My own domain').check();
    await page.getByLabel('Your domain').fill('coderhelm.example.com');
    await page.getByTestId('auto-update').check();
    await at('14-start-domain-options');
    await page.getByLabel('Your email').fill('ada@example.com');
    m.status = { schema: 1, phase: 'done', url: INSTALL, domain: EXTERNAL };
    m.setup = withOptional(setupDoc(NO_APP), { status: 'wait', code: 'validating' });
    await page.getByTestId('launch').click();
    await expect(page.getByTestId('screen-domain')).toBeVisible();
    await page.getByTestId('dns-provider').selectOption('godaddy');
    await at('15-domain-records');
    m.setup = withOptional(setupDoc(NO_APP), { status: 'fail', code: 'dns_wrong_value' });
    await page.getByTestId('check-again').click();
    await expect(page.getByTestId('domain-status')).toHaveAttribute('data-tone', 'fail');
    await at('16-domain-wrong-value');
    m.status = { schema: 1, phase: 'done', url: DOMAIN, domain: { hostname: 'coderhelm.example.com', mode: 'route53', state: 'live', records: [] } };
    m.setup = withOptional(setupDoc(NO_APP), { status: 'wait', code: 'attaching' });
    await page.evaluate(() => localStorage.clear());
    await page.goto('/self-host/install/');
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByLabel('My own domain').check();
    await page.getByLabel('Your domain').fill('coderhelm.example.com');
    await page.getByLabel('Your email').fill('ada@example.com');
    await page.getByTestId('launch').click();
    await expect(page.getByTestId('step-title')).toHaveText('Setting up your domain');
    await at('17-domain-route53');
    m.setup = withOptional(setupDoc(), { status: 'pass', code: 'ok' }, { updates: { status: 'pass', code: 'ok' } });
    await expect(page.getByTestId('screen-ready')).toBeVisible();
    await at('18-ready-optional-setup');
    // Back to the no-sign screen for the light-mode shots below.
    m.status = null;
    m.setup = null;
    await page.evaluate(() => localStorage.clear());
    await page.goto('/self-host/install/');
    await page.getByLabel('Your email').fill('ada@example.com');
    await page.getByTestId('launch').click();
    await expect(page.getByTestId('no-sign')).toBeVisible();
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

// ── Hybrid: a CoderHelm address and CoderHelm's GitHub App ───────────────

interface Hybrid {
  calls: { path: string; body: Json }[];
  /** Per path, a refusal to answer with ({status, code}), else ok. */
  refuse: Record<string, { status: number; code: string; error?: string } | undefined>;
}
const newHybrid = (): Hybrid => ({ calls: [], refuse: {} });
const REG_OK = { id: 'hybrid_registered', label: 'Registered with CoderHelm', status: 'pass', code: 'ok', required: false };
const nameCheck = (status: string, code: string) => ({ id: 'hybrid_name', label: 'Your CoderHelm address', status, code, required: false });
const HOSTED_GH = { github_app: { status: 'pass', code: 'hosted_app' }, github_installed: { status: 'fail', code: 'not_linked' } };
function withHybrid(doc: Json, ...checks: Json[]) {
  const list = [...(doc.checks as Json[])];
  list.splice(list.findIndex((c) => c.id === 'admin'), 0, ...checks);
  return { ...doc, checks: list };
}

async function mockHybrid(page: Page, h: Hybrid) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__CH_HYBRID_RETRY_MS = 50;
    w.__CH_NAME_DEBOUNCE_MS = 20;
  });
  await page.route('https://api.coderhelm.com/hybrid/names/**', (r) => {
    const name = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop() ?? '');
    if (name === 'admin') return r.fulfill({ json: { name, available: false, code: 'reserved', error: 'That name is reserved. Try another one.' }, headers: CORS });
    if (name === 'taken-co') return r.fulfill({ json: { name, available: false, code: 'taken', error: 'That name is taken. Try another one.' }, headers: CORS });
    return r.fulfill({ json: { name, hostname: `${name}.coderhelm.com`, available: true, code: 'ok', error: null }, headers: CORS });
  });
  await page.route(`${INSTALL}/api/setup/hybrid**`, (r) => {
    const p = new URL(r.request().url()).pathname.replace('/api/setup/hybrid', '');
    const body = JSON.parse(r.request().postData() ?? '{}');
    h.calls.push({ path: p, body });
    const no = h.refuse[p];
    if (no) return r.fulfill({ status: no.status, json: { code: no.code, error: no.error ?? 'Refused.' }, headers: CORS });
    if (p === '/github/link') return r.fulfill({ json: { state: 'hyb_x', install_url: 'https://github.com/apps/coderhelm/installations/new?state=hyb_x' }, headers: CORS });
    return r.fulfill({ json: { registered: true }, headers: CORS });
  });
}

const HYBRID_STATE = { setup: 'hybrid', domainChoice: 'coderhelm', coderhelmName: 'example-co', githubChoice: 'hosted', sharing: false, url: INSTALL };

test('hybrid: pick the setup, the name is checked as you type, and AWS opens with no domain to set up', async ({ page }) => {
  const m = newMock();
  const h = newHybrid();
  await mock(page, m);
  await mockHybrid(page, h);
  await page.goto('/self-host/install/');
  await expect(page.getByTestId('setup-choice')).toBeVisible();
  await page.locator('[data-setup="hybrid"]').click();
  await expect(page.getByTestId('hybrid-options')).toBeVisible();
  await expect(page.getByTestId('hosted-github')).toBeChecked();
  await expect(page.getByTestId('share-deliveries')).not.toBeChecked();
  const input = page.getByLabel('Your CoderHelm address name');
  await input.fill('ab');
  await expect(page.getByTestId('name-picker-status')).toHaveText('Not allowed: Use at least 3 characters.');
  await input.fill('admin');
  await expect(page.getByTestId('name-picker-status')).toHaveText('Reserved: That name is reserved. Try another one.');
  await expect(page.getByTestId('name-picker')).toHaveAttribute('data-name-state', 'reserved');
  await input.fill('taken-co');
  await expect(page.getByTestId('name-picker')).toHaveAttribute('data-name-state', 'taken');
  await expect(page.getByTestId('name-picker-status')).toHaveText('Taken: That name is taken. Try another one.');
  await input.fill('example-co');
  await expect(page.getByTestId('name-picker-status')).toHaveText('Available: example-co.coderhelm.com is free. It’s claimed for you once your install answers.');
  await expect(page.getByTestId('summary')).toContainText('example-co.coderhelm.com');
  await expect(page.getByTestId('summary')).toContainText('CoderHelm’s app');
  await page.getByLabel('Your email').fill('ada@example.com');
  await page.getByTestId('launch').click();
  await expect(page.getByTestId('step-title')).toHaveText('Waiting for AWS');
  const [u] = await opened(page);
  const q = new URLSearchParams(new URL(u).hash.split('?')[1]);
  expect(q.get('param_Hostname')).toBeNull();
  // The steps for a CoderHelm address.
  await expect(page.locator('[aria-label="Install steps"] > li')).toHaveCount(5);
  await expect(page.getByTestId('trust')).toContainText('GitHub events pass through CoderHelm');
});

test('hybrid: an empty or bad name stops the launch with the reason', async ({ page }) => {
  const m = newMock();
  await mock(page, m);
  await mockHybrid(page, newHybrid());
  await page.goto('/self-host/install/');
  await page.locator('[data-setup="hybrid"]').click();
  await page.getByLabel('Your email').fill('ada@example.com');
  await page.getByTestId('launch').click();
  await expect(page.getByTestId('name-picker-status')).toHaveText('Type a name, such as your company’s.');
  expect(await opened(page)).toHaveLength(0);
});

test('hybrid: "couldn’t check" only when the check really fails', async ({ page }) => {
  await mock(page, newMock());
  await mockHybrid(page, newHybrid());
  // A failed request (no answer), then an answer that isn't one: both "couldn't check".
  await page.route('https://api.coderhelm.com/hybrid/names/down-co', (r) => r.abort('connectionrefused'));
  await page.route('https://api.coderhelm.com/hybrid/names/odd-co', (r) => r.fulfill({ status: 502, body: 'Bad Gateway', headers: CORS }));
  await page.goto('/self-host/install/');
  await page.locator('[data-setup="hybrid"]').click();
  const input = page.getByLabel('Your CoderHelm address name');
  for (const name of ['down-co', 'odd-co']) {
    await input.fill(name);
    await expect(page.getByTestId('name-picker')).toHaveAttribute('data-name-state', 'offline');
    await expect(page.getByTestId('name-picker-status')).toContainText('Couldn’t check right now');
  }
  // A real answer is never "couldn't check".
  await input.fill('example-co');
  await expect(page.getByTestId('name-picker-verdict')).toHaveText('Available:');
  await expect(page.getByTestId('name-picker-status')).not.toContainText('Couldn’t check');
});

test('hybrid: registers, sends the choices and claims the name by itself, then follows the certificate', async ({ page }) => {
  const m = newMock({ setup: setupDoc(NO_APP) });
  const h = newHybrid();
  await mockHybrid(page, h);
  await seeded(page, m, HYBRID_STATE);
  await expect(page.getByTestId('screen-address')).toBeVisible();
  await expect(page.getByTestId('step-title')).toHaveText('Setting up example-co.coderhelm.com');
  await expect.poll(() => h.calls.map((c) => c.path)).toContain('/register');
  expect(h.calls[0].body.setup_token).toBe(TOKEN);
  m.setup = withHybrid(setupDoc(NO_APP), REG_OK);
  await expect.poll(() => h.calls.map((c) => c.path)).toContain('/name');
  const settings = h.calls.find((c) => c.path === '/settings')!;
  expect(settings.body).toMatchObject({ github_mode: 'hosted', sharing: { enabled: false, payloads: false } });
  expect(h.calls.find((c) => c.path === '/name')!.body.name).toBe('example-co');
  m.setup = withHybrid(setupDoc(HOSTED_GH), REG_OK, nameCheck('wait', 'cert_pending'));
  await expect(page.getByTestId('address-status')).toContainText('Waiting for AWS to issue the certificate');
  await expect(page.getByTestId('address-progress').locator('[data-row-status]')).toHaveText([/Registered/, /reserved for you/, /Certificate issued/, /answers on example-co\.coderhelm\.com/]);
  await expect(page.getByTestId('address-progress').locator('[data-row-status="active"]')).toHaveCount(1);
  m.setup = withHybrid(setupDoc(HOSTED_GH), REG_OK, nameCheck('wait', 'attaching'));
  await expect(page.getByTestId('address-status')).toContainText('Moving CoderHelm to the address');
  m.setup = withHybrid(setupDoc(HOSTED_GH), REG_OK, nameCheck('pass', 'ok'));
  await expect(page.getByTestId('screen-github')).toBeVisible();
  await expect(page.getByTestId('step-title')).toHaveText('Install CoderHelm’s GitHub App');
});

test('hybrid: a taken name is picked again right on the page', async ({ page }) => {
  const m = newMock({ setup: withHybrid(setupDoc(NO_APP), REG_OK) });
  const h = newHybrid();
  h.refuse['/name'] = { status: 409, code: 'taken', error: 'That name is taken. Try another one.' };
  await mockHybrid(page, h);
  await seeded(page, m, HYBRID_STATE);
  await expect(page.getByTestId('rename')).toBeVisible();
  await expect(page.getByTestId('address-status')).toContainText('That name can’t be used');
  h.refuse['/name'] = undefined;
  await page.getByLabel('Another name').fill('example-two');
  await expect(page.getByTestId('rename-status')).toContainText('is free');
  await page.getByTestId('claim-name').click();
  await expect.poll(() => h.calls.filter((c) => c.path === '/name').map((c) => c.body.name)).toContain('example-two');
});

test('hybrid failures each say what to do: unreachable install, unreachable CoderHelm, a refused registration', async ({ page }) => {
  const m = newMock({ setup: withHybrid(setupDoc(NO_APP), { id: 'hybrid_registered', label: 'x', status: 'fail', code: 'proof_failed', required: false }) });
  const h = newHybrid();
  await mockHybrid(page, h);
  await seeded(page, m, HYBRID_STATE);
  await expect(page.getByTestId('address-status')).toContainText('CoderHelm can’t reach your install yet');
  await expect(page.getByTestId('address-progress').locator('[data-row-status="fail"]')).toHaveCount(1);
  // Asking again re-checks (the install proves itself on the next try).
  await expect.poll(() => h.calls.filter((c) => c.path === '').length).toBeGreaterThan(0);
  m.setup = setupDoc(NO_APP);
  h.refuse['/register'] = { status: 502, code: 'hosted_unreachable', error: 'CoderHelm’s servers didn’t answer.' };
  await page.getByTestId('check-again').click();
  await expect(page.getByTestId('hybrid-error')).toContainText('Your install can’t reach CoderHelm.');
  await expect(page.getByTestId('hybrid-error')).toContainText('api.coderhelm.com');
  await page.getByTestId('skip-address').click();
  await expect(page.getByTestId('screen-github')).toBeVisible();
});

test('hybrid GitHub: install CoderHelm’s app and come back linked; refusals read plainly', async ({ page }) => {
  const m = newMock({ setup: withHybrid(setupDoc(HOSTED_GH), REG_OK, nameCheck('pass', 'ok')) });
  const h = newHybrid();
  await mockHybrid(page, h);
  let githubOpened = '';
  await page.route('https://github.com/apps/**', (r) => {
    githubOpened = r.request().url();
    return r.fulfill({ contentType: 'text/html', body: '<p>GitHub</p>' });
  });
  await seeded(page, m, HYBRID_STATE);
  await expect(page.getByTestId('github-hosted-progress').locator('[data-row-status]').first()).toHaveAttribute('data-row-status', 'pass');
  // A refused link says why.
  h.refuse['/github/link'] = { status: 502, code: 'broker_refused' };
  await page.getByTestId('install-hosted-app').click();
  await expect(page.getByTestId('hybrid-error')).toContainText('CoderHelm refused the request.');
  h.refuse['/github/link'] = { status: 401, code: 'signature_mismatch' };
  await page.getByTestId('install-hosted-app').click();
  await expect(page.getByTestId('hybrid-error')).toContainText('The keys on the two sides differ.');
  h.refuse['/github/link'] = undefined;
  await page.getByTestId('install-hosted-app').click();
  await page.waitForURL(/github\.com\/apps\/coderhelm\/installations\/new/);
  expect(githubOpened).toContain('github.com/apps/coderhelm/installations/new');
  const link = h.calls.filter((c) => c.path === '/github/link').pop()!;
  expect(String(link.body.return_url)).toContain('/self-host/install/?');
  expect(link.body.setup_token).toBe(TOKEN);
  // Back from GitHub: refused, then linked.
  await page.goto('/self-host/install/?hybrid_github=not_yours');
  await expect(page.getByTestId('hybrid-github-outcome')).toContainText('GitHub says that installation isn’t yours.');
  m.setup = withHybrid(setupDoc({ github_app: { status: 'pass', code: 'hosted_app' } }), REG_OK, nameCheck('pass', 'ok'));
  await page.goto('/self-host/install/?hybrid_github=linked');
  await expect(page.getByTestId('screen-ready')).toBeVisible();
});

test('hybrid GitHub: switching back to your own app is one click', async ({ page }) => {
  const m = newMock({ setup: withHybrid(setupDoc(HOSTED_GH), REG_OK, nameCheck('pass', 'ok')) });
  const h = newHybrid();
  await mockHybrid(page, h);
  await seeded(page, m, HYBRID_STATE);
  await page.getByTestId('use-own-app').click();
  await expect.poll(() => h.calls.filter((c) => c.path === '/settings').map((c) => c.body.github_mode)).toContain('own');
});

test('hybrid screenshots at 1440 and 390', async ({ page }) => {
  test.skip(!SHOTS, 'set E2E_SHOTS=<dir> to save screenshots');
  test.setTimeout(120_000);
  for (const [w, hgt] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: hgt });
    const at = (n: string) => shot(page, `${w}-${n}`);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const m = newMock();
    const h = newHybrid();
    await mock(page, m);
    await mockHybrid(page, h);
    await page.goto('/self-host/install/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/self-host/install/');
    await page.locator('[data-setup="hybrid"]').click();
    await page.getByLabel('Your CoderHelm address name').fill('example-co');
    await expect(page.getByTestId('name-picker-status')).toContainText('is free');
    await page.getByLabel('Your email').fill('ada@example.com');
    await at('19-start-hybrid');
    await page.getByLabel('Your CoderHelm address name').fill('taken-co');
    await expect(page.getByTestId('name-picker')).toHaveAttribute('data-name-state', 'taken');
    await at('20-start-name-taken');
    await page.getByLabel('Your CoderHelm address name').fill('example-co');
    m.status = { schema: 1, phase: 'deploying', step: 6, steps: 10 };
    await page.getByTestId('launch').click();
    await expect(page.getByText('Part 6 of 10')).toBeVisible();
    await at('21-hybrid-deploying');
    m.status = { schema: 1, phase: 'done', url: INSTALL };
    m.setup = withHybrid(setupDoc(HOSTED_GH), REG_OK, nameCheck('wait', 'cert_pending'));
    await expect(page.getByTestId('screen-address')).toBeVisible();
    await expect(page.getByTestId('address-status')).toContainText('certificate');
    await at('22-address-cert-pending');
    m.setup = withHybrid(setupDoc(NO_APP), { id: 'hybrid_registered', label: 'x', status: 'fail', code: 'proof_failed', required: false });
    await expect(page.getByTestId('address-status')).toContainText('reach your install');
    await at('23-address-unreachable');
    m.setup = withHybrid(setupDoc(HOSTED_GH), REG_OK, nameCheck('pass', 'ok'));
    await expect(page.getByTestId('screen-github')).toBeVisible();
    await at('24-github-hosted');
    h.refuse['/github/link'] = { status: 502, code: 'broker_refused' };
    await page.getByTestId('install-hosted-app').click();
    await expect(page.getByTestId('hybrid-error')).toBeVisible();
    await at('25-github-hosted-refused');
  }
});
