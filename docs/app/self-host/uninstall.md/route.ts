import { uninstallGuideMarkdown } from '@/lib/uninstall/page-info';

export const revalidate = false;

/** The uninstall guide's Markdown twin, at /self-host/uninstall.md like every page's. */
export function GET() {
  return new Response(uninstallGuideMarkdown(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
