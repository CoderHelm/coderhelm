#!/usr/bin/env node
// Moves platform.lock.json to the current head of coderhelm-platform's main,
// so the next build imports the self-hosting guides, routes and changelog
// from it. Commit the lock file change like any other.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'platform.lock.json');
const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
const ref = process.argv[2] ?? 'refs/heads/main';
const out = execFileSync('git', ['ls-remote', `https://github.com/${lock.repo}.git`, ref], { encoding: 'utf8' }).trim();
const sha = out.split(/\s+/)[0];
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Could not resolve ${ref} in ${lock.repo}`);
if (sha === lock.ref) {
  console.log(`platform.lock.json already at ${sha.slice(0, 12)}`);
} else {
  fs.writeFileSync(file, JSON.stringify({ ...lock, ref: sha }, null, 2) + '\n');
  console.log(`platform.lock.json: ${lock.ref.slice(0, 12)} → ${sha.slice(0, 12)}`);
}
