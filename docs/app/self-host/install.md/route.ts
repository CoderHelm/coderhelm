import { installGuideMarkdown } from '@/lib/install/page-info';

export const revalidate = false;

/** The install guide's Markdown twin, at /self-host/install.md like every page's. */
export function GET() {
  return new Response(installGuideMarkdown(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
