#!/usr/bin/env node
// Checks the static export has everything agents and crawlers rely on, all
// generated from the same MDX as the pages:
//   - llms.txt lists every page, each pointing at a Markdown twin that exists
//   - llms-full.txt contains every page
//   - every page has its .md twin and an Open Graph image
//   - sitemap.xml lists every page; robots.txt points at it
//   - the plugin manifest schema and the bundled validator are published
//   - a 404 page exists

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { files } from './lib/out.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const SITE = 'https://docs.coderhelm.com';
const problems = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };
const read = (rel) => (fs.existsSync(path.join(OUT, rel)) ? fs.readFileSync(path.join(OUT, rel), 'utf8') : null);

// Pages: every index.html outside Next's own folders and the 404 copies.
const skip = new Set(['_next', '404', '_not-found', 'og', 'schema', 'tools']);
const pages = files(OUT, (f) => f.endsWith(`${path.sep}index.html`))
  .map((f) => path.relative(OUT, path.dirname(f)).split(path.sep).filter(Boolean))
  .filter((segs) => !skip.has(segs[0]));
need(pages.length >= 30, `only ${pages.length} pages exported`);

const llms = read('llms.txt');
const full = read('llms-full.txt');
const sitemap = read('sitemap.xml');
need(llms, 'llms.txt is missing');
need(full, 'llms-full.txt is missing');
need(sitemap, 'sitemap.xml is missing');
need((read('robots.txt') ?? '').includes(`${SITE}/sitemap.xml`), 'robots.txt does not point at the sitemap');

for (const segs of pages) {
  const url = segs.length ? `/${segs.join('/')}` : '/';
  const md = segs.length ? `${segs.join('/')}.md` : 'index.md';
  const twin = read(md);
  need(twin, `${url}: no Markdown twin at /${md}`);
  if (twin) {
    const title = twin.match(/^# (.+)$/m)?.[1];
    need(title, `/${md}: no title`);
    need(twin.includes(`Source: ${SITE}${url === '/' ? '/' : url}`), `/${md}: no Source line`);
    need(!/<include/.test(twin), `/${md}: an <include> was not expanded`);
    if (title && full) need(full.includes(`# ${title}`), `llms-full.txt: missing "${title}"`);
  }
  if (llms) need(llms.includes(`(${SITE}/${md})`), `llms.txt: no link to /${md}`);
  if (sitemap) need(sitemap.includes(`<loc>${SITE}${url === '/' ? '/' : `${url}/`}</loc>`) || sitemap.includes(`<loc>${SITE}${url}</loc>`), `sitemap.xml: no ${url}`);
  const og = path.join(OUT, 'og', ...segs, 'image.png');
  need(fs.existsSync(og) && fs.statSync(og).size > 1000, `${url}: no Open Graph image`);
  const html = read(path.join(...(segs.length ? segs : ['.']), 'index.html'));
  need(html && /<meta property="og:image" content="[^"]+\/og\//.test(html), `${url}: no og:image meta`);
  need(html && html.includes('text/markdown'), `${url}: no Markdown alternate link`);
}

const schemaText = read('schema/plugin-manifest.v1.json');
need(schemaText, 'schema/plugin-manifest.v1.json is missing');
if (schemaText) {
  const schema = JSON.parse(schemaText);
  need(schema.$id === `${SITE}/schema/plugin-manifest.v1.json`, 'schema $id does not match its URL');
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/plugin-manifest.schema.json'), 'utf8'));
  need(JSON.stringify(schema) === JSON.stringify(source), 'published schema differs from schemas/plugin-manifest.schema.json');
}
need(fs.existsSync(path.join(OUT, 'tools/validate-plugin.mjs')), 'tools/validate-plugin.mjs is missing');
need(fs.existsSync(path.join(OUT, '404.html')), '404.html is missing');
need(fs.existsSync(path.join(OUT, 'search-index.json')), 'search-index.json is missing');

if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'} in the export:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`output: ${pages.length} pages, each with its Markdown twin, llms.txt entry, sitemap entry and Open Graph image; llms-full.txt, schema, validator and 404 present`);
