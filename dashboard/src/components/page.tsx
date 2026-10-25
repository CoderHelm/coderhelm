"use client";

import type { ReactNode } from "react";
import { MoreMenu, type MenuAction } from "./list/list";
import { usePageMeta } from "./top-bar";

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
 * How a page describes itself: a visible title with the page's main actions
 * beside it, and a one-line lead under it. The shell's top bar only shows the
 * trail (lib/routes.ts); the heading is here, in the page.
 *
 * - A section or settings page: `<PageHeader title="Security" lead="…" actions={…} />`.
 * - An item's page (`detail`): the item's title and status, with an eyebrow
 *   (its kind) above it; the bar's last crumb becomes the item's short name
 *   (`crumb`, default `title`).
 *
 * `actions` are the page's one or two main buttons; `more` is a short list
 * of rarely used ones behind a "More" menu. Both sit beside the title and
 * wrap under it on a phone, so the main action is always visible.
 */
export function PageHeader({
  title,
  lead,
  actions,
  more,
  detail = false,
  crumb,
  status,
  eyebrow,
  titleId,
  titleClassName = "",
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  more?: MenuAction[];
  /** One item's page: the title is the item's name. */
  detail?: boolean;
  /**
   * The last crumb: the item's short name, or an extra step (New request).
   * An item's page defaults to its `title`; `false` keeps the route's label.
   */
  crumb?: string | false;
  /** An item's state, beside its title. */
  status?: ReactNode;
  /** Small line above an item's title, e.g. its kind. */
  eyebrow?: ReactNode;
  /** An id for the title, for moving focus to it. */
  titleId?: string;
  titleClassName?: string;
}) {
  const moreItems = more?.filter(Boolean) ?? [];
  const hasActions = !!actions || moreItems.length > 0;
  const lastCrumb = crumb === false ? undefined : crumb ?? (detail && typeof title === "string" ? title : undefined);
  usePageMeta({ crumb: lastCrumb, ownTitle: true, hasActions: false });

  return (
    <header className="min-w-0" data-testid="page-header">
      {eyebrow && <div className="mb-1 text-sm text-zinc-400">{eyebrow}</div>}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1
              id={titleId}
              tabIndex={titleId ? -1 : undefined}
              className={`min-w-0 text-2xl font-semibold tracking-tight text-zinc-50 [overflow-wrap:anywhere] focus:outline-none ${titleClassName}`.trim()}
            >
              {title}
            </h1>
            {status && <div className="flex shrink-0 items-center gap-2">{status}</div>}
          </div>
          {lead && <div className="mt-1.5 max-w-prose text-sm text-zinc-400">{lead}</div>}
        </div>
        {hasActions && (
          <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="page-actions">
            {actions}
            {moreItems.length > 0 && <MoreMenu items={moreItems} />}
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * For a page that draws its own heading instead of a <PageHeader> (the plan
 * composer's opening question): the top bar's last crumb then stops being
 * the page's heading, so the page keeps exactly one.
 */
export function OwnTitle() {
  usePageMeta({ ownTitle: true, hasActions: false });
  return null;
}

/**
 * A heading inside a page, in sentence case: "Recent alerts 12". Use it for
 * every titled block instead of a hand-written grey overline.
 */
export function SectionHeading({
  children,
  count,
  level = 2,
  id,
  danger = false,
  className = "",
}: {
  children: ReactNode;
  count?: ReactNode;
  level?: 2 | 3;
  id?: string;
  danger?: boolean;
  className?: string;
}) {
  const H = level === 3 ? "h3" : "h2";
  return (
    <H id={id} className={`flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-semibold ${danger ? "text-red-300" : "text-zinc-100"} ${className}`.trim()}>
      {children}
      {count !== undefined && count !== null && <span className="font-normal tabular-nums text-zinc-400">{count}</span>}
    </H>
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
            {title && <SectionHeading id={headingId}>{title}</SectionHeading>}
            {description && <div className="mt-1 max-w-prose text-sm text-zinc-400">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={title || actions ? "mt-3" : ""}>{children}</div>
    </section>
  );
}
