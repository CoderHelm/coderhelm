#!/usr/bin/env node
// Writes the pages that come from code rather than from this folder, so they
// can never drift from it. Runs before every dev server and build.
//
//   content/docs/self-host/**       the guides in coderhelm-platform docs/self-host/
//   .generated/openapi.json         the public API's OpenAPI document, which the
//                                   API reference pages are generated from
//   public/openapi.json             the same document, published at /openapi.json
//   content/docs/changelog.mdx      platform tags and merged pull requests
//   content/docs/plugins/manifest-reference.mdx   rendered from schemas/plugin-manifest.schema.json
//
// The platform repo is read at the commit pinned in platform.lock.json
// (`npm run platform:bump` moves it to the platform's main). Set PLATFORM_DIR
// to read a local checkout instead (it must be at the pinned commit unless
// PLATFORM_ALLOW_ANY_REF=1). All of these files are git-ignored.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC_PATH, checkSpec, operationsOf } from './lib/openapi.mjs';
import { renderManifestReference } from './lib/manifest-reference.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content/docs');
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform.lock.json'), 'utf8'));
const REPO_URL = `https://github.com/${lock.repo}`;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A checkout of the platform repo at the pinned commit, with its history. */
function platformCheckout() {
  if (process.env.PLATFORM_DIR) {
    const dir = path.resolve(process.env.PLATFORM_DIR);
    const head = git(dir, 'rev-parse', 'HEAD');
    if (head !== lock.ref && process.env.PLATFORM_ALLOW_ANY_REF !== '1') {
      throw new Error(`PLATFORM_DIR is at ${head}, but platform.lock.json pins ${lock.ref}. Check out the pinned commit or set PLATFORM_ALLOW_ANY_REF=1.`);
    }
    return { dir, ref: head };
  }
  const dir = path.join(ROOT, '.platform');
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    // Blobs are fetched on checkout only; the history (for the changelog) is cheap.
    execFileSync('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', `${REPO_URL}.git`, dir], { stdio: 'inherit' });
  }
  try {
    git(dir, 'cat-file', '-e', `${lock.ref}^{commit}`);
  } catch {
    execFileSync('git', ['fetch', '--quiet', '--tags', 'origin'], { cwd: dir, stdio: 'inherit' });
  }
  execFileSync('git', ['checkout', '--quiet', '--force', lock.ref], { cwd: dir, stdio: 'inherit' });
  return { dir, ref: lock.ref };
}

function write(rel, text) {
  const file = path.join(CONTENT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const yamlString = (s) => JSON.stringify(String(s));

/** Plain text of a Markdown line, for a description. */
const plain = (s) =>
  s.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// --- Self-hosting guides ----------------------------------------------------

const SELF_HOST_SRC = 'docs/self-host';
/** The install guide's sidebar entry (a Fumadocs link item). */
export const INSTALL_GUIDE_LINK = '[Install from your browser](/self-host/install/)';

function importSelfHost(platform) {
  const out = path.join(CONTENT, 'self-host');
  fs.rmSync(out, { recursive: true, force: true });
  const src = path.join(platform.dir, SELF_HOST_SRC);
  if (!fs.existsSync(src)) {
    writeSelfHostStub(platform.ref);
    return { imported: 0 };
  }
  let imported = 0;
  const walk = (dir, rel) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    const pages = [];
    const order = new Map();
    for (const entry of entries) {
      const from = path.join(dir, entry.name);
      const relPath = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) {
        walk(from, relPath);
        pages.push(entry.name);
      } else if (/\.mdx?$/i.test(entry.name)) {
        const isIndex = /^(readme|index)\.mdx?$/i.test(entry.name);
        const name = isIndex ? 'index' : entry.name.replace(/\.mdx?$/i, '');
        const raw = fs.readFileSync(from, 'utf8');
        write(path.posix.join('self-host', rel, `${name}.md`), convertGuide(raw, path.posix.join(SELF_HOST_SRC, relPath), platform.ref));
        if (!isIndex) {
          pages.push(name);
          const o = guideOrder(raw);
          if (o !== undefined) order.set(name, o);
        }
        imported++;
      } else {
        // Images and other files the guides link to sit next to them.
        fs.mkdirSync(path.join(out, rel), { recursive: true });
        fs.copyFileSync(from, path.join(out, rel, entry.name));
      }
    }
    sortByOrder(pages, order);
    const metaTitle = rel === '' ? 'Self-hosting' : undefined;
    fs.mkdirSync(path.join(out, rel), { recursive: true });
    if (!fs.existsSync(path.join(out, rel, 'index.md'))) {
      write(path.posix.join('self-host', rel, 'index.md'), `---\ntitle: ${yamlString(rel === '' ? 'Self-hosting' : titleCase(path.basename(rel)))}\neditUrl: ${yamlString(`${REPO_URL}/tree/main/${path.posix.join(SELF_HOST_SRC, rel)}`)}\n---\n\nThe guides in this section:\n\n${pages.map((p) => `- [${titleCase(p)}](./${p})`).join('\n')}\n`);
    }
    // The browser install guide (app/self-host/install) sits right under the
    // section's overview: it is the fastest way in.
    const lead = rel === '' ? ['index', INSTALL_GUIDE_LINK] : ['index'];
    fs.writeFileSync(path.join(out, rel, 'meta.json'), JSON.stringify({ ...(metaTitle ? { title: metaTitle } : {}), pages: [...lead, ...pages] }, null, 2) + '\n');
  };
  walk(src, '');
  return { imported };
}

/** A guide's `order:` front matter, when it has one. */
export function guideOrder(raw) {
  const fm = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const m = fm?.[1].match(/^order:\s*(-?\d+(?:\.\d+)?)\s*$/m);
  return m ? Number(m[1]) : undefined;
}

/** Pages with an `order` first, by it; the rest after, by name. */
export function sortByOrder(pages, order) {
  pages.sort((a, b) => {
    const oa = order.get(a) ?? Infinity;
    const ob = order.get(b) ?? Infinity;
    return oa === ob ? a.localeCompare(b) : oa - ob;
  });
  return pages;
}

const titleCase = (s) => s.replace(/^\d+[-_]/, '').replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Frontmatter, a title from the first heading, and links that leave the folder point at GitHub. */
export function convertGuide(raw, srcPath, ref) {
  let body = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  let front = {};
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) front[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    body = body.slice(fm[0].length);
  }
  if (!front.title) {
    const h1 = body.match(/^#\s+(.+)\n/m);
    if (h1) {
      front.title = plain(h1[1]);
      body = body.replace(h1[0], '');
    } else {
      front.title = titleCase(path.posix.basename(srcPath).replace(/\.mdx?$/i, ''));
    }
  }
  if (!front.description) {
    const para = body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^[#>|`<\-*!\d]/.test(p));
    if (para) front.description = plain(para).slice(0, 240);
  }
  const dir = path.posix.dirname(srcPath);
  body = body.replace(/(\]\()([^)\s]+)(\))/g, (all, a, target, b) => {
    if (/^(https?:|mailto:|#)/.test(target)) return all;
    const [file, hash] = target.split('#');
    const resolved = path.posix.normalize(path.posix.join(dir, file));
    if (resolved.startsWith(`${SELF_HOST_SRC}/`) || resolved === SELF_HOST_SRC) return all;
    return `${a}${REPO_URL}/blob/${ref}/${resolved}${hash ? `#${hash}` : ''}${b}`;
  });
  const lines = [
    '---',
    `title: ${yamlString(front.title)}`,
    ...(front.description ? [`description: ${yamlString(front.description)}`] : []),
    `editUrl: ${yamlString(`${REPO_URL}/blob/main/${srcPath}`)}`,
    '---',
    '',
    `{/* Imported from ${lock.repo}/${srcPath} at ${ref.slice(0, 12)}. Edit it there. */}`,
    '',
  ];
  return lines.join('\n') + body.trimStart();
}

function writeSelfHostStub(ref) {
  write('self-host/index.mdx', `---
title: Self-hosting
description: Run CoderHelm in your own AWS account.
editUrl: ${yamlString(`${REPO_URL}/tree/main/${SELF_HOST_SRC}`)}
generated: true
---

The self-hosting guides live with the code they describe, in [\`${SELF_HOST_SRC}/\`](${REPO_URL}/tree/main/${SELF_HOST_SRC}) of the platform repo. This site pulls them in each time it is built, from the commit pinned in \`docs/platform.lock.json\`, so they always match that code.

That folder is not on the pinned commit yet (\`${ref.slice(0, 12)}\`). Once it is, the guides replace this page.

## What CoderHelm runs on today

CoderHelm is two repos, both public:

- [\`CoderHelm/coderhelm-platform\`](${REPO_URL}): the backend. Rust services on AWS Lambda (ARM64), deployed with AWS CDK.
- [\`CoderHelm/coderhelm\`](https://github.com/CoderHelm/coderhelm): the dashboard, the marketing site and these docs. Static Next.js exports on S3 and CloudFront.

The platform uses Lambda, API Gateway, SQS, DynamoDB, S3, KMS, Secrets Manager, Cognito, SES, EventBridge, CodeBuild, CloudWatch, SNS and Bedrock (for embeddings), plus a GitHub App and, for Jira, an Atlassian Forge app. Models are called through the Anthropic API with each team's own key.

Until the guides land, the platform's [README](${REPO_URL}#readme) lists the tools needed to build it.
`);
}

// --- OpenAPI document -------------------------------------------------------

/**
 * Copies the public API's OpenAPI document from the platform checkout. It is
 * generated from the gateway's handlers and checked there by a test, so the
 * reference pages can't drift from the code. A missing or broken document
 * fails the build rather than publishing an empty reference.
 */
function importOpenApi(platform) {
  const from = path.join(platform.dir, SPEC_PATH);
  if (!fs.existsSync(from)) {
    throw new Error(`${SPEC_PATH} is not in ${lock.repo} at ${platform.ref.slice(0, 12)}. Move platform.lock.json to a commit that has it (npm run platform:bump).`);
  }
  const text = fs.readFileSync(from, 'utf8');
  const spec = JSON.parse(text);
  const problems = checkSpec(spec);
  if (problems.length) throw new Error(`${SPEC_PATH} is not fit to publish:\n  ${problems.join('\n  ')}`);
  for (const rel of ['.generated/openapi.json', 'public/openapi.json']) {
    const to = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, text);
  }
  // The route list the reference replaced, removed so a stale copy never builds.
  fs.rmSync(path.join(CONTENT, 'api/routes.mdx'), { force: true });
  return { operations: operationsOf(spec).length };
}

// --- Changelog --------------------------------------------------------------

const MONTHS = 6;
const PR = /^(.*)\s\(#(\d+)\)$/;

function prLog(dir, rev, since) {
  try {
    const raw = git(dir, 'log', rev, '--first-parent', `--since=${since}`, '--format=%cs%x09%s');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [date, subject] = l.split('\t');
        const m = subject.match(PR);
        return m ? { date, title: m[1].trim(), number: Number(m[2]) } : null;
      })
      .filter(Boolean);
  } catch {
    return null;
  }
}

const escapeMdx = (s) => s.replace(/[<>{}]/g, (c) => `\\${c}`);

function writeChangelog(platform) {
  const since = `${MONTHS} months ago`;
  const platformPrs = prLog(platform.dir, platform.ref, since) ?? [];
  // This repo's own history (the dashboard and docs); empty in a shallow clone.
  const repoRoot = path.resolve(ROOT, '..');
  let isShallow = false;
  try { isShallow = git(repoRoot, 'rev-parse', '--is-shallow-repository') === 'true'; } catch { isShallow = true; }
  const appPrs = isShallow ? [] : (prLog(repoRoot, 'HEAD', since) ?? []);

  let tags = [];
  try {
    tags = git(platform.dir, 'for-each-ref', 'refs/tags', '--sort=-creatordate', '--format=%(refname:short)%09%(creatordate:short)%09%(contents:subject)')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [name, date, subject] = l.split('\t');
        return { name, date, subject: subject.replace(new RegExp(`^${name.replace(/\./g, '\\.')}\\s*[—-]\\s*`), '') };
      });
  } catch {}

  const months = new Map();
  const add = (repo, url, pr) => {
    const key = pr.date.slice(0, 7);
    if (!months.has(key)) months.set(key, { platform: [], app: [] });
    months.get(key)[repo].push(`- ${escapeMdx(pr.title)} ([#${pr.number}](${url}/pull/${pr.number}))`);
  };
  platformPrs.forEach((pr) => add('platform', REPO_URL, pr));
  appPrs.forEach((pr) => add('app', 'https://github.com/CoderHelm/coderhelm', pr));

  const monthName = (key) => new Date(`${key}-15T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const out = [
    '---',
    'title: Changelog',
    `description: What changed in CoderHelm, month by month, from the merged pull requests of both repos.`,
    `editUrl: ${yamlString('https://github.com/CoderHelm/coderhelm/blob/main/docs/scripts/import-platform.mjs')}`,
    'generated: true',
    '---',
    '',
    `Generated at build time from the merged pull requests of [coderhelm-platform](${REPO_URL}) (the agents and API, at \`${platform.ref.slice(0, 12)}\`) and [coderhelm](https://github.com/CoderHelm/coderhelm) (the dashboard and these docs), covering the last ${MONTHS} months. CoderHelm ships from \`main\` continuously, so there are no version numbers after the tags listed at the end.`,
    '',
  ];
  for (const key of [...months.keys()].sort().reverse()) {
    const m = months.get(key);
    out.push(`## ${monthName(key)}`, '');
    if (m.platform.length) out.push('### Agents and API', '', ...m.platform, '');
    if (m.app.length) out.push('### Dashboard and docs', '', ...m.app, '');
  }
  if (tags.length) {
    out.push('## Tagged releases', '', 'The platform was tagged during its first weeks:', '');
    for (const t of tags) out.push(`- [\`${t.name}\`](${REPO_URL}/releases/tag/${t.name}) (${t.date}): ${escapeMdx(t.subject)}`);
    out.push('');
  }
  write('changelog.mdx', out.join('\n'));
  return { platformPrs: platformPrs.length, appPrs: appPrs.length, tags: tags.length, shallow: isShallow };
}

// --- Manifest reference -----------------------------------------------------

function writeManifestReference() {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/plugin-manifest.schema.json'), 'utf8'));
  write('plugins/manifest-reference.mdx', renderManifestReference(schema));
}

// ---------------------------------------------------------------------------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  writeManifestReference();
  const platform = platformCheckout();
  const selfHost = importSelfHost(platform);
  const api = importOpenApi(platform);
  const log = writeChangelog(platform);
  console.log(
    `platform ${platform.ref.slice(0, 12)}: ${selfHost.imported ? `${selfHost.imported} self-host guides` : 'no self-host guides yet (stub page)'}, ${api.operations} API operations, changelog ${log.platformPrs}+${log.appPrs} PRs${log.shallow ? ' (shallow clone: dashboard PRs left out)' : ''}, ${log.tags} tags`,
  );
}
