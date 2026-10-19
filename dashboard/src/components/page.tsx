import type { ReactNode } from "react";

// Shared page layout. Every dashboard page sits in the same centered column
// (the width Analytics uses), so left edges and widths line up page to page.
// The app shell's <main> already supplies the side gutter (p-4 md:p-8), so the
// column adds no padding of its own.

/** The one page width. Use `pageNarrowClass` only for a page that is nothing but a short form. */
export const pageWidthClass = "mx-auto w-full min-w-0 max-w-6xl";
export const pageNarrowClass = "mx-auto w-full min-w-0 max-w-3xl";

/** Card surface shared by panels, empty states and list boxes. */
export const cardClass = "min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4";

export function Page({
  children,
  narrow = false,
  className = "",
  testId,
}: {
  children: ReactNode;
  /** Short form-only pages; still centered. */
  narrow?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div data-page="" data-testid={testId} className={`${narrow ? pageNarrowClass : pageWidthClass} ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Title, one-line lead and the page's primary actions (top right, wrapping
 * under the title on a phone). `breadcrumb` renders above the title.
 */
export function PageHeader({
  title,
  lead,
  actions,
  breadcrumb,
  eyebrow,
  titleId,
  titleClassName = "",
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  /** Small line above the title, e.g. a status or a parent name. */
  eyebrow?: ReactNode;
  titleId?: string;
  titleClassName?: string;
}) {
  return (
    <header className="min-w-0">
      {breadcrumb && <div className="mb-4">{breadcrumb}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-sm text-zinc-500">{eyebrow}</div>}
          <h1 id={titleId} tabIndex={titleId ? -1 : undefined} className={`break-words text-2xl font-bold text-zinc-100 ${titleClassName}`.trim()}>
            {title}
          </h1>
          {lead && <div className="mt-1 max-w-prose text-sm text-zinc-400">{lead}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A titled block of a page, 2.5rem below whatever comes before it. */
export function Section({
  title,
  description,
  actions,
  children,
  id,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} className={`mt-10 min-w-0 ${className}`.trim()} aria-labelledby={title ? headingId : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {title}
              </h2>
            )}
            {description && <div className="mt-1 max-w-prose text-sm text-zinc-400">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={title || actions ? "mt-3" : ""}>{children}</div>
    </section>
  );
}
