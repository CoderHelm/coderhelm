import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { SITE } from '@/lib/shared';
import { INSTALL_GUIDE } from '@/lib/install/page-info';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...source.getPages().map((page) => ({
      url: `${SITE.url}${page.url}`,
      changeFrequency: 'weekly' as const,
      priority: page.slugs.length === 0 ? 1 : 0.7,
    })),
    // The browser install guide: an app page, not MDX.
    { url: `${SITE.url}${INSTALL_GUIDE.url}`, changeFrequency: 'weekly' as const, priority: 0.8 },
  ];
}
