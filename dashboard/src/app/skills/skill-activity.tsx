"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Callout } from "@/components/callout";
import { BookIcon, ChatIcon, ClipboardIcon } from "@/components/icons";
import { usePagedList } from "@/components/load-more";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { focusRing, inputClass, linkButton, secondaryButton } from "@/components/ui";
import {
  RANGES,
  actionPhrase,
  activityApi,
  clock,
  dayLabel,
  originHref,
  outcomeOf,
  rangeSince,
  readerLabel,
  type Range,
  type SkillAccessEvent,
} from "@/lib/activity";
import { agentHref, type Skill } from "@/lib/skills";

/** The filters the log can show, as kept in the page's address. */
export interface ActivityFilters {
  item: string;
  by: string;
  action: "" | "read" | "ask";
  outcome: string;
  range: Range;
  q: string;
}

export const NO_FILTERS: ActivityFilters = { item: "", by: "", action: "", outcome: "", range: "all", q: "" };

const itemKey = (s: { repo: string; path: string }) => `${s.repo}#${s.path}`;

function splitItem(key: string): { repo?: string; path?: string } {
  const i = key.indexOf("#");
  return i > 0 ? { repo: key.slice(0, i), path: key.slice(i + 1) } : {};
}

function ActionIcon({ action }: { action: SkillAccessEvent["action"] }) {
  const icon = action === "ask" ? <ChatIcon /> : action === "read_file" ? <ClipboardIcon /> : <BookIcon />;
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
      {icon}
    </span>
  );
}

function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

/** One read or ask: who, what, why, during which work, and how it went. */
function ActivityRow({ e, showItem }: { e: SkillAccessEvent; showItem: boolean }) {
  const o = outcomeOf(e);
  const handle = `${e.kind}:${e.name}`;
  const origin = originHref(e.origin);
  const wrong = o.tone === "warning" || o.tone === "error";
  return (
    <li data-testid="skill-activity-row" className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <ActionIcon action={e.action} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col items-start gap-1 sm:flex-row sm:justify-between sm:gap-3">
          <p className="min-w-0 text-sm text-zinc-300 [overflow-wrap:anywhere] sm:flex-1">
            <span className="font-medium text-zinc-100">{readerLabel(e.by)}</span> {actionPhrase(e)}{" "}
            {showItem ? (
              e.kind === "agent" ? (
                <Link href={agentHref(e)} className={`font-mono text-zinc-100 underline-offset-4 hover:underline rounded ${focusRing}`}>
                  {handle}
                </Link>
              ) : (
                <span className="font-mono text-zinc-100">{handle}</span>
              )
            ) : (
              "it"
            )}
            {e.file && (
              <>
                {": "}
                <span className="font-mono text-xs text-zinc-400">{e.file.split("/").pop()}</span>
              </>
            )}
          </p>
          <span title={o.means} className="shrink-0">
            <StatusPill tone={o.tone}>{o.label}</StatusPill>
          </span>
        </div>
        {e.why && (
          <p className="mt-1 line-clamp-3 text-sm text-zinc-400 [overflow-wrap:anywhere]">
            <span className="sr-only">{e.action === "ask" ? "Question: " : "Why: "}</span>
            <span aria-hidden="true" className="text-zinc-600">
              {e.action === "ask" ? "Asked: " : "Why: "}
            </span>
            {e.why}
          </p>
        )}
        {wrong && <p className={`mt-1 text-xs ${o.tone === "error" ? "text-red-300" : "text-amber-300"}`}>{o.means}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-500">
          <time dateTime={e.at} title={new Date(e.at).toLocaleString()}>
            {clock(e.at)}
          </time>
          {e.origin && (
            <>
              <span aria-hidden="true">·</span>
              <span className="[overflow-wrap:anywhere]">
                on{" "}
                {origin ? (
                  <a href={origin} target="_blank" rel="noreferrer" className={`text-zinc-400 underline underline-offset-2 hover:text-zinc-200 rounded ${focusRing}`}>
                    {e.origin}
                  </a>
                ) : (
                  <span className="text-zinc-400">{e.origin}</span>
                )}
              </span>
            </>
          )}
          {e.run_id && (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/runs/detail?id=${encodeURIComponent(e.run_id)}`} className={`text-zinc-400 underline underline-offset-2 hover:text-zinc-200 rounded ${focusRing}`}>
                View run
              </Link>
            </>
          )}
          {e.action === "ask" && e.ask_id && (
            <>
              <span aria-hidden="true">·</span>
              <Link href={agentHref(e)} className={`text-zinc-400 underline underline-offset-2 hover:text-zinc-200 rounded ${focusRing}`}>
                See the answer
              </Link>
            </>
          )}
          {e.ms > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{seconds(e.ms)}</span>
            </>
          )}
          {!showItem ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span className="[overflow-wrap:anywhere]">{e.repo}</span>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul role="status" aria-label="Loading activity" className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <Skeleton className="h-8 w-8 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

/**
 * The access log of a team's skills: every read and ask, newest first,
 * grouped by day. Filterable by item, reader, kind, result, time and words;
 * older entries load as the list is scrolled. With `item` set it shows one
 * item's activity only, without the item filter.
 */
export function SkillActivity({
  items = [],
  item,
  filters,
  onFiltersChange,
  pageSize = 50,
  heading = "Activity",
}: {
  items?: Skill[];
  /** Show only this item's activity. */
  item?: { repo: string; path: string; name: string };
  filters: ActivityFilters;
  onFiltersChange: (f: ActivityFilters) => void;
  pageSize?: number;
  heading?: string;
}) {
  const [search, setSearch] = useState(filters.q);
  // Follow the address when it changes from outside (back, a summary link).
  useEffect(() => setSearch(filters.q), [filters.q]);
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => onFiltersChange({ ...filters, q: search }), 300);
    return () => clearTimeout(t);
  }, [search, filters, onFiltersChange]);

  const scope = item ? { repo: item.repo, path: item.path } : splitItem(filters.item);
  const key = JSON.stringify([scope, filters.by, filters.action, filters.outcome, filters.range, filters.q]);
  const { items: events, next, loading, loadingMore, error, loadMore, reload } = usePagedList<SkillAccessEvent>(
    async (cursor) => {
      const r = await activityApi.skills(
        { ...scope, by: filters.by, action: filters.action, outcome: filters.outcome, q: filters.q, since: rangeSince(filters.range) },
        cursor,
        pageSize,
      );
      return { items: r.events, next: r.next };
    },
    [key],
  );

  // Load older entries as the end of the list comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((x) => x.isIntersecting) && loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loadMore]);

  const days = useMemo(() => {
    const out: { label: string; list: SkillAccessEvent[] }[] = [];
    for (const e of events) {
      const label = dayLabel(e.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.list.push(e);
      else out.push({ label, list: [e] });
    }
    return out;
  }, [events]);

  const filtering = (!item && !!filters.item) || !!filters.by || !!filters.action || !!filters.outcome || filters.range !== "all" || !!filters.q;
  const set = (patch: Partial<ActivityFilters>) => onFiltersChange({ ...filters, ...patch });
  const itemOptions = useMemo(() => [...items].sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`)), [items]);

  return (
    <section aria-labelledby="skill-activity-heading" className="mt-6" id="skill-activity">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="skill-activity-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {heading}
        </h2>
        <p className="text-xs text-zinc-500" aria-live="polite">
          {loading ? "" : events.length === 0 ? "" : `${events.length.toLocaleString()}${next ? "+" : ""} shown`}
        </p>
      </div>

      <div className={`mb-3 grid grid-cols-2 gap-2 ${item ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
        <label className={`text-xs text-zinc-400 ${item ? "col-span-2 lg:col-span-4" : "col-span-2 lg:col-span-5"}`}>
          <span className="mb-1 block">Search</span>
          <input
            type="search"
            className={inputClass}
            placeholder={item ? "Words in the reason or the work" : "A name, words in the reason, a pull request"}
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
          />
        </label>
        {!item && (
          <label className="text-xs text-zinc-400">
            <span className="mb-1 block">Item</span>
            <select value={filters.item} onChange={(ev) => set({ item: ev.target.value })} className={inputClass}>
              <option value="">Every item</option>
              {itemOptions.map((s) => (
                <option key={itemKey(s)} value={itemKey(s)}>
                  {s.kind}:{s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Who</span>
          <select value={filters.by} onChange={(ev) => set({ by: ev.target.value })} className={inputClass}>
            <option value="">Everyone</option>
            <option value="planner">Planner</option>
            <option value="coder">Coder</option>
            <option value="reviewer">Reviewer</option>
            <option value="people">People trying an agent</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">What</span>
          <select value={filters.action} onChange={(ev) => set({ action: ev.target.value as ActivityFilters["action"] })} className={inputClass}>
            <option value="">Reads and asks</option>
            <option value="read">Reads</option>
            <option value="ask">Asks</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Result</span>
          <select value={filters.outcome} onChange={(ev) => set({ outcome: ev.target.value })} className={inputClass}>
            <option value="">Any result</option>
            <option value="problems">Went wrong</option>
            <option value="ok">Read</option>
            <option value="answered">Answered</option>
            <option value="off">Switched off</option>
            <option value="limit">Over the limit</option>
            <option value="failed">Failed or no answer</option>
            <option value="timed_out">Took too long</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">When</span>
          <select value={filters.range} onChange={(ev) => set({ range: ev.target.value as Range })} className={inputClass}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtering && (
        <p className="mb-3">
          <button type="button" className={`${linkButton} text-xs`} onClick={() => onFiltersChange({ ...NO_FILTERS })}>
            Clear filters
          </button>
        </p>
      )}

      {error ? (
        <Callout variant="error" title="We couldn't load the activity">
          <p>
            Your skills are not affected.{" "}
            <button type="button" className={`${linkButton} text-sm`} onClick={reload}>
              Try again
            </button>
          </p>
        </Callout>
      ) : loading ? (
        <RowsSkeleton rows={item ? 3 : 5} />
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          {filtering ? (
            <>
              <p>Nothing matches these filters.</p>
              <button type="button" className={`${linkButton} mt-1 text-sm`} onClick={() => onFiltersChange({ ...NO_FILTERS })}>
                Clear filters
              </button>
            </>
          ) : item ? (
            <p>No reads or asks yet. Each one shows here with who made it, during which work, and why.</p>
          ) : (
            <p>
              Nothing read or asked yet. When the planner, coder or reviewer reads a skill or asks one of your agents, it shows here
              with the pull request or ticket and the reason it gave.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d.label}>
              <h3 className="mb-2 text-xs font-medium text-zinc-400">{d.label}</h3>
              <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
                {d.list.map((e) => (
                  <ActivityRow key={e.id || e.cursor} e={e} showItem={!item} />
                ))}
              </ul>
            </div>
          ))}
          <div ref={sentinel} />
          {next && (
            <div className="flex justify-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className={secondaryButton}>
                {loadingMore ? "Loading…" : "Load older"}
              </button>
            </div>
          )}
          {!next && events.length > pageSize / 2 && <p className="text-center text-xs text-zinc-600">That&apos;s everything kept. Reads and asks are kept for 180 days.</p>}
        </div>
      )}
    </section>
  );
}

/** One item's own recent reads and asks, for its page or opened card. */
export function ItemActivity({ item, heading = "Recent activity" }: { item: { repo: string; path: string; name: string }; heading?: string }) {
  const [filters, setFilters] = useState<ActivityFilters>(NO_FILTERS);
  return <SkillActivity item={item} filters={filters} onFiltersChange={setFilters} pageSize={10} heading={heading} />;
}
