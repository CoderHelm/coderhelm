// The uninstall page's decisions (lib/uninstall/core.ts), without a browser.
// Node runs the TypeScript file directly (type stripping, Node 22.18+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../lib/uninstall/core.ts';

const S = c.newState({ stage: 'prod', region: 'eu-west-1', mode: 'everything' });

test('nothing is chosen for the person, and the address bar never carries the choice', () => {
  assert.equal(c.newState().mode, null);
  assert.deepEqual(c.queryToPartial('?stage=prod-eu&region=eu-west-1&mode=everything'), { stage: 'prod-eu', region: 'eu-west-1' });
  assert.deepEqual(c.queryToPartial('?stage=Prod!&region=mars'), {});
  assert.doesNotMatch(c.stateToQuery(S), /mode|everything/);
});

test('the install guide in this browser fills in its install', () => {
  assert.deepEqual(c.fromInstallGuide(JSON.stringify({ stage: 'prod', region: 'us-east-2', email: 'x@example.org' })), { stage: 'prod', region: 'us-east-2' });
  assert.equal(c.fromInstallGuide('{bad'), null);
});

test('the stack, its console page, and the commands name exactly this install', () => {
  assert.equal(c.stackName(S), 'coderhelm-prod');
  assert.equal(c.stackConsoleUrl(S), 'https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/stackinfo?stackId=coderhelm-prod');
  assert.equal(c.deleteCommand(S), 'aws cloudformation delete-stack --region eu-west-1 --stack-name coderhelm-prod');
  assert.equal(c.leftoversCommand(S), 'npx -y github:CoderHelm/coderhelm-platform leftovers --stage prod --region eu-west-1');
  assert.match(c.leftoversCommand(S, true), / --delete$/);
});

test('changing KeepDataOnDelete gives the stack its own release template again, keeps every other value, and checks the output', () => {
  const cmd = c.keepDataCommand(S, false);
  // --use-previous-template silently kept every old value on v0.8.4 and v0.8.5 (CloudFormation stores that template resolved).
  assert.doesNotMatch(cmd, /use-previous-template/);
  assert.match(cmd, /^V=\$\(aws cloudformation describe-stacks --region eu-west-1 --stack-name coderhelm-prod --query "Stacks\[0\]\.Outputs\[\?OutputKey=='Version'\]\.OutputValue" --output text\)/);
  assert.match(cmd, /--template-url "https:\/\/coderhelm-public\.s3\.amazonaws\.com\/launch\/\$V\/coderhelm\.json"/);
  assert.match(cmd, /wait stack-update-complete --region eu-west-1 --stack-name coderhelm-prod/);
  assert.ok(cmd.trim().endsWith(c.keepDataCheckCommand(S)), 'it ends by printing the KeepDataOnDelete output');
  assert.match(c.keepDataCheckCommand(S), /OutputKey=='KeepDataOnDelete'/);
  assert.match(cmd, /ParameterKey=KeepDataOnDelete,ParameterValue=false/);
  assert.match(cmd, /CAPABILITY_AUTO_EXPAND/);
  for (const k of ['Stage', 'AdminEmail', 'AutoUpdate', 'DomainCertificateArn']) assert.match(cmd, new RegExp(`ParameterKey=${k},UsePreviousValue=true`));
});

test('what goes and what stays follows the choice', () => {
  const keep = c.consequences('keep');
  assert.ok(keep.stays.includes('the tables') && keep.stays.some((x) => x.includes('user pool')));
  assert.ok(!keep.goes.includes('the tables'));
  const all = c.consequences('everything');
  assert.deepEqual(all.stays, []);
  assert.ok(all.goes.some((x) => x.includes(`${c.KEY_DAYS}-day wait`)));
});

test('validation names what is wrong', () => {
  assert.deepEqual(c.validate({ stage: 'prod', region: 'us-east-1' }), {});
  assert.ok(c.validate({ stage: 'Prod', region: 'x' }).stage);
});

test('no page tells anyone to change a parameter with the current template', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '..');
  const files = ['lib/uninstall/core.ts', 'lib/uninstall/page-info.ts', 'components/uninstall/guide.tsx', 'lib/install/core.ts', 'lib/install/page-info.ts', 'components/install/wizard.tsx'];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(text, /--use-previous-template/, f);
    for (const m of text.matchAll(/[^.\n]*Use (current|existing) template[^.\n]*/g)) assert.match(m[0], /Don(&apos;|')t/, `${f}: ${m[0].trim()}`);
  }
});
