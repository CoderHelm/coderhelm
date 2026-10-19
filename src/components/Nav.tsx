import Link from "next/link";
import { SITE, navPages } from "@/content/site";
import { Logo } from "./Logo";

// Server rendered. The phone menu is a <details> element, so the nav works
// with no JavaScript at all.
export default function Nav() {
  const links = navPages();
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
          {links.map((p) => (
            <li key={p.slug}>
              <Link href={p.path} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
                {p.navLabel}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-5 lg:flex">
          <a href={SITE.appUrl} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
            Sign in
          </a>
          <a href={SITE.appUrl} className="rounded-md bg-white px-3.5 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90">
            Get started
          </a>
        </div>

        <details className="group relative lg:hidden">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <svg className="h-5 w-5 group-open:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg className="hidden h-5 w-5 group-open:block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </summary>
          <div className="fixed inset-x-0 top-14 border-b border-line bg-surface px-4 pb-6 pt-2">
            <ul className="flex flex-col">
              {links.map((p) => (
                <li key={p.slug}>
                  <Link href={p.path} className="block border-b border-line py-3 text-[15px] text-text-secondary hover:text-text-primary">
                    {p.navLabel}
                  </Link>
                </li>
              ))}
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
    </header>
  );
}
