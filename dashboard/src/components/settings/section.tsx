import type { ReactNode } from "react";

/**
 * A titled group of settings rows in one bordered box, the rows split by
 * lines. `id` is the anchor a section nav links to.
 */
export function SettingsSection({
  id,
  title,
  description,
  danger,
  children,
}: {
  id: string;
  title: string;
  /** One or two plain sentences under the title. */
  description?: ReactNode;
  /** Red title and border, for "Stop everything" and other destructive groups. */
  danger?: boolean;
  /** `SettingsRow`s, usually. */
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="min-w-0 scroll-mt-6">
      <h2 id={`${id}-heading`} className={`text-xs font-semibold uppercase tracking-wider ${danger ? "text-red-400" : "text-zinc-500"}`}>
        {title}
      </h2>
      {description && <p className="mt-1 max-w-prose text-sm text-zinc-400">{description}</p>}
      <div
        className={`mt-3 divide-y overflow-hidden rounded-lg border bg-zinc-900/40 ${
          danger ? "divide-red-500/20 border-red-500/30" : "divide-zinc-800 border-zinc-800"
        }`}
      >
        {children}
      </div>
    </section>
  );
}
