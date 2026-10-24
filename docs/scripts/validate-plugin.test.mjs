import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { validatePlugin } from './validate-plugin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = path.join(ROOT, 'examples/marketing');

/** A copy of the example plugin with its manifest changed by `edit`. */
function variant(edit, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-'));
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  const manifest = YAML.parse(fs.readFileSync(path.join(dir, 'plugin.yaml'), 'utf8'));
  edit(manifest);
  fs.writeFileSync(path.join(dir, 'plugin.yaml'), YAML.stringify(manifest));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return validatePlugin(dir);
}

test('the example marketing plugin is valid, with no warnings', () => {
  const { errors, warnings, manifest } = validatePlugin(EXAMPLE);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(manifest.name, 'marketing');
});

test('a minimal plugin needs only name, version, description and one skill', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-'));
  fs.writeFileSync(path.join(dir, 'plugin.yaml'), 'name: hello\nversion: 0.1.0\ndescription: Says hello.\nagents: []\n');
  fs.mkdirSync(path.join(dir, 'skills/hello'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'skills/hello/SKILL.md'), '---\nname: hello\ndescription: Greets.\n---\nSay hello.\n');
  assert.deepEqual(validatePlugin(dir).errors, []);
});

test('unknown fields, bad names and bad versions are refused', () => {
  const r = variant((m) => {
    m.nmae = 'typo';
    m.name = 'Marketing!';
    m.version = '1.0';
  });
  assert.ok(r.errors.some((e) => e.includes('`nmae`')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.startsWith('name:')));
  assert.ok(r.errors.some((e) => e.startsWith('version:')));
});

test('a publish output must go through a consequential tool', () => {
  const r = variant((m) => {
    m.tools.find((t) => t.name === 'publish_post').risk = 'write';
  });
  assert.ok(r.errors.some((e) => e.includes('must be a `consequential` tool')), r.errors.join('\n'));
});

test('tool names must not clash with a name allowed from a connection', () => {
  const r = variant((m) => {
    m.tools.push({ name: 'create_draft', kind: 'builtin', risk: 'write' });
  });
  assert.ok(r.errors.some((e) => e.includes('clashes')), r.errors.join('\n'));
});

test('a connection setting needs a provider; settings types are limited', () => {
  const r = variant((m) => {
    m.settings.push({ key: 'crm', type: 'connection' }, { key: 'tone', type: 'select' });
  });
  assert.ok(r.errors.some((e) => e.includes('provider')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.startsWith('settings.')), r.errors.join('\n'));
});

test('an agent may only list tools the manifest grants', () => {
  const r = variant(() => {}, {
    'agents/rogue.md': '---\nname: rogue\ndescription: Tries more.\ntools: [create_draft, delete_document]\n---\nBody.\n',
  });
  assert.ok(r.errors.some((e) => e.includes('`delete_document` is not granted')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('`create_draft`')));
});

test('a glob that matches nothing is an error', () => {
  const r = variant((m) => {
    m.agents = ['agents/missing/*.md'];
  });
  assert.ok(r.errors.some((e) => e.includes('matches no file')));
});

test('a manual form field is text or a list of choices', () => {
  const r = variant((m) => {
    m.triggers.find((t) => t.on === 'manual').form.when = 'date';
  });
  assert.ok(r.errors.length >= 1, r.errors.join('\n'));
});

test('an item over 64,000 bytes is refused', () => {
  const r = variant(() => {}, { 'skills/huge/SKILL.md': `---\nname: huge\ndescription: Big.\n---\n${'x'.repeat(64_001)}` });
  assert.ok(r.errors.some((e) => e.includes('64000-byte limit')), r.errors.join('\n'));
});
