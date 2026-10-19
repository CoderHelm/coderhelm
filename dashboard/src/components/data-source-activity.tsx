"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type DataSource, type DataSourceActivityEvent, type DataSourceActivityFilter, type DataSourceKind } from "@/lib/api";
import { actorLabel, errorMessage, formatDuration, timeAgo } from "@/lib/data-sources";
import { RANGES, originHref, rangeSince, type Range } from "@/lib/activity";
import { Callout } from "./callout";
import { CopyButton } from "./copy-button";
import { StatusPill } from "./status-pill";
import { Skeleton } from "./skeleton";
import { CodeIcon, DatabaseIcon, LogsIcon } from "./icons";
import { focusRing, inputClass, linkButton, secondaryButton } from "./ui";

/** How often the feed asks for new lookups while it is following. */
export const FOLLOW_INTERVAL_MS = 10_000;

const AGENTS = ["reviewer", "planner", "coder"] as const;
type Who = "all" | (typeof AGENTS)[number] | "people";
type Outcome = "all" | DataSourceActivityEvent["outcome"] | "problems";

/** The filters the feed starts with, e.g. from the page's address. */
export interface FeedFilters {
  source: string;
  who: Who;
  outcome: Outcome;
  range: Range;
  q: string;
}

export const ALL_LOOKUPS: FeedFilters = { source: "all", who: "all", outcome: "all", range: "all", q: "" };

/** Feed filters from an address's query, ignoring values it doesn't know. */
export function feedFiltersFrom(params: URLSearchParams): FeedFilters {
  const who = params.get("who") ?? "";
  const outcome = params.get("outcome") ?? "";
  const range = params.get("range") ?? "";
  return {
    source: params.get("source") || "all",
    who: (["reviewer", "planner", "coder", "people"] as string[]).includes(who) ? (who as Who) : "all",
    outcome: (["ok", "refused", "failed", "unknown_name", "problems"] as string[]).includes(outcome) ? (outcome as Outcome) : "all",
    range: RANGES.some((r) => r.value === range) ? (range as Range) : "all",
    q: params.get("q") ?? "",
  };
}

/** A stable identity for an event, whether or not the server sends a cursor. */
export function eventKey(ev: DataSourceActivityEvent): string {
  return ev.cursor || `${ev.at}|${ev.source_id}|${ev.actor}|${ev.summary}`;
}

function matchesWho(ev: DataSourceActivityEvent, who: Who): boolean {
  if (who === "all") return true;
  if (who === "people") return !(AGENTS as readonly string[]).includes(ev.actor);
  return ev.actor === who;
}

function matchesOutcome(ev: DataSourceActivityEvent, outcome: Outcome): boolean {
  if (outcome === "all") return true;
  if (outcome === "problems") return ev.outcome !== "ok";
  return ev.outcome === outcome;
}

function matchesWords(ev: DataSourceActivityEvent, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [ev.query, ev.summary, ev.detail, ev.source_name, ev.repo, ev.origin].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Lookups in a row that failed or were refused the same way, shown once. */
export interface LookupGroup {
  key: string;
  first: DataSourceActivityEvent;
  all: DataSourceActivityEvent[];
}

/** Folds consecutive identical failures and refusals into one group each. */
export function groupRepeats(events: DataSourceActivityEvent[]): LookupGroup[] {
  const out: LookupGroup[] = [];
  const same = (a: DataSourceActivityEvent, b: DataSourceActivityEvent) =>
    a.outcome !== "ok" &&
    a.outcome === b.outcome &&
    a.source_id === b.source_id &&
    a.actor === b.actor &&
    (a.query || a.summary) === (b.query || b.summary) &&
    (a.detail ?? "") === (b.detail ?? "");
  for (const ev of events) {
    const last = out[out.length - 1];
    if (last && same(last.first, ev)) last.all.push(ev);
    else out.push({ key: eventKey(ev), first: ev, all: [ev] });
  }
  return out;
}

function KindIcon({ kind }: { kind?: DataSourceKind }) {
  const icon = kind === "logs" ? <LogsIcon /> : kind === "database" ? <DatabaseIcon /> : <CodeIcon />;
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 scale-90">
      {icon}
    </span>
  );
}

function OutcomePill({ outcome }: { outcome: DataSourceActivityEvent["outcome"] }) {
  if (outcome === "ok") return <StatusPill tone="success">OK</StatusPill>;
  if (outcome === "refused") return <StatusPill tone="warning">Refused</StatusPill>;
  if (outcome === "unknown_name") return <StatusPill tone="warning">Unknown name</StatusPill>;
  return <StatusPill tone="error">Failed</StatusPill>;
}

const subtleLink = `text-zinc-400 underline underline-offset-2 hover:text-zinc-200 rounded ${focusRing}`;

/**
 * A live feed of every lookup Coderhelm and teammates run against connected
 * sources. Follows new lookups while the tab is visible, can be paused,
 * filtered (the server filters, so older matches are found too), and paged
 * back. The same failure repeated in a row shows once, with a count.
 */
export function ActivityFeed({
  sources,
  pageSize = 50,
  fullPageLink = false,
  initialFilters = ALL_LOOKUPS,
  onFiltersChange,
}: {
  sources: DataSource[];
  pageSize?: number;
  /** Show a link to the full activity page. */
  fullPageLink?: boolean;
  initialFilters?: FeedFilters;
  /** Called when a filter changes, e.g. to keep it in the address. */
  onFiltersChange?: (f: FeedFilters) => void;
}) {
  const [events, setEvents] = useState<DataSourceActivityEvent[] | null>(null);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [olderState, setOlderState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [older, setOlder] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedFilters>(initialFilters);
  const [search, setSearch] = useState(initialFilters.q);
  const loaded = useRef(false);
  const generation = useRef(0);

  // Follow the address when it changes from outside (back, a summary link).
  const initialKey = JSON.stringify(initialFilters);
  useEffect(() => {
    const f = JSON.parse(initialKey) as FeedFilters;
    setFilters(f);
    setSearch(f.q);
  }, [initialKey]);

  const kinds = useMemo(() => new Map(sources.map((s) => [s.id, s.kind])), [sources]);
  const { source, who, outcome, range, q } = filters;

  const serverFilter = useCallback(
    (): DataSourceActivityFilter => ({
      source: source === "all" ? undefined : source,
      who: who === "all" ? undefined : who,
      outcome: outcome === "all" ? undefined : outcome,
      q: q.trim() || undefined,
      since: rangeSince(range),
    }),
    [source, who, outcome, range, q],
  );

  const setFilter = (patch: Partial<FeedFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    onFiltersChange?.(next);
  };

  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => {
      const next = { ...filters, q: search };
      setFilters(next);
      onFiltersChange?.(next);
    }, 300);
    return () => clearTimeout(t);
  }, [search, filters, onFiltersChange]);

  const refresh = useCallback(async () => {
    const gen = generation.current;
    try {
      const res = await api.listDataSourceActivity(pageSize, undefined, serverFilter());
      if (gen !== generation.current) return;
      setError("");
      setEvents((prev) => {
        if (!prev) {
          const last = res.events[res.events.length - 1];
          const cursor = "next" in res ? (res.next ?? null) : res.events.length < pageSize ? null : (last?.cursor ?? null);
          setOlder(cursor);
          setOlderState(cursor ? "idle" : "done");
          return res.events;
        }
        const known = new Set(prev.map(eventKey));
        const added = res.events.filter((ev) => !known.has(eventKey(ev)));
        if (added.length === 0) return prev;
        if (loaded.current) setFresh(new Set(added.map(eventKey)));
        return [...added, ...prev];
      });
      loaded.current = true;
    } catch (e) {
      if (gen !== generation.current) return;
      setError(errorMessage(e, "The request failed."));
      setEvents((prev) => prev ?? []);
    }
  }, [pageSize, serverFilter]);

  // A new filter starts the list over.
  useEffect(() => {
    generation.current += 1;
    loaded.current = false;
    setEvents(null);
    setOpen(new Set());
    setFresh(new Set());
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!following) return;
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const id = setInterval(tick, FOLLOW_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [following, refresh]);

  const loadOlder = async () => {
    if (!older) {
      setOlderState("done");
      return;
    }
    const gen = generation.current;
    setOlderState("loading");
    try {
      const res = await api.listDataSourceActivity(pageSize, older, serverFilter());
      if (gen !== generation.current) return;
      setEvents((prev) => {
        const known = new Set((prev ?? []).map(eventKey));
        return [...(prev ?? []), ...res.events.filter((ev) => !known.has(eventKey(ev)))];
      });
      const last = res.events[res.events.length - 1];
      const cursor = "next" in res ? (res.next ?? null) : res.events.length < pageSize ? null : (last?.cursor ?? null);
      setOlder(cursor);
      setOlderState(cursor ? "idle" : "done");
    } catch {
      if (gen === generation.current) setOlderState("error");
    }
  };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const sourceOptions = useMemo(() => {
    const names = new Map<string, string>(sources.map((s) => [s.id, s.name]));
    for (const ev of events ?? []) if (!names.has(ev.source_id)) names.set(ev.source_id, ev.source_name);
    return [...names.entries()];
  }, [sources, events]);

  // The server filters; this keeps an older server's answer honest too.
  const since = rangeSince(range);
  const shown = (events ?? []).filter(
    (ev) =>
      (source === "all" || ev.source_id === source) &&
      matchesWho(ev, who) &&
      matchesOutcome(ev, outcome) &&
      matchesWords(ev, q) &&
      (!since || ev.at >= since),
  );
  const groups = groupRepeats(shown);
  const filtering = source !== "all" || who !== "all" || outcome !== "all" || range !== "all" || !!q.trim();
  const canPageBack = olderState !== "done" && !!events?.length && !!older;
  const clear = () => {
    setSearch("");
    setFilter({ ...ALL_LOOKUPS });
  };

  return (
    <section id="activity" aria-labelledby="activity-heading" className="mt-10 scroll-mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="activity-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Activity</h2>
        <span className="flex items-center gap-1.5 text-xs text-zinc-400" aria-live="polite">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${following ? "bg-emerald-400 motion-safe:animate-pulse" : "bg-zinc-600"}`}
          />
          {following ? "Following live" : "Paused"}
        </span>
        <button
          type="button"
          onClick={() => setFollowing((f) => !f)}
          className={`${secondaryButton} !min-h-7 !px-2.5 !py-0.5 text-xs`}
          aria-pressed={!following}
        >
          {following ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          onClick={() => setFilter({ outcome: outcome === "problems" ? "all" : "problems" })}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${
            outcome === "problems" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
          } ${focusRing}`}
          aria-pressed={outcome === "problems"}
        >
          Problems only
        </button>
        {fullPageLink && (
          <Link href="/data-sources/activity" className={`${linkButton} ml-auto text-xs`}>Open the full activity log</Link>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <label className="col-span-2 text-xs text-zinc-400 lg:col-span-4">
          <span className="mb-1 block">Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Words in what was asked, why it failed, or a repository"
            className={inputClass}
          />
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Source</span>
          <select value={source} onChange={(e) => setFilter({ source: e.target.value })} className={inputClass}>
            <option value="all">All sources</option>
            {sourceOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Who</span>
          <select value={who} onChange={(e) => setFilter({ who: e.target.value as Who })} className={inputClass}>
            <option value="all">Everyone</option>
            <option value="reviewer">Reviewer</option>
            <option value="planner">Planner</option>
            <option value="coder">Coding agent</option>
            <option value="people">People</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Result</span>
          <select value={outcome} onChange={(e) => setFilter({ outcome: e.target.value as Outcome })} className={inputClass}>
            <option value="all">Any result</option>
            <option value="problems">Failed or refused</option>
            <option value="ok">Worked</option>
            <option value="refused">Refused</option>
            <option value="failed">Failed</option>
            <option value="unknown_name">Unknown name (not sent)</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">When</span>
          <select value={range} onChange={(e) => setFilter({ range: e.target.value as Range })} className={inputClass}>
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      </div>
      {filtering && (
        <p className="mb-3">
          <button type="button" onClick={clear} className={`${linkButton} text-xs`}>Clear filters</button>
        </p>
      )}

      {error && (
        <div className="mb-3">
          <Callout variant="error" title="We couldn't load the activity log">
            <p>{error} Your sources are not affected. {following ? "We'll try again in a few seconds." : "Resume to try again."}</p>
          </Callout>
        </div>
      )}

      {events === null ? (
        <ul role="status" aria-label="Loading lookups" className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-4 sm:px-5">
              <Skeleton className="h-7 w-7 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </li>
          ))}
        </ul>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          {filtering ? (
            <>
              <p>No lookups match these filters.</p>
              <button type="button" onClick={clear} className={`${linkButton} mt-1 text-sm`}>Clear filters</button>
            </>
          ) : (
            <p>No lookups yet. They appear here the moment Coderhelm or a teammate runs one.</p>
          )}
        </div>
      ) : (
        <ul className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
          {groups.map((g) => {
            const ev = g.first;
            const key = g.key;
            const repeats = g.all.length;
            const isOpen = open.has(key);
            const full = ev.query || ev.summary;
            const prUrl = ev.repo && ev.pr ? `https://github.com/${ev.repo}/pull/${ev.pr}` : "";
            const workUrl = ev.origin ? originHref(ev.origin) : "";
            const oldest = g.all[g.all.length - 1];
            return (
              <li key={key} className={fresh.has(key) ? "animate-feed-in" : undefined} data-testid="activity-row">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/40 sm:px-5 ${focusRing}`}
                >
                  <KindIcon kind={kinds.get(ev.source_id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm text-zinc-100">{ev.summary}</span>
                    {ev.outcome !== "ok" && ev.detail && (
                      <span className={`mt-0.5 block break-words text-sm ${ev.outcome === "failed" ? "text-red-200" : "text-amber-200"}`}>{ev.detail}</span>
                    )}
                    <span className="mt-1 block break-words text-xs text-zinc-500">
                      <span className="text-zinc-400">{actorLabel(ev)}</span>
                      <span aria-hidden="true"> · </span>
                      {ev.source_name}
                      <span aria-hidden="true"> · </span>
                      <time dateTime={ev.at} title={new Date(ev.at).toLocaleString()}>{timeAgo(ev.at)}</time>
                      {ev.ms > 0 && (<><span aria-hidden="true"> · </span>{formatDuration(ev.ms)}</>)}
                      {ev.outcome === "ok" && ev.detail && (<><span aria-hidden="true"> · </span>{ev.detail}</>)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <OutcomePill outcome={ev.outcome} />
                    {repeats > 1 && (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium tabular-nums text-zinc-300">
                        {repeats} times in a row
                      </span>
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pl-[3.75rem]">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950">
                      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-1.5">
                        <span className="text-xs text-zinc-500">What was asked</span>
                        <CopyButton text={full} />
                      </div>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-zinc-200">{full}</pre>
                    </div>
                    {ev.detail && (
                      <p className="text-sm text-zinc-400">
                        <span className="text-zinc-500">{ev.outcome === "ok" ? "Came back: " : ev.outcome === "refused" ? "Refused because: " : ev.outcome === "unknown_name" ? "Not sent, because: " : "Failed because: "}</span>
                        {ev.detail}
                      </p>
                    )}
                    {repeats > 1 && (
                      <p className="text-sm text-zinc-400">
                        The same lookup {ev.outcome === "refused" ? "was refused" : ev.outcome === "unknown_name" ? "was stopped" : "failed"} {repeats} times in a row, from{" "}
                        <time dateTime={oldest.at}>{new Date(oldest.at).toLocaleString()}</time> to{" "}
                        <time dateTime={ev.at}>{new Date(ev.at).toLocaleString()}</time>.
                      </p>
                    )}
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>Only the lookup is kept, never what came back.</span>
                      {ev.origin && !prUrl && (
                        <span className="[overflow-wrap:anywhere]">
                          During{" "}
                          {workUrl ? (
                            <a href={workUrl} target="_blank" rel="noreferrer" className={subtleLink}>{ev.origin}</a>
                          ) : (
                            <span className="text-zinc-400">{ev.origin}</span>
                          )}
                        </span>
                      )}
                      {ev.run_id && (
                        <Link href={`/runs/detail?id=${encodeURIComponent(ev.run_id)}`} className={`${linkButton} text-xs`}>View run</Link>
                      )}
                      {prUrl && (
                        <a href={prUrl} target="_blank" rel="noreferrer" className={`${linkButton} text-xs`}>
                          Open {ev.repo} #{ev.pr} on GitHub
                        </a>
                      )}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canPageBack && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={loadOlder} disabled={olderState === "loading"} className={secondaryButton}>
            {olderState === "loading" ? "Loading…" : "Load older"}
          </button>
          {olderState === "error" && <span className="text-sm text-red-200">Couldn&apos;t load older lookups. Try again.</span>}
        </div>
      )}
    </section>
  );
}
