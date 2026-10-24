import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertGuide, guideOrder, sortByOrder } from './import-platform.mjs';

const REF = '0123456789abcdef0123456789abcdef01234567';

test('a guide gets frontmatter from its first heading and paragraph, and an edit link to the platform repo', () => {
  const out = convertGuide('# Install on AWS\n\nDeploy CoderHelm into **your** account in one command.\n\n## Steps\n', 'docs/self-host/install.md', REF);
  assert.match(out, /^---\ntitle: "Install on AWS"\ndescription: "Deploy CoderHelm into your account in one command."\neditUrl: "https:\/\/github.com\/CoderHelm\/coderhelm-platform\/blob\/main\/docs\/self-host\/install.md"\n---/);
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
