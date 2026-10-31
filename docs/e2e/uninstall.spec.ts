// The browser uninstall guide (/self-host/uninstall/) end to end, with the
// release bucket and the uninstaller's progress file mocked: choosing, the
// typed confirmation, the AWS link, live progress, the final "nothing left"
// list, a failure, hybrid's warning, and phones. E2E_SHOTS=<dir> also saves
// screenshots at 1440 and 375 wide.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = process.env.E2E_SHOTS;
const CORS = { 'access-control-allow-origin': '*' };
type Json = Record<string, unknown>;
interface Mock { status: Json | null; requests: string[]; templates?: string[] }

async function mock(page: Page, m: Mock) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__CH_POLL_MS = 150;
  });
  page.on('request', (r) => m.requests.push(r.url()));
  await page.context().route(/console\.aws\.amazon\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<p>AWS</p>' }));
  await page.route('https://coderhelm-public.s3.amazonaws.com/launch/latest.json', (r) => r.fulfill({ json: { version: 'v0.9.0' }, headers: CORS }));
  await page.route(/^https:\/\/coderhelm-public\.s3\.amazonaws\.com\/launch\/(v[^/]+)\/coderhelm-uninstall\.yaml$/, (r) => {
    const v = /\/launch\/(v[^/]+)\//.exec(r.request().url())![1];
    return (m.templates ?? ['v0.9.0']).includes(v) ? r.fulfill({ status: 200, body: '{}', headers: CORS }) : r.fulfill({ status: 403, body: 'AccessDenied', headers: CORS });
  });
  await page.route('https://api.github.com/repos/CoderHelm/coderhelm-platform/releases/latest', (r) => r.fulfill({ status: 404, json: {}, headers: CORS }));
  await page.route(/^https:\/\/coderhelm-setup-[a-z0-9]{16}\.s3\.[a-z0-9-]+\.amazonaws\.com\/status\.json/, (r) =>
    m.status ? r.fulfill({ json: m.status, headers: CORS }) : r.fulfill({ status: 403, body: 'AccessDenied', headers: CORS }),
  );
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(400); // the screen's fade-in
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

const doc = (over: Json = {}): Json => ({ schema: 1, kind: 'uninstall', phase: 'stacks', message: 'Deleting coderhelm-prod-api', mode: 'everything', stage: 'prod', step: 3, steps: 9, removed: [], kept: [], scheduled: [], left: [], problems: [], hybrid: null, updatedAt: '2026-10-30T12:00:00Z', ...over });
const DONE = doc({
  phase: 'done', message: 'CoderHelm and its data are removed from this account.', step: null, steps: null,
  removed: [{ kind: 'stack', name: 'coderhelm-prod-api' }, { kind: 'stack', name: 'coderhelm-prod-database' }, { kind: 'table', name: 'coderhelm-prod-runs' }, { kind: 'permissions boundary', name: 'coderhelm-prod-boundary-1a2b3c4d' }],
  scheduled: [{ kind: 'KMS key', name: '1234abcd-12ab-34cd-56ef-1234567890ab', date: '2026-11-06T12:00:00Z' }],
});

/** Every request goes to this site or AWS: nothing to CoderHelm's servers. */
function assertPrivate(m: Mock) {
  for (const u of m.requests) {
    const h = new URL(u).hostname;
    expect(h === 'localhost' || h.endsWith('.amazonaws.com') || h === 'api.github.com', `unexpected request to ${u}`).toBe(true);
  }
}

test('choose, type the name, open AWS, follow the uninstall to "nothing left"', async ({ page }) => {
  const m: Mock = { status: null, requests: [] };
  await mock(page, m);
  await page.goto('/self-host/uninstall/?stage=prod&region=eu-west-1');
  await expect(page.getByTestId('step-title')).toHaveText('Uninstall CoderHelm');
  await expect(page.getByTestId('stage')).toHaveValue('prod');
  // Nothing is chosen for the person.
  await expect(page.getByTestId('mode-keep')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('mode-everything')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('continue').click();
  await expect(page.getByText('Choose what to remove.')).toBeVisible();
  // Every control shows the pointer.
  for (const id of ['mode-keep', 'mode-everything', 'continue']) expect(await page.getByTestId(id).evaluate((e) => getComputedStyle(e).cursor)).toBe('pointer');

  await page.getByTestId('mode-everything').click();
  await expect(page.getByTestId('will-delete')).toContainText('The KMS keys');
  await expect(page.getByTestId('will-delete')).toContainText('7 days');
  await expect(page.getByTestId('will-keep')).toHaveCount(0);
  await shot(page, 'uninstall-choose-1440');
  await page.getByTestId('continue').click();

  await expect(page.getByTestId('step-title')).toHaveText('Delete CoderHelm prod and all its data');
  await expect(page.getByTestId('everything-warning')).toContainText('7 days');
  await expect(page.getByTestId('open-aws')).toBeDisabled();
  for (const typed of ['Prod', 'prod-eu', 'pro']) {
    await page.getByTestId('confirm').fill(typed);
    await expect(page.getByTestId('open-aws')).toBeDisabled();
  }
  await page.getByTestId('confirm').fill('prod');
  const link = page.getByTestId('open-aws');
  await expect(link).toHaveAttribute('href', /eu-west-1\.console\.aws\.amazon\.com/);
  const href = (await link.getAttribute('href'))!;
  const q = new URLSearchParams(href.split('?')[2] ?? href.split('#')[1].split('?')[1]);
  expect(q.get('templateURL')).toBe('https://coderhelm-public.s3.amazonaws.com/launch/v0.9.0/coderhelm-uninstall.yaml');
  expect(q.get('param_Stage')).toBe('prod');
  expect(q.get('param_ConfirmStage')).toBe('prod');
  expect(q.get('param_Mode')).toBe('everything');
  expect(q.get('stackName')).toMatch(/^coderhelm--uninstall-prod-[a-z0-9]{6}$/);
  await shot(page, 'uninstall-confirm-1440');
  const popup = page.waitForEvent('popup');
  await link.click();
  await (await popup).close();

  await expect(page.getByTestId('step-title')).toHaveText('Removing CoderHelm');
  await expect(page.getByTestId('live-progress')).toContainText('Waiting for AWS to start');
  m.status = doc();
  await expect(page.getByTestId('live-progress')).toContainText('%');
  await expect(page.locator('[data-testid="phases"] [data-row-status="active"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="phases"] [data-row-status="pass"]')).toHaveCount(1);
  await shot(page, 'uninstall-progress-1440');

  m.status = DONE;
  await expect(page.getByTestId('step-title')).toHaveText('Nothing left');
  await expect(page.getByTestId('nothing-left')).toContainText('coderhelm-prod');
  await expect(page.getByTestId('removed')).toContainText('2 stacks');
  await expect(page.getByTestId('scheduled')).toContainText('2026-11-06');
  await expect(page.getByTestId('self-removal')).toContainText('ROLLBACK_COMPLETE');
  await expect(page.getByTestId('verify-command')).toHaveText('npx -y github:CoderHelm/coderhelm-platform uninstall --verify --stage prod --region eu-west-1');
  await shot(page, 'uninstall-done-1440');
  // The address bar never carries the choice to delete.
  expect(page.url()).not.toMatch(/mode|everything|confirm/);
  assertPrivate(m);
});

test('served with the uninstall guide’s own policy: S3 and GitHub’s release API only, no form posts', async ({ page }) => {
  const CSP = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'infra', 'lib', 'docs-csp.json'), 'utf8'));
  const r = await page.goto('/self-host/uninstall/');
  expect(r!.headers()['content-security-policy']).toBe(CSP.uninstallGuide);
  const details = await page.request.get('/self-host/uninstall-details/');
  expect(details.headers()['content-security-policy']).toBe(CSP.docs);
});

test('keep my data: the data is listed as kept, and the stack is told to keep it', async ({ page }) => {
  const m: Mock = { status: null, requests: [] };
  await mock(page, m);
  await page.goto('/self-host/uninstall/?stage=prod&region=us-east-1');
  await page.getByTestId('mode-keep').click();
  await expect(page.getByTestId('will-keep')).toContainText('DynamoDB tables');
  await expect(page.getByTestId('will-keep')).toContainText('The user pool');
  await expect(page.getByTestId('will-delete')).not.toContainText('DynamoDB tables');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('keep-note')).toBeVisible();
  await page.getByTestId('confirm').fill('prod');
  expect(await page.getByTestId('open-aws').getAttribute('href')).toContain('param_Mode=keep');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('step-title')).toHaveText('Uninstall CoderHelm');
});

test('a failed uninstall says what is left and why, and launches again', async ({ page }) => {
  const m: Mock = { status: doc({ phase: 'failed', message: 'Most of CoderHelm is removed, but 1 piece could not be.', fix: 'Launch the uninstaller again: it picks up where it stopped.', left: [{ kind: 'stack', name: 'coderhelm-prod-web', error: 'DELETE_FAILED: bucket not empty' }], logUrl: 'https://us-east-1.console.aws.amazon.com/cloudwatch/home' }), requests: [] };
  await mock(page, m);
  await page.goto('/self-host/uninstall/?stage=prod&region=us-east-1&id=abcd1234efgh5678');
  await expect(page.getByTestId('step-title')).toHaveText('Almost everything is removed');
  await expect(page.getByTestId('left')).toContainText('coderhelm-prod-web');
  await expect(page.getByTestId('left')).toContainText('bucket not empty');
  await page.getByTestId('again').click();
  await expect(page.getByTestId('step-title')).toHaveText('Uninstall CoderHelm');
  await expect(page.getByTestId('stage')).toHaveValue('prod');
});

test('hybrid: a plain warning that GitHub and Jira go back to CoderHelm hosted', async ({ page }) => {
  const m: Mock = { status: null, requests: [] };
  await mock(page, m);
  await page.goto('/self-host/uninstall/?stage=acme&region=us-east-1&hybrid=1&github=2&jira=1');
  await page.getByTestId('mode-keep').click();
  await expect(page.getByTestId('hybrid-warning')).toContainText('2 GitHub installations and a Jira site');
  await expect(page.getByTestId('hybrid-warning')).toContainText('back to CoderHelm hosted');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('hybrid-warning')).toBeVisible();
});

test('no uninstall template in the newest release: the terminal way instead, no AWS link', async ({ page }) => {
  const m: Mock = { status: null, requests: [], templates: [] };
  await mock(page, m);
  await page.goto('/self-host/uninstall/?stage=prod&region=us-east-1');
  await page.getByTestId('mode-everything').click();
  await page.getByTestId('continue').click();
  await page.getByTestId('confirm').fill('prod');
  await expect(page.getByTestId('no-template')).toContainText('uninstall --everything --stage prod --region us-east-1');
  await expect(page.getByTestId('open-aws')).toBeDisabled();
});

test('the install guide links to the uninstall guide with its install', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    const s = { statusId: 'abcd1234efgh5678', setupToken: 'Tk'.repeat(20), region: 'eu-west-1', stage: 'prod', email: 'ada@example.com', provider: 'bedrock', org: '', version: 'v0.7.0', url: '', launchedAt: null, attempt: 1 };
    localStorage.setItem(`coderhelm-install:${s.statusId}`, JSON.stringify(s));
    localStorage.setItem('coderhelm-install:last', s.statusId);
    sessionStorage.setItem('seeded', '1');
  });
  await page.route('**/launch/latest.json', (r) => r.fulfill({ status: 403, body: '', headers: CORS }));
  await page.goto('/self-host/install/');
  await expect(page.getByTestId('uninstall-link')).toHaveAttribute('href', '/self-host/uninstall/?stage=prod&region=eu-west-1');
});

for (const [w, h] of [[1440, 1000], [375, 812]] as const) {
  test(`fits ${w} wide with no sideways scroll`, async ({ page }) => {
    const m: Mock = { status: DONE, requests: [] };
    await page.setViewportSize({ width: w, height: h });
    await mock(page, m);
    await page.goto('/self-host/uninstall/?stage=prod&region=us-east-1');
    await page.getByTestId('mode-everything').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, `uninstall-choose-${w}`);
    if (w === 375) await expect(page.getByTestId('mobile-steps')).toBeVisible();
    await page.getByTestId('continue').click();
    await page.getByTestId('confirm').fill('prod');
    await shot(page, `uninstall-confirm-${w}`);
    await page.goto('/self-host/uninstall/?stage=prod&region=us-east-1&id=abcd1234efgh5678');
    await expect(page.getByTestId('step-title')).toHaveText('Nothing left');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, `uninstall-done-${w}`);
  });
}
