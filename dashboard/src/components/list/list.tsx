"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronRightIcon } from "../icons";
import { Skeleton } from "../skeleton";
import { focusRing, secondaryButton } from "../ui";
import { GROUP_TONE, StatusDot, type StatusGroup, type StatusLook, type Tone } from "./status";
import { Time } from "./time";

// The one list look: divided rows in one box (never a stack of bordered
// cards), the same density everywhere. A row is a status dot, a title, a meta
// line, and chips with the time on the right; details open under the row.

/** The box the rows sit in. */
export function List({ children, label, className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <ul
      aria-label={label}
      className={`divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 ${className}`}
    >
      {children}
    </ul>
  );
}

/** A row's checkbox, for lists that act on several rows at once. */
export interface RowSelect {
  checked: boolean;
  /** `range`: shift was held, so select every row from the last one clicked to this one. */
  onChange: (checked: boolean, range: boolean) => void;
  /** Spoken name, e.g. "Select Fix the login page". */
  label: string;
  disabled?: boolean;
  /** Hover text, e.g. why it can't be picked. */
  title?: string;
}

export interface ListRowProps {
  /** A checkbox before the status dot. */
  select?: RowSelect;
  /** The status dot at the start of the row. */
  status?: StatusLook | { tone: Tone; live?: boolean };
  /** Something else at the start instead of a dot (an icon, an avatar). */
  leading?: ReactNode;
  title: ReactNode;
  /** In-app link for the title. */
  href?: string;
  /** External link for the title (opens in a new tab). */
  externalHref?: string;
  /** Hover text for a cut title. */
  titleText?: string;
  /** Bits of the meta line, joined with " · ". Falsy bits are skipped. */
  meta?: ReactNode[];
  /** A third line in the status colour ("Waiting for 1 approval"). */
  summary?: ReactNode;
  summaryTone?: Tone;
  /** Chips, a status word, switches: right-aligned beside the title on wide screens. */
  chips?: ReactNode;
  /** Shown last on the right. */
  time?: string | null;
  /** Small buttons after the chips. */
  actions?: ReactNode;
  /** Extra reading that opens under the row. */
  details?: ReactNode;
  /** The button that opens the details, e.g. "3 reviews". Default "Details". */
  detailsLabel?: string;
  /** Spoken name of that button, e.g. "details of your-team/web #42". */
  detailsFor?: string;
  /** Controlled open state; leave both unset for the row to keep its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  /** Dimmed (an older attempt, something switched off). */
  quiet?: boolean;
  testId?: string;
  /** Extra classes on the row, e.g. a one-off highlight for a row that just arrived. */
  className?: string;
  /** Extra data-* for tests, e.g. { status: "running" }. */
  data?: Record<string, string>;
  children?: ReactNode;
}

export function ListRow({
  select,
  status,
  leading,
  title,
  href,
  externalHref,
  titleText,
  meta,
  summary,
  summaryTone,
  chips,
  time,
  actions,
  details,
  detailsLabel = "Details",
  detailsFor,
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  quiet = false,
  testId,
  className = "",
  data,
  children,
}: ListRowProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOwnOpen(v);
    onOpenChange?.(v);
  };
  const panelId = useId();
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]));
  const metaBits = (meta ?? []).filter((m) => m !== null && m !== undefined && m !== false && m !== "");
  const titleClass = `block break-words line-clamp-2 sm:truncate rounded text-sm font-medium ${
    quiet ? "text-zinc-400" : "text-zinc-100"
  } ${href || externalHref ? "hover:underline" : ""} ${focusRing}`;

  return (
    <li
      className={`px-4 py-3 ${select?.checked ? "bg-zinc-800/40" : ""} ${className}`}
      data-testid={testId}
      data-selected={select ? String(select.checked) : undefined}
      {...dataAttrs}
    >
      <div className="flex gap-3">
        {select && (
          <input
            type="checkbox"
            checked={select.checked}
            disabled={select.disabled}
            title={select.title}
            aria-label={select.label}
            // Click, not change: only the click knows whether shift was held.
            onClick={(e) => select.onChange(e.currentTarget.checked, e.shiftKey)}
            onChange={() => {}}
            className={`mt-[3px] h-4 w-4 shrink-0 cursor-pointer accent-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
          />
        )}
        {leading ? (
          <span className="mt-0.5 shrink-0">{leading}</span>
        ) : status ? (
          <StatusDot tone={status.tone} live={status.live} className="mt-[7px]" />
        ) : null}
        <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-4">
          <div className="min-w-0 flex-1">
            {href ? (
              <Link href={href} className={titleClass} title={titleText}>
                {title}
              </Link>
            ) : externalHref ? (
              <a href={externalHref} target="_blank" rel="noreferrer" className={titleClass} title={titleText}>
                {title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <span className={titleClass} title={titleText}>
                {title}
              </span>
            )}
            {metaBits.length > 0 && (
              <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
                {metaBits.map((m, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span aria-hidden="true">·</span>}
                    <span className="min-w-0 [overflow-wrap:anywhere]">{m}</span>
                  </Fragment>
                ))}
              </p>
            )}
            {summary && (
              <p className={`mt-1 line-clamp-2 text-xs ${summaryTone ? toneText(summaryTone) : "text-zinc-400"}`}>{summary}</p>
            )}
            {children}
          </div>
          {(chips || time || actions || details) && (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:mt-0 sm:max-w-[50%] sm:shrink-0 sm:justify-end">
              {chips}
              {time && <Time iso={time} className="text-xs text-zinc-500" />}
              {actions}
              {details && (
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-label={detailsFor ? `${open ? "Hide" : "Show"} ${detailsFor}` : undefined}
                  className={`inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 ${focusRing}`}
                >
                  {detailsLabel}
                  <span aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
                    <ChevronRightIcon />
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {details && open && (
        <div id={panelId} className="mt-3 ml-5 flex min-w-0 flex-col gap-3 border-l border-zinc-800 pl-4 text-xs text-zinc-400">
          {details}
        </div>
      )}
    </li>
  );
}

/** A labelled block of details inside an open row. */
export function DetailBlock({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 font-medium text-zinc-300">{title}</p>
      <div className="break-words text-zinc-400">{children}</div>
    </div>
  );
}

function toneText(tone: Tone): string {
  return {
    live: "text-sky-300",
    queued: "text-sky-300",
    waiting: "text-amber-300",
    attention: "text-orange-300",
    success: "text-emerald-300",
    merged: "text-violet-300",
    danger: "text-red-300",
    neutral: "text-zinc-300",
    muted: "text-zinc-400",
  }[tone];
}

/** A group of rows under a small header with its count: "Waiting 3". */
export function ListSection({
  id,
  title,
  count,
  group,
  tone,
  live,
  description,
  actions,
  level = 2,
  children,
}: {
  id: string;
  title: ReactNode;
  count?: number;
  /** Takes the header dot's colour from the shared status groups. */
  group?: StatusGroup;
  tone?: Tone;
  /** The header dot pulses (something in the group is moving). */
  live?: boolean;
  description?: ReactNode;
  actions?: ReactNode;
  /** Heading level; 3 for groups nested under a page section's h2. */
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  const dotTone = tone ?? (group ? GROUP_TONE[group] : undefined);
  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0" data-testid={`list-section-${id}`}>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Heading id={`${id}-heading`} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {dotTone && <StatusDot tone={dotTone} live={!!live} className="!h-1.5 !w-1.5" />}
            {title}
            {count !== undefined && <span className="font-normal normal-case tracking-normal tabular-nums text-zinc-600">{count}</span>}
          </Heading>
          {description && <div className="mt-1 max-w-prose text-sm text-zinc-400">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Rows of grey bars the shape of real rows, while the first page loads. */
export function ListSkeleton({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div aria-busy="true" data-testid="list-skeleton">
      <p role="status" className="sr-only">
        {label}…
      </p>
      <ul aria-hidden="true" className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex gap-3 px-4 py-3">
            <Skeleton className="mt-1.5 h-2 w-2 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5" style={{ width: `${[62, 48, 70, 55, 40][i % 5]}%` }} />
              <Skeleton className="h-2.5 w-40 max-w-full" />
            </div>
            <Skeleton className="hidden h-3 w-16 sm:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Nothing to list. `filtered` says it is the filters that hide everything,
 * and offers to clear them.
 */
export function ListEmpty({
  title,
  children,
  action,
  onClear,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Set when filters hide every row: shows "Clear filters". */
  onClear?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center" data-testid="list-empty">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-prose text-sm text-zinc-500">{children}</div>}
      {(action || onClear) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onClear && (
            <button type="button" onClick={onClear} className={secondaryButton}>
              Clear filters
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

/** The list could not be read. */
export function ListError({ title, children, onRetry }: { title: ReactNode; children?: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-4" data-testid="list-error">
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <div className="mt-1 text-sm text-zinc-400">{children ?? "Check your connection and try again."}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`mt-3 ${secondaryButton}`}>
          Try again
        </button>
      )}
    </div>
  );
}

export interface MenuAction {
  label: string;
  onSelect: () => void;
  /** Short hint on the right, e.g. a shortcut. */
  hint?: string;
  disabled?: boolean;
}

/**
 * A small "More" button with a menu: the home for rarely used actions
 * ("Review a PR…", "Write notes for a tag…") so they don't take the page's
 * best space.
 */
export function MoreMenu({ label = "More", items }: { label?: string; items: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setActive(0);
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(0);
            setOpen(true);
          }
        }}
        className={`${secondaryButton} gap-1.5 !px-3`}
      >
        {label}
        <svg aria-hidden="true" className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % items.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + items.length) % items.length);
            } else if (e.key === "Tab") {
              setOpen(false);
            }
          }}
          className="absolute right-0 z-40 mt-1 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              onMouseEnter={() => setActive(i)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none disabled:opacity-50"
            >
              {item.label}
              {item.hint && <span className="text-xs text-zinc-500">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
