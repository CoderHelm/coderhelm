#!/usr/bin/env node
// Adds the pages of the last build (out/) to published-pages.json. Paths are
// only ever added: a page that goes away needs a redirect instead.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportedPages } from './lib/moves.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, 'published-pages.json');
const ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
const before = new Set(ledger.pages);
const added = exportedPages(path.join(ROOT, 'out')).filter((p) => !before.has(p));
ledger.pages = [...before, ...added].sort();
fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n');
console.log(added.length ? `published-pages.json: added ${added.join(', ')}` : 'published-pages.json: nothing new');
