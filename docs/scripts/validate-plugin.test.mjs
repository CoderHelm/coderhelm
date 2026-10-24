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

test('a minimal plugin needs only name, version and one skill', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-'));
  fs.writeFileSync(path.join(dir, 'plugin.yaml'), 'name: hello\nversion: "0.1"\nagents: []\n');
  fs.mkdirSync(path.join(dir, 'skills/hello'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'skills/hello/SKILL.md'), '---\nname: hello\ndescription: Greets.\n---\nSay hello.\n');
  assert.deepEqual(validatePlugin(dir).errors, []);
});

test('unknown fields, bad names and bad versions are refused', () => {
  const r = variant((m) => {
    m.nmae = 'typo';
    m.name = 'Marketing!';
    m.version = 'v1';
  });
  assert.ok(r.errors.some((e) => e.includes('`nmae`')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.startsWith('name:')));
  assert.ok(r.errors.some((e) => e.startsWith('version:')));
});

test('a publish output must go through a consequential tool', () => {
  const r = variant((m) => {
    m.outputs.find((o) => o.type === 'publish').via = 'generate_image';
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

test('the manifest is also read from .coderhelm/plugin.yaml', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-'));
  fs.mkdirSync(path.join(dir, '.coderhelm'));
  fs.writeFileSync(path.join(dir, '.coderhelm/plugin.yaml'), 'name: hello\nversion: 1.0.0\nagents: []\nskills: []\n');
  assert.deepEqual(validatePlugin(dir).errors, []);
});

test('a connection may never allow every tool of a server', () => {
  const r = variant((m) => {
    m.tools.find((t) => t.ref === 'mcp:sanity').allow = ['*'];
  });
  assert.ok(r.errors.some((e) => e.startsWith('tools.0')), r.errors.join('\n'));
});

test('an HTTP tool names a connection setting, and its headers never carry credentials', () => {
  const r = variant((m) => {
    const t = m.tools.find((x) => x.name === 'publish_post');
    t.connection = 'brand_voice_doc';
    t.headers.Authorization = 'Bearer secret';
  });
  assert.ok(r.errors.some((e) => e.includes('headers')), r.errors.join('\n'));
  const r2 = variant((m) => {
    m.tools.find((x) => x.name === 'publish_post').connection = 'brand_voice_doc';
  });
  assert.ok(r2.errors.some((e) => e.includes('must name a connection setting')), r2.errors.join('\n'));
});

test('an HTTP tool needs an https address', () => {
  const r = variant((m) => {
    m.tools.find((x) => x.name === 'publish_post').url = 'http://api.example.com/posts';
  });
  assert.ok(r.errors.some((e) => e.includes('url')), r.errors.join('\n'));
});

test("a body template only uses settings that are strings and aren't sensitive", () => {
  const r = variant((m) => {
    m.tools.find((x) => x.name === 'publish_post').body.author = '{{setting:linkedin}}';
  });
  assert.ok(r.errors.some((e) => e.includes('setting `linkedin`')), r.errors.join('\n'));
});

test('results are read through a listed server with a read-only tool', () => {
  const r = variant((m) => {
    m.results = { via: 'mcp:hubspot', tool: 'delete_contact', after_days: 7 };
  });
  assert.ok(r.errors.some((e) => e.includes('results: `via`')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.includes('read-only')), r.errors.join('\n'));
});

test('a schedule is five cron fields, and only a manual trigger has a form', () => {
  const r = variant((m) => {
    m.triggers.find((t) => t.on === 'schedule').cron = '0 14 * *';
    m.triggers.find((t) => t.on === 'github.release').form = { brief: 'text' };
  });
  assert.ok(r.errors.some((e) => e.includes('cron') || e.startsWith('triggers.1')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.includes('`form`')), r.errors.join('\n'));
});

test('draft kinds are the ones CoderHelm keeps', () => {
  const r = variant((m) => {
    m.outputs.find((o) => o.type === 'draft').kinds.push('podcast');
  });
  assert.ok(r.errors.some((e) => e.startsWith('outputs.0.kinds')), r.errors.join('\n'));
});
