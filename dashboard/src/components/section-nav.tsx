"use client";

import { useEffect, useState } from "react";
import { focusRing } from "./ui";

export interface NavSection {
  id: string;
  label: string;
  /** A small count after the label, e.g. the number of tasks. */
  count?: number;
}

/**
 * "On this page" for a long document: a sticky list of its sections on wide
 * screens, the one being read marked. Hidden on a phone, where the sections
 * simply follow each other.
 */
export function SectionNav({ sections, label = "On this page" }: { sections: NavSection[]; label?: string }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const ids = sections.map((s) => s.id).join(",");

  useEffect(() => {
    const els = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        // The first section on screen, top to bottom, is the one being read.
        const first = els.find((el) => seen.get(el.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  if (sections.length < 2) return null;
  return (
    <nav aria-label={label} className="hidden lg:block">
      <div className="sticky top-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <ul className="space-y-0.5 border-l border-zinc-800">
          {sections.map((s) => {
            const on = s.id === active;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? "location" : undefined}
                  onClick={() => setActive(s.id)}
                  className={`-ml-px flex items-center justify-between gap-2 border-l py-1 pl-3 pr-1 text-sm transition-colors motion-reduce:transition-none ${focusRing} ${
                    on ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <span className="truncate">{s.label}</span>
                  {s.count !== undefined && <span className="text-xs tabular-nums text-zinc-600">{s.count}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
