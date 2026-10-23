"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreMenu, type MenuAction } from "./list/list";
import { usePageMeta, useTopBar } from "./top-bar";

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
 * How a page describes itself. It fills the one top bar the shell draws
 * (components/top-bar.tsx) and, under it, the page's lead line:
 *
 * - A section or settings page (`<PageHeader title="Security" lead="…" />`)
 *   is named by the bar's last crumb, which is the page's heading. The name
 *   comes from the route map (lib/routes.ts), so it is never repeated as a big
 *   title; `title` here only names the page if the map has no entry.
 * - An item's page (`<PageHeader detail title={run.title} status={…} />`)
 *   shows the item's title and status under the bar as the heading, and the
 *   bar's last crumb becomes the item's short name (`crumb`, default `title`).
 *
 * `actions` (the page's primary buttons) and `more` (a short list of
 * secondary ones) go to the right of the bar, or into its actions menu on a
 * phone (the same element, laid out per screen, so a resize never remounts
 * them). They are rendered through a portal, so they keep the page's state.
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
  /** One item's page: the title shows under the bar. */
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
  /** An id for the item's title, for moving focus to it. */
  titleId?: string;
  titleClassName?: string;
}) {
  const bar = useTopBar();
  const moreItems = more?.filter(Boolean) ?? [];
  const hasActions = !!actions || moreItems.length > 0;
  const lastCrumb = crumb === false ? undefined : crumb ?? (detail && typeof title === "string" ? title : undefined);
  usePageMeta({ crumb: lastCrumb, ownTitle: detail, hasActions });

  const slot = bar?.slot ?? null;
  const inBar =
    slot && hasActions
      ? createPortal(
          <>
            {actions}
            {moreItems.length > 0 && <MoreMenu items={moreItems} />}
          </>,
          slot,
        )
      : null;

  if (!detail) {
    return (
      <>
        {inBar}
        {/* Without a shell (a bare test render) the title still shows. */}
        {!bar && <h1 className="text-2xl font-bold text-zinc-100">{title}</h1>}
        {lead && (
          <header className="min-w-0">
            <div className="max-w-prose text-sm text-zinc-400">{lead}</div>
          </header>
        )}
      </>
    );
  }

  return (
    <header className="min-w-0">
      {inBar}
      {eyebrow && <div className="mb-1 text-sm text-zinc-500">{eyebrow}</div>}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1
          id={titleId}
          tabIndex={titleId ? -1 : undefined}
          className={`min-w-0 break-words text-2xl font-bold text-zinc-100 [overflow-wrap:anywhere] focus:outline-none ${titleClassName}`.trim()}
        >
          {title}
        </h1>
        {status && <div className="flex shrink-0 items-center gap-2">{status}</div>}
      </div>
      {lead && <div className="mt-1 max-w-prose text-sm text-zinc-400">{lead}</div>}
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
