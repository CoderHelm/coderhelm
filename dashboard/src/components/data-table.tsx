import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** "grow" takes the spare width (a title); "fit" stays as narrow as its content (a number). Default "fit". */
  width?: "grow" | "fit";
  align?: "left" | "right";
  /** Cut long text to two lines (the full text in `title`). */
  clamp?: boolean;
  /** Hover text for a clamped cell. */
  title?: (row: T) => string | undefined;
  /** Hide this column on the phone card (it is shown elsewhere in the card). */
  hideOnPhone?: boolean;
}

/**
 * The one data table. Columns say how wide they are ("grow" for the title,
 * "fit" for numbers); the title column wraps or clamps, so the other columns
 * never get pushed out of the card. On a phone each row becomes a small card
 * of label and value pairs, so nothing hides off the right edge.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  empty,
  testId,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** What the table is, for screen readers. */
  label: string;
  /** Shown instead of the table with no rows. */
  empty?: ReactNode;
  testId?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const [first, ...rest] = columns;
  return (
    <div data-testid={testId} className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
      <table aria-label={label} className="hidden w-full table-auto text-sm sm:table">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-2.5 font-medium ${c.width === "grow" ? "w-full" : "w-px whitespace-nowrap"} ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="align-top">
              {columns.map((c) => (
                <td
                  key={c.key}
                  title={c.title?.(r)}
                  className={`px-4 py-2.5 ${c.width === "grow" ? "max-w-0 text-zinc-100" : "whitespace-nowrap tabular-nums text-zinc-300"} ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.clamp ? <span className="line-clamp-2 [overflow-wrap:anywhere]">{c.cell(r)}</span> : c.width === "grow" ? <span className="[overflow-wrap:anywhere]">{c.cell(r)}</span> : c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Phone: one card per row. */}
      <ul aria-label={label} className="divide-y divide-zinc-800 sm:hidden">
        {rows.map((r, i) => (
          <li key={rowKey(r, i)} className="min-w-0 px-4 py-3">
            <div className="text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">{first.cell(r)}</div>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {rest
                .filter((c) => !c.hideOnPhone)
                .map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-zinc-400">{c.header}</dt>
                    <dd className="min-w-0 text-right tabular-nums text-zinc-200 [overflow-wrap:anywhere]">{c.cell(r)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
