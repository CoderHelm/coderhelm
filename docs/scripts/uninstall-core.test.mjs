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

test('changing KeepDataOnDelete keeps the template and every other value', () => {
  const cmd = c.keepDataCommand(S, false);
  assert.match(cmd, /--use-previous-template/);
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
