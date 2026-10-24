import schema from '@/schemas/plugin-manifest.schema.json';

export const revalidate = false;

// The plugin manifest's JSON Schema at a stable URL. The manifest reference
// page is rendered from the same file, so the two cannot disagree.
export function GET() {
  return new Response(JSON.stringify(schema, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/schema+json; charset=utf-8' },
  });
}
