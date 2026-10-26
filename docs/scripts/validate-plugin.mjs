#!/usr/bin/env node
// Checks a CoderHelm plugin before you push it:
//
//   node validate-plugin.mjs [plugin-dir]
//
// 1. plugin.yaml against the manifest's JSON Schema
//    (https://docs.coderhelm.com/schema/plugin-manifest.v1.json).
// 2. The checks a schema cannot express, the same ones CoderHelm makes when
//    it reads a plugin (services/common/src/plugins/manifest.rs): every skill
//    and agent glob finds a file, files fit the size limits, a publish output
//    goes through a consequential tool, an HTTP tool names a connection
//    setting and its body only uses settings that aren't sensitive, results
//    are read through a listed server with a read-only tool, tool names don't
//    clash, and each agent's `tools:` are tools the manifest grants.
//
// The docs site also ships this file bundled with its dependencies at
// https://docs.coderhelm.com/tools/validate-plugin.mjs, so a plugin repo can
// run it with nothing but Node 20 or newer.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import YAML from 'yaml';
import schema from '../schemas/plugin-manifest.schema.json' with { type: 'json' };

/** Limits shared with skill repos (services/common/src/skills.rs). */
export const LIMITS = {
  itemBytes: 64_000,
  descriptionChars: 240,
  items: 200,
  repoBytes: 2_000_000,
};

const SKILL_DEFAULT = schema.properties.skills.default;
const AGENT_DEFAULT = schema.properties.agents.default;

/** Files under `dir` matching a glob where `*` stays inside one path segment. */
export function globFiles(dir, pattern) {
  const parts = pattern.replace(/^\.\//, '').split('/');
  const results = [];
  const walk = (base, i) => {
    if (i === parts.length) {
      if (fs.existsSync(base) && fs.statSync(base).isFile()) results.push(base);
      return;
    }
    const part = parts[i];
    if (!part.includes('*')) return walk(path.join(base, part), i + 1);
    const re = new RegExp(`^${part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return;
    for (const name of fs.readdirSync(base).sort()) if (re.test(name)) walk(path.join(base, name), i + 1);
  };
  walk(dir, 0);
  return results;
}

/** The frontmatter of a Markdown file, or {} when there is none. */
export function frontMatter(text) {
  const m = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  try {
    return YAML.parse(m[1]) ?? {};
  } catch {
    return null;
  }
}

/** `tools:` in an agent's frontmatter: a list, or one string split by commas or spaces. */
function toolList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean);
  return [];
}

const globToRe = (g) => new RegExp(`^${g.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);

/** Where a plugin folder keeps its manifest, in the order CoderHelm looks (services/common/src/plugins/manifest.rs). */
export const MANIFEST_FILES = ['plugin.yaml', 'plugin.yml', '.coderhelm/plugin.yaml'];
/** Tools every plugin run has without asking. */
export const ALWAYS = ['read_plugin_skill', 'save_draft'];

// How CoderHelm reads a tool's risk from its name (services/common/src/tool_registry.rs).
const READ_VERBS = ['get', 'list', 'search', 'read', 'query', 'fetch', 'find', 'describe', 'count', 'show', 'view', 'lookup', 'inspect', 'check', 'retrieve', 'browse'];
const CONSEQUENTIAL_VERBS = ['publish', 'send', 'post', 'delete', 'remove', 'destroy', 'drop', 'merge', 'deploy', 'release', 'pay', 'charge', 'refund', 'transfer', 'invite', 'revoke', 'archive', 'email', 'tweet', 'share', 'schedule', 'submit', 'purge', 'unpublish', 'notify', 'broadcast'];
const CONSEQUENTIAL_ANYWHERE = ['publish', 'unpublish', 'delete', 'destroy', 'purge', 'deploy', 'refund', 'transfer', 'revoke', 'broadcast'];
const RISKS = ['read', 'write', 'consequential'];
const maxRisk = (a, b) => (RISKS.indexOf(a) >= RISKS.indexOf(b) ? a : b);

/** A connection's tool's risk from its own name: read, write or consequential. */
export function classifyTool(name) {
  const words = String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => CONSEQUENTIAL_ANYWHERE.includes(w))) return 'consequential';
  if (CONSEQUENTIAL_VERBS.includes(words[0])) return 'consequential';
  if (READ_VERBS.includes(words[0])) return 'read';
  return 'write';
}

/** The risk a named tool runs at: a declared risk can raise it, never lower it. */
export function toolRisk(t) {
  let base;
  if (t.kind === 'builtin') base = 'read';
  else if (t.kind === 'http' && t.method !== 'GET') base = maxRisk(classifyTool(t.name), 'write');
  else base = classifyTool(t.name);
  return t.risk ? maxRisk(base, t.risk) : base;
}

/** The `{{setting:<key>}}` names a body template uses. */
export function templateSettings(v, out = []) {
  if (typeof v === 'string') for (const m of v.matchAll(/\{\{setting:([^}]*)\}\}/g)) out.push(m[1]);
  else if (Array.isArray(v)) v.forEach((x) => templateSettings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => templateSettings(x, out));
  return out;
}

let validateSchema;
function schemaValidator() {
  if (!validateSchema) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    validateSchema = ajv.compile(schema);
  }
  return validateSchema;
}

/**
 * Validates a plugin folder. Returns { errors, warnings, manifest }; a plugin
 * is valid when `errors` is empty.
 */
export function validatePlugin(dir) {
  const errors = [];
  const warnings = [];
  const file = MANIFEST_FILES.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!file) return { errors: [`No plugin.yaml in ${dir}`], warnings, manifest: null };

  let manifest;
  try {
    manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { errors: [`plugin.yaml is not valid YAML: ${e.message}`], warnings, manifest: null };
  }

  const validate = schemaValidator();
  if (!validate(manifest)) {
    for (const err of validate.errors) {
      // oneOf reports every branch that failed; the specific errors above it say why.
      if (err.keyword === 'oneOf' || err.keyword === 'if') continue;
      const where = err.instancePath ? err.instancePath.slice(1).replace(/\//g, '.') : '(top level)';
      const extra = err.keyword === 'additionalProperties' ? ` (\`${err.params.additionalProperty}\`)` : err.keyword === 'enum' ? `: ${err.params.allowedValues.join(', ')}` : '';
      errors.push(`${where}: ${err.message}${extra}`);
    }
    return { errors: [...new Set(errors)], warnings, manifest };
  }

  const settings = manifest.settings ?? [];
  const tools = manifest.tools ?? [];
  const settingKeys = new Set();
  for (const s of settings) {
    if (settingKeys.has(s.key)) errors.push(`settings: \`${s.key}\` is declared twice`);
    settingKeys.add(s.key);
  }
  const setting = (key) => settings.find((s) => s.key === key);

  // Tools
  const namedTools = new Map();
  const allowPatterns = [];
  const servers = new Set();
  for (const t of tools) {
    if (t.ref) {
      servers.add(t.ref.slice(4));
      allowPatterns.push(...t.allow.map(globToRe));
      continue;
    }
    if (namedTools.has(t.name) || ALWAYS.includes(t.name)) errors.push(`tools: \`${t.name}\` is declared twice or takes a built-in name`);
    namedTools.set(t.name, t);
    if (t.kind === 'http') {
      if (setting(t.connection)?.type !== 'connection') errors.push(`tools.${t.name}: \`connection\` must name a connection setting`);
      for (const key of templateSettings(t.body)) {
        const s = setting(key);
        if (!s || s.type !== 'string' || s.sensitive) errors.push(`tools.${t.name}: the body uses setting \`${key}\`, which must be a string setting that isn't sensitive`);
      }
      if (t.body !== undefined && JSON.stringify(t.body).length > 8_000) errors.push(`tools.${t.name}: the body is too large`);
    }
  }
  for (const name of namedTools.keys()) {
    if (allowPatterns.some((re) => re.test(name))) errors.push(`tools: \`${name}\` clashes with a tool allowed from a connection; rename it`);
  }

  // Outputs
  for (const o of manifest.outputs ?? []) {
    if (o.type !== 'publish') continue;
    const tool = namedTools.get(o.via);
    if (!tool) errors.push(`outputs: publish via \`${o.via}\` names no tool in \`tools\``);
    else if (toolRisk(tool) !== 'consequential') errors.push(`outputs: publish via \`${o.via}\` must be a \`consequential\` tool (it is \`${toolRisk(tool)}\`)`);
  }
  // Results
  if (manifest.results) {
    const r = manifest.results;
    if (!servers.has(r.via.slice(4))) errors.push(`results: \`via\` must be an mcp: server the plugin lists in \`tools\``);
    if (classifyTool(r.tool) !== 'read') errors.push(`results: \`tool\` must be a read-only tool (\`${r.tool}\` isn't)`);
  }

  // Skills and agents
  let total = 0;
  let items = 0;
  const checkItem = (kind, f) => {
    const rel = path.relative(dir, f);
    const text = fs.readFileSync(f, 'utf8');
    const bytes = Buffer.byteLength(text);
    total += bytes;
    items++;
    if (bytes > LIMITS.itemBytes) errors.push(`${rel}: ${bytes} bytes, over the ${LIMITS.itemBytes}-byte limit`);
    const fm = frontMatter(text);
    if (fm === null) {
      warnings.push(`${rel}: frontmatter is not valid YAML; CoderHelm falls back to reading key: value lines`);
      return null;
    }
    if (!fm.description) warnings.push(`${rel}: no \`description\`; the first line of the body is used`);
    else if (String(fm.description).length > LIMITS.descriptionChars) warnings.push(`${rel}: description is cut to ${LIMITS.descriptionChars} characters`);
    return fm;
  };
  for (const pattern of manifest.skills ?? SKILL_DEFAULT) {
    const found = globFiles(dir, pattern);
    if (found.length === 0) errors.push(`skills: \`${pattern}\` matches no file`);
    found.forEach((f) => checkItem('skill', f));
  }
  for (const pattern of manifest.agents ?? AGENT_DEFAULT) {
    const found = globFiles(dir, pattern);
    if (found.length === 0) errors.push(`agents: \`${pattern}\` matches no file`);
    for (const f of found) {
      const fm = checkItem('agent', f);
      if (!fm) continue;
      for (const name of toolList(fm.tools ?? fm['allowed-tools'])) {
        const granted = ALWAYS.includes(name) || namedTools.has(name) || allowPatterns.some((re) => re.test(name));
        if (!granted) errors.push(`${path.relative(dir, f)}: tool \`${name}\` is not granted in plugin.yaml \`tools\``);
      }
    }
  }
  if (items > LIMITS.items) errors.push(`${items} skills and agents, over the limit of ${LIMITS.items}`);
  if (total > LIMITS.repoBytes) errors.push(`${total} bytes of skills and agents, over the ${LIMITS.repoBytes}-byte limit`);

  return { errors, warnings, manifest };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dir = path.resolve(process.argv[2] ?? '.');
  const { errors, warnings, manifest } = validatePlugin(dir);
  for (const w of warnings) console.log(`warning  ${w}`);
  for (const e of errors) console.log(`error    ${e}`);
  if (errors.length) {
    console.log(`\n${errors.length} error${errors.length === 1 ? '' : 's'}: the plugin would be refused.`);
    process.exit(1);
  }
  console.log(`ok       ${manifest.name} ${manifest.version}${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}`);
}
