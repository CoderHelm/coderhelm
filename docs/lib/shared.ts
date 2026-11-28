// Site-wide constants. Every URL the site prints is built from these, so the
// Markdown twins, llms.txt, the sitemap and the pages agree.

export const SITE = {
  name: 'CoderHelm Docs',
  product: 'CoderHelm',
  url: 'https://docs.coderhelm.com',
  appUrl: 'https://app.coderhelm.com',
  homeUrl: 'https://coderhelm.com',
  description:
    'Guides and reference for CoderHelm: connect GitHub and Jira, run the coder and the reviewer, ask Chat about your code, self-host it in your own AWS account, and call the API.',
} as const;

/** The docs live at the root of docs.coderhelm.com. */
export const docsRoute = '/';
export const docsImageRoute = '/og';

/** Where this site's own pages are edited. */
export const gitConfig = {
  user: 'CoderHelm',
  repo: 'coderhelm',
  branch: 'main',
  contentDir: 'docs/content/docs',
};

/**
 * "Moving from CoderHelm cloud?": an email to support with the topic in the
 * subject. A person helps with the move; there is no automatic migration tool.
 * coderhelm.com's /self-host/ page uses the same address.
 */
export const MOVE_TO_SELF_HOST_URL = 'mailto:support@coderhelm.com?subject=Moving%20to%20self-hosted%20CoderHelm';

/** The JSON Schema for plugin manifests, served at a stable URL. */
export const PLUGIN_SCHEMA_PATH = '/schema/plugin-manifest.v1.json';

/** The raw Markdown twin of a page: /index.md for the home page, /a/b.md otherwise. */
export function markdownPath(slugs: string[]): string {
  return slugs.length === 0 ? '/index.md' : `/${slugs.join('/')}.md`;
}

/** The Open Graph image of a page, rendered at build time. */
export function imagePath(slugs: string[]): { segments: string[]; url: string } {
  const segments = [...slugs, 'image.png'];
  return { segments, url: `${docsImageRoute}/${segments.join('/')}` };
}

/**
 * Folders of content/docs that scripts/import-platform.mjs writes (they are
 * git-ignored), mapped to where this repo keeps the pages copied into them.
 * Pages imported from the platform repo carry their own editUrl.
 */
export const COPIED_CONTENT: Record<string, string> = {
  'self-host/': 'docs/content/self-host-site/',
};

/** "Edit this page" link: imported pages name their own source; copied pages point at the file they are copied from. */
export function editUrl(pagePath: string, override?: string): string {
  if (override) return override;
  const prefix = Object.keys(COPIED_CONTENT).find((p) => pagePath.startsWith(p));
  const file = prefix ? `${COPIED_CONTENT[prefix]}${pagePath.slice(prefix.length)}` : `${gitConfig.contentDir}/${pagePath}`;
  return `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/${file}`;
}
