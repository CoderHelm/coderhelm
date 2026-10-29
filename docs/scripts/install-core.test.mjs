// The install guide's decisions (lib/install/core.ts), without a browser.
// Node runs the TypeScript file directly (type stripping, Node 22.18+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../lib/install/core.ts';

const S = c.newState({ statusId: 'abcd1234efgh5678', setupToken: 'T'.repeat(40), email: 'Ada@Example.com', region: 'eu-west-1', version: 'v0.7.0' });

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
  assert.equal(p.stage, 'Use 1 to 20 lowercase letters, digits or hyphens, starting with a letter.');
  assert.ok(c.validate({ email: 'a@example.com', stage: 'a'.repeat(21), region: 'us-east-1' }).stage);
  assert.equal(c.validate({ email: 'a@example.com', stage: 'a'.repeat(20), region: 'us-east-1' }).stage, undefined);
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

test('the template comes from S3 by version; latest.json picks it, GitHub covers a bad file, never a hard-coded one', () => {
  assert.equal(c.pickVersion({ version: 'v0.8.1' }), 'v0.8.1');
  assert.equal(c.pickVersion({ version: 'latest' }), null);
  assert.equal(c.pickVersion(null), null);
  assert.equal(c.versionFromGithub({ tag_name: 'v0.9.2' }), 'v0.9.2');
  assert.equal(c.versionFromGithub({ message: 'Not Found' }), null);
  assert.equal(c.versionFromGithub(null), null);
  assert.equal(c.GITHUB_LATEST_URL, 'https://api.github.com/repos/CoderHelm/coderhelm-platform/releases/latest');
  assert.equal(c.newState().version, '');
  assert.equal(c.notPublishedText('v0.9.2'), "CoderHelm v0.9.2 isn't published yet. Releases publish automatically after each update; try again in a few minutes.");
  assert.equal(c.notPublishedText(null), "CoderHelm isn't published yet. Releases publish automatically after each update; try again in a few minutes.");
  assert.throws(() => c.templateUrl('main'));
  assert.throws(() => c.templateUrl(''));
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

// ── Everything else you can set up ──────────────────────────────────────

test('more options: domain, sender, sign-up domain and updates go into the quick-create link only when set', () => {
  const q = (st) => new URLSearchParams(new URL(c.quickCreateUrl(st)).hash.split('?')[1]);
  const plain = q(S);
  for (const k of ['param_Hostname', 'param_EmailFrom', 'param_SignupDomain', 'param_RequireTwoFactor', 'param_AutoUpdate', 'param_UpdateWindow', 'param_UpdateTimezone']) assert.equal(plain.get(k), null, k);
  const all = q({ ...S, domainChoice: 'own', hostname: 'https://CoderHelm.Example.com/', emailFrom: 'Bot@Example.com', joinDomain: true, signupDomain: '@example.com', requireTwoFactor: true, autoUpdate: true, updateWindow: 'daily 02:00', updateTimezone: 'Europe/Berlin' });
  assert.equal(all.get('param_RequireTwoFactor'), 'on');
  // Only people I invite (the default): a typed domain is not sent.
  assert.equal(c.newState().joinDomain, false);
  assert.equal(q({ ...S, joinDomain: false, signupDomain: 'example.com' }).get('param_SignupDomain'), null);
  // A guide saved before the choice existed keeps its domain.
  assert.equal(q({ ...S, joinDomain: undefined, signupDomain: 'example.com' }).get('param_SignupDomain'), 'example.com');
  assert.equal(all.get('param_Hostname'), 'coderhelm.example.com');
  assert.equal(all.get('param_EmailFrom'), 'bot@example.com');
  assert.equal(all.get('param_SignupDomain'), 'example.com');
  assert.equal(all.get('param_AutoUpdate'), 'on');
  assert.equal(all.get('param_UpdateWindow'), 'daily 02:00');
  assert.equal(all.get('param_UpdateTimezone'), 'Europe/Berlin');
  // Email: through CoderHelm only when picked, and then no sender address; never by default.
  assert.equal(plain.get('param_EmailTransport'), null);
  assert.equal(all.get('param_EmailTransport'), null);
  const relay = q({ ...S, emailTransport: 'coderhelm', emailFrom: 'bot@example.com' });
  assert.equal(relay.get('param_EmailTransport'), 'coderhelm');
  assert.equal(relay.get('param_EmailFrom'), null);
  assert.deepEqual(c.validate({ ...S, emailTransport: 'coderhelm', emailFrom: 'not an address' }).emailFrom, undefined);
  // The AWS address chosen: a typed hostname is not sent.
  assert.equal(q({ ...S, domainChoice: 'aws', hostname: 'coderhelm.example.com' }).get('param_Hostname'), null);
  // Defaults stay out of the link.
  const def = q({ ...S, autoUpdate: true });
  assert.equal(def.get('param_UpdateWindow'), null);
  assert.equal(def.get('param_UpdateTimezone'), null);
});

test('more options are validated in plain words', () => {
  const base = { email: 'ada@example.com', stage: 'prod', region: 'us-east-1' };
  assert.deepEqual(c.validate({ ...base, domainChoice: 'aws', hostname: 'junk' }), {}, 'a hostname only matters with own domain');
  assert.match(c.validate({ ...base, domainChoice: 'own', hostname: 'coderhelm' }).hostname, /coderhelm\.example\.com/);
  assert.match(c.validate({ ...base, domainChoice: 'own', hostname: 'd111.cloudfront.net' }).hostname, /domain you own/);
  assert.deepEqual(c.validate({ ...base, domainChoice: 'own', hostname: 'https://coderhelm.example.com/' }), {});
  assert.match(c.validate({ ...base, emailFrom: 'nope' }).emailFrom, /email address/);
  assert.match(c.validate({ ...base, signupDomain: 'not a domain' }).signupDomain, /example\.com/);
  assert.match(c.validate({ ...base, joinDomain: true, signupDomain: '' }).signupDomain, /Only people I invite/);
  assert.deepEqual(c.validate({ ...base, joinDomain: false, signupDomain: 'not a domain' }), {}, 'a domain only matters when people may join by it');
  assert.match(c.validate({ ...base, autoUpdate: true, updateTimezone: 'Mars' }).updateTimezone, /time zone/);
  assert.deepEqual(c.validate({ ...base, autoUpdate: true, updateWindow: 'Sat 22:00', updateTimezone: 'America/New_York' }), {});
});

test('the domain step: only for their own domain, before GitHub, skippable, and the guide follows the install there', () => {
  assert.deepEqual(c.stepsFor({ domainChoice: 'aws' }).map((x) => x.id), ['aws', 'github', 'models', 'ready']);
  assert.deepEqual(c.stepsFor({ domainChoice: 'own' }).map((x) => x.id), ['aws', 'domain', 'github', 'models', 'ready']);
  const own = { launchedAt: 1, url: 'https://d111.cloudfront.net', domainChoice: 'own', domainSkipped: false };
  const withDomain = (st, code, extra = {}) => ({ ...setup(extra), checks: [...setup(extra).checks, { id: 'domain', status: st, code, required: false }] });
  assert.equal(c.deriveStep(own, withDomain('wait', 'validating', { github_app: { status: 'fail', code: 'missing' } })), 'domain');
  assert.equal(c.deriveStep(own, withDomain('fail', 'cname_at_apex')), 'domain');
  assert.equal(c.deriveStep({ ...own, domainSkipped: true }, withDomain('wait', 'validating', { github_app: { status: 'fail', code: 'missing' } })), 'github');
  assert.equal(c.deriveStep({ ...own, domainChoice: 'aws' }, withDomain('skip', 'none')), 'ready');
  assert.equal(c.deriveStep(own, withDomain('pass', 'ok', { github_app: { status: 'fail', code: 'missing' } })), 'github');
  assert.equal(c.deriveStep(own, setup()), 'ready', 'an install too old to report the domain holds nobody up');
  const st = { domainChoice: 'own', hostname: 'coderhelm.example.com', url: 'https://d111.cloudfront.net' };
  assert.equal(c.domainUrl(st, withDomain('wait', 'attaching')), null);
  assert.equal(c.domainUrl(st, withDomain('pass', 'ok')), 'https://coderhelm.example.com');
  assert.equal(c.domainUrl({ ...st, url: 'https://coderhelm.example.com' }, withDomain('pass', 'ok')), null);
  assert.equal(c.domainUrl({ ...st, domainChoice: 'aws' }, withDomain('pass', 'ok')), null);
});

test('domain progress rows follow the code; failures sit on their row', () => {
  const st = (code, mode = 'external') => c.domainRows(code, mode).map((r) => r.status).join(',');
  assert.equal(st('validating'), 'active,pending,pending,pending');
  assert.equal(st('validation_wrong_value'), 'fail,pending,pending,pending');
  assert.equal(st('caa_blocked'), 'fail,pending,pending,pending');
  assert.equal(st('attaching'), 'pass,active,pending,pending');
  assert.equal(st('attach_failed'), 'pass,fail,pending,pending');
  assert.equal(st('dns_missing'), 'pass,pass,active,pending');
  assert.equal(st('cname_at_apex'), 'pass,pass,fail,pending');
  assert.equal(st('https_failed'), 'pass,pass,pass,fail');
  assert.equal(st('ok'), 'pass,pass,pass,pass');
  assert.match(c.domainRows('validating', 'route53')[0].label, /Route 53/);
});

test('every domain, sign-in and updates code the install documents has a sentence and a fix', () => {
  const documented = {
    domain: ['ok', 'none', 'validating', 'zone_not_delegated', 'validation_wrong_value', 'caa_blocked', 'certificate_failed', 'attaching', 'attach_failed', 'dns_missing', 'dns_wrong_value', 'cname_at_apex', 'https_failed', 'api_unreachable', 'removing', 'unknown'],
    google_sign_in: ['ok', 'off', 'missing_keys'],
    updates: ['ok', 'auto_off', 'unknown'],
  };
  for (const [id, codes] of Object.entries(documented)) {
    for (const code of codes) {
      const t = c.checkText({ id, code, status: 'fail' });
      assert.ok(t.title && !t.title.includes(':'), `${id}.${code}`);
      if (code !== 'ok') assert.ok(t.fix, `${id}.${code} has a fix`);
      for (const g of ['→', '⇒', '➜']) assert.ok(!`${t.title} ${t.fix ?? ''}`.includes(g), 'no arrow glyphs');
      assert.ok(!/brain/i.test(`${t.title} ${t.fix ?? ''}`));
    }
  }
});

test('DNS records: short names for providers that add the domain, a hint for each common provider', () => {
  assert.equal(c.baseDomain('coderhelm.example.com'), 'example.com');
  assert.equal(c.baseDomain('helm.example.co.uk'), 'example.co.uk');
  assert.equal(c.relativeName('coderhelm.example.com', 'coderhelm.example.com'), 'coderhelm');
  assert.equal(c.relativeName('_a1.coderhelm.example.com', 'coderhelm.example.com'), '_a1.coderhelm');
  assert.equal(c.relativeName('example.com', 'example.com'), '@');
  for (const p of c.DNS_PROVIDERS) {
    assert.ok(p.where.length > 10, p.id);
    if (p.url) assert.match(p.url, /^https:\/\//);
  }
  assert.ok(c.DNS_PROVIDERS.find((p) => p.id === 'cloudflare').where.includes('DNS only'));
});

test('the progress file\'s domain part is checked before it is shown, and remembered for a refresh', () => {
  const d = c.parseStatusDoc({ schema: 1, phase: 'done', url: 'https://d111.cloudfront.net', domain: { hostname: 'coderhelm.example.com', mode: 'external', state: 'validating', records: [
    { purpose: 'certificate', name: '_a1.coderhelm.example.com', type: 'CNAME', value: '_b2.acm-validations.aws' },
    { purpose: 'address', name: 'coderhelm.example.com', type: 'CNAME', value: 'd111.cloudfront.net' },
    { purpose: 'address', name: '<script>', type: 'CNAME', value: 'x' },
  ] } });
  assert.equal(d.domain.records.length, 2, 'a junk record is dropped');
  assert.equal(c.parseStatusDoc({ schema: 1, phase: 'done', domain: { hostname: 'javascript:1' } }).domain, null);
  assert.equal(c.parseStatusDoc({ schema: 1, phase: 'done' }).domain, null);
  const next = c.withDomainDoc(c.newState(), d);
  assert.equal(next.domainChoice, 'own');
  assert.equal(next.hostname, 'coderhelm.example.com');
  assert.equal(c.withDomainDoc(next, d), null, 'nothing new');
  assert.equal(c.parseStored(JSON.stringify(next)).domainDoc.records[0].value, '_b2.acm-validations.aws');
});

test('optional setup: each item has one action, its check where the install reports one, and backups are done by the install', () => {
  const st = { url: 'https://coderhelm.example.com', region: 'eu-west-1', provider: 'bedrock', domainChoice: 'aws' };
  const withChecks = { ...setup(), checks: [...setup().checks, { id: 'domain', status: 'skip', code: 'none' }, { id: 'google_sign_in', status: 'skip', code: 'off' }, { id: 'updates', status: 'pass', code: 'ok' }] };
  const items = c.optionalSetup(st, withChecks);
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.deepEqual(items.map((i) => i.id), ['domain', 'email', 'optional_emails', 'invite', 'chat', 'jira', 'google_sign_in', 'updates', 'hybrid_apps', 'deliveries', 'backups']);
  assert.equal(by.domain.state, 'todo');
  assert.equal(by.domain.action.href, 'https://coderhelm.example.com/settings/system/#domain');
  assert.equal(by.email.state, 'todo');
  assert.equal(by.email.action.href, 'https://eu-west-1.console.aws.amazon.com/ses/home?region=eu-west-1#/account');
  assert.equal(by.updates.state, 'done');
  assert.equal(by.google_sign_in.state, 'todo');
  assert.equal(by.backups.state, 'auto');
  assert.equal(by.invite.state, 'unknown');
  for (const i of items) {
    assert.ok(i.title && i.why && i.doc, i.id);
    if (i.state !== 'auto') assert.ok(i.action?.href.startsWith('https://'), `${i.id} has a link`);
  }
  // Anthropic keys add the key item; a live own domain drops the domain item.
  const anthropic = c.optionalSetup({ ...st, provider: 'anthropic', domainChoice: 'own' }, { ...withChecks, checks: withChecks.checks.map((x) => (x.id === 'domain' ? { ...x, status: 'pass', code: 'ok' } : x)) });
  assert.ok(anthropic.some((i) => i.id === 'anthropic'));
  assert.ok(!anthropic.some((i) => i.id === 'domain'));
  // An unverified sender links to the identities page.
  const unverified = c.optionalSetup(st, setup({ email: { status: 'warn', code: 'identity_unverified', required: false } }));
  assert.match(unverified.find((i) => i.id === 'email').action.href, /#\/identities$/);
  // Optional emails start off and are turned on in Settings, Emails.
  assert.equal(by.optional_emails.title, 'Weekly summary email (off; turn on in Settings)');
  assert.equal(by.optional_emails.action.href, 'https://coderhelm.example.com/settings/emails/');
  // Email through CoderHelm: no SES to set up, so no SES item.
  assert.ok(!c.optionalSetup({ ...st, emailTransport: 'coderhelm' }, withChecks).some((i) => i.id === 'email'));
});

test('setups: fully private and hybrid, each with what it gives and its trade-off', () => {
  assert.deepEqual(c.SETUPS.map((x) => x.id), ['private', 'hybrid']);
  for (const x of c.SETUPS) {
    assert.ok(x.gets.length >= 3 && x.tradeoff.endsWith('.'));
  }
  const n = c.newState();
  assert.equal(n.setup, 'private');
  assert.equal(n.githubChoice, 'own');
  assert.equal(n.sharing, false, 'sharing is off by default');
});

test('CoderHelm address names: the same rules as the server, checked before asking', () => {
  assert.equal(c.cleanName(' Example-Co.coderhelm.com '), 'example-co');
  assert.equal(c.nameProblem('example'), null);
  assert.match(c.nameProblem(''), /Type a name/);
  assert.match(c.nameProblem('ab'), /3 characters/);
  assert.match(c.nameProblem('a'.repeat(41)), /40/);
  assert.match(c.nameProblem('ex_ample'), /lowercase/);
  assert.match(c.nameProblem('-example'), /Start and end/);
  assert.match(c.nameProblem('ex--ample'), /hyphens/);
  assert.equal(c.nameCheckUrl('Example'), 'https://api.coderhelm.com/hybrid/names/example');
  assert.equal(c.hybridUrl('https://d111test.cloudfront.net/', '/register'), 'https://d111test.cloudfront.net/api/setup/hybrid/register');
  const p = c.validate({ email: 'a@example.com', stage: 'prod', region: 'us-east-1', domainChoice: 'coderhelm', coderhelmName: 'x' });
  assert.match(p.coderhelmName, /3 characters/);
});

test('a CoderHelm address adds an Address step that waits for registration and the name', () => {
  assert.deepEqual(c.stepsFor({ domainChoice: 'coderhelm' }).map((x) => x.id), ['aws', 'address', 'github', 'models', 'ready']);
  const st = (checks) => ({ schema: 1, ready: false, checks });
  const base = { launchedAt: 1, url: 'https://d111test.cloudfront.net', domainChoice: 'coderhelm' };
  const gh = [{ id: 'github_app', status: 'fail', code: 'missing' }];
  assert.equal(c.deriveStep(base, st(gh)), 'address');
  assert.equal(c.deriveStep(base, st([...gh, { id: 'hybrid_registered', status: 'pass', code: 'ok' }, { id: 'hybrid_name', status: 'wait', code: 'cert_pending' }])), 'address');
  assert.equal(c.deriveStep(base, st([...gh, { id: 'hybrid_registered', status: 'pass', code: 'ok' }, { id: 'hybrid_name', status: 'pass', code: 'ok' }])), 'github');
  assert.equal(c.deriveStep({ ...base, domainSkipped: true }, st(gh)), 'github');
  for (const code of ['requested', 'cert_pending', 'attaching', 'taken']) assert.ok(c.checkText({ id: 'hybrid_name', code, status: 'wait' }).fix);
});

test('hybrid outcomes and refusals each read as one sentence with a fix', () => {
  for (const [, o] of Object.entries(c.HYBRID_GITHUB_OUTCOMES)) assert.ok(o.title.endsWith('.') && (o.ok || o.fix));
  for (const code of ['taken', 'proof_failed', 'hosted_unreachable', 'broker_refused', 'signature_mismatch']) {
    const e = c.hybridError(code, 'x');
    assert.ok(e.title.endsWith('.') && e.fix.endsWith('.'), code);
  }
  assert.equal(c.hybridError('nope', 'Fallback.').title, 'Fallback.');
  assert.equal(c.queryToPartial('?hybrid_github=linked').hybridGithub, 'linked');
  assert.equal(c.checkText({ id: 'github_installed', code: 'not_linked', status: 'fail' }).title, 'Install CoderHelm\u2019s GitHub App on your repositories');
});

test('the summary: what the stack creates and an honest monthly cost', () => {
  const m = c.monthlyCost('bedrock');
  assert.ok(m.low > 0 && m.high > m.low);
  assert.match(m.model, /per token/);
  assert.ok(c.CREATES.length >= 4);
  assert.ok(c.optionalSetup({ url: 'https://x.example.org', region: 'us-east-1', provider: 'bedrock', domainChoice: 'coderhelm' }, null).some((o) => o.id === 'deliveries'));
});

test('the Address step follows registration, the claim, the certificate and the move', () => {
  const st = (checks) => ({ schema: 1, ready: false, checks });
  const status = (rows) => rows.map((r) => r.status).join(' ');
  assert.equal(status(c.hybridRows(st([]), 'example', false)), 'active pending pending pending');
  const reg = { id: 'hybrid_registered', status: 'pass', code: 'ok' };
  assert.equal(status(c.hybridRows(st([reg]), 'example', false)), 'pass active pending pending');
  assert.equal(status(c.hybridRows(st([reg, { id: 'hybrid_name', status: 'wait', code: 'cert_pending' }]), 'example', false)), 'pass pass active pending');
  assert.equal(status(c.hybridRows(st([reg, { id: 'hybrid_name', status: 'wait', code: 'attaching' }]), 'example', false)), 'pass pass pass active');
  assert.equal(status(c.hybridRows(st([reg, { id: 'hybrid_name', status: 'pass', code: 'ok' }]), 'example', false)), 'pass pass pass pass');
  assert.equal(status(c.hybridRows(st([reg, { id: 'hybrid_name', status: 'fail', code: 'https_failed' }]), 'example', false)), 'pass pass pass fail');
  const refused = c.hybridRows(st([reg]), 'example', true);
  assert.equal(refused[1].status, 'fail');
  assert.equal(c.hybridRows(st([{ id: 'hybrid_registered', status: 'fail', code: 'proof_failed' }]), 'example', false)[0].status, 'fail');
  assert.match(c.hybridRows(st([]), 'example', false)[3].label, /example\.coderhelm\.com/);
});
