import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { InstallWizard } from '@/components/install/wizard';
import { INSTALL_GUIDE } from '@/lib/install/page-info';
import { SITE } from '@/lib/shared';

const image = `/og${INSTALL_GUIDE.url}/image.png`;

export const metadata: Metadata = {
  title: INSTALL_GUIDE.title,
  description: INSTALL_GUIDE.description,
  alternates: { canonical: `${INSTALL_GUIDE.url}/`, types: { 'text/markdown': `${INSTALL_GUIDE.url}.md` } },
  openGraph: { title: INSTALL_GUIDE.title, description: INSTALL_GUIDE.description, url: `${INSTALL_GUIDE.url}/`, siteName: SITE.name, type: 'website', images: image },
  twitter: { card: 'summary_large_image', images: image },
};

// A focused page: no sidebar, one task. The guide itself is a client
// component (components/install/wizard.tsx); everything it does happens in
// the browser, against AWS, GitHub and the person's own install.
export default function InstallPage() {
  return (
    <div className="flex min-h-screen flex-col bg-fd-background text-fd-foreground">
      <header className="border-b border-fd-border">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="CoderHelm Docs home">
            <Logo />
          </Link>
          <Link href="/self-host/" className="text-sm font-medium text-fd-muted-foreground hover:text-fd-foreground">
            Self-hosting docs
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 py-10 sm:py-14">
        <InstallWizard />
      </main>
    </div>
  );
}
