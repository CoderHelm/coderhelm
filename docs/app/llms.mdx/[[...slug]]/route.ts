import { pageMarkdown, source } from '@/lib/source';
import { notFound } from 'next/navigation';

export const revalidate = false;

// Every page's Markdown twin, rendered from the same MDX as the page. The
// export writes them under /llms.mdx/<slug>/content.md; scripts/postbuild.mjs
// moves each to /<slug>.md (and /index.md), the URL the pages link to.
export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug?.slice(0, -1));
  if (!page) notFound();
  return new Response(await pageMarkdown(page), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: [...page.slugs, 'content.md'] }));
}
