import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_GUIDE_LINK, UNINSTALL_GUIDE_LINK, importedName, convertGuide, guideOrder, groupByDate, releaseNotes, selfHostLead, sitePages, sortByOrder, stableTags } from './import-platform.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = '0123456789abcdef0123456789abcdef01234567';

test('a guide gets frontmatter from its first heading and paragraph, and an edit link to the platform repo', () => {
  const out = convertGuide('# Install on AWS\n\nDeploy CoderHelm into **your** account in one command.\n\n## Steps\n', 'docs/self-host/install.md', REF);
  assert.match(out, /^---\ntitle: "Install on AWS"\ndescription: "Deploy CoderHelm into your account in one command."\neditUrl: "https:\/\/github.com\/CoderHelm\/coderhelm-platform\/blob\/main\/docs\/self-host\/install.md"\nsource: "CoderHelm\/coderhelm-platform\/docs\/self-host\/install.md"\nsourceCommit: "[0-9a-f]{40}"\n---\n\n/);
  assert.ok(!out.includes('# Install on AWS'), 'the H1 becomes the page title, not a second heading');
  assert.match(out, /## Steps/);
});

test('existing frontmatter is kept', () => {
  const out = convertGuide('---\ntitle: Upgrade\ndescription: Move to a new release.\n---\n\nBody.\n', 'docs/self-host/upgrade.md', REF);
  assert.match(out, /title: "Upgrade"/);
  assert.match(out, /description: "Move to a new release."/);
});

test('links inside the guides stay relative; links out of the folder point at GitHub at the pinned commit', () => {
  const out = convertGuide('# A\n\nSee [config](./config.md#keys), [infra](../../infra/README.md) and [site](https://example.com).\n', 'docs/self-host/install.md', REF);
  assert.match(out, /\[config\]\(\.\/config\.md#keys\)/);
  assert.match(out, new RegExp(`\\[infra\\]\\(https://github.com/CoderHelm/coderhelm-platform/blob/${REF}/infra/README.md\\)`));
  assert.match(out, /\[site\]\(https:\/\/example.com\)/);
});

test('guides are listed by their order front matter, the rest by name', () => {
  assert.equal(guideOrder('---\ntitle: A\norder: 3\n---\nBody'), 3);
  assert.equal(guideOrder('# No front matter'), undefined);
  const order = new Map([['quick-start', 1], ['faq', 13], ['requirements', 2]]);
  assert.deepEqual(sortByOrder(['faq', 'zeta', 'quick-start', 'alpha', 'requirements'], order), ['quick-start', 'requirements', 'faq', 'alpha', 'zeta']);
});

test('where a guide comes from is front matter, never a comment in the body (Markdown would print it)', () => {
  const out = convertGuide('# Backups\n\nKeep a copy.\n', 'docs/self-host/backups.md', REF);
  assert.match(out, /\nsource: "CoderHelm\/coderhelm-platform\/docs\/self-host\/backups.md"\n/);
  assert.match(out, new RegExp(`\\nsourceCommit: "${REF}"\\n`));
  const body = out.slice(out.indexOf('\n---\n', 4) + 5);
  assert.ok(!/\{\/\*|<!--/.test(body), `no comment in the body:\n${body}`);
  assert.match(body, /^\nKeep a copy\./);
});

test("the site's own self-host pages follow the install guide in the sidebar", () => {
  const site = sitePages();
  assert.ok(site.includes('aws-account'), 'content/self-host-site/aws-account.mdx is listed');
  assert.deepEqual(selfHostLead(site), ['index', INSTALL_GUIDE_LINK, UNINSTALL_GUIDE_LINK, ...site]);
  // The platform's uninstall guide sits next to the guided page, which keeps /self-host/uninstall/.
  assert.equal(importedName('uninstall'), 'uninstall-details');
  assert.equal(importedName('faq'), 'faq');
});

test('release notes lose their leading comment and keep every release heading', () => {
  assert.equal(releaseNotes('<!--\nhow to write these\n-->\n\n## Nov 15: A\n\n- one\n'), '## Nov 15: A\n\n- one');
  assert.equal(releaseNotes(''), '');
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content/release-notes.md');
  const notes = releaseNotes(fs.readFileSync(file, 'utf8'));
  assert.ok(!notes.includes('<!--'), 'no HTML comment reaches the MDX page');
  assert.match(notes, /^## /, 'the notes start with a release heading');
  assert.ok(!/[<>{}]/.test(notes.replace(/`[^`]*`/g, '')), 'no raw MDX syntax outside code');
});

test('release notes are grouped by day, one heading a day, newest first', () => {
  const notes = [
    '## November 17, 2026: tests that run',
    '',
    '- one',
    '',
    '## November 16, 2026 (evening): quiet runs',
    '',
    '- two',
    '',
    '## November 17, 2026: smaller changes',
    '',
    '- three',
    '',
    '## November 16, 2026 (after midnight): ticket answers',
    '',
    '- four',
  ].join('\n');
  assert.equal(groupByDate(notes), [
    '## November 17, 2026',
    '',
    '### Tests that run',
    '',
    '- one',
    '',
    '### Smaller changes',
    '',
    '- three',
    '',
    '## November 16, 2026',
    '',
    '### Quiet runs',
    '',
    '- two',
    '',
    '### Ticket answers',
    '',
    '- four',
  ].join('\n'));
  // The real file: every day appears exactly once.
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content/release-notes.md');
  const days = groupByDate(releaseNotes(fs.readFileSync(file, 'utf8'))).split('\n').filter((l) => l.startsWith('## '));
  assert.ok(days.length > 0);
  assert.equal(new Set(days).size, days.length, 'each day has one heading');
  for (const d of days) assert.match(d, /^## [A-Z][a-z]+ \d{1,2}, \d{4}$/, `day heading: ${d}`);
});

test('only stable self-host releases are listed, never the beta builds', () => {
  const tags = [
    { name: 'v0.8.121-beta.20261115' },
    { name: 'v0.8.111' },
    { name: 'v0.8.98' },
    { name: 'nightly' },
  ];
  assert.deepEqual(stableTags(tags).map((t) => t.name), ['v0.8.111', 'v0.8.98']);
});
