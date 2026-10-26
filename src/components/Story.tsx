import type { CSSProperties } from "react";
import Link from "next/link";
import type { Chapter } from "@/content/types";
import { Inline } from "./Md";
import { Frame } from "./Frames";

// One ticket followed through its life. Every step stays in the page (nothing
// critical hides behind a tab or a carousel), grouped into the jobs it does for
// a team. A sticky rail of plain anchor links lets a visitor jump to any step;
// where the browser supports scroll driven animations, the rail also marks the
// step in view. No client JavaScript.
export function Story({ chapters }: { chapters: Chapter[] }) {
  let n = 0;
  const numbered = chapters.map((c) => ({ ...c, steps: c.steps.map((s) => ({ ...s, n: ++n })) }));
  return (
    <div
      className="story grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14"
      style={{ timelineScope: numbered.flatMap((c) => c.steps.map((s) => `--${s.id}`)).join(", ") } as CSSProperties}
    >
      <nav aria-label="Steps" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        <ol className="grid gap-6">
          {numbered.map((c) => (
            <li key={c.title}>
              <p className="text-[12px] font-medium leading-snug text-text-muted">{c.title}</p>
              <ol className="mt-2 grid border-l border-line">
                {c.steps.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="story-link -ml-px flex gap-2.5 border-l border-transparent py-1.5 pl-3 text-[14px] text-text-secondary hover:text-text-primary" style={{ animationTimeline: `--${s.id}` } as CSSProperties}>
                      <span className="font-mono text-[12px] leading-[21px] text-text-muted">{String(s.n).padStart(2, "0")}</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </nav>
      <div className="grid gap-16 [&>*]:min-w-0">
        {numbered.map((c, ci) => (
          <div key={c.title}>
            <h3 className="flex items-baseline gap-3 border-b border-line pb-4 text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
              <span className="font-mono text-sm font-normal text-accent-text">{ci + 1} / {chapters.length}</span>
              {c.title}
            </h3>
            <ol className="mt-8 grid gap-14 sm:gap-16">
              {c.steps.map((s) => (
                <li key={s.id} id={s.id} className="story-step grid scroll-mt-24 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-10 [&>*]:min-w-0" style={{ viewTimelineName: `--${s.id}` } as CSSProperties}>
                  <div className="xl:pt-4">
                    <p className="font-mono text-xs text-text-muted">Step {String(s.n).padStart(2, "0")} · {s.title}</p>
                    <h4 className="mt-2 text-balance text-lg font-semibold leading-snug text-text-primary sm:text-[22px]">{s.heading}</h4>
                    <p className="mt-3 text-[15px] leading-relaxed text-text-secondary sm:text-base"><Inline text={s.text} /></p>
                    <Link href={s.href} className="mt-4 inline-flex text-[15px] font-medium text-accent-text hover:text-text-primary">
                      {s.linkLabel}
                    </Link>
                  </div>
                  <Frame id={s.frame} caption={s.caption} hideCaption />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
