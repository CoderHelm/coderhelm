import { docsLlms } from '@/lib/source';
import { installGuideMarkdown } from '@/lib/install/page-info';
import { uninstallGuideMarkdown } from '@/lib/uninstall/page-info';

export const revalidate = false;

export async function GET() {
  // The install guide is an app page, not MDX: its Markdown twin goes at the end.
  return new Response(`${await docsLlms.full()}\n\n${installGuideMarkdown()}\n\n${uninstallGuideMarkdown()}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
