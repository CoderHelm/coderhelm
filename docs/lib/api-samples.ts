// Example requests in cURL, TypeScript and Python. The API reference pages
// (components/api-page.tsx) and their Markdown twins (lib/api-markdown.ts)
// both use these, so a reader and an agent see the same code.

export interface SampleRequest {
  method: string;
  /** The full URL, query string included. */
  url: string;
  /** Headers besides authentication. */
  headers?: Record<string, string>;
  /** A JSON body, already a value. */
  body?: unknown;
  /** How the request is authenticated. */
  auth: 'api_key' | 'bearer' | 'none';
}

/** The environment variable the samples read the credential from. */
export function tokenVariable(req: Pick<SampleRequest, 'auth' | 'url'>): string | null {
  if (req.auth === 'none') return null;
  return req.auth === 'api_key' ? 'CODERHELM_API_KEY' : 'OIDC_TOKEN';
}

const shellQuote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

export function curlSample(req: SampleRequest): string {
  const lines = [`curl -X ${req.method.toUpperCase()} ${shellQuote(req.url)}`];
  const token = tokenVariable(req);
  if (token) lines.push(`-H "Authorization: Bearer $${token}"`);
  for (const [k, v] of Object.entries(req.headers ?? {})) lines.push(`-H ${shellQuote(`${k}: ${v}`)}`);
  if (req.body !== undefined) {
    lines.push(`-H 'Content-Type: application/json'`);
    lines.push(`-d ${shellQuote(JSON.stringify(req.body, null, 2))}`);
  }
  return lines.join(' \\\n  ');
}

function indent(text: string, by = '  '): string {
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? l : by + l))
    .join('\n');
}

export function typescriptSample(req: SampleRequest): string {
  const token = tokenVariable(req);
  const headers: string[] = [];
  if (token) headers.push(`Authorization: \`Bearer \${process.env.${token}}\`,`);
  for (const [k, v] of Object.entries(req.headers ?? {})) headers.push(`${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  if (req.body !== undefined) headers.push(`'Content-Type': 'application/json',`);
  const options = [`method: '${req.method.toUpperCase()}',`];
  if (headers.length) options.push(`headers: {\n  ${headers.join('\n  ')}\n},`);
  if (req.body !== undefined) options.push(`body: JSON.stringify(${indent(JSON.stringify(req.body, null, 2))}),`);
  return [
    `const res = await fetch(${JSON.stringify(req.url)}, {`,
    `  ${indent(options.join('\n'))}`,
    `});`,
    `if (!res.ok) {`,
    `  const { error, code } = await res.json();`,
    `  throw new Error(\`\${res.status} \${code}: \${error}\`);`,
    `}`,
    `const data = await res.json();`,
  ].join('\n');
}

function pythonValue(v: unknown, depth = 0): string {
  const pad = '    '.repeat(depth + 1);
  const end = '    '.repeat(depth);
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return `[\n${v.map((x) => pad + pythonValue(x, depth + 1)).join(',\n')},\n${end}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${pythonValue(x, depth + 1)}`).join(',\n')},\n${end}}`;
}

export function pythonSample(req: SampleRequest): string {
  const token = tokenVariable(req);
  const lines = ['import os', 'import requests', ''];
  const headers: string[] = [];
  if (token) headers.push(`    "Authorization": f"Bearer {os.environ['${token}']}",`);
  for (const [k, v] of Object.entries(req.headers ?? {})) headers.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const args = [`"${req.method.toUpperCase()}"`, JSON.stringify(req.url)];
  if (headers.length) {
    lines.push('headers = {', ...headers, '}');
    args.push('headers=headers');
  }
  if (req.body !== undefined) {
    lines.push(`body = ${pythonValue(req.body)}`);
    args.push('json=body');
  }
  if (!token) lines.splice(0, 1);
  lines.push(
    `res = requests.request(${args.join(', ')})`,
    'if not res.ok:',
    '    raise RuntimeError(f"{res.status_code}: {res.json().get(\'error\')}")',
    'data = res.json()',
  );
  return lines.join('\n');
}

/** The samples a page shows, in tab order. */
export const SAMPLE_LANGUAGES = [
  { id: 'curl', label: 'cURL', lang: 'bash', generate: curlSample },
  { id: 'ts', label: 'TypeScript', lang: 'ts', generate: typescriptSample },
  { id: 'python', label: 'Python', lang: 'python', generate: pythonSample },
] as const;
