// The public API's OpenAPI document, generated from the gateway's code in
// coderhelm-platform (services/gateway/src/openapi.rs) and committed there at
// docs/api/openapi.json. The docs read it at the pinned commit, check it, and
// publish it at /openapi.json; the API reference pages are generated from it.

/** Where the document lives in the platform repo. */
export const SPEC_PATH = 'docs/api/openapi.json';

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

/**
 * Problems that would make the reference wrong or empty: an empty list means
 * the document is fit to render.
 */
export function checkSpec(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object') return ['not a JSON object'];
  if (!/^3\.1\./.test(String(spec.openapi))) problems.push(`openapi is ${spec.openapi}, expected 3.1.x`);
  if (!spec.info?.title) problems.push('info.title is missing');
  if (!Array.isArray(spec.servers) || !spec.servers.length) problems.push('no servers');
  const tags = new Set((spec.tags ?? []).map((t) => t.name));
  const ids = new Set();
  let operations = 0;
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op) continue;
      operations++;
      const at = `${method.toUpperCase()} ${path}`;
      if (!op.operationId) problems.push(`${at}: no operationId`);
      else if (ids.has(op.operationId)) problems.push(`${at}: operationId ${op.operationId} is used twice`);
      ids.add(op.operationId);
      if (!op.summary) problems.push(`${at}: no summary`);
      if (op.tags?.length !== 1) problems.push(`${at}: needs exactly one tag`);
      else if (!tags.has(op.tags[0])) problems.push(`${at}: tag ${op.tags[0]} is not described in tags`);
      if (!op.responses || !Object.keys(op.responses).some((s) => s.startsWith('2'))) problems.push(`${at}: no success response`);
    }
  }
  if (operations === 0) problems.push('no operations');
  return problems;
}

/** Every operation as `{ method, path, tag, summary }`, in document order. */
export function operationsOf(spec) {
  const out = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (op) out.push({ method: method.toUpperCase(), path, tag: op.tags?.[0] ?? '', summary: op.summary ?? '' });
    }
  }
  return out;
}
