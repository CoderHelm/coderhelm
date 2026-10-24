// Renders the plugin manifest reference page from the JSON Schema, so the
// page, the schema at /schema/plugin-manifest.v1.json and the validator are
// one source.

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/[<>{}]/g, (c) => `\\${c}`).replace(/\n/g, ' ');

function resolve(schema, node) {
  if (node && node.$ref) {
    const name = node.$ref.replace('#/$defs/', '');
    const target = schema.$defs[name];
    // A $ref with its own description or default keeps them.
    const { $ref, ...rest } = node;
    return { ...target, ...rest };
  }
  return node ?? {};
}

function typeOf(schema, node) {
  node = resolve(schema, node);
  if (node.const !== undefined) return `\`${JSON.stringify(node.const)}\``;
  if (node.enum) return node.enum.map((v) => `\`${v}\``).join(' \\| ');
  if (node.oneOf) return node.oneOf.map((n) => typeOf(schema, n)).join(' or ');
  if (node.type === 'array') {
    const items = resolve(schema, node.items);
    if (items.oneOf) return 'list of objects';
    return `list of ${items.type === 'object' ? 'objects' : typeOf(schema, items)}`;
  }
  if (node.type === 'object') return node.additionalProperties && typeof node.additionalProperties === 'object' ? 'map' : 'object';
  if (Array.isArray(node.type)) return node.type.join(' or ');
  return node.type ?? 'any';
}

const fmtDefault = (v) => (v === undefined ? '' : `\`${JSON.stringify(v)}\``);

function table(schema, node, prefix = '') {
  node = resolve(schema, node);
  const required = new Set(node.required ?? []);
  const rows = ['| Field | Type | Required | Default | Description |', '| --- | --- | --- | --- | --- |'];
  for (const [key, raw] of Object.entries(node.properties ?? {})) {
    if (key === '$schema') continue;
    const prop = resolve(schema, raw);
    let desc = prop.description ?? '';
    if (prop.pattern) desc += ` Must match \`${prop.pattern}\`.`;
    if (prop.maxLength) desc += ` At most ${prop.maxLength} characters.`;
    if (prop.examples) desc += ` Example: ${prop.examples.map((e) => `\`${e}\``).join(', ')}.`;
    rows.push(`| \`${prefix}${key}\` | ${typeOf(schema, raw)} | ${required.has(key) ? 'yes' : 'no'} | ${esc(fmtDefault(prop.default))} | ${esc(desc)} |`);
  }
  return rows.join('\n');
}

export function renderManifestReference(schema) {
  const p = schema.properties;
  const d = schema.$defs;
  const out = [
    '---',
    'title: Manifest reference',
    'description: Every field of plugin.yaml, with its type, default and rules. Rendered from the same JSON Schema that the validator uses.',
    'status: coming-soon',
    'editUrl: "https://github.com/CoderHelm/coderhelm/blob/main/docs/schemas/plugin-manifest.schema.json"',
    'generated: true',
    '---',
    '',
    'A plugin is described by one file, `plugin.yaml`, at the root of its repo. This page is generated from the manifest\'s JSON Schema, published at a stable URL:',
    '',
    '```txt',
    schema.$id,
    '```',
    '',
    'Point your editor at it for completion and inline errors. With the YAML extension for VS Code, put this comment on the first line:',
    '',
    '```yaml title="plugin.yaml"',
    `# yaml-language-server: $schema=${schema.$id}`,
    '```',
    '',
    'Check a plugin against it before you push with the validator: see [Test a plugin locally](/plugins/testing).',
    '',
    '## Top-level fields',
    '',
    esc(schema.description).replace(/\\\|/g, '|'),
    '',
    table(schema, schema),
    '',
    'Fields not listed here are refused, so a typo fails loudly instead of being ignored.',
    '',
    '## settings[]',
    '',
    p.settings.description,
    '',
    table(schema, d.setting, ''),
    '',
    'A `connection` setting needs `provider`. `secret` and `connection` settings are always sensitive.',
    '',
    '## tools[]',
    '',
    p.tools.description,
    'Each entry is one of two shapes.',
    '',
    '### Tools from an MCP server',
    '',
    d.mcpTool.description,
    '',
    table(schema, d.mcpTool),
    '',
    '### A built-in or plugin-defined tool',
    '',
    d.namedTool.description,
    '',
    table(schema, d.namedTool),
    '',
    '### Risk levels',
    '',
    d.risk.description,
    '',
    '## triggers[]',
    '',
    p.triggers.description,
    '',
    '### `on: manual`',
    '',
    d.manualTrigger.description,
    '',
    table(schema, d.manualTrigger),
    '',
    '### `on: schedule`',
    '',
    d.scheduleTrigger.description,
    '',
    table(schema, d.scheduleTrigger),
    '',
    '### `on: github.release`',
    '',
    d.releaseTrigger.description,
    '',
    table(schema, d.releaseTrigger),
    '',
    '## outputs[]',
    '',
    p.outputs.description,
    '',
    '### `type: draft`',
    '',
    table(schema, d.draftOutput),
    '',
    '### `type: publish`',
    '',
    table(schema, d.publishOutput),
    '',
    '#### approval',
    '',
    table(schema, d.publishOutput.properties.approval),
    '',
    '## budget',
    '',
    p.budget.description,
    '',
    table(schema, p.budget),
    '',
  ];
  return out.join('\n');
}
