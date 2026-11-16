"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Menu } from "@/components/menu";
import { BookIcon, ComposeIcon, MoreIcon, PinIcon, SearchIcon, SidebarIcon, UsersIcon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { focusRing, smallDangerButton, smallSecondaryButton } from "@/components/ui";
import { KNOWLEDGE_HREF } from "@/lib/routes";
import type { BrainThread } from "@/lib/brain";

// The list of chats: a new-chat button, a search box, your chats grouped by
// when you last asked in them, and the ones teammates shared at the end.
// Each of your own chats has a menu to rename, share or delete it. The same
// list sits in a sidebar on wide screens and in a sheet on narrower ones.
//
// Select mode deletes several of your own chats at once: "Select" by the
// search box, "Select" in a chat's menu, or Shift-click / Cmd-click (Ctrl-click)
// on a chat. Each of your chats then shows a checkbox; "Select all" takes the
// chats the search shows; Shift-click on a checkbox takes the run between it
// and the last one picked. The buttons at the foot (Cancel, Delete) stay on
// screen however long the list is, and Escape leaves select mode.

/** "Today", "Yesterday", "Previous 7 days", "Previous 30 days" or "Older". */
export function dayGroup(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((start.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Older";
}

export const SHARED_GROUP = "Shared with you";
export const PINNED_GROUP = "Pinned";
/** How many chats one person may pin (the server holds the same limit). */
export const MAX_PINNED = 5;

export function ThreadList({
  threads,
  currentId,
  canAsk,
  knowledgeCount,
  onNew,
  onPick,
  onRename,
  onShare,
  onPin,
  onDelete,
  onDeleteMany,
  onCollapse,
  shortcut,
}: {
  threads: BrainThread[] | null;
  currentId: string;
  canAsk: boolean;
  /** How many knowledge collections this person may read; null while loading. */
  knowledgeCount: number | null;
  onNew: () => void;
  /** After a chat is picked (closes the sheet on a phone). */
  onPick?: () => void;
  onRename: (t: BrainThread) => void;
  onShare: (t: BrainThread, shared: boolean) => void;
  /** Pins a chat to the top, or unpins it. */
  onPin?: (t: BrainThread, pinned: boolean) => void;
  onDelete: (t: BrainThread) => void;
  /** Deletes the selected chats after asking once. Resolves to the ids that
   * weren't deleted (they stay selected), or null when the question was declined. */
  onDeleteMany?: (ids: string[]) => Promise<string[] | null>;
  /** Hides the sidebar (wide screens). */
  onCollapse?: () => void;
  /** The new-chat shortcut as this keyboard writes it ("⌘/", "Ctrl+/"). */
  shortcut?: string;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: { label: string; items: BrainThread[] }[] = [];
    const shared: BrainThread[] = [];
    const pinned: BrainThread[] = [];
    for (const t of threads ?? []) {
      if (needle && !t.title.toLowerCase().includes(needle)) continue;
      if (t.mine && t.pinned) {
        pinned.push(t);
        continue;
      }
      if (!t.mine) {
        shared.push(t);
        continue;
      }
      const label = dayGroup(t.updated_at);
      let g = out.find((x) => x.label === label);
      if (!g) out.push((g = { label, items: [] }));
      g.items.push(t);
    }
    if (shared.length) out.push({ label: SHARED_GROUP, items: shared });
    if (pinned.length) out.unshift({ label: PINNED_GROUP, items: pinned });
    return out;
  }, [threads, q]);

  // ── Select mode ──
  const bulk = !!onDeleteMany && canAsk;
  const selectable = useCallback((t: BrainThread) => t.mine && canAsk, [canAsk]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const anchor = useRef<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  // Where focus goes after select mode opens or closes: a chat's checkbox,
  // "Select all", or the "Select" button.
  const focusNext = useRef<string | null>(null);

  /** The chats that can be picked, in the order they are shown. */
  const shown = useMemo(() => groups.flatMap((g) => g.items).filter(selectable), [groups, selectable]);
  // A chat that left the list (deleted elsewhere, or a reload) leaves the selection.
  const chosen = useMemo(
    () => (threads ?? []).filter((t) => selectable(t) && selected.has(t.id)).map((t) => t.id),
    [threads, selected, selectable],
  );
  const shownChosen = shown.filter((t) => selected.has(t.id)).length;
  const hiddenChosen = chosen.length - shownChosen;
  const allShown = shown.length > 0 && shownChosen === shown.length;
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = shownChosen > 0 && !allShown;
  });

  const startSelect = useCallback((id?: string) => {
    setSelecting(true);
    setSelected(new Set(id ? [id] : []));
    anchor.current = id ?? null;
    focusNext.current = id ? `[data-check-id="${CSS.escape(id)}"]` : "[data-select-all]";
  }, []);
  const stopSelect = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
    anchor.current = null;
    focusNext.current = "[data-select-start]";
  }, []);
  useEffect(() => {
    const sel = focusNext.current;
    if (!sel) return;
    focusNext.current = null;
    navRef.current?.querySelector<HTMLElement>(sel)?.focus();
  });

  const toggle = (id: string, range: boolean) => {
    const last = range ? anchor.current : null;
    setSelected((cur) => {
      const next = new Set(cur);
      const on = !cur.has(id);
      const from = last ? shown.findIndex((t) => t.id === last) : -1;
      const to = shown.findIndex((t) => t.id === id);
      if (from >= 0 && to >= 0) {
        for (const t of shown.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          if (on) next.add(t.id);
          else next.delete(t.id);
        }
      } else if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    anchor.current = id;
  };

  const toggleAll = () => {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const t of shown) {
        if (allShown) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  };

  const deleteChosen = async () => {
    if (!onDeleteMany || !chosen.length || busy) return;
    setBusy(true);
    try {
      const failed = await onDeleteMany(chosen);
      if (failed === null) return;
      if (failed.length) setSelected(new Set(failed));
      else stopSelect();
    } finally {
      setBusy(false);
    }
  };

  // Escape leaves select mode. It is caught before the sheet the list may sit
  // in (on a phone) sees it, so the sheet stays open; a dialog or menu above
  // the list (the delete question) keeps its own Escape.
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || busy) return;
      const nav = navRef.current;
      const target = e.target instanceof Element ? e.target : null;
      const layer = target?.closest("[role=dialog],[role=alertdialog],[role=menu]");
      if (layer && nav && !layer.contains(nav)) return;
      e.preventDefault();
      e.stopPropagation();
      stopSelect();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selecting, busy, stopSelect]);

  return (
    <nav ref={navRef} aria-label="Chats" className="flex h-full min-h-0 min-w-0 flex-col" data-testid="thread-rail">
      <div className="flex items-center gap-1.5">
        {canAsk ? (
          <button
            type="button"
            onClick={onNew}
            data-testid="new-chat"
            className={`inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-200 hover:bg-zinc-800/70 ${focusRing}`}
          >
            <ComposeIcon />
            <span className="min-w-0 flex-1 truncate text-left">New chat</span>
            {shortcut && <kbd className="hidden shrink-0 rounded border border-zinc-700 px-1 font-sans text-[10px] text-zinc-500 lg:inline">{shortcut}</kbd>}
          </button>
        ) : (
          <p className="min-w-0 flex-1 px-1 text-xs font-medium text-zinc-500">Chats</p>
        )}
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide chats"
            title="Hide chats"
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200 ${focusRing}`}
          >
            <SidebarIcon />
          </button>
        )}
      </div>

      {(threads?.length ?? 0) > 0 && (
        <div className="mt-3 flex min-w-0 items-center gap-1.5">
          <label className="relative block min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-zinc-500 [&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search chats"
              placeholder="Search chats"
              data-testid="thread-search"
              className="h-8 w-full rounded-lg border border-transparent bg-zinc-900 pl-8 pr-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </label>
          {bulk && !selecting && (threads ?? []).some(selectable) && (
            <button
              type="button"
              onClick={() => startSelect()}
              data-select-start
              data-testid="select-chats"
              title="Select chats to delete several at once"
              className={`inline-flex h-8 shrink-0 items-center rounded-lg px-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200 ${focusRing}`}
            >
              Select
            </button>
          )}
        </div>
      )}

      {selecting && (
        <div className="mt-2 flex min-w-0 items-center justify-between gap-2 px-2" data-testid="select-bar">
          <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input
              ref={selectAll}
              type="checkbox"
              data-select-all
              data-testid="select-all"
              checked={allShown}
              disabled={!shown.length || busy}
              onChange={toggleAll}
              className={`h-4 w-4 shrink-0 accent-emerald-500 ${focusRing}`}
            />
            <span className="truncate">Select all</span>
          </label>
          <p className="min-w-0 text-right text-xs tabular-nums text-zinc-400" aria-live="polite" data-testid="select-count">
            {chosen.length} selected{hiddenChosen > 0 ? ` (${hiddenChosen} hidden by search)` : ""}
          </p>
        </div>
      )}

      <div className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1">
        {threads === null ? (
          <div className="space-y-2 px-1" aria-label="Loading chats">
            {[70, 90, 60, 80].map((w) => (
              <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 py-1 text-xs leading-relaxed text-zinc-500">Your chats will show up here.</p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-1 text-xs text-zinc-500">No chats match.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="px-2 pb-1 text-[11px] font-medium text-zinc-500">{g.label}</p>
                <ul className="space-y-px">
                  {g.items.map((t) => (
                    <ThreadRow
                      key={t.id}
                      t={t}
                      selecting={selecting}
                      checked={selected.has(t.id)}
                      busy={busy}
                      onToggle={(range) => toggle(t.id, range)}
                      onStartSelect={bulk && selectable(t) ? () => startSelect(t.id) : undefined}
                      current={t.id === currentId}
                      canChange={t.mine && canAsk}
                      onPick={onPick}
                      onRename={onRename}
                      onShare={onShare}
                      onPin={onPin}
                      pinsFull={(threads ?? []).filter((x) => x.mine && x.pinned).length >= MAX_PINNED}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {selecting ? (
        // Pinned to the bottom of whatever scrolls the list (the app menu on a
        // phone), so Delete is on screen with the first chat picked or the last.
        <div className="sticky bottom-0 z-10 mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-zinc-800/80 bg-zinc-950 py-3" data-testid="select-actions">
          <button type="button" onClick={stopSelect} disabled={busy} className={smallSecondaryButton}>
            Cancel
          </button>
          <button
            type="button"
            onClick={deleteChosen}
            disabled={!chosen.length || busy}
            data-testid="delete-selected"
            className={smallDangerButton}
          >
            {busy ? "Deleting…" : chosen.length ? `Delete ${chosen.length}` : "Delete"}
          </button>
        </div>
      ) : (
        <div className="mt-3 border-t border-zinc-800/80 pt-3">
          <Link
            href={KNOWLEDGE_HREF}
            className={`flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 ${focusRing}`}
          >
            <BookIcon />
            <span className="min-w-0 flex-1 truncate">Knowledge</span>
            {knowledgeCount !== null && knowledgeCount > 0 && (
              <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 text-[11px] tabular-nums text-zinc-400" data-testid="knowledge-count" aria-label={`${knowledgeCount} added`}>
                {knowledgeCount}
              </span>
            )}
          </Link>
        </div>
      )}
    </nav>
  );
}

function ThreadRow({
  t,
  selecting,
  checked,
  busy,
  onToggle,
  onStartSelect,
  current,
  canChange,
  onPick,
  onRename,
  onShare,
  onPin,
  pinsFull,
  onDelete,
}: {
  t: BrainThread;
  /** Select mode: a checkbox in place of the link and the menu. */
  selecting: boolean;
  checked: boolean;
  busy: boolean;
  /** Picks or unpicks this chat; `range` (Shift) takes the run from the last one picked. */
  onToggle: (range: boolean) => void;
  /** Opens select mode with this chat picked (absent for a chat you can't delete). */
  onStartSelect?: () => void;
  current: boolean;
  canChange: boolean;
  onPick?: () => void;
  onRename: (t: BrainThread) => void;
  onShare: (t: BrainThread, shared: boolean) => void;
  onPin?: (t: BrainThread, pinned: boolean) => void;
  /** Five are pinned: pinning another is offered as unavailable. */
  pinsFull: boolean;
  onDelete: (t: BrainThread) => void;
}) {
  if (selecting) {
    return (
      <li className="min-w-0" data-testid="thread-row">
        {canChange ? (
          <label
            className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${checked ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800/50"}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={busy}
              data-check-id={t.id}
              data-testid="thread-check"
              // Toggled on click (a mouse, or Space from the keyboard), where
              // Shift is known; the change itself follows the state.
              onClick={(e) => onToggle(e.shiftKey)}
              onChange={() => {}}
              className={`h-4 w-4 shrink-0 accent-emerald-500 ${focusRing}`}
            />
            <span className="min-w-0 flex-1 truncate" title={t.title}>
              {t.title}
            </span>
          </label>
        ) : (
          // A chat a teammate shared: yours to read, not to delete.
          <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 pl-8 text-sm text-zinc-400" title="Only the person who started it can delete it">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{t.title}</span>
              {!t.mine && <span className="block truncate text-xs text-zinc-400">{t.owner_email}</span>}
            </span>
          </div>
        )}
      </li>
    );
  }
  return (
    <li className="group relative min-w-0" data-testid="thread-row">
      <Link
        href={`/chat?thread=${encodeURIComponent(t.id)}`}
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          // Shift-click or Cmd-click (Ctrl-click) on a chat you can delete
          // starts select mode with it picked, as in a mail app.
          if (onStartSelect && e.button === 0 && (e.shiftKey || e.metaKey || e.ctrlKey) && !e.altKey) {
            e.preventDefault();
            onStartSelect();
            return;
          }
          // Another chat on the same page: change the address in place. A
          // router navigation fetches the route again, and a tab on an older
          // build than the one deployed gets a full page load instead. A
          // modified click (new tab, new window) keeps the link's own behaviour.
          if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            window.history.pushState(null, "", `${window.location.pathname}?thread=${encodeURIComponent(t.id)}`);
          }
          onPick?.();
        }}
        aria-current={current ? "page" : undefined}
        title={t.title}
        className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${canChange ? "pr-9" : ""} ${current ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"} ${focusRing}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{t.title}</span>
          {!t.mine && <span className="block truncate text-[11px] text-zinc-500">{t.owner_email}</span>}
        </span>
        {t.mine && t.pinned && (
          <span className="shrink-0 text-zinc-500 [&_svg]:h-3.5 [&_svg]:w-3.5" title="Pinned" aria-label="Pinned" data-testid="thread-pinned">
            <PinIcon />
          </span>
        )}
        {t.mine && t.shared && (
          <span className="shrink-0 text-zinc-500 [&_svg]:h-3.5 [&_svg]:w-3.5" title="Shared with the team" aria-label="Shared with the team">
            <UsersIcon />
          </span>
        )}
      </Link>
      {canChange && (
        <div className={`absolute inset-y-0 right-1 flex items-center ${current ? "" : "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"}`}>
          <Menu
            label={`Actions for ${t.title}`}
            width="w-48"
            trigger={
              <button
                type="button"
                aria-label={`More actions for ${t.title}`}
                data-testid="thread-menu"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 ${focusRing}`}
              >
                <MoreIcon />
              </button>
            }
            items={[
              ...(onPin
                ? [
                    t.pinned
                      ? { label: "Unpin", onSelect: () => onPin(t, false) }
                      : { label: pinsFull ? `Pin (${MAX_PINNED} pinned already)` : "Pin to top", onSelect: () => onPin(t, true), disabled: pinsFull },
                  ]
                : []),
              ...(onStartSelect ? [{ label: "Select", onSelect: onStartSelect }] : []),
              { label: "Rename", onSelect: () => onRename(t) },
              { label: t.shared ? "Stop sharing" : "Share with team", onSelect: () => onShare(t, !t.shared) },
              { label: "Delete", onSelect: () => onDelete(t), danger: true },
            ]}
          />
        </div>
      )}
    </li>
  );
}
