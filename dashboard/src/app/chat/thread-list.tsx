"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Menu } from "@/components/menu";
import { BookIcon, ComposeIcon, MoreIcon, SearchIcon, SidebarIcon, UsersIcon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { focusRing } from "@/components/ui";
import { KNOWLEDGE_HREF } from "@/lib/routes";
import type { BrainThread } from "@/lib/brain";

// The list of chats: a new-chat button, a search box, your chats grouped by
// when you last asked in them, and the ones teammates shared at the end.
// Each of your own chats has a menu to rename, share or delete it. The same
// list sits in a sidebar on wide screens and in a sheet on narrower ones.

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

export function ThreadList({
  threads,
  currentId,
  canAsk,
  knowledgeCount,
  onNew,
  onPick,
  onRename,
  onShare,
  onDelete,
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
  onDelete: (t: BrainThread) => void;
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
    for (const t of threads ?? []) {
      if (needle && !t.title.toLowerCase().includes(needle)) continue;
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
    return out;
  }, [threads, q]);

  return (
    <nav aria-label="Chats" className="flex h-full min-h-0 flex-col" data-testid="thread-rail">
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
        <label className="relative mt-3 block">
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
                      current={t.id === currentId}
                      canChange={t.mine && canAsk}
                      onPick={onPick}
                      onRename={onRename}
                      onShare={onShare}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </nav>
  );
}

function ThreadRow({
  t,
  current,
  canChange,
  onPick,
  onRename,
  onShare,
  onDelete,
}: {
  t: BrainThread;
  current: boolean;
  canChange: boolean;
  onPick?: () => void;
  onRename: (t: BrainThread) => void;
  onShare: (t: BrainThread, shared: boolean) => void;
  onDelete: (t: BrainThread) => void;
}) {
  return (
    <li className="group relative min-w-0" data-testid="thread-row">
      <Link
        href={`/chat?thread=${encodeURIComponent(t.id)}`}
        onClick={onPick}
        aria-current={current ? "page" : undefined}
        title={t.title}
        className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${canChange ? "pr-9" : ""} ${current ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"} ${focusRing}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{t.title}</span>
          {!t.mine && <span className="block truncate text-[11px] text-zinc-500">{t.owner_email}</span>}
        </span>
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
