import { generateOGImage } from 'fumadocs-ui/og';
import { SITE } from '@/lib/shared';
import { UNINSTALL_GUIDE } from '@/lib/uninstall/page-info';

export const revalidate = false;

/** The uninstall guide's Open Graph image (it is not an MDX page, so the shared route can't make it). */
export function GET() {
  return generateOGImage({
    title: UNINSTALL_GUIDE.title,
    description: 'Keep your data or delete everything. Scoped to one install, checked at the end.',
    site: SITE.name,
    primaryColor: 'rgba(59,130,246,0.35)',
    primaryTextColor: 'rgb(110,168,255)',
  });
}
