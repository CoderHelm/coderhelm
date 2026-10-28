"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "@/components/status-pill";
import { FilterSelect } from "@/components/data-source-activity";
import { focusRing } from "@/components/ui";
import { List, ListEmpty, ListError, ListRow, ListSkeleton, ListToolbar, LoadMore, usePagedList, type Tone } from "@/components/list";
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
  action: "" | "read" | "ask" | "apply";
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

function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

const OUTCOME_TONE: Record<string, Tone> = { success: "success", warning: "waiting", error: "danger", neutral: "neutral" };

const metaLink = `text-zinc-400 underline underline-offset-2 hover:text-zinc-200 rounded ${focusRing}`;

/** One read or ask: who, what, why, during which work, and how it went. */
function ActivityRow({ e, showItem }: { e: SkillAccessEvent; showItem: boolean }) {
  const o = outcomeOf(e);
  const handle = `${e.kind}:${e.name}`;
  const origin = originHref(e.origin);
  const wrong = o.tone === "warning" || o.tone === "error";
  const lead = e.action === "ask" ? "Asked: " : e.action === "agent_tool" ? "Input: " : "Why: ";
  return (
    <ListRow
      testId="skill-activity-row"
      status={{ tone: OUTCOME_TONE[o.tone] ?? "neutral" }}
      title={
        <>
          <span className="text-zinc-100">{readerLabel(e.by)}</span>{" "}
          <span className="font-normal text-zinc-300">{actionPhrase(e)}</span>{" "}
          {showItem ? (
            e.kind === "agent" ? (
              <Link href={agentHref(e)} className={`font-mono underline-offset-4 hover:underline rounded ${focusRing}`}>
                {handle}
              </Link>
            ) : (
              <span className="font-mono">{handle}</span>
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
        </>
      }
      meta={[
        <time key="at" dateTime={e.at} title={new Date(e.at).toLocaleString()}>
          {clock(e.at)}
        </time>,
        e.origin ? (
          <span key="on">
            on{" "}
            {origin ? (
              <a href={origin} target="_blank" rel="noreferrer" className={metaLink}>
                {e.origin}
              </a>
            ) : (
              <span className="text-zinc-400">{e.origin}</span>
            )}
          </span>
        ) : null,
        e.run_id ? (
          <Link key="run" href={`/runs/detail?id=${encodeURIComponent(e.run_id)}`} className={metaLink}>
            View run
          </Link>
        ) : null,
        e.action === "ask" && e.ask_id ? (
          <Link key="answer" href={agentHref(e)} className={metaLink}>
            See the answer
          </Link>
        ) : null,
        e.ms > 0 ? seconds(e.ms) : null,
        showItem ? e.repo : null,
      ]}
      chips={
        <span title={o.means}>
          <StatusPill tone={o.tone}>{o.label}</StatusPill>
        </span>
      }
    >
      {e.why && (
        <p className="mt-1 line-clamp-3 text-sm text-zinc-400 [overflow-wrap:anywhere]">
          <span className="sr-only">{e.action === "ask" ? "Question: " : e.action === "agent_tool" ? "Input: " : "Why: "}</span>
          <span aria-hidden="true" className="text-zinc-400">
            {lead}
          </span>
          {e.why}
        </p>
      )}
      {wrong && <p className={`mt-1 text-xs ${o.tone === "error" ? "text-red-300" : "text-amber-300"}`}>{o.means}</p>}
    </ListRow>
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
  const scope = item ? { repo: item.repo, path: item.path } : splitItem(filters.item);
  const key = JSON.stringify([scope, filters.by, filters.action, filters.outcome, filters.range, filters.q]);
  const { items: events, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<SkillAccessEvent>(
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
  const clear = () => onFiltersChange({ ...NO_FILTERS });
  const itemOptions = useMemo(() => [...items].sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`)), [items]);

  return (
    <section aria-labelledby="skill-activity-heading" className="mt-6" id="skill-activity">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="skill-activity-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {heading}
        </h2>
        <p className="text-xs text-zinc-400" aria-live="polite">
          {loading ? "" : events.length === 0 ? "" : `${events.length.toLocaleString()}${next ? "+" : ""} shown`}
        </p>
      </div>

      {/* One item with nothing logged yet: no filters over an empty list. */}
      {!(item && !filtering && !loading && !error && events.length === 0) && (
      <>
      <ListToolbar
        className="mb-3"
        search={{
          value: filters.q,
          onChange: (v) => set({ q: v }),
          placeholder: item ? "Words in the reason or the work" : "A name, words in the reason, a pull request",
          label: "Search",
        }}
        status={{
          label: "Result",
          value: filters.outcome,
          onChange: (v) => set({ outcome: v }),
          options: [
            { value: "", label: "All" },
            { value: "problems", label: "Went wrong", tone: "waiting" },
            { value: "ok", label: "Read", tone: "success" },
            { value: "answered", label: "Answered", tone: "success" },
          ],
        }}
        onClear={filtering ? clear : undefined}
      />
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        {!item && (
          <FilterSelect
            label="Item"
            value={filters.item}
            onChange={(v) => set({ item: v })}
            options={[{ value: "", label: "Every item" }, ...itemOptions.map((s) => ({ value: itemKey(s), label: `${s.kind}:${s.name}` }))]}
          />
        )}
        <FilterSelect
          label="Who"
          value={filters.by}
          onChange={(v) => set({ by: v })}
          options={[
            { value: "", label: "Everyone" },
            { value: "planner", label: "Planner" },
            { value: "coder", label: "Coder" },
            { value: "reviewer", label: "Reviewer" },
            { value: "writer", label: "Writer (PR descriptions, release notes)" },
            { value: "people", label: "People trying an agent" },
          ]}
        />
        <FilterSelect
          label="What"
          value={filters.action}
          onChange={(v) => set({ action: v as ActivityFilters["action"] })}
          options={[
            { value: "", label: "Reads and asks" },
            { value: "read", label: "Reads" },
            { value: "ask", label: "Asks" },
            { value: "apply", label: "Always applied" },
          ]}
        />
        <FilterSelect label="When" value={filters.range} onChange={(v) => set({ range: v as Range })} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
      </div>
      </>
      )}

      {error ? (
        <ListError title="We couldn't load the activity" onRetry={reload}>
          Your skills are not affected.
        </ListError>
      ) : loading ? (
        <ListSkeleton rows={item ? 3 : 5} label="Loading activity" />
      ) : events.length === 0 ? (
        filtering ? (
          <ListEmpty title="Nothing matches these filters." onClear={clear} />
        ) : item ? (
          <ListEmpty title="No reads or asks yet.">Each one shows here with who made it, during which work, and why.</ListEmpty>
        ) : (
          <ListEmpty title="Nothing read or asked yet.">
            When the planner, coder or reviewer reads a skill or asks one of your agents, it shows here with the pull request or ticket and
            the reason it gave.
          </ListEmpty>
        )
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{d.label}</h3>
              <List>
                {d.list.map((e) => (
                  <ActivityRow key={e.id || e.cursor} e={e} showItem={!item} />
                ))}
              </List>
            </div>
          ))}
          <div ref={sentinel} />
          <LoadMore hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />
          {!next && events.length > pageSize / 2 && <p className="text-center text-xs text-zinc-400">That&apos;s everything kept. Reads and asks are kept for 180 days.</p>}
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
