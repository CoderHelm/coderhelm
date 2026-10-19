import Link from "next/link";
import { SITE, pageBySlug } from "@/content/site";
import { pageMetadata } from "@/lib/seo";
import { Shell, SectionView, Cta } from "@/components/PageView";
import { Inline } from "@/components/Md";

const page = pageBySlug("")!;

export const metadata = pageMetadata(page);

// The story's steps, for the strip under the hero that jumps to each one.
const steps = page.sections.flatMap((s) => s.blocks.flatMap((b) => (b.type === "story" ? b.chapters.flatMap((c) => c.steps) : [])));

// "Ship code, not tickets." The words before the comma carry the accent.
function HeroLine({ text }: { text: string }) {
  const i = text.indexOf(",");
  if (i < 0) return <>{text}</>;
  return (
    <>
      <span className="hero-accent">{text.slice(0, i + 1)}</span>
      {text.slice(i + 1)}
    </>
  );
}

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
          <h1 id="hero-h" className="mt-6 max-w-4xl text-balance text-[2.75rem] font-semibold leading-[1.05] tracking-tight sm:text-7xl lg:text-8xl">
            <HeroLine text={page.h1} />
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
          <nav aria-label="The life of a ticket" className="mt-14 sm:mt-20">
            <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4 lg:grid-cols-8">
              {steps.map((st, i) => (
                <li key={st.id} className="bg-surface">
                  <a href={`#${st.id}`} className="group flex h-full flex-col gap-1.5 p-3.5 transition-colors hover:bg-surface-raised sm:p-4">
                    <span className="flex items-center gap-2 font-mono text-[11px] text-text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13px] font-medium leading-snug text-text-secondary group-hover:text-text-primary">{st.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>
      {page.sections.map((s) => (
        <SectionView key={s.id} section={s} />
      ))}
      <Cta />
    </Shell>
  );
}
