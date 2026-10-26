// What the docs send to Google Analytics (lib/analytics.ts), without a
// browser. The e2e test (e2e/analytics.spec.ts) runs Google's real tag; this
// one holds the scrubber to the install guide's promise for hits the tag
// could build in any configuration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as a from '../lib/analytics.ts';

const COLLECT = 'https://region1.google-analytics.com/g/collect';
const AWS_LINK =
  'https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/create/review?param_AdminEmail=ada%40example.com&param_SetupToken=TkTkTkTk&param_StatusId=abcd1234efgh5678';

test('loads on docs.coderhelm.com only: never localhost, previews or a self-hosted build', () => {
  assert.equal(a.shouldLoad('docs.coderhelm.com'), true);
  for (const h of ['localhost', '127.0.0.1', 'coderhelm.com', 'docs-preview.coderhelm.com', 'd111test.cloudfront.net', 'docs.example.com']) {
    assert.equal(a.shouldLoad(h), false, h);
  }
  assert.equal(a.GA_ID, 'G-T14Q1LDRC0');
  assert.deepEqual(a.LINKER_DOMAINS, ['coderhelm.com', 'docs.coderhelm.com']);
});

test('URLs keep origin and path only, with no AWS region', () => {
  assert.equal(a.cleanUrl('https://docs.coderhelm.com/self-host/install/?id=abcd1234efgh5678&step=aws#top'), 'https://docs.coderhelm.com/self-host/install/');
  assert.equal(a.cleanUrl(AWS_LINK), 'https://console.aws.amazon.com/cloudformation/home');
  assert.equal(a.cleanUrl('mailto:ada@example.com'), null);
  assert.equal(a.cleanUrl('not a url'), null);
  assert.equal(a.dropRegions('coderhelm-setup-x.s3.ap-southeast-2.amazonaws.com'), 'coderhelm-setup-x.s3.amazonaws.com');
  assert.equal(a.dropRegions('us-gov-west-1.console.aws.amazon.com'), 'console.aws.amazon.com');
});

test('only Google Analytics collect endpoints are scrubbed', () => {
  assert.equal(a.isCollectUrl(`${COLLECT}?v=2`), true);
  assert.equal(a.isCollectUrl('https://www.google-analytics.com/g/collect?v=2'), true);
  assert.equal(a.isCollectUrl('https://region1.analytics.google.com/g/collect'), true);
  assert.equal(a.isCollectUrl('https://api.coderhelm.com/hybrid/names/x'), false);
  assert.equal(a.isCollectUrl('https://evil.example/google-analytics.com/g/collect'), false);
  assert.equal(a.isCollectUrl('https://www.googletagmanager.com/gtag/js?id=x'), false);
});

test('a hit loses query strings, fragments, emails, the setup key, the progress id, regions, search terms and form fields', () => {
  const head = new URLSearchParams({
    v: '2',
    tid: a.GA_ID,
    dl: 'https://docs.coderhelm.com/self-host/install/?id=abcd1234efgh5678#x',
    dr: 'https://coderhelm.com/self-host/?utm_source=ada%40example.com',
    dt: 'Install CoderHelm',
  });
  const body = [
    new URLSearchParams({ en: 'click', 'ep.link_url': AWS_LINK, 'ep.link_domain': 'eu-west-1.console.aws.amazon.com', 'ep.outbound': 'true' }).toString(),
    new URLSearchParams({ en: 'form_submit', 'ep.form_id': 'f', 'ep.form_destination': 'https://github.com/settings/apps/new?state=TkTkTkTk', 'ep.form_submit_text': 'Create' }).toString(),
    new URLSearchParams({ en: 'view_search_results', 'ep.search_term': 'my secret query' }).toString(),
    new URLSearchParams({ en: 'odd', 'ep.who': 'ada@example.com', 'ep.where': 'eu-west-1' }).toString(),
  ].join('\n');
  const hit = a.scrubHit(`${COLLECT}?${head}`, body);
  assert.ok(hit);
  const all = decodeURIComponent(`${hit.url}\n${hit.body}`);
  for (const bad of ['?id=', '#x', 'utm_source', 'ada@example.com', 'example.com', 'TkTkTkTk', 'abcd1234efgh5678', 'eu-west-1', 'param_', 'my secret query', 'state=', 'form_destination', 'search_term', 'Create']) {
    assert.ok(!all.slice(COLLECT.length).includes(bad), `${bad} must not be sent`);
  }
  const u = new URL(hit.url);
  assert.equal(u.searchParams.get('dl'), 'https://docs.coderhelm.com/self-host/install/');
  assert.equal(u.searchParams.get('dr'), 'https://coderhelm.com/self-host/');
  const click = new URLSearchParams(hit.body.split('\n')[0]);
  assert.equal(click.get('ep.link_url'), 'https://console.aws.amazon.com/cloudformation/home');
  assert.equal(click.get('ep.link_domain'), 'console.aws.amazon.com');
});

test("page views: ours are sent (without the mark); the tag's own history page views are dropped", () => {
  const ours = a.scrubHit(`${COLLECT}?v=2&en=page_view&dl=https%3A%2F%2Fdocs.coderhelm.com%2F&epn.${a.PAGE_VIEW_MARK}=1`, null);
  assert.ok(ours);
  assert.equal(new URL(ours.url).searchParams.get('en'), 'page_view');
  assert.ok(!ours.url.includes(a.PAGE_VIEW_MARK));
  assert.equal(a.scrubHit(`${COLLECT}?v=2&en=page_view&dl=https%3A%2F%2Fdocs.coderhelm.com%2Fself-host%2Finstall%2F%3Fid%3Dx`, null), null);
  // In a batch, only the foreign page view goes.
  const batch = a.scrubHit(`${COLLECT}?v=2`, `en=page_view&ep.${a.PAGE_VIEW_MARK}=1\nen=page_view\nen=scroll&epn.percent_scrolled=90`);
  assert.ok(batch);
  assert.deepEqual(batch.body.split('\n').map((l) => new URLSearchParams(l).get('en')), ['page_view', 'scroll']);
  assert.equal(a.scrubHit(`${COLLECT}?v=2`, 'en=page_view'), null);
});

test('events: copy buttons by their words, outbound links by host, install steps by name', () => {
  assert.deepEqual(a.clickEvent(' Copy Markdown '), { name: 'copy_markdown' });
  assert.deepEqual(a.clickEvent('Copied Markdown'), { name: 'copy_markdown' });
  assert.deepEqual(a.clickEvent('Copy Text'), { name: 'copy_code' });
  assert.equal(a.clickEvent('Open Search'), null);
  assert.equal(a.clickEvent(null), null);
  assert.equal(a.outboundHost(AWS_LINK, 'https://docs.coderhelm.com/self-host/install/'), 'console.aws.amazon.com');
  assert.equal(a.outboundHost('/self-host/', 'https://docs.coderhelm.com/'), null);
  assert.equal(a.outboundHost('https://docs.coderhelm.com/x/?q=1', 'https://docs.coderhelm.com/'), null);
  assert.equal(a.outboundHost('mailto:security@coderhelm.com', 'https://docs.coderhelm.com/'), null);
  assert.equal(a.outboundHost('https://coderhelm.com/pricing/?a=b', 'https://docs.coderhelm.com/'), 'coderhelm.com');
  assert.deepEqual(a.installStepEvent('aws'), { name: 'install_step', step: 'aws' });
  assert.equal(a.installStepEvent('ada@example.com'), null);
});

test('the install guide says what the code does', () => {
  assert.match(a.GUIDE_TRUST.private, /anonymous page views with Google Analytics/);
  assert.match(a.GUIDE_TRUST.private, /Nothing you type and nothing about your install is sent/);
  assert.match(a.GUIDE_TRUST.hybrid, /anonymous page views with Google Analytics/);
  assert.doesNotMatch(a.GUIDE_TRUST.private, /talks only to/);
});
