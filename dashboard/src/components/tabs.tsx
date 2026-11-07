"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ScrollFade } from "./scroll-fade";
import { Select } from "./select";
import { focusRing } from "./ui";

export interface TabItem {
  value: string;
  label: string;
  /** Where the tab goes. Tabs are links, so a view can be shared and opened in a new tab. */
  href: string;
  /** A count or badge after the label (the select on a phone shows `countText`). */
  count?: ReactNode;
  /** Plain text of the count, for the phone select, e.g. "3 new". */
  countText?: string;
}

/**
 * The views of one page, as underlined tabs. On a phone, more than
 * `selectAbove` tabs become one select (a row of eight tabs can't be read at
 * 390px); fewer scroll sideways with a fade at the edge that has more.
 */
export function Tabs({
  label,
  items,
  value,
  selectAbove = 5,
  className = "mt-6",
}: {
  /** Names the tab row, e.g. "Tests views". */
  label: string;
  items: TabItem[];
  /** The current tab's value. */
  value: string;
  /** On a phone, more tabs than this become a select. */
  selectAbove?: number;
  className?: string;
}) {
  const router = useRouter();
  const asSelect = items.length > selectAbove;
  const current = items.find((t) => t.value === value);

  // The base line is the row's own bottom border, and each tab's underline
  // pulls down 1px to sit on it. Both stay inside the row's box: a negative
  // margin on the row itself would make the scroll box 1px taller inside than
  // out, so it scrolled (and showed a scrollbar) even when every tab fit.
  const row = (
    <ul className="flex min-w-max gap-x-1 border-b border-zinc-800">
      {items.map((t) => {
        const on = t.value === value;
        return (
          <li key={t.value} className="flex shrink-0">
            <Link
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`-mb-px inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-t border-b-2 px-3 text-sm ${
                on ? "border-zinc-100 font-medium text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-100"
              } ${focusRing}`}
            >
              {t.label}
              {t.count}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav aria-label={label} className={className}>
      {asSelect && (
        <div className="border-b border-zinc-800 pb-3 sm:hidden">
          <Select
            aria-label={label}
            value={current?.value ?? ""}
            onChange={(v) => {
              const next = items.find((t) => t.value === v);
              if (next) router.push(next.href);
            }}
            className="w-full"
            options={items.map((t) => ({ value: t.value, label: t.countText ? `${t.label} (${t.countText})` : t.label }))}
          />
        </div>
      )}
      <ScrollFade axis="x" testId="tab-row" className={asSelect ? "hidden sm:block" : ""}>
        {row}
      </ScrollFade>
    </nav>
  );
}
