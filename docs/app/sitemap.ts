import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { SITE } from '@/lib/shared';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: `${SITE.url}${page.url}`,
    changeFrequency: 'weekly',
    priority: page.slugs.length === 0 ? 1 : 0.7,
  }));
}
