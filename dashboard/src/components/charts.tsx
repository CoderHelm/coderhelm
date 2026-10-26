"use client";

/**
 * The chart pieces Insights, Analytics and Settings, Deliveries share: a card
 * with a chart and its table, the tooltip, axis styling, the series colors,
 * a table that turns into cards on a phone, and the change against the
 * period before.
 */

import { useState, type ReactNode } from "react";
import { DataTable, type Column } from "./data-table";
import { focusRing } from "./ui";

// Categorical slots for the dark chart surface, checked for color-vision
// separation and contrast (blue, orange). Text never takes a series color.
export const SERIES = { first: "#3987e5", second: "#d95926" };

/** "+12% vs previous 30 days", or points for rates. Neutral ink: the reader judges. */
export function delta(cur: number | null, prev: number | null, kind: "count" | "rate" | "hours", vs: string): string {
  if (cur == null || prev == null) return `— ${vs}`;
  if (kind === "rate") {
    const pts = Math.round((cur - prev) * 100);
    return `${pts > 0 ? "▲ " : pts < 0 ? "▼ " : ""}${pts === 0 ? "No change" : `${Math.abs(pts)} pts`} ${vs}`;
  }
  if (prev === 0) return cur === 0 ? `No change ${vs}` : `New ${vs}`;
  const change = Math.round(((cur - prev) / prev) * 100);
  if (change === 0) return `No change ${vs}`;
  return `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% ${vs}`;
}
export const shortDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
};
export function ChartCard({ title, children, table, actions }: { title: string; children: ReactNode; table: ReactNode; actions?: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
        {actions && <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">{actions}</div>}
        <button type="button" onClick={() => setShowTable((v) => !v)} aria-label={`${showTable ? "Show chart" : "Show table"}: ${title}`} className={`rounded text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline ${focusRing}`}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? <div className="max-h-64 overflow-auto">{table}</div> : children}
    </div>
  );
}

export function ChartTip({ active, payload, label, format, labelFormat = shortDay }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format?: (v: number) => string; labelFormat?: (label: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-zinc-400">{label ? labelFormat(label) : ""}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-zinc-400">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-zinc-100">{format ? format(p.value) : p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export const axis = { stroke: "transparent", tick: { fill: "#71717a", fontSize: 11 }, tickLine: false, axisLine: false };

/**
 * A table on the shared DataTable: the first column takes the spare width and
 * wraps, numbers stay narrow, and a phone gets one card per row, so no column
 * is ever pushed out of its card. `grow` marks other text columns that wrap.
 */
export function Table({ head, rows, empty, label, grow = [] }: { head: string[]; rows: ReactNode[][]; empty: string; label: string; grow?: number[] }) {
  const columns: Column<ReactNode[]>[] = head.map((h, i) => ({
    key: `${i}-${h}`,
    header: h,
    cell: (r) => <span className="[overflow-wrap:break-word]">{r[i]}</span>,
    width: i === 0 || grow.includes(i) ? "grow" : "fit",
    align: i === 0 || grow.includes(i) ? "left" : "right",
    clamp: grow.includes(i),
  }));
  const table = (
    <DataTable
      label={label}
      columns={columns}
      rows={rows}
      rowKey={(_, i) => String(i)}
      empty={<p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">{empty}</p>}
    />
  );
  // A wide table keeps a minimum width from sm: up and scrolls inside its own
  // box, so no column squeezes a word in half; a phone gets one card per row.
  if (head.length < 4) return table;
  const min = head.length >= 7 ? "sm:min-w-[960px]" : head.length >= 5 ? "sm:min-w-[860px]" : "sm:min-w-[600px]";
  return (
    <div className="min-w-0 overflow-x-auto">
      <div className={min}>{table}</div>
    </div>
  );
}
