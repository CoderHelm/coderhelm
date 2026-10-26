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

/** "Edit this page" link: imported pages name their own source. */
export function editUrl(pagePath: string, override?: string): string {
  if (override) return override;
  return `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/${gitConfig.contentDir}/${pagePath}`;
}
