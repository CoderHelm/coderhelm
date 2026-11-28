// "Edit this page" (lib/shared.ts) points at a file in a repository, never at
// a page the import writes into a git-ignored folder. One page of each kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editUrl } from '../lib/shared.ts';
import { convertGuide } from './import-platform.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PREFIX = 'https://github.com/CoderHelm/coderhelm/blob/main/';

/** The repository path an edit link names, which git must track. */
function tracked(url) {
  assert.ok(url.startsWith(PREFIX), url);
  const file = url.slice(PREFIX.length);
  execFileSync('git', ['ls-files', '--error-unmatch', file], { cwd: REPO, stdio: 'pipe' });
  return file;
}

test('a page written in this repo links to itself', () => {
  assert.equal(tracked(editUrl('getting-started/index.mdx')), 'docs/content/docs/getting-started/index.mdx');
});

test("the site's own self-host page links to the file it is copied from", () => {
  assert.equal(tracked(editUrl('self-host/aws-account.mdx')), 'docs/content/self-host-site/aws-account.mdx');
});

test('a guide imported from the platform links to the platform repo', () => {
  const page = convertGuide('# Backups\n\nKeep a copy.\n', 'docs/self-host/backups.md', '0'.repeat(40));
  const own = page.match(/\neditUrl: "([^"]+)"\n/)[1];
  assert.equal(editUrl('self-host/backups.md', own), 'https://github.com/CoderHelm/coderhelm-platform/blob/main/docs/self-host/backups.md');
});
