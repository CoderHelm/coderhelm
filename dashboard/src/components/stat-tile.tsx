import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";
import { focusRing } from "./ui";

/**
 * One number with its label: the stat tile every page uses (Analytics,
 * Learning, Tests, Skills, run detail, Code graph). A `delta` compares with
 * the period before; `href` makes the whole tile a link.
 *
 *   <StatTile label="Merged" value="42" delta={{ text: "+8 vs last month", tone: "up" }} note="Pull requests" />
 */
export function StatTile({
  label,
  value,
  note,
  delta,
  href,
  tone = "neutral",
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  /** One short line under the value. */
  note?: ReactNode;
  delta?: { text: ReactNode; tone?: "up" | "down" | "flat" };
  href?: string;
  /** Colours the value for a state worth seeing at a glance. */
  tone?: "neutral" | "success" | "warning" | "danger";
  testId?: string;
}) {
  const valueColor = { neutral: "text-zinc-50", success: "text-emerald-300", warning: "text-amber-300", danger: "text-red-300" }[tone];
  const deltaColor = delta?.tone === "up" ? "text-emerald-300" : delta?.tone === "down" ? "text-red-300" : "text-zinc-400";
  const body = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <dt className="min-w-0 text-sm text-zinc-400">{label}</dt>
        {href && (
          <span aria-hidden="true" className="shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300">
            <ChevronRightIcon />
          </span>
        )}
      </div>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${valueColor} [overflow-wrap:anywhere]`}>{value}</dd>
      {delta && <dd className={`mt-1 text-xs ${deltaColor}`}>{delta.text}</dd>}
      {note && <dd className="mt-1 text-xs text-zinc-400">{note}</dd>}
    </>
  );
  const box = "group block min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4";
  if (href) {
    return (
      <Link href={href} data-testid={testId} className={`${box} transition-colors hover:border-zinc-700 hover:bg-zinc-900 ${focusRing}`}>
        <dl>{body}</dl>
      </Link>
    );
  }
  return (
    <dl data-testid={testId} className={box}>
      {body}
    </dl>
  );
}

/** A row of stat tiles: 2 across on a phone, up to 4 from `lg:`. */
export function StatGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4 ${className}`.trim()}>{children}</div>;
}
