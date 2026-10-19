import Link from "next/link";
import { SITE, pageBySlug } from "@/content/site";
import { pageMetadata } from "@/lib/seo";
import { Shell, SectionView, Cta } from "@/components/PageView";
import { Frame } from "@/components/Frames";
import { Inline } from "@/components/Md";

const page = pageBySlug("")!;

export const metadata = pageMetadata(page);

export default function Home() {
  return (
    <Shell page={page}>
      <section aria-labelledby="hero-h" className="relative overflow-hidden">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1 text-xs text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
            {page.eyebrow} · GitHub and Jira
          </p>
          <h1 id="hero-h" className="mt-6 max-w-4xl text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-7xl">
            {page.h1}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary sm:text-xl">
            <Inline text={page.lede} />
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href={SITE.appUrl} className="rounded-md bg-white px-5 py-3 text-[15px] font-semibold text-black hover:opacity-90">
              Get started
            </a>
            <Link href="#how-it-works" className="rounded-md border border-line px-5 py-3 text-[15px] font-medium text-text-primary hover:bg-surface-raised">
              See how it works
            </Link>
          </div>
          <p className="mt-4 text-sm text-text-muted">{SITE.ctaNote}</p>
          <div className="mt-16">
            <Frame id={page.heroFrame!.id} caption={page.heroFrame!.caption} priority />
          </div>
        </div>
      </section>
      {page.sections.map((s) => (
        <SectionView key={s.id} section={s} />
      ))}
      <Cta />
    </Shell>
  );
}
