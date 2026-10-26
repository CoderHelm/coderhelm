// The install guide's decisions (lib/install/core.ts), without a browser.
// Node runs the TypeScript file directly (type stripping, Node 22.18+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../lib/install/core.ts';

const S = c.newState({ statusId: 'abcd1234efgh5678', setupToken: 'T'.repeat(40), email: 'Ada@Example.com', region: 'eu-west-1' });

test('new state: random, valid IDs; Bedrock and prod by default', () => {
  const a = c.newState();
  const b = c.newState();
  assert.match(a.statusId, c.STATUS_ID_RE);
  assert.match(a.setupToken, /^[A-Za-z0-9]{40}$/);
  assert.notEqual(a.statusId, b.statusId);
  assert.notEqual(a.setupToken, b.setupToken);
  assert.equal(a.provider, 'bedrock');
  assert.equal(a.stage, 'prod');
});

test('validation speaks plainly', () => {
  assert.deepEqual(c.validate({ email: 'ada@example.com', stage: 'prod', region: 'us-east-1' }), {});
  const p = c.validate({ email: 'nope', stage: 'Prod!', region: 'mars-1' });
  assert.match(p.email, /email/);
  assert.match(p.stage, /lowercase/);
  assert.match(p.region, /region/);
});

test('quick-create link: the documented review page, every value filled, one region throughout', () => {
  const u = new URL(c.quickCreateUrl(S));
  assert.equal(u.hostname, 'eu-west-1.console.aws.amazon.com');
  assert.equal(u.searchParams.get('region'), 'eu-west-1');
  assert.ok(u.hash.startsWith('#/stacks/create/review?'));
  const q = new URLSearchParams(u.hash.split('?')[1]);
  assert.equal(q.get('templateURL'), 'https://coderhelm-public.s3.amazonaws.com/launch/v0.7.0/coderhelm-launch.yaml');
  assert.equal(q.get('stackName'), 'coderhelm-prod');
  assert.equal(q.get('param_AdminEmail'), 'ada@example.com');
  assert.equal(q.get('param_Version'), 'v0.7.0');
  assert.equal(q.get('param_StatusId'), 'abcd1234efgh5678');
  assert.equal(q.get('param_SetupToken'), 'T'.repeat(40));
  assert.equal(q.get('param_ModelProvider'), 'bedrock');
  assert.ok(c.quickCreateUrl(S).length < 2000, 'well under URL length limits');
});

test('a later attempt gets a fresh stack name (a failed stack keeps its name)', () => {
  assert.equal(c.stackName({ stage: 'prod', attempt: 1 }), 'coderhelm-prod');
  assert.equal(c.stackName({ stage: 'prod', attempt: 3 }), 'coderhelm-prod-3');
});

test('the template comes from S3 by version; latest.json picks it, the fallback covers a bad file', () => {
  assert.equal(c.pickVersion({ version: 'v0.8.1' }), 'v0.8.1');
  assert.equal(c.pickVersion({ version: 'latest' }), c.FALLBACK_VERSION);
  assert.equal(c.pickVersion(null), c.FALLBACK_VERSION);
  assert.throws(() => c.templateUrl('main'));
});

test('progress file and console links', () => {
  assert.equal(c.statusFileUrl(S), 'https://coderhelm-setup-abcd1234efgh5678.s3.eu-west-1.amazonaws.com/status.json');
  assert.equal(c.stacksConsoleUrl('eu-west-1'), 'https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks');
});

test('pasted URLs: https origins only, the stack output form too', () => {
  assert.equal(c.normalizeUrl('d111.cloudfront.net/'), 'https://d111.cloudfront.net');
  assert.equal(c.normalizeUrl('https://ch.example.com/settings/setup/'), 'https://ch.example.com');
  assert.equal(c.normalizeUrl('http://ch.example.com'), null);
  assert.equal(c.normalizeUrl('javascript:alert(1)'), null);
  assert.equal(c.normalizeUrl(''), null);
  assert.equal(c.urlFromPaste('{"install":"https://d111.cloudfront.net"}'), 'https://d111.cloudfront.net');
});

test('GitHub manifest: exact permissions (workflows: write), keys land on the install itself', () => {
  const m = c.githubManifest({ ...S, url: 'https://d111.cloudfront.net/' });
  assert.equal(m.redirect_url, 'https://d111.cloudfront.net/api/setup/github/callback');
  assert.equal(m.hook_attributes.url, 'https://d111.cloudfront.net/webhooks/github');
  assert.deepEqual(m.callback_urls, ['https://d111.cloudfront.net/auth/github/callback']);
  assert.equal(m.default_permissions.workflows, 'write');
  assert.equal(m.default_permissions.contents, 'write');
  assert.equal(m.public, false);
  assert.ok(m.name.length <= 34, 'GitHub app names are at most 34 characters');
  for (const k of Object.keys(c.GITHUB_PERMISSIONS)) assert.ok(c.PERMISSION_REASONS[k], `a reason for ${k}`);
  assert.equal(c.newAppUrl('', 'st'), 'https://github.com/settings/apps/new?state=st');
  assert.equal(c.newAppUrl('my org', 'st'), 'https://github.com/organizations/my%20org/settings/apps/new?state=st');
});

test('progress rows follow the phases; a failure sits on the first unfinished row', () => {
  const st = (rows) => rows.map((r) => r.status).join(',');
  assert.equal(st(c.progressRows(null, false, false)), 'pending,pending,pending,pending');
  assert.equal(st(c.progressRows(null, false, true)), 'active,pending,pending,pending');
  assert.equal(st(c.progressRows({ schema: 1, phase: 'starting' }, false, true)), 'pass,active,pending,pending');
  assert.equal(st(c.progressRows({ schema: 1, phase: 'deploying' }, false, true)), 'pass,pass,active,pending');
  assert.equal(st(c.progressRows({ schema: 1, phase: 'done' }, false, true)), 'pass,pass,pass,active');
  assert.equal(st(c.progressRows({ schema: 1, phase: 'done' }, true, true)), 'pass,pass,pass,pass');
  assert.equal(st(c.progressRows({ schema: 1, phase: 'failed' }, false, true)), 'pass,fail,pending,pending');
  assert.equal(st(c.progressRows({ schema: 1, phase: 'failed', step: 3, steps: 10 }, false, true)), 'pass,pass,fail,pending');
  assert.equal(st(c.progressRows(null, true, false)), 'pass,pass,pass,pass', 'a pasted URL that answers');
});

const setup = (over = {}) => ({
  schema: 1,
  ready: false,
  checks: [
    { id: 'api', status: 'pass', code: 'ok' },
    { id: 'github_app', status: 'pass', code: 'ok' },
    { id: 'github_installed', status: 'pass', code: 'ok' },
    { id: 'models', status: 'pass', code: 'ok' },
    { id: 'email', status: 'warn', code: 'sandbox', required: false },
    { id: 'admin', status: 'wait', code: 'not_signed_up' },
  ].map((ch) => (over[ch.id] ? { ...ch, ...over[ch.id] } : ch)),
});

test('the screen comes from the install itself', () => {
  assert.equal(c.deriveStep({ launchedAt: null, url: '' }, null), 'start');
  assert.equal(c.deriveStep({ launchedAt: 1, url: '' }, null), 'aws');
  assert.equal(c.deriveStep({ launchedAt: 1, url: 'https://x.y' }, setup({ github_app: { status: 'fail', code: 'missing' } })), 'github');
  assert.equal(c.deriveStep({ launchedAt: 1, url: 'https://x.y' }, setup({ github_installed: { status: 'fail', code: 'not_installed' } })), 'github');
  assert.equal(c.deriveStep({ launchedAt: 1, url: 'https://x.y' }, setup({ models: { status: 'fail', code: 'use_case_required' } })), 'models');
  assert.equal(c.deriveStep({ launchedAt: 1, url: 'https://x.y' }, setup({ models: { status: 'skip', code: 'anthropic_keys_per_team' } })), 'ready');
  assert.equal(c.deriveStep({ launchedAt: 1, url: 'https://x.y' }, setup()), 'ready');
});

test('every code the install documents has a sentence; unknown codes still render', () => {
  const documented = {
    github_app: ['ok', 'missing', 'missing_no_setup_key', 'secret_unreadable'],
    github_installed: ['ok', 'needs_app', 'not_installed', 'app_rejected', 'bad_key', 'github_unreachable'],
    models: ['ok', 'use_case_required', 'subscription_pending', 'marketplace_failed', 'access_denied', 'iam_denied', 'not_available', 'no_models', 'anthropic_keys_per_team'],
    email: ['ok', 'identity_unverified', 'sandbox', 'unknown'],
    admin: ['ok', 'not_signed_up', 'unconfirmed', 'no_admin_configured'],
  };
  for (const [id, codes] of Object.entries(documented)) {
    for (const code of codes) {
      const t = c.checkText({ id, code, status: 'fail' });
      assert.ok(t.title && !t.title.includes(':'), `${id}.${code}`);
      if (code !== 'ok') assert.ok(t.fix, `${id}.${code} has a fix`);
    }
  }
  assert.match(c.checkText({ id: 'new_check', code: 'x', status: 'warn' }).title, /new check/);
  for (const o of ['created', 'created_restart_needed', 'exists', 'bad_state', 'bad_code', 'github_refused', 'github_unreachable', 'store_failed']) {
    assert.ok(c.GITHUB_OUTCOMES[o], o);
  }
});

test('resume: the address bar holds no secret; stored state round-trips; junk is ignored', () => {
  const launched = { ...S, launchedAt: 5, url: 'https://d111.cloudfront.net' };
  const q = c.stateToQuery(launched);
  assert.doesNotMatch(q, /TTTT|ada/i, 'no setup key or email in the URL');
  assert.deepEqual(c.queryToPartial(q), { statusId: 'abcd1234efgh5678', region: 'eu-west-1', stage: 'prod', url: 'https://d111.cloudfront.net' });
  assert.equal(c.stateToQuery(c.newState()), '', 'nothing before launch');
  assert.deepEqual(c.queryToPartial('?id=../x&region=mars&url=javascript:1&github=created&app=coderhelm-prod'), { github: 'created', app: 'coderhelm-prod' });
  assert.deepEqual(c.parseStored(JSON.stringify(launched)), launched);
  assert.equal(c.parseStored('{bad'), null);
  assert.equal(c.parseStored(JSON.stringify({ statusId: 'x' })), null);
});

test('status documents are checked before use', () => {
  assert.equal(c.parseStatusDoc({ schema: 2, phase: 'done' }), null);
  assert.equal(c.parseStatusDoc({ schema: 1, phase: 'weird' }), null);
  assert.ok(c.parseStatusDoc({ schema: 1, phase: 'deploying', step: 2, steps: 10 }));
  assert.equal(c.elapsed(30_000), 'less than a minute');
  assert.equal(c.elapsed(125_000), '2 minutes');
});

test('the install\'s GET /api/setup/status, in its exact shape, drives the guide; links are the guide\'s own', () => {
  const at = { launchedAt: 1, url: 'https://x.y' };
  const doc = (over = {}, extra = {}) => ({
    schema: 1, service: 'coderhelm', self_hosted: true, setup_open: true, version: 'v0.7.0', checked_at: '2026-10-25T12:00:00Z', ready: false, github_manifest_ready: true,
    checks: [
      { id: 'api', label: 'CoderHelm answers', status: 'pass', code: 'ok' },
      { id: 'github_app', label: 'GitHub App created', status: 'pass', code: 'ok' },
      { id: 'github_installed', label: 'GitHub App installed on your repositories', status: 'pass', code: 'ok' },
      { id: 'models', label: 'Claude access', status: 'pass', code: 'ok' },
      { id: 'email', label: 'Email', status: 'warn', code: 'sandbox', required: false },
      { id: 'admin', label: 'First admin signed up', status: 'wait', code: 'not_signed_up' },
    ].map((x) => ({ ...x, ...(over[x.id] ?? {}) })),
    ...extra,
  });
  assert.equal(c.parseSetupStatus(null, 'us-east-1'), null);
  assert.equal(c.parseSetupStatus({ schema: 2, checks: [] }, 'us-east-1'), null);
  assert.equal(c.parseSetupStatus({ setup_open: true, steps: [] }, 'us-east-1'), null, 'the old progress shape is not read');

  // After the first account: only setup_open false, ready and a passing admin check.
  const closed = c.parseSetupStatus({ schema: 1, service: 'coderhelm', self_hosted: true, setup_open: false, version: 'v0.7.0', ready: true, github_manifest_ready: false, checks: [{ id: 'admin', label: 'First admin signed up', status: 'pass', code: 'ok' }] }, 'us-east-1');
  assert.equal(c.deriveStep(at, closed), 'ready');

  const noApp = c.parseSetupStatus(doc({ github_app: { status: 'fail', code: 'missing' }, github_installed: { status: 'wait', code: 'needs_app' } }), 'us-east-1');
  assert.equal(c.deriveStep(at, noApp), 'github');
  assert.equal(noApp.github_manifest_ready, true);
  const notInstalled = c.parseSetupStatus(doc({ github_installed: { status: 'wait', code: 'not_installed' } }), 'us-east-1');
  assert.equal(c.deriveStep(at, notInstalled), 'github');

  const bedrock = c.parseSetupStatus(doc({ models: { status: 'fail', code: 'use_case_required' } }), 'eu-west-1');
  const m = c.findCheck(bedrock, 'models');
  assert.equal(c.deriveStep(at, bedrock), 'models');
  assert.equal(m.code, 'use_case_required');
  assert.deepEqual(m.detail.models.map((x) => x.id), ['eu.anthropic.claude-opus-5-5', 'eu.anthropic.claude-sonnet-5-5']);
  assert.match(m.detail.console_url, /^https:\/\/eu-west-1\.console\.aws\.amazon\.com\/bedrock\//);
  // The subscription being set up is a warning, but still the step to wait on.
  assert.equal(c.deriveStep(at, c.parseSetupStatus(doc({ models: { status: 'warn', code: 'subscription_pending' } }), 'us-east-1')), 'models');
  assert.equal(c.deriveStep(at, c.parseSetupStatus(doc({ models: { status: 'skip', code: 'anthropic_keys_per_team' } }), 'us-east-1')), 'ready');

  const ready = c.parseSetupStatus(doc(), 'us-east-1');
  assert.equal(c.deriveStep(at, ready), 'ready');
  assert.match(c.findCheck(ready, 'email').detail.console_url, /\/ses\/home\?region=us-east-1/);
  // A check the guide doesn't know yet shows by its label.
  assert.equal(c.checkText({ id: 'new_check', code: 'x', status: 'warn', label: 'Something new' }).title, 'Something new');
  assert.equal(c.bedrockPrefixFor('ap-south-1'), 'apac.');
});
