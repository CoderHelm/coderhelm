"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Callout } from "@/components/callout";
import { CopyButton } from "@/components/copy-button";
import { Drawer } from "@/components/drawer";
import { BookIcon, ChevronRightIcon, CloudIcon, CodeIcon, LockIcon, LogsIcon, PlanIcon, SearchIcon, ShieldIcon, XIcon } from "@/components/icons";
import { StatusDot } from "@/components/list/status";
import { timeAgo } from "@/components/list/time";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { Segmented } from "@/components/segmented";
import { Code } from "@/components/settings/code";
import { Switch } from "@/components/settings/switch";
import { StatusPill } from "@/components/status-pill";
import { focusRing, inputClass, linkButton, smallPrimaryButton, smallSecondaryButton, buttonClass } from "@/components/ui";
import {
  AUDIENCE_ROLES,
  SHARE_DAYS,
  builtinBases,
  countLabel,
  countsLine,
  parsePeople,
  plural,
  shortCount,
  type BaseResult,
  type BaseSearch,
  type BuiltinBase,
  type BuiltinKey,
  type BuiltinList,
  type ShareDays,
} from "@/lib/builtin-bases";

// The six built-in bases on the Knowledge page, above the ones people made.
// One overview: per base what it holds in a few numbers, how fresh it is and
// who reads it. One search runs across the bases open to the person, the
// results grouped by base, with what was held back named. A base opens in a
// side panel with the rest: the full description, how access follows GitHub
// or Jira, and for admins who reads it. A search can be shared as a link that
// checks access again whoever opens it.

const ICON: Record<BuiltinKey, () => ReactNode> = {
  code: CodeIcon,
  work: PlanIcon,
  infra: CloudIcon,
  logs: LogsIcon,
  security: ShieldIcon,
  team: BookIcon,
};

/** What each base holds, in a few words for the overview; the panel has the gateway's full line. */
const SHORT_ABOUT: Record<BuiltinKey, string> = {
  code: "Repositories, files and history",
  work: "Tickets, pull requests and runs",
  infra: "AWS resources and their code",
  logs: "Log findings and alerts",
  security: "Advisories, CVEs and findings",
  team: "The bases your team made",
};

function BaseIcon({ k, size = "md" }: { k: BuiltinKey; size?: "sm" | "md" }) {
  const I = ICON[k] ?? BookIcon;
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/60 text-zinc-200 ${size === "sm" ? "h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5" : "h-9 w-9"}`}>
      <I />
    </span>
  );
}

function freshness(b: BuiltinBase): { words: string; live: boolean } {
  if (b.live) return { words: b.updated_at ? `Live, updated ${timeAgo(b.updated_at)}` : "Live", live: true };
  if (b.updated_at) return { words: `Updated ${timeAgo(b.updated_at)}`, live: false };
  return { words: "Not read yet", live: false };
}

/** The one state worth a pill on the overview, if any. */
function stateOf(b: BuiltinBase): { tone: "warning" | "neutral"; words: string } | null {
  if (!b.access.open) return { tone: "warning", words: "Not open to you" };
  if (b.audience.paused) return { tone: "neutral", words: "Paused" };
  if (!b.updated_at && !b.live) return { tone: "neutral", words: "Not read yet" };
  return null;
}

export function BuiltinBases() {
  const [list, setList] = useState<BuiltinList | null>(null);
  const [failed, setFailed] = useState(false);
  const [openKey, setOpenKey] = useState<BuiltinKey | null>(null);
  const [scope, setScope] = useState<BuiltinKey[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let live = true;
    builtinBases
      .list()
      .then((r) => {
        if (!live) return;
        // Anything but the list (an older gateway answering another route): as if it failed.
        if (r && Array.isArray(r.bases)) setList({ ...r, bases: r.bases.filter((b) => b && Array.isArray(b.counts) && b.access && b.audience) });
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  // An install whose gateway predates the built-in bases: the page shows the
  // bases people made, as before.
  if (failed) return null;
  if (!list) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading the built-in bases">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40 motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  const replace = (b: BuiltinBase) => setList((l) => (l ? { ...l, bases: l.bases.map((x) => (x.key === b.key ? b : x)) } : l));
  const opened = list.bases.find((b) => b.key === openKey) ?? null;

  return (
    <section aria-labelledby="builtin-heading" data-testid="builtin-bases">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-xl flex-1 basis-80">
          <h2 id="builtin-heading" className="text-base font-semibold text-zinc-100">
            Built in
          </h2>
          <p className="mt-1 text-sm text-zinc-400">Kept up to date with nothing to set up; Chat and AI tools answer from them.</p>
        </div>
        {list.can_manage && <ReadersSetting enabled={list.readers.enabled} onChange={(enabled) => setList((l) => (l ? { ...l, readers: { enabled } } : l))} />}
      </div>

      <CrossSearch bases={list.bases} scope={scope} setScope={setScope} inputRef={searchRef} />

      <ul className="mt-3 min-w-0 divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50" aria-label="Built-in bases">
        {list.bases.map((b) => (
          <BaseCard
            key={b.key}
            b={b}
            onOpen={(el) => {
              openerRef.current = el;
              setOpenKey(b.key);
            }}
          />
        ))}
      </ul>

      <BaseDrawer
        b={opened}
        canManage={list.can_manage}
        readersOn={list.readers.enabled}
        returnFocusTo={openerRef}
        onClose={() => setOpenKey(null)}
        onChange={replace}
        onSearch={(k) => {
          setScope([k]);
          setOpenKey(null);
          // After the panel hands focus back to the card.
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
      />
    </section>
  );
}

// ── Readers from AI tools ──────────────────────────────────────────────

function ReadersSetting({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  const labelId = useId();
  const helpId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toggle = async (v: boolean) => {
    // Shown at once; put back if the save fails.
    onChange(v);
    setSaving(true);
    setError("");
    try {
      const r = await builtinBases.setReaders(v);
      onChange(r.enabled);
    } catch (e) {
      onChange(!v);
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="min-w-0 max-w-full" data-testid="readers-toggle">
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
        <Switch checked={enabled} onChange={toggle} labelledBy={labelId} describedBy={helpId} disabled={saving} testId="readers-switch" />
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-sm font-medium text-zinc-200">
            AI tools as readers
          </p>
          <p id={helpId} className="text-xs text-zinc-400">
            No account, not a seat. Read only.
          </p>
        </div>
        <Popover>
          <PopoverTrigger className={`shrink-0 text-xs text-zinc-300 underline underline-offset-4 hover:text-zinc-100 ${focusRing} rounded`} data-testid="readers-more">
            Learn more
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3 text-sm text-zinc-300" data-testid="readers-more-panel">
            Someone in your GitHub organization signs in with GitHub when they connect Claude, ChatGPT, Cursor or VS Code. They read only the bases open to readers, and can&apos;t change anything. Turn readers on per base in its panel.
          </PopoverContent>
        </Popover>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

// ── The overview ───────────────────────────────────────────────────────

function BaseCard({ b, onOpen }: { b: BuiltinBase; onOpen: (el: HTMLElement) => void }) {
  const state = stateOf(b);
  const stats = b.counts.filter((c) => c.count > 0).slice(0, 3);
  const roles = AUDIENCE_ROLES.filter((r) => b.audience.roles.includes(r.key)).map((r) => r.label);
  const people = b.audience.people.length;
  const who = `${roles.length ? roles.join(", ") : "All roles"}${people ? ` +${people}` : ""}`;
  const whoSpoken = `${roles.length ? listWords(roles) : "All roles"}${people ? ` and ${plural(people, "person", "people")}` : ""}`;
  // The row says "Live" or how long ago; the panel has both.
  const fresh = b.live ? "Live" : b.updated_at ? `Updated ${timeAgo(b.updated_at)}` : "";
  const status = state ? (
    <span data-testid="builtin-state" className="min-w-0 max-w-full">
      <StatusPill tone={state.tone}>{state.words}</StatusPill>
    </span>
  ) : (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-400" data-testid="builtin-fresh">
      <StatusDot tone={b.live ? "success" : "neutral"} live={false} className="!h-1.5 !w-1.5" />
      <span className="truncate">{fresh}</span>
    </span>
  );
  return (
    <li className="min-w-0" data-testid="builtin-card" data-key={b.key} data-open={b.access.open ? "yes" : "no"}>
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        aria-haspopup="dialog"
        data-testid="builtin-open"
        className={`group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 py-3 text-left transition-colors [grid-template-areas:'base_base'_'stats_stats'_'who_status'] hover:bg-zinc-800/40 motion-reduce:transition-none lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,9rem)_minmax(0,8.5rem)_1rem] lg:items-center lg:gap-x-4 lg:py-2 lg:[grid-template-areas:'base_stats_who_status_chevron'] ${focusRing} focus-visible:outline-offset-[-2px]`}
      >
        <span className="flex min-w-0 items-center gap-3 [grid-area:base]">
          <BaseIcon k={b.key} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-zinc-100">{b.name}</span>
            <span className="block truncate text-xs text-zinc-400">{SHORT_ABOUT[b.key] ?? b.about}</span>
          </span>
        </span>

        <span className="flex min-w-0 gap-4 [grid-area:stats]" data-testid="builtin-stats">
          {stats.length === 0 ? (
            <span className="text-sm text-zinc-400">Nothing in it yet</span>
          ) : (
            stats.map((c) => (
              <span key={c.label} className="min-w-min shrink" data-testid="builtin-stat" title={`${c.count.toLocaleString()} ${countLabel(c.label, c.count)}`}>
                <span className="block text-base font-semibold tabular-nums leading-5 text-zinc-50">{shortCount(c.count)}</span>
                <span className="block text-xs leading-4 text-zinc-400" data-testid="builtin-stat-label">{countLabel(c.label, c.count)}</span>
              </span>
            ))
          )}
        </span>

        <span className="flex min-w-0 flex-wrap items-center gap-1 [grid-area:who]" data-testid="builtin-audience-chips">
          <span className="sr-only">Who reads it: </span>
          {b.audience.paused ? (
            <Chip>Nobody</Chip>
          ) : (
            <>
              <Chip title={whoSpoken}>{who}</Chip>
              {b.audience.readers && <Chip tone="ai">AI readers</Chip>}
            </>
          )}
        </span>

        <span className="flex min-w-0 items-center justify-end self-center [grid-area:status] lg:justify-start">{status}</span>
        <span aria-hidden="true" className="hidden text-zinc-500 transition-colors [grid-area:chevron] group-hover:text-zinc-200 lg:block">
          <ChevronRightIcon />
        </span>
      </button>
    </li>
  );
}

function Chip({ children, tone = "plain", title }: { children: ReactNode; tone?: "plain" | "ai"; title?: string }) {
  const look = tone === "ai" ? "border-violet-500/30 bg-violet-500/10 text-violet-200" : "border-zinc-700 bg-zinc-800/60 text-zinc-300";
  return (
    <span title={title} className={`inline-flex min-w-0 max-w-full items-center rounded-md border px-1.5 py-0.5 text-xs ${look}`}>
      <span className="truncate">{children}</span>
    </span>
  );
}

// ── One search across the bases ────────────────────────────────────────

type Group = { key: BuiltinKey; name: string; found?: BaseSearch; error?: string };

function CrossSearch({
  bases,
  scope,
  setScope,
  inputRef,
}: {
  bases: BuiltinBase[];
  scope: BuiltinKey[];
  setScope: (s: BuiltinKey[]) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [skipped, setSkipped] = useState<BuiltinBase[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = useRef(0);
  const open = bases.filter((b) => b.access.open && !b.audience.paused);
  const chosen = scope.length ? open.filter((b) => scope.includes(b.key)) : open;

  const run = async () => {
    const query = q.trim();
    if (!query || chosen.length === 0) return;
    const n = ++ask.current;
    setBusy(true);
    const settled = await Promise.allSettled(chosen.map((b) => builtinBases.search(b.key, query)));
    if (n !== ask.current) return;
    setGroups(
      chosen.map((b, i) => {
        const s = settled[i];
        return s.status === "fulfilled" ? { key: b.key, name: b.name, found: s.value } : { key: b.key, name: b.name, error: s.reason instanceof Error ? s.reason.message : "The search failed." };
      }),
    );
    // Named so nobody reads "nothing matched" as "nothing there".
    setSkipped(scope.length ? [] : bases.filter((b) => !open.includes(b)));
    setAsked(query);
    setBusy(false);
  };

  const toggle = (k: BuiltinKey) => setScope(scope.includes(k) ? scope.filter((x) => x !== k) : [...scope, k]);
  const where = scope.length === 0 ? "all bases open to you" : chosen.map((b) => b.name).join(", ");

  return (
    <div className="mt-4" data-testid="builtin-search">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-72"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <label htmlFor={id} className="sr-only">
            Search the built-in bases
          </label>
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            id={id}
            type="search"
            className={`${inputClass} pl-9 pr-24`}
            placeholder={scope.length === 1 ? `Search ${chosen[0]?.name ?? ""}` : "Search every base"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="submit"
            className={`${buttonClass("secondary", "sm")} absolute right-1 top-1/2 -translate-y-1/2`}
            disabled={busy || !q.trim() || chosen.length === 0}
            data-testid="builtin-search-go"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </form>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Bases to search" data-testid="builtin-filters">
          <FilterChip pressed={scope.length === 0} onClick={() => setScope([])} testId="filter-all">
            All
          </FilterChip>
          {bases.map((b) => {
            const closed = !open.includes(b);
            return (
              <FilterChip key={b.key} pressed={scope.includes(b.key)} disabled={closed} onClick={() => toggle(b.key)} testId={`filter-${b.key}`} title={closed ? (b.audience.paused ? `${b.name} is paused` : `${b.name} isn't open to you`) : undefined}>
                {closed && (
                  <span aria-hidden="true" className="[&_svg]:h-3 [&_svg]:w-3">
                    <LockIcon />
                  </span>
                )}
                {b.name}
              </FilterChip>
            );
          })}
        </div>
      </div>

      {groups && (
        <GroupedResults
          query={asked}
          where={where}
          groups={groups}
          skipped={skipped}
          onClear={() => {
            ask.current++;
            setGroups(null);
            setAsked("");
            setBusy(false);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({ pressed, disabled, onClick, children, testId, title }: { pressed: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; testId?: string; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${
        pressed ? "border-zinc-200 bg-zinc-100 text-zinc-900" : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
      } ${focusRing}`}
    >
      {children}
    </button>
  );
}

function GroupedResults({ query, where, groups, skipped, onClear }: { query: string; where: string; groups: Group[]; skipped: BuiltinBase[]; onClear: () => void }) {
  const found = groups.filter((g) => g.found && g.found.results.length > 0);
  const empty = groups.filter((g) => g.found && g.found.results.length === 0 && !(g.found.withheld?.count > 0));
  const failed = groups.filter((g) => g.error);
  const total = found.reduce((n, g) => n + (g.found?.results.length ?? 0), 0);
  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40" data-testid="builtin-grouped">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2.5">
        <p className="min-w-0 text-sm text-zinc-300" data-testid="builtin-summary">
          {plural(total, "result")} for <span className="font-medium text-zinc-100 [overflow-wrap:anywhere]">&ldquo;{query}&rdquo;</span> in {where}
        </p>
        <button type="button" onClick={onClear} className={buttonClass("ghost", "sm")} data-testid="builtin-clear">
          <span aria-hidden="true" className="mr-1 [&_svg]:h-3 [&_svg]:w-3">
            <XIcon />
          </span>
          Clear
        </button>
      </div>
      <div className="divide-y divide-zinc-800">
        {groups
          .filter((g) => g.found && (g.found.results.length > 0 || g.found.withheld?.count > 0 || (g.found.not_read ?? []).length > 0))
          .map((g) => (
            <section key={g.key} className="px-4 py-3" data-testid="builtin-group" data-key={g.key} aria-label={g.name}>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-100">
                  <BaseIcon k={g.key} size="sm" />
                  {g.name}
                  <span className="font-normal text-zinc-400">{g.found!.results.length}</span>
                </h3>
                {g.found!.results.length > 0 && <ShareControl baseKey={g.key} baseName={g.name} query={query} />}
              </div>
              <Results found={g.found!} hideBase />
            </section>
          ))}
      </div>
      {(empty.length > 0 || failed.length > 0 || skipped.length > 0) && (
        <div className="space-y-1 border-t border-zinc-800 px-4 py-2.5 text-sm text-zinc-400" data-testid="builtin-search-notes">
          {empty.length > 0 && <p>Nothing matched in {listWords(empty.map((g) => g.name))}.</p>}
          {failed.map((g) => (
            <p key={g.key} role="alert" className="text-red-300">
              {g.name} couldn&apos;t be searched: {g.error}
            </p>
          ))}
          {skipped.length > 0 && (
            <p data-testid="builtin-skipped">
              Not searched: {listWords(skipped.map((b) => b.name))} {skipped.length === 1 ? "isn't" : "aren't"} open to you.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** Results of one base's search; the shared-link page uses it too. */
export function Results({ found, hideBase }: { found: Pick<BaseSearch, "results" | "withheld" | "not_read">; hideBase?: boolean }) {
  const held = found.withheld?.count ?? 0;
  const kinds = found.withheld?.kinds_not_open_to_you ?? [];
  return (
    <div className="mt-2 space-y-2" data-testid="builtin-results">
      {found.results.length === 0 ? (
        held === 0 && <p className="text-sm text-zinc-400">Nothing matched.</p>
      ) : (
        <ul className="space-y-1">
          {found.results.map((r) => (
            <ResultRow key={r.id} r={r} hideBase={hideBase} />
          ))}
        </ul>
      )}
      {held > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-zinc-400" data-testid="builtin-withheld">
          <span aria-hidden="true" className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">
            <LockIcon />
          </span>
          <span>
            {held} more {held === 1 ? "result isn't" : "results aren't"} open to you, so {held === 1 ? "it isn't" : "they aren't"} shown
            {kinds.length > 0 ? ` (${listWords(kinds)})` : ""}.
          </span>
        </p>
      )}
      {(found.not_read ?? []).map((n, i) => (
        <p key={i} className="text-sm text-orange-300">
          {n.base} wasn&apos;t read: {n.reason}
        </p>
      ))}
    </div>
  );
}

function ResultRow({ r, hideBase }: { r: BaseResult; hideBase?: boolean }) {
  const when = r.updated_at ? timeAgo(r.updated_at) || r.updated_at : "";
  const meta = [hideBase ? "" : r.base, when ? `updated ${when}` : ""].filter(Boolean).join(", ");
  return (
    <li className="min-w-0 rounded-lg px-2 py-1.5 -mx-2 hover:bg-zinc-800/40" data-testid="builtin-result">
      <a href={r.url} target="_blank" rel="noreferrer" className={`text-sm font-medium text-zinc-100 underline-offset-2 hover:underline [overflow-wrap:anywhere] ${focusRing}`}>
        {r.title}
      </a>
      {r.snippet && <p className="mt-0.5 line-clamp-2 text-sm text-zinc-400 [overflow-wrap:anywhere]">{r.snippet}</p>}
      {meta && <p className="mt-0.5 text-xs text-zinc-400">{meta.charAt(0).toUpperCase() + meta.slice(1)}</p>}
    </li>
  );
}

function ShareControl({ baseKey, baseName, query }: { baseKey: BuiltinKey; baseName: string; query: string }) {
  const [days, setDays] = useState<ShareDays>(7);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const share = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await builtinBases.share(baseKey, query, days);
      setLink(`${window.location.origin}${r.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the link.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover>
      <PopoverTrigger className={smallSecondaryButton} data-testid="builtin-share-open">
        Share
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3 p-3" data-testid="builtin-share">
        <p className="text-sm text-zinc-200">
          Share this search in {baseName}. Whoever opens the link sees only what they may read themselves.
        </p>
        <Segmented
          label="How long the link works"
          options={SHARE_DAYS.map((d) => ({ value: String(d) as `${ShareDays}`, label: d === 1 ? "1 day" : `${d} days` }))}
          value={String(days) as `${ShareDays}`}
          onChange={(v) => {
            setDays(Number(v) as ShareDays);
            setLink("");
          }}
        />
        <div>
          {link ? (
            <CopyButton text={link} label="Copy the link" copiedLabel="Link copied" />
          ) : (
            <button type="button" className={smallPrimaryButton} disabled={busy} onClick={share} data-testid="builtin-share-make">
              {busy ? "Making the link…" : "Make the link"}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── The panel ──────────────────────────────────────────────────────────

function BaseDrawer({
  b,
  canManage,
  readersOn,
  returnFocusTo,
  onClose,
  onChange,
  onSearch,
}: {
  b: BuiltinBase | null;
  canManage: boolean;
  readersOn: boolean;
  returnFocusTo: RefObject<HTMLElement | null>;
  onClose: () => void;
  onChange: (b: BuiltinBase) => void;
  onSearch: (k: BuiltinKey) => void;
}) {
  // Kept while the panel closes, so its words don't vanish mid-animation.
  const last = useRef<BuiltinBase | null>(null);
  if (b) last.current = b;
  const base = b ?? last.current;
  return (
    <Drawer
      open={!!b}
      onOpenChange={(o) => !o && onClose()}
      testId="builtin-panel"
      returnFocusTo={returnFocusTo}
      title={
        base ? (
          <span className="flex items-center gap-2.5">
            <BaseIcon k={base.key} size="sm" />
            {base.name}
          </span>
        ) : (
          ""
        )
      }
      description={base?.about}
    >
      {base && <PanelBody key={base.key} b={base} canManage={canManage} readersOn={readersOn} onChange={onChange} onSearch={onSearch} />}
    </Drawer>
  );
}

function PanelBody({ b, canManage, readersOn, onChange, onSearch }: { b: BuiltinBase; canManage: boolean; readersOn: boolean; onChange: (b: BuiltinBase) => void; onSearch: (k: BuiltinKey) => void }) {
  const fresh = freshness(b);
  const counts = b.counts.filter((c) => c.count > 0);
  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span data-testid="builtin-access">{b.access.open ? <StatusPill tone="success">Open to you</StatusPill> : <StatusPill tone="warning">Not open to you</StatusPill>}</span>
        {b.audience.paused && <StatusPill tone="neutral">Paused</StatusPill>}
        <span className="flex items-center gap-1.5 text-zinc-400">
          <StatusDot tone={fresh.live ? "success" : b.updated_at ? "neutral" : "muted"} live={false} className="!h-1.5 !w-1.5" />
          {fresh.words}
        </span>
      </div>

      {!b.access.open && b.access.why && (
        <Callout variant="warning" live={false} testId="builtin-why">
          {b.access.why}
        </Callout>
      )}

      <section aria-labelledby={`holds-${b.key}`}>
        <h3 id={`holds-${b.key}`} className="mb-2 font-medium text-zinc-200">
          What it holds
        </h3>
        {counts.length === 0 ? (
          <p className="text-zinc-400">Nothing in it yet.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="builtin-counts" aria-label={countsLine(b.counts)}>
            {counts.map((c) => (
              <div key={c.label} className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                <dt className="truncate text-xs text-zinc-400">{countLabel(c.label, c.count)}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-50">{c.count.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}
        {b.access.open && !b.audience.paused && (
          <button type="button" className={`${smallSecondaryButton} mt-3`} onClick={() => onSearch(b.key)} data-testid="builtin-panel-search">
            <span aria-hidden="true" className="mr-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5">
              <SearchIcon />
            </span>
            Search {b.name}
          </button>
        )}
      </section>

      {b.mirroring && (
        <Callout variant="info" live={false} testId="builtin-mirroring">
          {b.mirroring}
        </Callout>
      )}

      <section aria-labelledby={`who-${b.key}`} className="border-t border-zinc-800 pt-5">
        <h3 id={`who-${b.key}`} className="font-medium text-zinc-200">
          Who reads it
        </h3>
        {canManage ? (
          <AudienceEditor b={b} readersOn={readersOn} onSaved={onChange} />
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-zinc-300 [overflow-wrap:anywhere]" data-testid="builtin-audience">
              {b.audience.paused ? "Paused: nobody reads it" : b.audience_label}
            </p>
            <p className="text-zinc-400">{b.audience.readers ? "Readers from AI tools read it too." : "Readers from AI tools don't."}</p>
          </div>
        )}
      </section>

      <section aria-labelledby={`tools-${b.key}`} className="border-t border-zinc-800 pt-5">
        <h3 id={`tools-${b.key}`} className="font-medium text-zinc-200">
          For AI tools
        </h3>
        <p className="mt-1 text-zinc-400">
          A connected AI tool reads {b.name} with the <Code>{b.scope}</Code> scope, and only what its person may read.
        </p>
      </section>
    </div>
  );
}

function AudienceEditor({ b, readersOn, onSaved }: { b: BuiltinBase; readersOn: boolean; onSaved: (b: BuiltinBase) => void }) {
  const [roles, setRoles] = useState<string[]>(b.audience.roles);
  const [people, setPeople] = useState(b.audience.people.join("\n"));
  const [readers, setReaders] = useState(b.audience.readers);
  const [paused, setPaused] = useState(b.audience.paused);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const peopleId = useId();
  const readersLabel = useId();
  const pausedLabel = useId();
  const dirty =
    roles.slice().sort().join() !== b.audience.roles.slice().sort().join() ||
    parsePeople(people).join() !== b.audience.people.join() ||
    readers !== b.audience.readers ||
    paused !== b.audience.paused;
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const nb = await builtinBases.update(b.key, { roles, people: parsePeople(people), readers, paused });
      onSaved(nb);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    setRoles(b.audience.roles);
    setPeople(b.audience.people.join("\n"));
    setReaders(b.audience.readers);
    setPaused(b.audience.paused);
    setError("");
  };
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSaved(false);
  };
  return (
    <div className="mt-2 space-y-4" data-testid="audience-editor">
      <p className="text-zinc-400" data-testid="builtin-audience">
        {b.audience.paused ? "Paused: nobody reads it" : b.audience_label}
      </p>
      <fieldset>
        <legend className="text-zinc-200">Roles</legend>
        <p className="text-zinc-400">None picked: everyone whose role opens what it holds.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AUDIENCE_ROLES.map((r) => (
            <RoleChip
              key={r.key}
              label={r.label}
              checked={roles.includes(r.key)}
              onChange={edit((on: boolean) => setRoles((rs) => (on ? [...rs, r.key] : rs.filter((x) => x !== r.key))))}
            />
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={peopleId} className="text-zinc-200">
          People, by email
        </label>
        <textarea id={peopleId} rows={2} className={`${inputClass} mt-1`} value={people} onChange={(e) => edit(setPeople)(e.target.value)} placeholder="ada@example.com" />
      </div>
      <div className="space-y-3 rounded-lg border border-zinc-800 px-3 py-3">
        <div className="flex items-start gap-3">
          <Switch checked={readers} onChange={edit(setReaders)} labelledBy={readersLabel} testId="audience-readers" />
          <div className="min-w-0">
            <p id={readersLabel} className="text-zinc-200">
              Readers from AI tools
            </p>
            <p className="text-zinc-400">{readersOn ? "People who connected an AI tool as readers can read it." : "AI tools as readers is off for the team, so this waits until it's on."}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Switch checked={paused} onChange={edit(setPaused)} labelledBy={pausedLabel} testId="audience-paused" />
          <div className="min-w-0">
            <p id={pausedLabel} className="text-zinc-200">
              Paused
            </p>
            <p className="text-zinc-400">Nobody reads it until it&apos;s turned back on.</p>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallPrimaryButton} disabled={saving || !dirty} onClick={save} data-testid="audience-save">
          {saving ? "Saving…" : "Save"}
        </button>
        {dirty && (
          <button type="button" className={linkButton} disabled={saving} onClick={reset}>
            Undo changes
          </button>
        )}
        {saved && !dirty && (
          <span role="status" className="text-emerald-300" data-testid="audience-saved">
            Saved
          </span>
        )}
      </div>
    </div>
  );
}

function RoleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <FilterChip pressed={checked} onClick={() => onChange(!checked)} testId={`role-${label.toLowerCase()}`}>
      {label}
    </FilterChip>
  );
}
