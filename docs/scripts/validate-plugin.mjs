#!/usr/bin/env node
// Checks a CoderHelm plugin before you push it:
//
//   node validate-plugin.mjs [plugin-dir]
//
// 1. plugin.yaml against the manifest's JSON Schema
//    (https://docs.coderhelm.com/schema/plugin-manifest.v1.json).
// 2. The checks a schema cannot express: every skill and agent glob finds a
//    file, files fit the size limits, `{settings.x}` and `{input}` name things
//    that exist, a publish output goes through a consequential tool, and each
//    agent's `tools:` are tools the manifest grants.
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
  const file = ['plugin.yaml', 'plugin.yml'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
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
  const connections = new Set(settings.filter((s) => s.type === 'connection').map((s) => s.key));

  // Tools
  const httpTools = new Map();
  const allowPatterns = [];
  for (const t of tools) {
    if (t.kind === 'http') {
      if (httpTools.has(t.name)) errors.push(`tools: \`${t.name}\` is declared twice`);
      httpTools.set(t.name, t);
      const inputs = new Set(Object.keys(t.inputs ?? {}));
      if (t.request.connection && !connections.has(t.request.connection)) {
        errors.push(`tools.${t.name}: request.connection \`${t.request.connection}\` is not a \`connection\` setting`);
      }
      const text = JSON.stringify(t.request);
      for (const m of text.matchAll(/\{settings\.([a-z0-9_]+)\}/g)) {
        if (!settingKeys.has(m[1])) errors.push(`tools.${t.name}: \`{settings.${m[1]}}\` names no setting`);
      }
      for (const m of text.matchAll(/\{([a-z][a-z0-9_]*)\}/g)) {
        if (!inputs.has(m[1])) errors.push(`tools.${t.name}: \`{${m[1]}}\` names no input`);
      }
      for (const name of inputs) {
        if (!text.includes(`{${name}}`)) warnings.push(`tools.${t.name}: input \`${name}\` is never used in the request`);
      }
    } else {
      const id = t.ref.split(':')[1];
      if (t.ref.startsWith('mcp:') && !connections.has(id)) {
        warnings.push(`tools: \`${t.ref}\` has no \`connection\` setting named \`${id}\`; the team must already have it on the Connections page`);
      }
      allowPatterns.push(...t.allow.map(globToRe));
      if (t.allow.includes('*')) warnings.push(`tools: \`${t.ref}\` allows every tool on the server; list the ones the plugin needs`);
    }
  }

  for (const name of httpTools.keys()) {
    if (allowPatterns.some((re) => re.test(name))) errors.push(`tools: \`${name}\` clashes with a tool allowed from a connection; rename it`);
  }

  // Outputs
  for (const o of manifest.outputs ?? []) {
    if (o.type !== 'publish') continue;
    const tool = httpTools.get(o.via);
    if (!tool) errors.push(`outputs: publish via \`${o.via}\` names no tool defined in \`tools\``);
    else if (tool.risk !== 'consequential') errors.push(`outputs: publish via \`${o.via}\` must be a \`consequential\` tool (it is \`${tool.risk}\`)`);
  }
  for (const t of httpTools.values()) {
    if (t.risk === 'consequential' && !(manifest.outputs ?? []).some((o) => o.type === 'publish' && o.via === t.name)) {
      warnings.push(`tools.${t.name}: a consequential tool that no publish output uses can never run`);
    }
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
        const granted = httpTools.has(name) || allowPatterns.some((re) => re.test(name));
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
