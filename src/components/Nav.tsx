import Link from "next/link";
import { SITE, featureMenu, navPages } from "@/content/site";
import { Logo } from "./Logo";
import { MenuCloser } from "./MenuCloser";

// Server rendered. The Features menu and the phone menu are <details>
// elements, so the nav works with no JavaScript at all; MenuCloser adds Escape
// and a press outside to close them. Each page renders its own Nav (keyed by
// page), so an open menu closes on the next page. The summaries are not
// selectable: quick repeated clicks on one count as a triple click, which
// selects the whole <details> block, the open panel's links included.
export default function Nav() {
  const links = navPages();
  const groups = featureMenu();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded focus:bg-white focus:px-3 focus:py-1.5 focus:text-sm focus:text-black">
        Skip to content
      </a>
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded text-[15px] font-semibold" aria-label={`${SITE.name} home`}>
          <Logo />
          <span>{SITE.name}</span>
        </Link>

        <ul className="hidden items-center gap-7 lg:flex">
          <li>
            <details data-menu className="group relative">
              <summary className="flex cursor-pointer select-none list-none items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary group-open:text-text-primary [&::-webkit-details-marker]:hidden">
                Features
                <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <div className="absolute left-0 top-full mt-4 grid w-[600px] grid-cols-3 gap-6 rounded-xl border border-line bg-surface p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
                {groups.map((g) => (
                  <div key={g.title}>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">{g.title}</p>
                    <ul className="mt-3 grid gap-2.5">
                      {g.pages.map((p) => (
                        <li key={p.slug}>
                          <Link href={p.path} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
                            {p.navLabel}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </li>
          {links.map((p) => (
            <li key={p.slug}>
              <Link href={p.path} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
                {p.navLabel}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-5 lg:flex">
          <a href={SITE.docsUrl} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
            Docs
          </a>
          <a href={SITE.appUrl} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
            Sign in
          </a>
          <a href={SITE.appUrl} className="rounded-md bg-white px-3.5 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90">
            Get started
          </a>
        </div>

        <details data-menu className="group relative lg:hidden">
          <summary className="flex h-10 w-10 cursor-pointer select-none list-none items-center justify-center rounded-md text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <svg className="h-5 w-5 group-open:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg className="hidden h-5 w-5 group-open:block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </summary>
          <div className="fixed inset-x-0 top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-line bg-surface px-4 pb-6 pt-2">
            {groups.map((g) => (
              <div key={g.title} className="mt-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">{g.title}</p>
                <ul className="mt-1 grid grid-cols-2 gap-x-4">
                  {g.pages.map((p) => (
                    <li key={p.slug}>
                      <Link href={p.path} className="block border-b border-line py-2.5 text-[15px] text-text-secondary hover:text-text-primary">
                        {p.navLabel}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <ul className="mt-3 flex flex-col">
              {links.filter((p) => !groups.some((g) => g.pages.includes(p))).map((p) => (
                <li key={p.slug}>
                  <Link href={p.path} className="block border-b border-line py-3 text-[15px] text-text-secondary hover:text-text-primary">
                    {p.navLabel}
                  </Link>
                </li>
              ))}
              <li>
                <a href={SITE.docsUrl} className="block border-b border-line py-3 text-[15px] text-text-secondary hover:text-text-primary">
                  Docs
                </a>
              </li>
            </ul>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <a href={SITE.appUrl} className="rounded-md border border-line px-4 py-2.5 text-center text-sm text-text-primary">
                Sign in
              </a>
              <a href={SITE.appUrl} className="rounded-md bg-white px-4 py-2.5 text-center text-sm font-semibold text-black">
                Get started
              </a>
            </div>
          </div>
        </details>
      </nav>
      <MenuCloser />
    </header>
  );
}
