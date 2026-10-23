"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A scroll area that shows there is more: a soft fade on each edge that has
 * content past it. `axis="x"` for a row of chips or tabs on a phone,
 * `axis="y"` for a tall menu. The fades never take clicks.
 *
 * `fadeFrom` is the background the fade blends into (a Tailwind `from-` class),
 * so it matches the surface the area sits on.
 */
export function ScrollFade({
  axis = "x",
  children,
  className = "",
  innerClassName = "",
  fadeFrom = "from-zinc-950",
  testId,
}: {
  axis?: "x" | "y";
  children: ReactNode;
  /** Classes for the outer box (size, flex). */
  className?: string;
  /** Classes for the scrolling box itself. */
  innerClassName?: string;
  fadeFrom?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = axis === "x" ? el.scrollLeft : el.scrollTop;
    const size = axis === "x" ? el.clientWidth : el.clientHeight;
    const full = axis === "x" ? el.scrollWidth : el.scrollHeight;
    const next = { start: pos > 1, end: pos + size < full - 1 };
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [axis]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    // Content that grows (a menu item appearing after the role loads) changes the size too.
    for (const child of Array.from(el.children)) ro?.observe(child);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [measure]);

  const x = axis === "x";
  const fade = "pointer-events-none absolute z-10 transition-opacity duration-150 motion-reduce:transition-none";
  return (
    <div className={`relative min-w-0 ${x ? "" : "min-h-0"} ${className}`} data-testid={testId}>
      <div
        ref={ref}
        data-scroll-fade={axis}
        data-more-start={edges.start || undefined}
        data-more-end={edges.end || undefined}
        className={`${x ? "overflow-x-auto overscroll-x-contain" : "h-full overflow-y-auto overscroll-contain"} [scrollbar-width:thin] ${innerClassName}`}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={`${fade} ${x ? `inset-y-0 left-0 w-6 bg-gradient-to-r` : "inset-x-0 top-0 h-6 bg-gradient-to-b"} ${fadeFrom} to-transparent ${
          edges.start ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden="true"
        data-testid={testId ? `${testId}-more` : undefined}
        className={`${fade} ${x ? "inset-y-0 right-0 w-6 bg-gradient-to-l" : "inset-x-0 bottom-0 h-10 bg-gradient-to-t"} ${fadeFrom} to-transparent ${
          edges.end ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
