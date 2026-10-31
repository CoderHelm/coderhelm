// The uninstall guide's decisions (lib/uninstall/core.ts), without a browser.
// Node runs the TypeScript file directly (type stripping, Node 22.18+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../lib/uninstall/core.ts';

const S = c.newState({ stage: 'prod', region: 'eu-west-1', mode: 'everything', statusId: 'abcd1234efgh5678', confirm: 'prod', version: 'v0.9.0', installStatusId: 'zzzz1111yyyy2222' });

test('nothing is chosen for the person: no mode, an empty confirmation, a random progress id', () => {
  const a = c.newState();
  assert.equal(a.mode, null);
  assert.equal(a.confirm, '');
  assert.match(a.statusId, c.STATUS_ID_RE);
  assert.notEqual(a.statusId, c.newState().statusId);
});

test('the address bar fills in the install, never a choice to delete', () => {
  const p = c.queryToPartial('?stage=prod-eu&region=eu-west-1&hybrid=1&github=2&jira=1&mode=everything&confirm=prod-eu&install=zzzz1111yyyy2222');
  assert.deepEqual(p, { stage: 'prod-eu', region: 'eu-west-1', installStatusId: 'zzzz1111yyyy2222', hybrid: true, github: 2, jira: true });
  assert.deepEqual(c.queryToPartial('?stage=Prod!&region=mars&id=short&github=-1'), {});
  const q = c.stateToQuery(S);
  assert.doesNotMatch(q, /mode|confirm|everything/);
  assert.match(c.stateToQuery({ ...S, launchedAt: 1 }), /id=abcd1234efgh5678/);
});

test('the install guide in this browser fills in its install and progress id', () => {
  assert.deepEqual(c.fromInstallGuide(JSON.stringify({ stage: 'prod', region: 'us-east-2', statusId: 'aaaabbbbccccdddd', email: 'x@example.org' })), { stage: 'prod', region: 'us-east-2', installStatusId: 'aaaabbbbccccdddd' });
  assert.equal(c.fromInstallGuide('{bad'), null);
  assert.equal(c.fromInstallGuide(JSON.stringify({ stage: 'P' })), null);
});

test('the name must be typed exactly; a choice must be made', () => {
  assert.deepEqual(c.validate(S), {});
  assert.ok(c.validate({ ...S, mode: null }).mode);
  assert.ok(c.validate({ ...S, stage: '' }).stage);
  assert.ok(c.confirmed(S));
  for (const typed of ['', 'Prod', ' prod', 'prod ', 'prod-eu', 'pro']) assert.ok(!c.confirmed({ ...S, confirm: typed }), JSON.stringify(typed));
  assert.throws(() => c.quickCreateUrl({ ...S, confirm: 'prd' }), /not confirmed/);
  assert.throws(() => c.quickCreateUrl({ ...S, mode: null }), /no mode/);
});

test('quick-create link: the uninstall template of a release, the typed name as the stack’s own check, one region', () => {
  const u = new URL(c.quickCreateUrl(S));
  assert.equal(u.host, 'eu-west-1.console.aws.amazon.com');
  assert.equal(u.searchParams.get('region'), 'eu-west-1');
  const q = new URLSearchParams(u.hash.split('?')[1]);
  assert.equal(q.get('templateURL'), 'https://coderhelm-public.s3.amazonaws.com/launch/v0.9.0/coderhelm-uninstall.yaml');
  assert.equal(q.get('stackName'), 'coderhelm--uninstall-prod-abcd12', 'outside every install’s names');
  assert.equal(q.get('param_Stage'), 'prod');
  assert.equal(q.get('param_ConfirmStage'), 'prod');
  assert.equal(q.get('param_Mode'), 'everything');
  assert.equal(q.get('param_StatusId'), 'abcd1234efgh5678');
  assert.equal(q.get('param_InstallStatusId'), 'zzzz1111yyyy2222');
  assert.throws(() => c.templateUrl('latest'), /not a release tag/);
  // The uninstaller's own stack name is never one of the install's Launch Stack names (coderhelm-<name>-<n>).
  assert.doesNotMatch(c.stackName(S), /^coderhelm-prod-/);
});

test('what goes and what stays, by choice; KMS keys on the 7-day minimum, plainly', () => {
  const keep = c.split('prod', 'keep');
  assert.ok(keep.keep.some((i) => /tables/.test(i.what)) && keep.keep.some((i) => /KMS/.test(i.what)) && keep.keep.some((i) => /user pool/.test(i.what)));
  assert.ok(keep.remove.some((i) => /boundary/.test(i.what)) && keep.remove.some((i) => /Launch Stack/.test(i.what)));
  const all = c.split('prod', 'everything');
  assert.equal(all.keep.length, 0);
  assert.match(all.remove.find((i) => /KMS/.test(i.what)).note, /7 days/);
  assert.match(all.remove.find((i) => /secret/.test(i.what)).names, /coderhelm\/prod\/secrets/);
});

test('hybrid: a plain warning when CoderHelm forwards GitHub or Jira here', () => {
  assert.equal(c.hybridWarning({ hybrid: false, github: 3, jira: true }), null);
  assert.match(c.hybridWarning({ hybrid: true, github: 2, jira: true }), /2 GitHub installations and a Jira site.*back to CoderHelm hosted/);
  assert.match(c.hybridWarning({ hybrid: true, github: null, jira: false }), /If CoderHelm forwards/);
  assert.match(c.hybridWarning({ hybrid: true, github: 1, jira: false }), /hands it back/);
});

test('the progress file: only an uninstaller’s, with lists and a console log link only', () => {
  assert.equal(c.parseDoc({ schema: 1, phase: 'done' }), null, 'an install guide’s file is not an uninstaller’s');
  const d = c.parseDoc({ schema: 1, kind: 'uninstall', phase: 'stacks', step: 2, steps: 8, removed: [{ kind: 'stack', name: 'coderhelm-prod-api' }, { bad: 1 }], logUrl: 'javascript:alert(1)' });
  assert.equal(d.removed.length, 1);
  assert.equal(d.logUrl, null);
  assert.equal(c.percent(d), 28);
  assert.equal(c.percent(c.parseDoc({ schema: 1, kind: 'uninstall', phase: 'done' })), 100);
  const rows = c.phaseRows(d, 'keep');
  assert.deepEqual(rows.map((r) => r.status), ['pass', 'active', 'pending', 'pending', 'pending']);
  assert.ok(!rows.some((r) => r.id === 'data'), 'no data phase when keeping the data');
  assert.ok(c.phaseRows(d, 'everything').some((r) => r.id === 'data'));
});

test('the final list by kind, and the step the guide is on', () => {
  assert.deepEqual(c.byKind([{ kind: 'stack', name: 'a' }, { kind: 'stack', name: 'b' }, { kind: 'KMS key', name: 'k' }]), [{ kind: 'stack', count: 2, names: ['a', 'b'] }, { kind: 'KMS key', count: 1, names: ['k'] }]);
  assert.equal(c.plural('permissions boundary', 2), 'permissions boundaries');
  assert.equal(c.plural('KMS key', 2), 'KMS keys');
  assert.equal(c.stepOf(c.newState(), null), 'choose');
  assert.equal(c.stepOf(S, null), 'confirm');
  assert.equal(c.stepOf({ ...S, launchedAt: 1 }, null), 'remove');
  assert.equal(c.stepOf({ ...S, launchedAt: 1 }, c.parseDoc({ schema: 1, kind: 'uninstall', phase: 'done' })), 'check');
});

test('the terminal way for the same install', () => {
  assert.equal(c.cliCommand(S), 'npx -y github:CoderHelm/coderhelm-platform uninstall --everything --stage prod --region eu-west-1');
  assert.equal(c.cliCommand(S, true), 'npx -y github:CoderHelm/coderhelm-platform uninstall --verify --stage prod --region eu-west-1');
});
