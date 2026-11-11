"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClass, focusRing } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import type { KnowledgeLimits } from "@/lib/knowledge";
import { GAP_WHY, kbUsage, surfaceWords, type Usage as UsageData } from "@/lib/knowledge-usage";
import { missingRoute, relTime } from "@/lib/knowledge-page";

// Usage: what searched this base this week and from where, its most cited
// pages as bars, the runs and chats that used it, the questions it had no
// good answer for (words for managers only), and the pages nothing found.

function Bars({ rows, label }: { rows: { name: string; value: number; note?: string }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5" aria-label={label}>
      {rows.map((r) => (
        <li key={r.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
          <span className="min-w-0 truncate text-zinc-200" title={r.name}>
            {r.name}
          </span>
          <span className="order-3 col-span-2 h-1.5 overflow-hidden rounded-full bg-zinc-800 sm:order-none sm:col-span-1" aria-hidden="true">
            <span className="block h-full rounded-full bg-sky-400" style={{ width: `${Math.max(3, Math.round((r.value / max) * 100))}%` }} />
          </span>
          <span className="text-right text-xs tabular-nums text-zinc-400">{r.note ?? r.value.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

export function Usage({
  kbId,
  limits,
  canManage,
  onSearches,
  onAddPage,
  onAsk,
}: {
  kbId: string;
  limits: KnowledgeLimits | null;
  canManage: boolean;
  /** The week's searches, for the tile. */
  onSearches: (s: { week: number; last_week: number; by_day: number[] } | null) => void;
  onAddPage: () => void;
  onAsk: (question: string) => void;
}) {
  const [u, setU] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    kbUsage
      .get(kbId)
      .then((r) => {
        setU(r);
        onSearches({ week: r.week, last_week: r.last_week, by_day: r.by_day });
      })
      .catch((e) => {
        if (missingRoute(e)) setMissing(true);
        else setError(errorMessage(e, "Couldn't read how it's used."));
        onSearches(null);
      });
    // onSearches is the page's setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId]);
  if (missing) return <p className="text-sm text-zinc-400">Usage is counted from the next search on.</p>;
  if (error)
    return (
      <p className="text-sm text-orange-300" role="alert">
        {error}
      </p>
    );
  if (!u) return <div className="h-32 animate-pulse rounded-xl bg-zinc-900/60 motion-reduce:animate-none" role="status" aria-label="Loading" />;
  const agents = limits?.agents ?? [];
  const surfaces = Object.entries(u.by_surface).sort((a, b) => b[1] - a[1]);
  const block = "min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4";
  const h = "mb-3 text-xs font-medium text-zinc-400";
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2" data-testid="usage">
      <section className={block} aria-label="Searches this week" data-testid="usage-surfaces">
        <h3 className={h}>Searches this week: {u.week.toLocaleString()}</h3>
        {surfaces.length ? <Bars label="Searches by where they came from" rows={surfaces.map(([s, n]) => ({ name: surfaceWords(s, agents), value: n }))} /> : <p className="text-sm text-zinc-400">Nothing searched it this week.</p>}
      </section>
      <section className={block} aria-label="Top pages" data-testid="usage-top">
        <h3 className={h}>Most cited pages, 30 days</h3>
        {u.top_pages.length ? (
          <Bars label="Most cited pages" rows={u.top_pages.map((p) => ({ name: p.title, value: p.cited || p.found, note: `${p.cited} cited · found ${p.found}` }))} />
        ) : (
          <p className="text-sm text-zinc-400">No page has been found by a search yet.</p>
        )}
      </section>
      <section className={block} aria-label="Used in" data-testid="usage-used-in">
        <h3 className={h}>Used in</h3>
        {u.used_in.length ? (
          <ul className="space-y-1.5 text-sm">
            {u.used_in.map((x, i) => (
              <li key={i} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                {x.href ? (
                  <Link href={x.href} className={`min-w-0 max-w-full truncate rounded text-zinc-100 underline underline-offset-4 ${focusRing}`}>
                    {surfaceWords(x.surface, agents).replace(/ runs$/, " run")}
                  </Link>
                ) : (
                  <span className="min-w-0 max-w-full truncate text-zinc-200">{surfaceWords(x.surface, agents).replace(/ runs$/, " run")}</span>
                )}
                {x.actor && <span className="min-w-0 truncate text-zinc-400">{x.actor}</span>}
                <span className="text-xs text-zinc-400">{relTime(x.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">No run or chat has used it yet.</p>
        )}
      </section>
      <section className={block} aria-label="No good answer" data-testid="usage-gaps">
        <h3 className={h}>No good answer, 30 days: {u.no_answer_count.toLocaleString()}</h3>
        {canManage && u.no_answer.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {u.no_answer.map((g) => (
              <li key={g.question} className="min-w-0" data-testid="usage-gap">
                <span className="text-zinc-200 [overflow-wrap:anywhere]">&ldquo;{g.question}&rdquo;</span>
                <span className="text-xs text-zinc-400">
                  {" "}
                  {g.times > 1 ? `×${g.times} · ` : ""}
                  {GAP_WHY[g.why] ?? g.why}
                </span>
                <span className="mt-1 flex flex-wrap gap-2">
                  <button type="button" className={buttonClass("secondary", "sm")} onClick={onAddPage}>
                    Add the page
                  </button>
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => onAsk(g.question)}>
                    Ask again
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">{u.no_answer_count ? "The questions are shown to the people who manage this knowledge base." : "Every question found something to answer with."}</p>
        )}
      </section>
      <section className={`${block} lg:col-span-2`} aria-label="Never found" data-testid="usage-never">
        <h3 className={h}>Never found by a search, {u.kept_days} days: {u.never_found.toLocaleString()}</h3>
        {u.never_found_sample.length > 0 ? (
          <p className="text-sm text-zinc-300 [overflow-wrap:anywhere]">
            {u.never_found_sample.slice(0, 8).map((p) => p.title).join(" · ")}
            {u.never_found > 8 ? ` and ${(u.never_found - 8).toLocaleString()} more` : ""}. Pages nothing finds are candidates to leave out.
          </p>
        ) : (
          <p className="text-sm text-zinc-400">Every searchable page has come up in a search.</p>
        )}
      </section>
    </div>
  );
}
