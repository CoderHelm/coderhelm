"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chip, MoreMenu } from "@/components/list";
import type { Tone } from "@/components/list/status";
import { buttonClass, focusRing, inputClass, secondaryButton } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import { KIND_LABEL, fileSize, knowledge, type AddKind } from "@/lib/knowledge";
import {
  SKIP_WORDS,
  STATE_WORDS,
  dayWords,
  itemState,
  itemsPage,
  kbPage,
  missingRoute,
  type ItemGroup,
  type ItemState,
  type ItemsPage,
  type ItemsQuery,
  type PageItem,
  type PageSource,
} from "@/lib/knowledge-page";
import { SourceLogo } from "./logos";

// Content: every page in the base as a tree (source, then space or folder,
// then parent), with filters and a search box answered by the gateway one
// page at a time. Each item says its state in words and links to the
// original. Failed and skipped items can be read again.

const STATE_TONE: Record<ItemState, Tone> = {
  searchable: "success",
  working: "live",
  failed: "attention",
  skipped: "muted",
  cut_short: "waiting",
};

/** Over this many items, groups start closed. */
const OPEN_ALL_UP_TO = 200;

export interface ContentProps {
  kbId: string;
  sources: PageSource[];
  /** Every item, from an older gateway that sends them with the base. */
  files: PageItem[] | null;
  canManage: boolean;
  /** Bumped when items may have changed (a sync ended, an upload landed). */
  version: number;
  /** A filter the page asks for (the problems banner's "See them"). */
  wantStatus?: { status: ItemState | ""; at: number } | null;
  onReplace: (f: PageItem) => void;
  onDelete: (f: PageItem) => void;
  onRetry?: (sourceId: string, ids: string[]) => Promise<void>;
}

export function Content({ kbId, sources, files, canManage, version, wantStatus, onReplace, onDelete, onRetry }: ContentProps) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<ItemState | "">("");
  const [source, setSource] = useState("");
  const [updated, setUpdated] = useState<ItemsQuery["updated"]>("");
  const [top, setTop] = useState<ItemsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<PageItem[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pages, setPages] = useState<Record<string, ItemsPage>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const all = files ?? fallback;

  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (wantStatus) setStatus(wantStatus.status);
  }, [wantStatus]);

  const base: ItemsQuery = useMemo(() => ({ q: term, status, source, updated }), [term, status, source, updated]);
  const fetchPage = useCallback(
    async (query: ItemsQuery): Promise<ItemsPage> => {
      if (all) return itemsPage(all, query);
      try {
        return await kbPage.items(kbId, query);
      } catch (e) {
        if (!missingRoute(e)) throw e;
        // An older gateway: every item comes with the base.
        const r = await knowledge.get(kbId);
        const list = (r.files ?? []) as PageItem[];
        setFallback(list);
        return itemsPage(list, query);
      }
    },
    [all, kbId],
  );

  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    fetchPage({ ...base, limit: OPEN_ALL_UP_TO })
      .then((p) => {
        if (n !== seq.current) return;
        setTop(p);
        setError(null);
        setPages({});
      })
      .catch((e) => n === seq.current && setError(errorMessage(e, "Couldn't read what's in it.")));
  }, [fetchPage, base, version]);

  // Opened groups read their own pages.
  const loadGroup = useCallback(
    (g: ItemGroup, cursor?: string) => {
      fetchPage({ ...base, group: g.key, cursor, limit: 100 })
        .then((p) =>
          setPages((cur) => {
            const prev = cursor ? cur[g.key] : undefined;
            return { ...cur, [g.key]: prev ? { ...p, items: [...prev.items, ...p.items] } : p };
          }),
        )
        .catch((e) => setError(errorMessage(e, "Couldn't read that group.")));
    },
    [fetchPage, base],
  );

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const everythingOpen = !!top && top.total <= OPEN_ALL_UP_TO && !top.next;
  // With everything on one page, the groups come from it.
  const inGroup = useCallback(
    (g: ItemGroup): PageItem[] | null => {
      if (pages[g.key]) return pages[g.key].items;
      if (everythingOpen && top) return top.items.filter((f) => `${f.source_id || "upload"}|${(f.path ?? "").split(" / ")[0]?.trim() ?? ""}` === g.key);
      return null;
    },
    [pages, everythingOpen, top],
  );
  const isOpen = (g: ItemGroup) => open[g.key] ?? (everythingOpen || (top?.groups.length ?? 0) === 1);
  const toggle = (g: ItemGroup) => {
    const next = !isOpen(g);
    setOpen((o) => ({ ...o, [g.key]: next }));
    if (next && !inGroup(g)) loadGroup(g);
  };
  useEffect(() => {
    // A single group (or everything) opens by itself; read it when it isn't on the first page.
    if (!top) return;
    for (const g of top.groups) if (isOpen(g) && !inGroup(g)) loadGroup(g);
    // isOpen and inGroup read state this effect depends on through top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  const bySource = useMemo(() => {
    const m = new Map<string, ItemGroup[]>();
    for (const g of top?.groups ?? []) m.set(g.source, [...(m.get(g.source) ?? []), g]);
    return [...m.entries()].sort(([a], [b]) => (a === "upload" ? 1 : b === "upload" ? -1 : (sourceById.get(a)?.name ?? a).localeCompare(sourceById.get(b)?.name ?? b)));
  }, [top, sourceById]);

  const states = top?.states ?? {};
  const allCount = Object.values(states).reduce((a, b) => a + (b ?? 0), 0);
  const canRetry = canManage && !!onRetry && (status === "failed" || status === "skipped");
  const retry = async () => {
    if (!onRetry || !picked.size) return;
    setRetrying(true);
    const bySrc = new Map<string, string[]>();
    for (const g of top?.groups ?? [])
      for (const f of inGroup(g) ?? [])
        if (picked.has(f.id) && f.source_id) bySrc.set(f.source_id, [...(bySrc.get(f.source_id) ?? []), f.id]);
    try {
      for (const [sid, ids] of bySrc) await onRetry(sid, ids);
      setPicked(new Set());
    } finally {
      setRetrying(false);
    }
  };

  if (!top && !error) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-900/60 motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  if (top && top.all === 0) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-8 text-center text-sm text-zinc-400" data-testid="items-empty">
        {sources.length ? "Pages appear here as they come in." : canManage ? "Add an app or upload files to fill it." : "Nothing in it yet."}
      </p>
    );
  }

  const chip = (on: boolean) =>
    `inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors motion-reduce:transition-none ${focusRing} ${on ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"}`;
  const stateKeys: ItemState[] = ["searchable", "working", "failed", "skipped", "cut_short"];
  return (
    <div className="min-w-0" data-testid="content">
      <div className="flex min-w-0 flex-col gap-3">
        <label className="relative block min-w-0 sm:max-w-md">
          <span className="sr-only">Search pages</span>
          <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            className={`${inputClass} pl-9`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${(top?.all ?? 0).toLocaleString()} ${top?.all === 1 ? "page" : "pages"}`}
            data-testid="items-search"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Status">
          <span className="w-16 shrink-0 text-xs text-zinc-400">Status</span>
          <button type="button" aria-pressed={status === ""} className={chip(status === "")} onClick={() => setStatus("")}>
            All <span className="text-zinc-500">{allCount.toLocaleString()}</span>
          </button>
          {stateKeys
            .filter((k) => (states[k] ?? 0) > 0 || status === k)
            .map((k) => (
              <button key={k} type="button" aria-pressed={status === k} className={chip(status === k)} onClick={() => setStatus(status === k ? "" : k)} data-testid={`filter-${k}`}>
                {STATE_WORDS[k]} <span className="text-zinc-500">{(states[k] ?? 0).toLocaleString()}</span>
              </button>
            ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Updated">
          <span className="w-16 shrink-0 text-xs text-zinc-400">Updated</span>
          {(
            [
              ["", "Any time"],
              ["7d", "7 days"],
              ["30d", "30 days"],
              ["90d", "90 days"],
              ["older", "Older"],
            ] as const
          ).map(([k, l]) => (
            <button key={k || "any"} type="button" aria-pressed={updated === k} className={chip(updated === k)} onClick={() => setUpdated(k)}>
              {l}
            </button>
          ))}
        </div>
        {sources.length + (bySource.some(([s]) => s === "upload") ? 1 : 0) > 1 && (
          <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Source">
            <span className="w-16 shrink-0 text-xs text-zinc-400">Source</span>
            <button type="button" aria-pressed={source === ""} className={chip(source === "")} onClick={() => setSource("")}>
              All
            </button>
            {[...sources.map((s) => ({ key: s.id, label: s.name })), { key: "upload", label: "Uploaded files" }].map((s) => (
              <button key={s.key} type="button" aria-pressed={source === s.key} className={`${chip(source === s.key)} sm:max-w-[16rem]`} onClick={() => setSource(source === s.key ? "" : s.key)}>
                <span className="min-w-0 truncate">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-orange-300" role="alert">
          {error}
        </p>
      )}

      {canRetry && (
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm" data-testid="retry-bar">
          <span className="text-zinc-300">{picked.size ? `${picked.size} picked` : "Pick pages to read again"}</span>
          <button type="button" className={buttonClass("primary", "sm")} onClick={retry} disabled={!picked.size || retrying} data-testid="retry-picked">
            {retrying ? "Asking…" : "Read these again"}
          </button>
        </div>
      )}

      {top && top.total === 0 ? (
        <p className="mt-6 text-sm text-zinc-400" data-testid="items-none">
          {term.trim() ? <>Nothing matches &ldquo;{term.trim()}&rdquo;.</> : "Nothing matches these filters."}
        </p>
      ) : (
        <div className="mt-4 space-y-4" data-testid="items-tree">
          {bySource.map(([sid, groups]) => {
            const src = sourceById.get(sid);
            const kind: AddKind = src?.kind ?? "upload";
            const n = groups.reduce((a, g) => a + g.items, 0);
            return (
              <section key={sid} className="min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30" data-testid="tree-source">
                <h3 className="flex min-w-0 items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5 text-sm font-semibold text-zinc-100">
                  <SourceLogo kind={kind} size="sm" />
                  <span className="min-w-0 truncate">{src?.name ?? "Uploaded files"}</span>
                  <span className="shrink-0 font-normal tabular-nums text-zinc-400">{n.toLocaleString()}</span>
                </h3>
                <ul className="divide-y divide-zinc-800/80">
                  {groups.map((g) => (
                    <GroupRow
                      key={g.key}
                      group={g}
                      single={groups.length === 1 && !g.top}
                      open={isOpen(g)}
                      onToggle={() => toggle(g)}
                      items={inGroup(g)}
                      more={pages[g.key]?.next ?? null}
                      onMore={() => loadGroup(g, pages[g.key]?.next ?? undefined)}
                      kind={kind}
                      canManage={canManage}
                      picking={canRetry}
                      picked={picked}
                      onPick={(id, on) =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (on) next.add(id);
                          else next.delete(id);
                          return next;
                        })
                      }
                      onReplace={onReplace}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GroupRow({
  group: g,
  single,
  open,
  onToggle,
  items,
  more,
  onMore,
  kind,
  canManage,
  picking,
  picked,
  onPick,
  onReplace,
  onDelete,
}: {
  group: ItemGroup;
  single: boolean;
  open: boolean;
  onToggle: () => void;
  items: PageItem[] | null;
  more: string | null;
  onMore: () => void;
  kind: AddKind;
  canManage: boolean;
  picking: boolean;
  picked: Set<string>;
  onPick: (id: string, on: boolean) => void;
  onReplace: (f: PageItem) => void;
  onDelete: (f: PageItem) => void;
}) {
  const body = open && (
    <div className="min-w-0">
      {items === null ? (
        <p className="px-4 py-3 text-xs text-zinc-400" role="status">
          Reading…
        </p>
      ) : (
        <ul className="min-w-0">
          {items.map((f, i) => {
            const parent = (f.path ?? "").split(" / ").slice(1).join(" / ");
            const before = i > 0 ? (items[i - 1].path ?? "").split(" / ").slice(1).join(" / ") : null;
            return (
              <li key={f.id} className="min-w-0">
                {parent && parent !== before && (
                  <p className="truncate bg-zinc-950/30 px-4 pb-1 pt-2.5 text-xs font-medium text-zinc-400 sm:pl-10" data-testid="tree-parent" title={parent}>
                    {parent}
                  </p>
                )}
                <ItemRow f={f} kind={kind} canManage={canManage} picking={picking} picked={picked.has(f.id)} onPick={(on) => onPick(f.id, on)} onReplace={() => onReplace(f)} onDelete={() => onDelete(f)} />
              </li>
            );
          })}
        </ul>
      )}
      {more && (
        <div className="px-4 py-3">
          <button type="button" className={secondaryButton} onClick={onMore}>
            Show more
          </button>
        </div>
      )}
    </div>
  );
  if (single) return <li className="min-w-0">{body}</li>;
  return (
    <li className="min-w-0" data-testid="tree-group">
      <button type="button" onClick={onToggle} aria-expanded={open} className={`flex w-full min-w-0 items-center gap-2 px-4 py-2.5 text-left hover:bg-zinc-800/30 ${focusRing}`}>
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{g.top || "Top level"}</span>
        {g.failed > 0 && <Chip tone="attention">{`${g.failed} couldn't read`}</Chip>}
        <span className="shrink-0 text-xs tabular-nums text-zinc-400">
          {g.items.toLocaleString()}
          <span className="hidden sm:inline">{g.newest ? ` · newest ${dayWords(g.newest)}` : ""}</span>
        </span>
      </button>
      {body}
    </li>
  );
}

function ItemRow({
  f,
  kind,
  canManage,
  picking,
  picked,
  onPick,
  onReplace,
  onDelete,
}: {
  f: PageItem;
  kind: AddKind;
  canManage: boolean;
  picking: boolean;
  picked: boolean;
  onPick: (on: boolean) => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const state = itemState(f);
  const meta = [
    f.as_of ? `Updated ${dayWords(f.as_of)}` : null,
    f.indexed_at ? `Indexed ${dayWords(f.indexed_at)}` : null,
    f.chunks ? `${f.chunks.toLocaleString()} ${f.chunks === 1 ? "passage" : "passages"}` : null,
    kind === "upload" ? fileSize(f.size) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const why = state === "failed" ? f.error || "It couldn't be read." : state === "skipped" ? SKIP_WORDS[f.skipped ?? ""] ?? f.error ?? "Left out." : state === "cut_short" ? "Only the first passages are searchable; split the page to search the rest." : "";
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-2.5 sm:pl-10" data-testid="item-row" data-status={f.status} data-state={state}>
      {picking && (state === "failed" || state === "skipped") && f.source_id && (
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-500" checked={picked} onChange={(e) => onPick(e.target.checked)} aria-label={`Pick ${f.name}`} data-testid="item-pick" />
      )}
      <div className="min-w-0 flex-1">
        {f.url ? (
          <a href={f.url} target="_blank" rel="noopener noreferrer" className={`block truncate rounded text-sm text-zinc-100 hover:underline hover:underline-offset-4 ${focusRing}`} data-testid="item-link">
            {f.name}
            <span className="sr-only"> (opens in {KIND_LABEL[kind]})</span>
          </a>
        ) : (
          <span className="block truncate text-sm text-zinc-100">{f.name}</span>
        )}
        {meta && <span className="block truncate text-xs text-zinc-400">{meta}</span>}
        {why && <span className={`block text-xs [overflow-wrap:anywhere] ${state === "failed" ? "text-orange-300" : "text-zinc-400"}`}>{why}</span>}
      </div>
      {state !== "searchable" && <Chip tone={STATE_TONE[state]}>{STATE_WORDS[state]}</Chip>}
      {canManage && kind === "upload" && (
        <MoreMenu
          compact
          label={`${f.name} actions`}
          buttonLabel={`More for ${f.name}`}
          items={[
            { label: "Upload a new version", onSelect: onReplace },
            { label: "Delete", onSelect: onDelete, danger: true },
          ]}
        />
      )}
    </div>
  );
}
