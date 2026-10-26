import { llms, loader } from 'fumadocs-core/source';
import { statusBadgesPlugin } from 'fumadocs-core/source/status-badges';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';
import { createElement } from 'react';
import { SITE, docsRoute, markdownPath } from './shared';
import { openapi } from './openapi';
import { operationMarkdown } from './api-markdown';
import { INSTALL_GUIDE } from './install/page-info';
import { diagramsAsText } from './diagrams/text.mjs';

/**
 * Page frontmatter. `status: coming-soon` marks a page that documents work not
 * yet on main; it shows as a badge in the sidebar and on the page. `editUrl`
 * points "Edit this page" somewhere other than this repo (imported pages).
 */
export const frontmatterSchema = pageSchema.extend({
  status: z.enum(['coming-soon', 'new']).optional(),
  editUrl: z.string().url().optional(),
  /** Written by a build script; the edit link goes to the script's source. */
  generated: z.boolean().optional(),
});

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export const STATUS_LABEL: Record<string, string> = {
  'coming-soon': 'Coming soon',
  new: 'New',
};

/**
 * The docs, plus one page per public API endpoint under /api/reference/,
 * generated from the OpenAPI document (lib/openapi.ts) and grouped by
 * resource (the document's tags).
 */
export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    openapi: await openapi.staticSource({
      baseDir: 'api/reference',
      per: 'operation',
      groupBy: 'tag',
      meta: true,
      // /api/reference/runs/list-runs/ from the operation id `listRuns`.
      name(output) {
        if (output.type !== 'operation') return output.item.name;
        const op = (this.document.paths?.[output.item.path] as Record<string, { operationId?: string }> | undefined)?.[
          output.item.method
        ];
        const id = op?.operationId ?? `${output.item.method}-${output.item.path}`;
        return id
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase();
      },
    }),
  },
  {
    baseUrl: docsRoute,
    plugins: [
      openapi.loaderPlugin(),
      statusBadgesPlugin({
        renderBadge: (status) =>
          createElement('span', { className: 'ch-badge', 'data-status': status }, STATUS_LABEL[status] ?? status),
      }),
    ],
  },
);

export type DocsPage = NonNullable<ReturnType<typeof source.getPage>>;

/** A hand-written page's status badge, if it has one (generated pages have none). */
export function pageStatus(page: DocsPage): string | undefined {
  return page.type === 'docs' ? page.data.status : undefined;
}

/** One page as Markdown: the title, where it lives, then its body. */
export async function pageMarkdown(page: DocsPage): Promise<string> {
  const description = page.data.description ? `\n\n${page.data.description}` : '';
  if (page.type === 'openapi') {
    const { bundled } = page.data.getSchema();
    const ops = page.data.getOpenAPIPageProps().operations ?? [];
    const body = ops.map((op) => operationMarkdown(bundled, op)).join('\n');
    // The operation's own description opens the body, so it isn't repeated here.
    return `# ${page.data.title}\n\nSource: ${SITE.url}${page.url}\n\n${body}`;
  }
  const status = page.data.status ? `\n\n> ${STATUS_LABEL[page.data.status]}: this page describes work that is not on main yet.` : '';
  return `# ${page.data.title}\n\nSource: ${SITE.url}${page.url}${description}${status}\n\n${diagramsAsText(await page.data.getText('processed'))}`;
}

export const docsLlms = llms(source, {
  renderPage: pageMarkdown,
});

/** llms.txt: what the site is, then every page as a link to its Markdown twin. */
export function llmsIndex(): string {
  const lines = [
    `# ${SITE.product}`,
    '',
    `> ${SITE.description}`,
    '',
    'Every page below is plain Markdown. Add `.md` to any page URL, or send `Accept: text/markdown`, to get the same text. The whole site in one file is at /llms-full.txt. The API is also described by an OpenAPI 3.1 document at /openapi.json.',
    '',
  ];
  const tree = source.getPageTree();
  const walk = (nodes: typeof tree.children, depth: number) => {
    for (const node of nodes) {
      if (node.type === 'separator') {
        lines.push('', `## ${String(node.name ?? '')}`, '');
      } else if (node.type === 'folder') {
        // A folder's name can be an element (a title with its badge): use its page's title then.
        const index = node.index ? source.getPages().find((p) => p.url === node.index?.url) : undefined;
        const name = typeof node.name === 'string' ? node.name : (index?.data.title ?? '');
        if (depth === 0) lines.push('', `## ${name}`, '');
        if (node.index) pushPage(node.index.url);
        walk(node.children, depth + 1);
      } else {
        pushPage(node.url);
      }
    }
  };
  const seen = new Set<string>();
  const pushPage = (url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    if (url.replace(/\/$/, '') === INSTALL_GUIDE.url) {
      // The sidebar's link to the browser install guide (an app page, not MDX).
      lines.push(`- [${INSTALL_GUIDE.title}](${SITE.url}${INSTALL_GUIDE.url}.md): ${INSTALL_GUIDE.description}`);
      return;
    }
    const page = source.getPages().find((p) => p.url === url);
    if (!page) return;
    const desc = page.data.description ? `: ${page.data.description}` : '';
    const s = pageStatus(page);
    const status = s ? ` (${STATUS_LABEL[s]})` : '';
    lines.push(`- [${page.data.title}](${SITE.url}${markdownPath(page.slugs)})${status}${desc}`);
  };
  walk(tree.children, 0);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
