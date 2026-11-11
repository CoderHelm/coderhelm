"use client";

import type { ReactNode } from "react";
import { StatusDot, type Tone } from "@/components/list/status";
import { buttonClass, focusRing, linkButton } from "@/components/ui";
import { KIND_LABEL, READ_SENTENCE, baseHealth, fixLabel, readerWords, syncCount, type Base, type KnowledgeLimits } from "@/lib/knowledge";
import { relTime, type PageSource } from "@/lib/knowledge-page";

// The knowledge base page's smaller parts: the one overall status, the
// four tiles, the problems banner, the in-page nav and Access.

/**
 * How far a source's sync is, in the card's own words: a first sync counts
 * documents searchable of the real total ("Syncing (265 of 4,812)"), a later
 * one the changes it brings in. Never progress against the limit.
 */
export function syncWords(s: PageSource): string | null {
  const c = syncCount(s);
  if (!c) return null;
  const n = `${c.done.toLocaleString()} of ${c.total.toLocaleString()}`;
  return c.first ? `Syncing (${n})` : `Bringing in ${n} change${c.total === 1 ? "" : "s"}`;
}

/** One status for the whole base, from its sources: a dot and its words. */
export function overallStatus(base: Base, sources: PageSource[]): { tone: Tone; words: string } | null {
  const syncing = sources.map(syncWords).find(Boolean);
  if (sources.some((s) => s.status === "error")) {
    const n = sources.filter((s) => s.status === "error").length;
    return { tone: "attention", words: n > 1 ? `${n} sources need attention` : "Needs attention" };
  }
  if (syncing) return { tone: "live", words: syncing };
  const h = baseHealth({ ...base, sources });
  if (!h) return base.ready ? { tone: "success", words: "Ready" } : null;
  const tone: Tone = h.tone === "attention" ? "attention" : h.tone === "live" ? "live" : h.tone === "muted" ? "muted" : "success";
  return { tone, words: h.tone === "success" ? "Up to date" : h.words };
}

export function StatusChip({ status }: { status: { tone: Tone; words: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 text-xs font-medium text-zinc-200" data-testid="base-status" aria-live="polite">
      <StatusDot tone={status.tone} />
      {status.words}
    </span>
  );
}

function Tile({ label, value, children, testId }: { label: string; value: ReactNode; children?: ReactNode; testId: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 sm:p-4" data-testid={testId}>
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-zinc-50 sm:text-2xl">{value}</p>
      {children && <div className="mt-1 min-w-0 text-xs text-zinc-400 [overflow-wrap:anywhere]">{children}</div>}
    </div>
  );
}

export interface TileData {
  searchable: number;
  failed: number;
  skipped: number;
  working: number;
  passages: number;
  /** Searches this week, when the gateway counts them. */
  searches?: { week: number; last_week: number; by_day: number[] } | null;
}

/** A tiny bar per day (bars, not a gauge), with the numbers spoken. */
function DayBars({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  return (
    <span className="mt-1 flex h-5 items-end gap-0.5" role="img" aria-label={`Searches per day: ${days.join(", ")}`}>
      {days.map((d, i) => (
        <span key={i} className="w-1.5 rounded-sm bg-sky-400/70" style={{ height: `${Math.max(8, Math.round((d / max) * 100))}%` }} />
      ))}
    </span>
  );
}

export function Tiles({ data, sources, onShow }: { data: TileData; sources: PageSource[]; onShow: (status: "failed" | "skipped") => void }) {
  const newest = sources.map((s) => s.last_success_at).filter(Boolean).sort().reverse()[0];
  const next = sources
    .filter((s) => !s.paused && s.next_sync_at)
    .map((s) => s.next_sync_at)
    .sort()[0];
  const live = sources.filter((s) => s.live_updates).length;
  const firstSync = sources.filter((s) => s.status === "syncing" && !s.last_success_at).map(syncWords).find(Boolean);
  const s = data.searches;
  const change = s && s.last_week > 0 ? Math.round(((s.week - s.last_week) / s.last_week) * 100) : null;
  return (
    <div className="mt-6 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4" data-testid="tiles">
      <Tile label="Pages searchable" value={data.searchable.toLocaleString()} testId="tile-pages">
        {firstSync ? (
          <span data-testid="tile-first-sync">{firstSync}</span>
        ) : data.failed || data.skipped ? (
          <span className="flex flex-wrap gap-x-2">
            {data.failed > 0 && (
              <button type="button" className={linkButton} onClick={() => onShow("failed")} data-testid="tile-failed">
                {data.failed.toLocaleString()} couldn&apos;t read
              </button>
            )}
            {data.skipped > 0 && (
              <button type="button" className={linkButton} onClick={() => onShow("skipped")}>
                {data.skipped.toLocaleString()} skipped
              </button>
            )}
          </span>
        ) : data.working ? (
          <span>{data.working.toLocaleString()} being read</span>
        ) : (
          <span>None failed</span>
        )}
      </Tile>
      <Tile label="Passages" value={data.passages.toLocaleString()} testId="tile-passages">
        <span>What a search ranks</span>
      </Tile>
      <Tile label="Freshness" value={newest ? relTime(newest) || "just now" : sources.length ? "Not yet" : "Uploads only"} testId="tile-fresh">
        {sources.length > 0 && (
          <span>
            {next ? `Next check ${relTime(next)}` : "No check scheduled"} · live updates {live === 0 ? "off" : live === sources.length ? "on" : `on for ${live}`}
          </span>
        )}
      </Tile>
      <Tile label="Searched this week" value={s ? s.week.toLocaleString() : "Not yet"} testId="tile-searches">
        {s ? (
          <>
            <DayBars days={s.by_day} />
            <span className="mt-1 block">{change === null ? "No searches last week" : `${change >= 0 ? "+" : ""}${change}% on last week`}</span>
          </>
        ) : (
          <span>Counted from the next search on</span>
        )}
      </Tile>
    </div>
  );
}

/** Shown only when something is wrong: each problem with its one fix. */
export function ProblemsBanner({
  sources,
  failed,
  canManage,
  onFix,
  onShowFailed,
}: {
  sources: PageSource[];
  failed: number;
  canManage: boolean;
  onFix: (s: PageSource) => void;
  onShowFailed: () => void;
}) {
  const broken = sources.filter((s) => s.status === "error");
  if (!broken.length && !failed) return null;
  return (
    <div className="mt-4 min-w-0 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 sm:p-4" role="region" aria-label="Problems" data-testid="problems">
      <p className="text-sm font-semibold text-orange-200">
        {broken.length + (failed ? 1 : 0)} {broken.length + (failed ? 1 : 0) === 1 ? "problem" : "problems"}
        <span className="font-normal text-orange-200/80"> · pages already brought in stay searchable</span>
      </p>
      <ul className="mt-2 space-y-2">
        {broken.map((s) => {
          const fix = fixLabel(s);
          return (
            <li key={s.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm" data-testid="problem">
              <span className="inline-flex min-w-0 flex-1 basis-60 items-start gap-2 text-zinc-200">
                <StatusDot tone="attention" className="mt-1.5" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-medium">{s.name}</span> ({KIND_LABEL[s.kind]}): {s.error?.fix || s.error?.message || "It stopped syncing."}
                </span>
              </span>
              {canManage && fix && (
                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onFix(s)} data-testid="problem-fix">
                  {fix}
                </button>
              )}
            </li>
          );
        })}
        {failed > 0 && (
          <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm" data-testid="problem">
            <span className="inline-flex min-w-0 flex-1 basis-60 items-start gap-2 text-zinc-200">
              <StatusDot tone="attention" className="mt-1.5" />
              <span>
                {failed.toLocaleString()} {failed === 1 ? "page" : "pages"} couldn&apos;t be read
              </span>
            </span>
            <button type="button" className={buttonClass("secondary", "sm")} onClick={onShowFailed} data-testid="problem-see">
              See them
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/** The sections, as links: one row that wraps, sticky under the top bar. */
export function PageNav({ sections }: { sections: { id: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="mt-5 rounded-lg border border-zinc-800/80 bg-zinc-950/90 px-2 py-1.5 backdrop-blur sm:px-3 lg:sticky lg:top-2 lg:z-10" data-testid="page-nav">
      <ul className="flex min-w-0 flex-wrap gap-x-1 gap-y-1">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className={`inline-block rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100 ${focusRing}`}>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Access({
  base,
  limits,
  visibilityNote,
  canManage,
  onChange,
}: {
  base: Base;
  limits: KnowledgeLimits | null;
  visibilityNote: string;
  canManage: boolean;
  onChange: () => void;
}) {
  const agentLabel = (k: string) => limits?.agents.find((a) => a.key === k)?.label ?? k;
  const agents = base.agents.map(agentLabel);
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4" data-testid="access">
      <dl className="divide-y divide-zinc-800/60 text-sm">
        <div className="grid gap-0.5 py-2 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-xs font-medium text-zinc-400 sm:pt-0.5">Who reads it</dt>
          <dd className="text-zinc-300" data-testid="read-line">
            {READ_SENTENCE[base.read_role] ?? ""}
            {!!base.readers?.length && <span data-testid="readers-line"> Only {base.readers.map(readerWords).join(", ")}.</span>}
          </dd>
        </div>
        <div className="grid gap-0.5 py-2 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-xs font-medium text-zinc-400 sm:pt-0.5">Searched by</dt>
          <dd className="text-zinc-300" data-testid="searched-by">
            Chat{agents.length ? `, ${agents.join(", ")}` : ""}
            {base.attach_team ? " and every agent of the team" : ""}
            {base.agent_access_note && (
              <span className="mt-1 block text-zinc-400" data-testid="agent-access-note">
                {base.agent_access_note}
              </span>
            )}
          </dd>
        </div>
        {visibilityNote && (
          <div className="grid gap-0.5 py-2 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="text-xs font-medium text-zinc-400 sm:pt-0.5">Who sees pages</dt>
            <dd className="text-zinc-400">{visibilityNote}</dd>
          </div>
        )}
        <div className="grid gap-0.5 py-2 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-xs font-medium text-zinc-400 sm:pt-0.5">Source of truth</dt>
          <dd className="text-zinc-300">{base.authoritative ? "Yes: its passages win over others when they disagree." : "No"}</dd>
        </div>
      </dl>
      {canManage && (
        <button type="button" className={`${buttonClass("secondary", "sm")} mt-3`} onClick={onChange} data-testid="access-change">
          Change
        </button>
      )}
    </div>
  );
}
