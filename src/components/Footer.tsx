import Link from "next/link";
import { SITE, pages } from "@/content/site";
import { Logo } from "./Logo";

export default function Footer() {
  const product = pages.filter((p) => p.slug !== "" && p.kind !== "legal");
  const legal = pages.filter((p) => p.kind === "legal" && p.slug !== "contact");
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo />
            {SITE.name}
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">{SITE.tagline}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Product</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {product.map((p) => (
              <li key={p.slug}>
                <Link href={p.path} className="text-text-secondary hover:text-text-primary">
                  {p.navLabel}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">For agents</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a href="/llms.txt" className="text-text-secondary hover:text-text-primary">llms.txt</a></li>
            <li><a href="/llms-full.txt" className="text-text-secondary hover:text-text-primary">llms-full.txt</a></li>
            <li><a href="/index.md" className="text-text-secondary hover:text-text-primary">This site in Markdown</a></li>
            <li><a href="/sitemap.xml" className="text-text-secondary hover:text-text-primary">Sitemap</a></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Company</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/contact/" className="text-text-secondary hover:text-text-primary">Contact</Link></li>
            {legal.map((p) => (
              <li key={p.slug}>
                <Link href={p.path} className="text-text-secondary hover:text-text-primary">
                  {p.navLabel}
                </Link>
              </li>
            ))}
            <li><a href={`mailto:${SITE.email}`} className="text-text-secondary hover:text-text-primary">{SITE.email}</a></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-6xl border-t border-line px-4 py-6 text-xs text-text-muted sm:px-6">
        © {SITE.year} {SITE.name}. Updated {SITE.updatedLabel}.
      </div>
    </footer>
  );
}
