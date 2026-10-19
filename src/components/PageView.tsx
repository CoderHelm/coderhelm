import Link from "next/link";
import type { Block, Page, Section } from "@/content/types";
import { SITE, pageBySlug } from "@/content/site";
import { pageJsonLd, jsonLdString } from "@/lib/seo";
import { Inline } from "./Md";
import { Frame } from "./Frames";
import Nav from "./Nav";
import Footer from "./Footer";

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p className="max-w-2xl text-[17px] leading-relaxed text-text-secondary">
          <Inline text={block.text} />
        </p>
      );
    case "list":
      return (
        <ul className="grid max-w-3xl gap-2.5">
          {block.items.map((t) => (
            <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-text-secondary">
              <svg className="mt-[5px] h-4 w-4 flex-none text-accent-text" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span><Inline text={t} /></span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {block.items.map((s, i) => (
            <li key={s.title} className="bg-surface p-6">
              <span className="font-mono text-xs text-accent-text">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-base font-semibold text-text-primary">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-text-secondary"><Inline text={s.text} /></p>
            </li>
          ))}
        </ol>
      );
    case "cards":
      return (
        // Pick columns that fill every row, so no empty cell shows.
        <ul className={`grid gap-px overflow-hidden rounded-xl border border-line bg-line ${block.items.length % 3 === 0 ? (block.items.length === 3 ? "md:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3") : "sm:grid-cols-2"}`}>
          {block.items.map((c) => (
            <li key={c.title} className="relative bg-surface p-6 transition-colors has-[a]:hover:bg-surface-raised">
              <h3 className="text-[15px] font-semibold text-text-primary">
                {c.href ? (
                  <Link href={c.href} className="after:absolute after:inset-0">
                    {c.title} <span aria-hidden="true" className="text-text-muted">→</span>
                  </Link>
                ) : (
                  c.title
                )}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-text-secondary"><Inline text={c.text} /></p>
            </li>
          ))}
        </ul>
      );
    case "faq":
      return (
        <div className="max-w-3xl divide-y divide-line border-y border-line">
          {block.items.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-left text-[15px] font-medium text-text-primary [&::-webkit-details-marker]:hidden">
                <h3>{f.q}</h3>
                <span aria-hidden="true" className="text-xl leading-none text-text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-5 pr-8 text-[15px] leading-relaxed text-text-secondary"><Inline text={f.a} /></p>
            </details>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-raised text-text-primary">
              <tr>{block.head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line text-text-secondary">
              {block.rows.map((r) => (
                <tr key={r.join("|")}>
                  {r.map((c, i) => (
                    <td key={i} className={`px-4 py-3 align-top ${i === 0 ? "font-medium text-text-primary" : ""}`}><Inline text={c} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "frame":
      return <Frame id={block.id} caption={block.caption} />;
  }
}

export function SectionView({ section }: { section: Section }) {
  const frame = section.blocks.find((b) => b.type === "frame");
  // A frame beside short text reads better side by side on wide screens.
  const split = Boolean(frame) && section.blocks.every((b) => b.type === "frame" || b.type === "p" || b.type === "list");
  const text = section.blocks.filter((b) => !split || b.type !== "frame");
  const heading = (
    <>
      {section.eyebrow && <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent-text">{section.eyebrow}</p>}
      <h2 id={`${section.id}-h`} className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
        {section.heading}
      </h2>
    </>
  );
  return (
    <section id={section.id} aria-labelledby={`${section.id}-h`} className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        {split ? (
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-14 [&>*]:min-w-0">
            <div>
              {heading}
              <div className="mt-8 grid grid-cols-1 gap-6 [&>*]:min-w-0">
                {text.map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
              </div>
            </div>
            <BlockView block={frame!} />
          </div>
        ) : (
          <>
            {heading}
            <div className="mt-8 grid grid-cols-1 gap-8 [&>*]:min-w-0">
              {text.map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function Cta({ heading = "Put CoderHelm on your next ticket." }: { heading?: string }) {
  return (
    <section aria-labelledby="cta-h" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <h2 id="cta-h" className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{heading}</h2>
        <p className="mx-auto mt-4 max-w-xl text-[17px] text-text-secondary">{SITE.ctaNote}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={SITE.appUrl} className="rounded-md bg-white px-5 py-2.5 text-[15px] font-semibold text-black hover:opacity-90">Get started</a>
          <Link href="/contact/" className="rounded-md border border-line px-5 py-2.5 text-[15px] font-medium text-text-primary hover:bg-surface-raised">Talk to us</Link>
        </div>
      </div>
    </section>
  );
}

export function Shell({ page, children }: { page: Page; children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(pageJsonLd(page)) }} />
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}

// A product page: hero, then its sections, then related pages and the CTA.
export default function PageView({ page }: { page: Page }) {
  const related = (page.related ?? []).map(pageBySlug).filter((p): p is Page => Boolean(p));
  return (
    <Shell page={page}>
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        <nav aria-label="Breadcrumb" className="text-sm text-text-muted">
          <ol className="flex gap-2">
            <li><Link href="/" className="hover:text-text-primary">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-text-secondary">{page.navLabel}</li>
          </ol>
        </nav>
        {page.eyebrow && <p className="mt-8 font-mono text-xs uppercase tracking-[0.14em] text-accent-text">{page.eyebrow}</p>}
        <h1 className="mt-3 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">{page.h1}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary"><Inline text={page.lede} /></p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={SITE.appUrl} className="rounded-md bg-white px-5 py-2.5 text-[15px] font-semibold text-black hover:opacity-90">Get started</a>
          <a href={`/${page.slug}.md`} className="rounded-md border border-line px-5 py-2.5 text-[15px] font-medium text-text-secondary hover:text-text-primary">Read as Markdown</a>
        </div>
        {page.heroFrame && (
          <div className="mt-14">
            <Frame id={page.heroFrame.id} caption={page.heroFrame.caption} priority />
          </div>
        )}
      </div>
      {page.sections.map((s) => (
        <SectionView key={s.id} section={s} />
      ))}
      {related.length > 0 && (
        <section aria-labelledby="related-h" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="related-h" className="text-xl font-semibold">Related</h2>
            <ul className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <li key={p.slug} className="relative bg-surface p-5 hover:bg-surface-raised">
                  <Link href={p.path} className="font-medium text-text-primary after:absolute after:inset-0">{p.navLabel} <span aria-hidden="true" className="text-text-muted">→</span></Link>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{p.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <Cta />
    </Shell>
  );
}
