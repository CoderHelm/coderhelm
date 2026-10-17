"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type DataSource, type DataSourceActivityEvent, type DataSourceKind } from "@/lib/api";
import { actorLabel, errorMessage, formatDuration, timeAgo } from "@/lib/data-sources";
import { Callout } from "./callout";
import { CopyButton } from "./copy-button";
import { StatusPill } from "./status-pill";
import { CodeIcon, DatabaseIcon, LogsIcon } from "./icons";
import { focusRing, inputClass, linkButton, secondaryButton } from "./ui";

/** How often the feed asks for new lookups while it is following. */
export const FOLLOW_INTERVAL_MS = 10_000;

const AGENTS = ["reviewer", "planner", "coder"] as const;
type Who = "all" | (typeof AGENTS)[number] | "people";
type Outcome = "all" | DataSourceActivityEvent["outcome"];

/** A stable identity for an event, whether or not the server sends a cursor. */
export function eventKey(ev: DataSourceActivityEvent): string {
  return ev.cursor || `${ev.at}|${ev.source_id}|${ev.actor}|${ev.summary}`;
}

function matchesWho(ev: DataSourceActivityEvent, who: Who): boolean {
  if (who === "all") return true;
  if (who === "people") return !(AGENTS as readonly string[]).includes(ev.actor);
  return ev.actor === who;
}

function KindIcon({ kind }: { kind?: DataSourceKind }) {
  const icon = kind === "logs" ? <LogsIcon /> : kind === "database" ? <DatabaseIcon /> : <CodeIcon />;
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 scale-90">
      {icon}
    </span>
  );
}

/**
 * A live feed of every lookup Coderhelm and teammates run against connected
 * sources. Follows new lookups while the tab is visible, can be paused,
 * filtered, and paged back.
 */
export function ActivityFeed({
  sources,
  pageSize = 50,
  fullPageLink = false,
}: {
  sources: DataSource[];
  pageSize?: number;
  /** Show a link to the full activity page. */
  fullPageLink?: boolean;
}) {
  const [events, setEvents] = useState<DataSourceActivityEvent[] | null>(null);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [olderState, setOlderState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [source, setSource] = useState("all");
  const [who, setWho] = useState<Who>("all");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const loaded = useRef(false);

  const kinds = useMemo(() => new Map(sources.map((s) => [s.id, s.kind])), [sources]);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listDataSourceActivity(pageSize);
      setError("");
      setEvents((prev) => {
        if (!prev) {
          if (res.events.length < pageSize) setOlderState("done");
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
      setError(errorMessage(e, "The request failed."));
      setEvents((prev) => prev ?? []);
    }
  }, [pageSize]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!following) return;
    const tick = () => { if (document.visibilityState === "visible") refresh(); };
    const id = setInterval(tick, FOLLOW_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [following, refresh]);

  const loadOlder = async () => {
    const last = events?.[events.length - 1];
    if (!last?.cursor) { setOlderState("done"); return; }
    setOlderState("loading");
    try {
      const res = await api.listDataSourceActivity(pageSize, last.cursor);
      setEvents((prev) => {
        const known = new Set((prev ?? []).map(eventKey));
        return [...(prev ?? []), ...res.events.filter((ev) => !known.has(eventKey(ev)))];
      });
      setOlderState(res.events.length < pageSize ? "done" : "idle");
    } catch {
      setOlderState("error");
    }
  };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const sourceOptions = useMemo(() => {
    const names = new Map<string, string>(sources.map((s) => [s.id, s.name]));
    for (const ev of events ?? []) if (!names.has(ev.source_id)) names.set(ev.source_id, ev.source_name);
    return [...names.entries()];
  }, [sources, events]);

  const shown = (events ?? []).filter(
    (ev) => (source === "all" || ev.source_id === source) && matchesWho(ev, who) && (outcome === "all" || ev.outcome === outcome),
  );
  const filtering = source !== "all" || who !== "all" || outcome !== "all";
  const canPageBack = olderState !== "done" && !!events?.length && !!events[events.length - 1]?.cursor;

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
        {fullPageLink && (
          <Link href="/data-sources/activity" className={`${linkButton} ml-auto text-xs`}>Open the full activity log</Link>
        )}
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
            <option value="all">All sources</option>
            {sourceOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Who</span>
          <select value={who} onChange={(e) => setWho(e.target.value as Who)} className={inputClass}>
            <option value="all">Everyone</option>
            <option value="reviewer">Reviewer</option>
            <option value="planner">Planner</option>
            <option value="coder">Coding agent</option>
            <option value="people">People</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Result</span>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} className={inputClass}>
            <option value="all">Any result</option>
            <option value="ok">Worked</option>
            <option value="refused">Refused</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-3">
          <Callout variant="error" title="We couldn't load the activity log">
            <p>{error} Your sources are not affected. {following ? "We'll try again in a few seconds." : "Resume to try again."}</p>
          </Callout>
        </div>
      )}

      {events === null ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          {filtering
            ? "No lookups match these filters."
            : "No lookups yet. They appear here the moment Coderhelm or a teammate runs one."}
        </p>
      ) : (
        <ul className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
          {shown.map((ev) => {
            const key = eventKey(ev);
            const isOpen = open.has(key);
            const full = ev.query || ev.summary;
            const prUrl = ev.repo && ev.pr ? `https://github.com/${ev.repo}/pull/${ev.pr}` : "";
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
                      <span className={`mt-0.5 block break-words text-sm ${ev.outcome === "refused" ? "text-amber-200" : "text-red-200"}`}>{ev.detail}</span>
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
                  <span className="shrink-0">
                    {ev.outcome === "ok"
                      ? <StatusPill tone="success">OK</StatusPill>
                      : ev.outcome === "refused"
                        ? <StatusPill tone="warning">Refused</StatusPill>
                        : <StatusPill tone="error">Failed</StatusPill>}
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
                        <span className="text-zinc-500">{ev.outcome === "ok" ? "Came back: " : ev.outcome === "refused" ? "Refused because: " : "Failed because: "}</span>
                        {ev.detail}
                      </p>
                    )}
                    <p className="text-xs text-zinc-500">
                      Only the lookup is kept, never what came back.
                      {prUrl && (
                        <>
                          {" "}
                          <a href={prUrl} target="_blank" rel="noreferrer" className={`${linkButton} text-xs`}>
                            Open {ev.repo} #{ev.pr} on GitHub
                          </a>
                        </>
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
