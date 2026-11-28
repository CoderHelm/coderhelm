import Link from "next/link";
import type { Block, Section } from "@/content/types";
import { SITE, pageBySlug } from "@/content/site";
import { pageMetadata } from "@/lib/seo";
import { Shell } from "@/components/PageView";
import { Inline } from "@/components/Md";
import { PullRequestView } from "@/components/PullRequest";
import { ProductShot } from "@/components/ProductShot";

const page = pageBySlug("")!;

export const metadata = pageMetadata(page);

// The words live in src/content/site.ts, so the Markdown twin, llms.txt and
// this page say the same thing. Each section gets its own layout here.
function section(id: string): Section {
  const s = page.sections.find((x) => x.id === id);
  if (!s) throw new Error(`home section ${id} is missing`);
  return s;
}

function first<T extends Block["type"]>(s: Section, type: T): Extract<Block, { type: T }> {
  const b = s.blocks.find((x): x is Extract<Block, { type: T }> => x.type === type);
  if (!b) throw new Error(`home section ${s.id} has no ${type} block`);
  return b;
}

function all<T extends Block["type"]>(s: Section, type: T): Extract<Block, { type: T }>[] {
  return s.blocks.filter((x): x is Extract<Block, { type: T }> => x.type === type);
}

// Every section, the nav and the footer share one container.
const wrap = "mx-auto max-w-6xl px-4 sm:px-6";

// A screenshot set in a quiet window frame.
const frame = "overflow-hidden rounded-xl border border-line bg-panel shadow-[0_1px_2px_rgba(24,24,27,0.04),0_24px_48px_-24px_rgba(24,24,27,0.18)]";

const primary = "inline-flex items-center rounded-md bg-text-primary px-5 py-2.5 text-[15px] font-medium text-surface transition-opacity hover:opacity-85";
const quiet = "inline-flex items-center text-[15px] font-medium text-text-primary underline decoration-text-muted/50 underline-offset-[6px] hover:decoration-text-primary";

function GoLink({ href, children, className = quiet }: { href: string; children: React.ReactNode; className?: string }) {
  return href.startsWith("/") ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

function H2({ s, className = "" }: { s: Section; className?: string }) {
  return (
    <h2 id={`${s.id}-h`} className={`text-balance font-serif text-[2rem] font-medium leading-[1.1] tracking-[-0.01em] sm:text-[2.5rem] ${className}`}>
      {s.heading}
    </h2>
  );
}

// The headline and the words beside it, then the product itself.
function Hero() {
  return (
    <section aria-labelledby="hero-h">
      <div className={`${wrap} pb-16 pt-12 sm:pt-16 lg:pb-24 lg:pt-20`}>
        <div className="grid gap-8 lg:grid-cols-[1.55fr_1fr] lg:items-start lg:gap-14">
          <h1 id="hero-h" className="max-w-[27ch] text-balance font-serif text-[2.35rem] font-medium leading-[1.06] tracking-[-0.02em] sm:text-5xl lg:text-[2.75rem] xl:text-[3.3rem]">
            {page.h1}
          </h1>
          <div className="lg:pt-2">
            <p className="max-w-xl text-[17px] leading-relaxed text-text-secondary sm:text-[18px]">
              <Inline text={page.lede} />
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-4">
              <a href={SITE.appUrl} className={primary}>
                Get started
              </a>
              <Link href="/self-host/" className={quiet}>
                Self-host it
              </Link>
            </div>
            <p className="mt-4 text-sm text-text-muted">{SITE.ctaNote}</p>
          </div>
        </div>
        <div className={`mt-12 lg:mt-16 ${frame}`}>
          <ProductShot id="homeHero" sizes="(min-width: 1152px) 1104px, calc(100vw - 2rem)" priority />
        </div>
      </div>
    </section>
  );
}

// The parts the headline names, each with its own screen.
function Platform() {
  const s = section("platform");
  const parts = first(s, "cards").items;
  return (
    <section id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20 border-t border-line">
      <div className={`${wrap} py-20 lg:py-28`}>
        <H2 s={s} />
        <ul className="mt-12 grid gap-x-10 gap-y-14 md:grid-cols-2 lg:gap-x-12 lg:gap-y-16">
          {parts.map((p) => (
            <li key={p.title} className="flex min-w-0 flex-col">
              {p.shot && (
                <div className={frame}>
                  <ProductShot id={p.shot} sizes="(min-width: 1152px) 540px, (min-width: 768px) 46vw, calc(100vw - 2rem)" />
                </div>
              )}
              <h3 className="mt-6 text-[18px] font-semibold text-text-primary">
                {p.href ? (
                  <GoLink href={p.href} className="underline decoration-text-muted/40 underline-offset-[6px] hover:decoration-text-primary">
                    {p.title}
                  </GoLink>
                ) : (
                  p.title
                )}
              </h3>
              <p className="mt-2 max-w-lg text-[16px] leading-relaxed text-text-secondary">
                <Inline text={p.text} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Heading on the left, the four steps as a plain numbered list on the right.
function HowItWorks() {
  const s = section("how-it-works");
  const steps = first(s, "steps");
  const go = first(s, "actions").items[0];
  return (
    <section id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20 border-t border-line">
      <div className={`${wrap} grid gap-10 py-20 lg:grid-cols-[1fr_1.6fr] lg:gap-16 lg:py-28`}>
        <div>
          <H2 s={s} />
          <p className="mt-6">
            <GoLink href={go.href}>{go.label}</GoLink>
          </p>
        </div>
        <ol className="grid">
          {steps.items.map((st, i) => (
            <li key={st.title} className="grid grid-cols-[2.25rem_1fr] gap-x-3 border-t border-line py-6 first:border-t-0 first:pt-0 sm:grid-cols-[3rem_1fr]">
              <span className="font-serif text-2xl leading-7 text-text-muted" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="text-[17px] font-semibold leading-7 text-text-primary">{st.title}</h3>
                <p className="mt-1.5 max-w-xl text-[16px] leading-relaxed text-text-secondary">
                  <Inline text={st.text} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// The evidence, on white: a real pull request, quoted.
function ARealOne() {
  const s = section("a-real-one");
  const [intro, after] = all(s, "p");
  const pr = first(s, "pr").pr;
  return (
    <section id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20 border-y border-line bg-panel">
      <div className={`${wrap} grid gap-10 py-20 lg:grid-cols-[1fr_1.6fr] lg:gap-16 lg:py-28`}>
        <div>
          <H2 s={s} />
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-text-secondary">
            <Inline text={intro.text} />
          </p>
          {after && (
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
              <Inline text={after.text} />
            </p>
          )}
        </div>
        <div className="min-w-0">
          <PullRequestView pr={pr} />
        </div>
      </div>
    </section>
  );
}

// Situations on the left, what it does on the right, as a definition list.
function AfterThePullRequest() {
  const s = section("after-the-pull-request");
  const rows = first(s, "table").rows;
  const go = first(s, "actions").items[0];
  return (
    <section id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20">
      <div className={`${wrap} py-20 lg:py-28`}>
        <H2 s={s} className="max-w-2xl" />
        <dl className="mt-12 border-t border-text-primary/80">
          {rows.map(([when, what]) => (
            <div key={when} className="grid gap-2 border-b border-line py-6 md:grid-cols-[1fr_2fr] md:gap-12">
              <dt className="font-serif text-[1.35rem] leading-snug text-text-primary">{when}</dt>
              <dd className="max-w-2xl text-[16px] leading-relaxed text-text-secondary">
                <Inline text={what} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-8">
          <GoLink href={go.href}>{go.label}</GoLink>
        </p>
      </div>
    </section>
  );
}

// The one ink band on the page: running it yourself.
function SelfHost() {
  const s = section("self-host");
  const intro = first(s, "p");
  const facts = first(s, "table").rows;
  const actions = first(s, "actions").items;
  return (
    <section id={s.id} aria-labelledby={`${s.id}-h`} className="ink scroll-mt-20 bg-surface text-text-primary">
      <div className={`${wrap} grid gap-12 py-20 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:py-28`}>
        <div>
          <H2 s={s} />
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-text-secondary">
            <Inline text={intro.text} />
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            {actions.map((a, i) => (
              <GoLink key={a.href} href={a.href} className={i === 0 ? primary : quiet}>
                {a.label}
              </GoLink>
            ))}
          </div>
        </div>
        <dl className="self-end border-t border-text-primary/60">
          {facts.map(([k, v]) => (
            <div key={k} className="grid gap-1 border-b border-line py-4 sm:grid-cols-[7rem_1fr] sm:gap-6">
              <dt className="font-mono text-[13px] leading-6 text-text-muted">{k}</dt>
              <dd className="min-w-0 break-words text-[15px] leading-relaxed text-text-primary">
                <Inline text={v} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// An index of the rest, each line a link to its own page.
function More() {
  const s = section("more");
  const items = first(s, "list").items;
  const note = first(s, "note");
  return (
    <section id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20">
      <div className={`${wrap} grid gap-10 py-20 lg:grid-cols-[1fr_1.6fr] lg:gap-16 lg:py-24`}>
        <H2 s={s} />
        <div>
          <ul className="grid gap-x-10 sm:grid-cols-2">
            {items.map((t) => (
              <li key={t} className="border-b border-line py-3.5 text-[16px] leading-relaxed text-text-secondary">
                <Inline text={t} />
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a href={SITE.appUrl} className={primary}>
              Get started
            </a>
            <p className="text-[15px] text-text-muted">
              <Inline text={note.text} />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Shell page={page}>
      <Hero />
      <Platform />
      <HowItWorks />
      <ARealOne />
      <AfterThePullRequest />
      <SelfHost />
      <More />
    </Shell>
  );
}
