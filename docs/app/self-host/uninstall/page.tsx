import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { UninstallGuide } from '@/components/uninstall/guide';
import { UNINSTALL_GUIDE } from '@/lib/uninstall/page-info';
import { SITE } from '@/lib/shared';

const image = `/og${UNINSTALL_GUIDE.url}/image.png`;

export const metadata: Metadata = {
  title: UNINSTALL_GUIDE.title,
  description: UNINSTALL_GUIDE.description,
  alternates: { canonical: `${UNINSTALL_GUIDE.url}/`, types: { 'text/markdown': `${UNINSTALL_GUIDE.url}.md` } },
  openGraph: { title: UNINSTALL_GUIDE.title, description: UNINSTALL_GUIDE.description, url: `${UNINSTALL_GUIDE.url}/`, siteName: SITE.name, type: 'website', images: image },
  twitter: { card: 'summary_large_image', images: image },
  // A destructive flow: found from the docs and the install, not from search.
  robots: { index: false, follow: true },
};

// A focused page like the install guide: no sidebar, one task, everything in the browser.
export default function UninstallPage() {
  return (
    <div className="flex min-h-screen flex-col bg-fd-background text-fd-foreground">
      <header className="border-b border-fd-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="CoderHelm Docs home">
            <Logo />
          </Link>
          <Link href="/self-host/" className="text-sm font-medium text-fd-muted-foreground hover:text-fd-foreground">
            Self-hosting docs
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 py-8 sm:py-12">
        <UninstallGuide />
      </main>
    </div>
  );
}
