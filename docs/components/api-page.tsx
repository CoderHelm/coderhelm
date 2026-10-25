'use client';
import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { SAMPLE_LANGUAGES, type SampleRequest } from '@/lib/api-samples';

/** How an operation is authenticated, from its path (see the Authentication page). */
function authOf(url: string): SampleRequest['auth'] {
  const path = new URL(url).pathname;
  if (path.startsWith('/api/')) return 'api_key';
  if (path.startsWith('/webhooks/ci/')) return 'bearer';
  return 'none';
}

// cURL, TypeScript and Python, from the same builder the Markdown twins use.
const codeUsages = createCodeUsageGeneratorRegistry();
for (const l of SAMPLE_LANGUAGES) {
  codeUsages.add(l.id, {
    label: l.label,
    lang: l.lang,
    generate(data) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.header)) {
        if (k.toLowerCase() !== 'authorization') headers[k] = String(v.value);
      }
      return l.generate({
        method: data.method,
        url: data.url,
        headers,
        body: data.body === undefined || data.body === null || data.body === '' ? undefined : data.body,
        auth: authOf(data.url),
      });
    },
  });
}

// No try-it console: the API accepts cross-origin calls only from the
// dashboard, with credentials, so a browser console on this site can't reach
// it safely. Each page shows copyable requests instead.
export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  playground: { enabled: false },
  schemaUI: { showExample: true },
});
