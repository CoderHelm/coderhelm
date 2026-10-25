// Old links keep working. Every page path the site has published is listed
// in published-pages.json; each must still be a page or have a redirect in
// redirects.json (served as a 301 by the docs CloudFront function).

import fs from 'node:fs';
import path from 'node:path';

const isPagePath = (p) => typeof p === 'string' && p.startsWith('/') && p.endsWith('/') && !p.includes('//');

/**
 * Problems with the published pages and redirects, given the pages the build
 * produced. An empty list means no old link breaks.
 */
export function checkMoves({ pages, published, redirects }) {
  const now = new Set(pages);
  const problems = [];
  for (const [from, to] of Object.entries(redirects)) {
    if (!isPagePath(from)) problems.push(`redirect ${from}: write it as a page path ending in /`);
    if (now.has(from)) problems.push(`redirect ${from}: that page still exists, so the redirect would hide it`);
    if (!now.has(to)) problems.push(`redirect ${from}: its target ${to} is not a page`);
  }
  for (const p of published) {
    if (!now.has(p) && !(p in redirects)) {
      problems.push(`${p} was published but is no longer a page: add where it went to docs/redirects.json`);
    }
  }
  const known = new Set(published);
  for (const p of pages) {
    if (!known.has(p)) problems.push(`${p} is a new page: run \`npm run pages:record\` to add it to docs/published-pages.json`);
  }
  return problems;
}

/** The page paths of a static export: every folder with an index.html. */
export function exportedPages(outDir) {
  const skip = new Set(['_next', '404', '_not-found', 'og', 'schema', 'tools', 'errors', 'llms.mdx']);
  const pages = [];
  const walk = (dir, route) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || (route === '/' && skip.has(entry.name))) continue;
      walk(path.join(dir, entry.name), `${route}${entry.name}/`);
    }
    if (fs.existsSync(path.join(dir, 'index.html'))) pages.push(route);
  };
  walk(outDir, '/');
  return pages.sort();
}

export function readMoves(root) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  return { published: read('published-pages.json').pages, redirects: read('redirects.json').redirects };
}
