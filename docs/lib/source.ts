import { llms, loader } from 'fumadocs-core/source';
import { statusBadgesPlugin } from 'fumadocs-core/source/status-badges';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';
import { createElement } from 'react';
import { SITE, docsRoute, markdownPath } from './shared';

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

export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [
    statusBadgesPlugin({
      renderBadge: (status) =>
        createElement('span', { className: 'ch-badge', 'data-status': status }, STATUS_LABEL[status] ?? status),
    }),
  ],
});

export type DocsPage = NonNullable<ReturnType<typeof source.getPage>>;

/** One page as Markdown: the title, where it lives, then its processed body. */
export async function pageMarkdown(page: DocsPage): Promise<string> {
  const status = page.data.status ? `\n\n> ${STATUS_LABEL[page.data.status]}: this page describes work that is not on main yet.` : '';
  const description = page.data.description ? `\n\n${page.data.description}` : '';
  return `# ${page.data.title}\n\nSource: ${SITE.url}${page.url}${description}${status}\n\n${await page.data.getText('processed')}`;
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
    'Every page below is plain Markdown. Add `.md` to any page URL, or send `Accept: text/markdown`, to get the same text. The whole site in one file is at /llms-full.txt.',
    '',
  ];
  const tree = source.getPageTree();
  const walk = (nodes: typeof tree.children, depth: number) => {
    for (const node of nodes) {
      if (node.type === 'separator') {
        lines.push('', `## ${String(node.name ?? '')}`, '');
      } else if (node.type === 'folder') {
        if (depth === 0) lines.push('', `## ${String(node.name)}`, '');
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
    const page = source.getPages().find((p) => p.url === url);
    if (!page) return;
    const desc = page.data.description ? `: ${page.data.description}` : '';
    const status = page.data.status ? ` (${STATUS_LABEL[page.data.status]})` : '';
    lines.push(`- [${page.data.title}](${SITE.url}${markdownPath(page.slugs)})${status}${desc}`);
  };
  walk(tree.children, 0);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
