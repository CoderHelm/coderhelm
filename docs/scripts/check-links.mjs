#!/usr/bin/env node
// Fails when a page links to a page, file or #heading of this site that does
// not exist. Reads the static export (out/), so it checks what is shipped:
// links in the HTML pages and in the Markdown twins.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { files, idsIn, resolvePath } from './lib/out.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const SITE = 'https://docs.coderhelm.com';

const broken = [];
let checked = 0;
const idCache = new Map();
const ids = (file) => {
  if (!idCache.has(file)) idCache.set(file, idsIn(fs.readFileSync(file, 'utf8')));
  return idCache.get(file);
};

function check(from, href) {
  if (href.startsWith(SITE)) href = href.slice(SITE.length) || '/';
  if (!href.startsWith('/') && !href.startsWith('#')) return;
  if (href.startsWith('//')) return;
  checked++;
  const [p, frag] = href.split('#');
  const target = p === '' ? from : resolvePath(OUT, p);
  if (!target) return broken.push(`${path.relative(OUT, from)} → ${href} (no such page or file)`);
  if (frag && target.endsWith('.html') && !ids(target).has(decodeURIComponent(frag))) {
    broken.push(`${path.relative(OUT, from)} → ${href} (no #${frag} on that page)`);
  }
}

const pages = files(OUT, (f) => f.endsWith('.html') && !f.includes(`${path.sep}_next${path.sep}`));
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  // Only links in the page itself, not the payload scripts Next adds.
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) check(file, m[1].replace(/&amp;/g, '&'));
  for (const m of html.matchAll(/<link\s[^>]*href="(\/[^"]+)"/g)) check(file, m[1]);
}
const twins = files(OUT, (f) => f.endsWith('.md') || f.endsWith('llms.txt') || f.endsWith('llms-full.txt'));
for (const file of twins) {
  const md = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of md.matchAll(/\]\((\/[^)\s]*|https:\/\/docs\.coderhelm\.com[^)\s]*)\)/g)) check(file, m[1]);
}

if (broken.length) {
  console.error(`${broken.length} broken internal link${broken.length === 1 ? '' : 's'}:`);
  for (const b of [...new Set(broken)]) console.error(`  ${b}`);
  process.exit(1);
}
console.log(`links: ${checked} internal links in ${pages.length} pages and ${twins.length} Markdown files, none broken`);
