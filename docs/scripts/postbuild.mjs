#!/usr/bin/env node
// After `next build`:
//  1. Every page's Markdown twin, exported at /llms.mdx/<slug>/content.md,
//     moves to /<slug>.md (the home page's to /index.md), the URL pages and
//     llms.txt link to. Both come from the same MDX as the HTML page.
//  2. The 404 page is copied to /errors/404.html for the CDN.
//  3. The plugin validator is bundled with its dependencies and the schema
//     into /tools/validate-plugin.mjs, so plugin authors can run it with Node
//     alone.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const TWINS = path.join(OUT, 'llms.mdx');

if (!fs.existsSync(OUT)) throw new Error('No out/: run next build first.');
if (!fs.existsSync(TWINS)) throw new Error('No out/llms.mdx/: the Markdown twins were not exported.');

let moved = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(from);
    else if (entry.name === 'content.md') {
      const slug = path.relative(TWINS, dir);
      const to = path.join(OUT, slug === '' ? 'index.md' : `${slug}.md`);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      moved++;
    }
  }
};
walk(TWINS);
fs.rmSync(TWINS, { recursive: true, force: true });

// The CDN serves unknown pages the file at /errors/404.html (the convention
// the site and the app share, infra/lib/static-site.ts): use this site's own.
fs.mkdirSync(path.join(OUT, 'errors'), { recursive: true });
fs.copyFileSync(path.join(OUT, '404.html'), path.join(OUT, 'errors/404.html'));

await build({
  entryPoints: [path.join(ROOT, 'scripts/validate-plugin.mjs')],
  outfile: path.join(OUT, 'tools/validate-plugin.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: false,
  legalComments: 'inline',
  banner: {
    js: '// CoderHelm plugin validator. Usage: node validate-plugin.mjs [plugin-dir]\n// Built from https://github.com/CoderHelm/coderhelm/blob/main/docs/scripts/validate-plugin.mjs\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  logLevel: 'warning',
});

console.log(`postbuild: ${moved} Markdown pages, tools/validate-plugin.mjs`);
