// The event catalog on /api/webhooks/, rendered from the OpenAPI document's
// `webhooks` section. That section is generated from the platform's event
// catalog (services/common/src/webhooks/catalog.rs), so the page lists
// exactly the events CoderHelm sends, with their real fields and examples.
// import-platform.mjs writes the result to .generated/webhook-events.md and
// content/docs/api/webhooks.mdx includes it.

import { plainArrows } from './prose.mjs';

/** Groups in the order the page lists them; others follow, by name. */
export const GROUP_ORDER = ['Runs', 'Pull requests', 'Reviews', 'CI fixes', 'Alerts', 'Logs', 'Releases', 'Plans', 'Plugins', 'Testing'];

/** Event types in the order the page lists them inside a group. */
const TYPE_ORDER = ['created', 'opened', 'started', 'received', 'completed', 'failed', 'needs_input', 'approved', 'published', 'resolved', 'test'];

/** The envelope's fields, in the order CoderHelm sends them. */
export const ENVELOPE = ['id', 'type', 'created_at', 'team_id', 'api_version', 'data'];

/** `obj` with its keys in `order` first (the rest after, as they were). */
function ordered(obj, order) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const keys = [...order.filter((k) => k in obj), ...Object.keys(obj).filter((k) => !order.includes(k))];
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

/** An example event with its fields in the documented order (the document's JSON sorts them). */
export function exampleInOrder(e) {
  const fields = e.schema?.properties?.data?.required ?? [];
  const ex = ordered(e.example, ENVELOPE);
  return ex && { ...ex, data: ordered(ex.data, fields) };
}

const rank = (list, v) => {
  const i = list.indexOf(v);
  return i === -1 ? list.length : i;
};

/** Every event in the document: `{ type, group, summary, description, schema, example }`. */
export function eventsOf(spec) {
  const out = [];
  for (const [type, item] of Object.entries(spec.webhooks ?? {})) {
    const op = item?.post;
    if (!op) continue;
    const content = op.requestBody?.content?.['application/json'] ?? {};
    out.push({
      type,
      group: String(op.tags?.[0] ?? '').replace(/^Events:\s*/, ''),
      summary: op.summary ?? '',
      // The document adds how it is sent; the page says that once, above.
      description: String(op.description ?? '').replace(/\s*Sent as `POST` to each endpoint.*$/, ''),
      schema: content.schema ?? {},
      example: content.examples?.event?.value,
    });
  }
  return out.sort((a, b) => {
    const g = rank(GROUP_ORDER, a.group) - rank(GROUP_ORDER, b.group) || a.group.localeCompare(b.group);
    if (g) return g;
    const last = (t) => t.split('.').pop();
    return rank(TYPE_ORDER, last(a.type)) - rank(TYPE_ORDER, last(b.type)) || a.type.localeCompare(b.type);
  });
}

/** Problems that would publish a wrong or empty catalog. */
export function checkEvents(spec) {
  const events = eventsOf(spec);
  const problems = [];
  if (!events.length) problems.push('the document has no `webhooks` section (no events to list)');
  for (const e of events) {
    if (!e.summary) problems.push(`${e.type}: no summary`);
    if (!e.group) problems.push(`${e.type}: no group tag`);
    if (!e.example || e.example.type !== e.type) problems.push(`${e.type}: no example event of its own type`);
    if (!e.schema?.properties?.data?.properties) problems.push(`${e.type}: no data schema`);
  }
  return problems;
}

/** Text for a table cell: one line, pipes escaped, MDX braces and angle brackets escaped outside `code`. */
const cell = (s) =>
  String(s)
    .replace(/\n+/g, ' ')
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/[{}<>]/g, (c) => `\\${c}`)))
    .join('')
    .replace(/\|/g, '\\|');

function typeOf(s) {
  const types = (Array.isArray(s.type) ? s.type : [s.type]).filter(Boolean);
  const nullable = types.includes('null');
  let t = types.filter((x) => x !== 'null').join(' or ') || 'any';
  if (t === 'array' && s.items?.type) t = `array of ${s.items.type}`;
  if (s.format === 'date-time') t = 'time (RFC 3339)';
  if (s.format === 'uri') t = 'URL';
  const values = (s.enum ?? []).filter((v) => v !== null);
  if (values.length) t = values.map((v) => `\`${v}\``).join(', ');
  return nullable ? `${t}, or null` : t;
}

/** The catalog as Markdown: one section per group, one per event. */
export function renderWebhookEvents(spec) {
  const events = eventsOf(spec);
  const out = [];
  let group = null;
  for (const e of events) {
    if (e.group !== group) {
      group = e.group;
      out.push(`### ${group}`, '');
    }
    out.push(`#### \`${e.type}\``, '', `${cell(e.summary)}. ${cell(e.description)}`.replace(/\.\. /, '. '), '');
    const props = ordered(e.schema.properties.data.properties, e.schema.properties.data.required ?? []);
    out.push('| `data` field | Type | What it is |', '| --- | --- | --- |');
    for (const [name, s] of Object.entries(props)) {
      out.push(`| \`${name}\` | ${cell(typeOf(s))} | ${cell(s.description ?? '')} |`);
    }
    out.push('', '```json', JSON.stringify(exampleInOrder(e), null, 2), '```', '');
  }
  return plainArrows(out.join('\n'));
}
