import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plainArrows, proseProblems } from './lib/prose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content/docs');
const ALLOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/prose-allow.json'), 'utf8'));
// Written at build time (see .gitignore); check-output covers them in the built twins.
const GENERATED = ['self-host/', 'api/routes.mdx', 'changelog.mdx', 'plugins/manifest-reference.mdx'];

function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return pages(p);
    return /\.mdx?$/.test(e.name) ? [p] : [];
  });
}

test('no page draws a diagram in a code fence or puts an arrow glyph in prose', () => {
  const found = [];
  for (const file of pages(CONTENT)) {
    const rel = path.relative(CONTENT, file).split(path.sep).join('/');
    if (GENERATED.some((g) => rel.startsWith(g))) continue;
    for (const p of proseProblems(fs.readFileSync(file, 'utf8'), { file: `content/docs/${rel}`, allow: ALLOW })) {
      found.push(`content/docs/${rel}:${p.line} ${p.rule}: ${p.text}`);
    }
  }
  assert.deepEqual(found, [], `use <Diagram> for pictures and words for menu paths ("Settings, then Team"):\n${found.join('\n')}`);
});

test('every allowlist entry says why and still matches something', () => {
  for (const a of ALLOW) {
    assert.ok(a.file && a.text && a.reason, `prose-allow.json entry needs file, text and reason: ${JSON.stringify(a)}`);
    // Generated pages exist only after a build; check-output matches those.
    if (GENERATED.some((g) => a.file.startsWith(`content/docs/${g}`))) continue;
    assert.ok(fs.readFileSync(path.join(ROOT, a.file), 'utf8').includes(a.text), `prose-allow.json: "${a.text}" is no longer in ${a.file}`);
  }
});

test('an ASCII diagram in a fence is caught, in any language', () => {
  for (const lang of ['txt', 'text', '', 'mermaid-ish']) {
    const md = `Intro.\n\n\`\`\`${lang}\nGitHub ──► gateway ──► queue\n     └── dashboard\n\`\`\`\n`;
    const p = proseProblems(md);
    assert.equal(p.length, 1, lang);
    assert.equal(p[0].rule, 'diagram-fence');
    assert.equal(p[0].line, 4);
  }
  assert.equal(proseProblems('```txt\ntrigger\n  -> run\n  → drafts\n```\n')[0]?.rule, 'diagram-fence');
});

test('file trees, real code and CLI output are not diagrams', () => {
  const tree = '```txt\nrepo/\n├── marketing/\n│   └── plugin.yaml\n└── sales-notes/\n    └── plugin.yaml\n```\n';
  assert.deepEqual(proseProblems(tree), []);
  const code = '```ts\nconst f = (a: number) => a + 1;\n```\n\n```rust\nfn main() -> Result<(), E> {}\n```\n';
  assert.deepEqual(proseProblems(code), []);
  const cli = '```\nStep 1 of 8 [██░░░░░░] Your machine\n```\n';
  assert.deepEqual(proseProblems(cli), []);
});

test('arrow glyphs in prose are caught; inline code and comments are not', () => {
  assert.equal(proseProblems('Open **Settings** → **Team**.')[0]?.rule, 'prose-arrow');
  assert.equal(proseProblems('| Run log | **Runs** → a run |')[0]?.rule, 'prose-arrow');
  assert.equal(proseProblems('## Brief ⇒ draft')[0]?.rule, 'prose-arrow');
  assert.equal(proseProblems('trigger -> run')[0]?.rule, 'prose-arrow');
  assert.deepEqual(proseProblems('The arrow `a → b` is code, and `x -> y` too.'), []);
  assert.deepEqual(proseProblems('{/* Imported → from elsewhere */}\n<!-- a → b -->'), []);
  assert.deepEqual(proseProblems('A range like 2-15 and a flag like --since stay.'), []);
});

test('plainArrows writes menu paths as words and leaves code alone', () => {
  assert.equal(plainArrows('REST API in Settings → Integrations: address'), 'REST API in Settings, then Integrations: address');
  assert.equal(plainArrows('Alerts page for alert → pull request routes'), 'Alerts page for alert to pull request routes');
  assert.equal(plainArrows('(**SES → Identities → your domain**)'), '(**SES, then Identities, then your domain**)');
  assert.equal(plainArrows('(GitHub → the app → **Install App**)'), '(GitHub, then the app, then **Install App**)');
  assert.equal(plainArrows('keep `a → b` here'), 'keep `a → b` here');
  assert.equal(plainArrows('```\n  Jira: connect from Settings → Jira\n```'), '```\n  Jira: connect from Settings → Jira\n```');
  assert.deepEqual(proseProblems(plainArrows('Open Settings → Team → Members, then save.')), []);
});
