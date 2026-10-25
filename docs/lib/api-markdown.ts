// The Markdown twin of an API reference page: everything the page shows
// (what the endpoint does, its scope, parameters, body and response fields,
// errors, and example requests and responses), as plain Markdown, built from
// the same OpenAPI document. Agents read these through llms.txt.

import { SAMPLE_LANGUAGES, type SampleRequest } from './api-samples';

type Schema = Record<string, any>;
type Doc = Record<string, any>;

/** Follows a local `$ref` (`#/components/schemas/Run`). */
function deref(doc: Doc, s: Schema | undefined): Schema {
  let cur = s ?? {};
  for (let i = 0; i < 20 && typeof cur.$ref === 'string'; i++) {
    const parts = cur.$ref.replace(/^#\//, '').split('/');
    cur = parts.reduce((o: any, k: string) => o?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], doc) ?? {};
  }
  return cur;
}

/** The schema without its `null` alternative, and whether it can be null. */
function unwrapNull(doc: Doc, s: Schema): { schema: Schema; nullable: boolean } {
  const d = deref(doc, s);
  for (const key of ['oneOf', 'anyOf'] as const) {
    if (Array.isArray(d[key])) {
      const rest = d[key].filter((x: Schema) => deref(doc, x).type !== 'null');
      if (rest.length === 1 && rest.length < d[key].length) {
        const inner = deref(doc, rest[0]);
        return { schema: { ...inner, description: d.description ?? inner.description }, nullable: true };
      }
    }
  }
  if (Array.isArray(d.type) && d.type.includes('null')) {
    const types = d.type.filter((t: string) => t !== 'null');
    return { schema: { ...d, type: types.length === 1 ? types[0] : types }, nullable: true };
  }
  return { schema: d, nullable: false };
}

/** Properties and required names, with `allOf` merged. */
function objectParts(doc: Doc, s: Schema): { props: Record<string, Schema>; required: Set<string> } {
  const d = deref(doc, s);
  const props: Record<string, Schema> = {};
  const required = new Set<string>();
  for (const part of [d, ...(Array.isArray(d.allOf) ? d.allOf.map((x: Schema) => deref(doc, x)) : [])]) {
    if (part !== d && part.allOf) {
      const inner = objectParts(doc, part);
      Object.assign(props, inner.props);
      inner.required.forEach((r) => required.add(r));
    }
    Object.assign(props, part.properties ?? {});
    for (const r of part.required ?? []) required.add(r);
  }
  return { props, required };
}

function refName(s: Schema | undefined): string | undefined {
  const ref = s?.$ref ?? s?.oneOf?.find((x: Schema) => x.$ref)?.$ref ?? s?.items?.$ref;
  return typeof ref === 'string' ? ref.split('/').pop() : undefined;
}

function typeLabel(doc: Doc, s: Schema): string {
  const { schema, nullable } = unwrapNull(doc, s);
  let t: string;
  if (schema.type === 'array') t = `array of ${typeLabel(doc, schema.items ?? {})}`;
  else if (Array.isArray(schema.enum)) t = `enum (${schema.enum.map((v: unknown) => `\`${v}\``).join(', ')})`;
  else if (schema.type === 'object' || schema.properties || schema.allOf) t = refName(s) ?? 'object';
  else t = Array.isArray(schema.type) ? schema.type.join(' or ') : (schema.type ?? 'any');
  return nullable ? `${t} or null` : t;
}

const cell = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

/** Rows for every field, nested ones as `parent.child`. */
function fieldRows(doc: Doc, s: Schema, prefix = '', depth = 0, seen = new Set<string>()): string[] {
  const { schema } = unwrapNull(doc, s);
  const target = schema.type === 'array' ? unwrapNull(doc, schema.items ?? {}).schema : schema;
  const name = refName(schema.type === 'array' ? schema.items : s);
  if (name && seen.has(name)) return [];
  const nextSeen = new Set(seen);
  if (name) nextSeen.add(name);
  const { props, required } = objectParts(doc, target);
  const rows: string[] = [];
  for (const [key, prop] of Object.entries(props)) {
    const path = `${prefix}${key}`;
    const d = deref(doc, prop);
    if (d.deprecated) continue;
    rows.push(`| \`${path}\` | ${cell(typeLabel(doc, prop))} | ${required.has(key) ? 'yes' : 'no'} | ${cell(unwrapNull(doc, prop).schema.description ?? d.description)} |`);
    const inner = unwrapNull(doc, prop).schema;
    const nested = inner.type === 'array' ? unwrapNull(doc, inner.items ?? {}).schema : inner;
    if (depth < 3 && (nested.properties || nested.allOf)) {
      rows.push(...fieldRows(doc, prop, `${path}${inner.type === 'array' ? '[]' : ''}.`, depth + 1, nextSeen));
    }
  }
  return rows;
}

function fieldTable(doc: Doc, s: Schema): string {
  const rows = fieldRows(doc, s);
  if (!rows.length) return '';
  return ['| Field | Type | Required | Description |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

/** An example value: the schema's own example, or one made from its fields. */
export function exampleOf(doc: Doc, s: Schema | undefined, depth = 0): unknown {
  if (!s) return undefined;
  const raw = deref(doc, s);
  if (raw.example !== undefined) return raw.example;
  const { schema } = unwrapNull(doc, s);
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (depth > 4) return null;
  if (schema.type === 'array') {
    const item = exampleOf(doc, schema.items, depth + 1);
    return item === undefined ? [] : [item];
  }
  if (schema.type === 'object' || schema.properties || schema.allOf) {
    const { props } = objectParts(doc, schema);
    const out: Record<string, unknown> = {};
    for (const [k, p] of Object.entries(props)) {
      if (deref(doc, p).deprecated) continue;
      const v = exampleOf(doc, p, depth + 1);
      out[k] = v === undefined ? null : v;
    }
    return out;
  }
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'string') return 'string';
  return null;
}

export interface OperationRef {
  path: string;
  method: string;
}

/** The operation's request, with example values, for the samples. */
export function sampleRequest(doc: Doc, ref: OperationRef): SampleRequest {
  const op = doc.paths[ref.path][ref.method];
  const base = String(doc.servers?.[0]?.url ?? '').replace(/\/$/, '');
  let path = ref.path;
  const query = new URLSearchParams();
  const headers: Record<string, string> = {};
  for (const p of (op.parameters ?? []).map((x: Schema) => deref(doc, x))) {
    const value = String(p.example ?? exampleOf(doc, p.schema) ?? '');
    if (p.in === 'path') path = path.replace(`{${p.name}}`, encodeURIComponent(value));
    else if (p.in === 'query' && p.required) query.set(p.name, value);
    else if (p.in === 'header' && p.required) headers[p.name] = value;
  }
  const security = op.security?.[0] ? Object.keys(op.security[0]) : [];
  const auth: SampleRequest['auth'] = security.includes('api_key') ? 'api_key' : security.includes('github_oidc') ? 'bearer' : 'none';
  const json = op.requestBody?.content?.['application/json'];
  const qs = query.toString();
  return {
    method: ref.method,
    url: `${base}${path}${qs ? `?${qs}` : ''}`,
    headers,
    body: json ? exampleOf(doc, json.schema) : undefined,
    auth,
  };
}

function parameterTable(doc: Doc, params: Schema[], where: string): string {
  const rows = params
    .filter((p) => p.in === where)
    .map((p) => `| \`${p.name}\` | ${cell(typeLabel(doc, p.schema ?? {}))} | ${p.required ? 'yes' : 'no'} | ${cell(p.description)} |`);
  if (!rows.length) return '';
  const title = { path: 'Path parameters', query: 'Query parameters', header: 'Headers' }[where] ?? where;
  return [`### ${title}`, '', '| Name | Type | Required | Description |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

/** The whole operation as Markdown. */
export function operationMarkdown(doc: Doc, ref: OperationRef): string {
  const op = doc.paths[ref.path][ref.method];
  const out: string[] = [];
  out.push(`\`${ref.method.toUpperCase()} ${ref.path}\``, '');
  if (op.description) out.push(op.description, '');

  out.push('## Authentication', '');
  const sec = op.security?.[0] ?? {};
  if ('api_key' in sec) {
    const scopes: string[] = sec.api_key;
    out.push(
      `A team API key: \`Authorization: Bearer chk_...\`.${scopes.length ? ` The key needs the \`${scopes.join('`, `')}\` scope.` : ' Any key works.'} See [Authentication](https://docs.coderhelm.com/api/authentication).`,
      '',
    );
  } else if ('github_oidc' in sec) {
    out.push('A GitHub Actions OIDC token requested with the audience `coderhelm`, as `Authorization: Bearer <token>`. See [Authentication](https://docs.coderhelm.com/api/authentication#ci-jobs).', '');
  } else if ('github_signature' in sec || 'jira_signature' in sec) {
    out.push('Verified by its signature header. See [Webhooks](https://docs.coderhelm.com/api/webhooks).', '');
  } else {
    out.push('Verified by the request itself (see the description above). See [Webhooks](https://docs.coderhelm.com/api/webhooks).', '');
  }

  const params: Schema[] = (op.parameters ?? []).map((p: Schema) => deref(doc, p));
  const paramParts = ['path', 'query', 'header'].map((w) => parameterTable(doc, params, w)).filter(Boolean);
  if (paramParts.length) out.push('## Parameters', '', paramParts.join('\n\n'), '');

  const body = op.requestBody;
  if (body) {
    const [mediaType, media] = Object.entries(body.content ?? {})[0] ?? [];
    out.push('## Request body', '', `\`${mediaType}\`${body.description ? `: ${body.description}` : ''}`, '');
    const table = media ? fieldTable(doc, (media as Schema).schema ?? {}) : '';
    if (table) out.push(table, '');
  }

  out.push('## Responses', '');
  for (const [status, r] of Object.entries(op.responses ?? {})) {
    const resp = deref(doc, r as Schema);
    out.push(`### ${status}`, '', resp.description ?? '', '');
    const json = resp.content?.['application/json'];
    if (status.startsWith('2') && json?.schema) {
      const table = fieldTable(doc, json.schema);
      if (table) out.push(table, '');
    }
    const headers = Object.keys(resp.headers ?? {});
    if (headers.length) out.push(`Headers: ${headers.map((h) => `\`${h}\``).join(', ')}.`, '');
  }

  const req = sampleRequest(doc, ref);
  out.push('## Example request', '');
  for (const l of SAMPLE_LANGUAGES) out.push(`${l.label}:`, '', '```' + l.lang, l.generate(req), '```', '');

  const ok = Object.entries(op.responses ?? {}).find(([s]) => s.startsWith('2'));
  const okJson = ok ? deref(doc, ok[1] as Schema).content?.['application/json'] : undefined;
  if (okJson) {
    const example = okJson.example ?? exampleOf(doc, okJson.schema);
    if (example !== undefined) out.push('## Example response', '', '```json', JSON.stringify(example, null, 2), '```', '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
