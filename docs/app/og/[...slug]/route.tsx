import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { generateOGImage } from 'fumadocs-ui/og';
import { SITE, imagePath } from '@/lib/shared';

export const revalidate = false;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();
  return generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: SITE.name,
    primaryColor: 'rgba(59,130,246,0.35)',
    primaryTextColor: 'rgb(110,168,255)',
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: imagePath(page.slugs).segments }));
}
