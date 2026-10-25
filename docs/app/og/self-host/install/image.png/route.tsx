import { generateOGImage } from 'fumadocs-ui/og';
import { SITE } from '@/lib/shared';
import { INSTALL_GUIDE } from '@/lib/install/page-info';

export const revalidate = false;

/** The install guide's Open Graph image (it is not an MDX page, so the shared route can't make it). */
export function GET() {
  return generateOGImage({
    title: INSTALL_GUIDE.title,
    description: 'One click into your own AWS account. GitHub and models checked for you.',
    site: SITE.name,
    primaryColor: 'rgba(59,130,246,0.35)',
    primaryTextColor: 'rgb(110,168,255)',
  });
}
