import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMoves, readMoves } from './lib/moves.mjs';

const pages = ['/', '/api/', '/api/authentication/'];

test('a removed page needs a redirect', () => {
  const published = [...pages, '/api/routes/'];
  assert.deepEqual(checkMoves({ pages, published, redirects: { '/api/routes/': '/api/' } }), []);
  const problems = checkMoves({ pages, published, redirects: {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\/api\/routes\/ was published but is no longer a page/);
});

test('redirects point at real pages and never hide one', () => {
  const problems = checkMoves({
    pages,
    published: pages,
    redirects: { '/old/': '/nowhere/', '/api/': '/', 'no-slash': '/' },
  });
  assert.ok(problems.some((p) => p.includes('target /nowhere/ is not a page')));
  assert.ok(problems.some((p) => p.includes('/api/: that page still exists')));
  assert.ok(problems.some((p) => p.includes('no-slash: write it as a page path')));
});

test('a new page has to be recorded', () => {
  const problems = checkMoves({ pages: [...pages, '/new/'], published: pages, redirects: {} });
  assert.deepEqual(problems, ['/new/ is a new page: run `npm run pages:record` to add it to docs/published-pages.json']);
});

test('the committed files cover the old API routes page', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { published, redirects } = readMoves(root);
  assert.ok(published.includes('/api/routes/'));
  assert.equal(redirects['/api/routes/'], '/api/');
  for (const p of published) assert.match(p, /^\/(.*\/)?$/, p);
});
