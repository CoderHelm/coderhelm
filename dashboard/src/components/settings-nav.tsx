"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { normalizePath } from "@/lib/routes";
import { SETTINGS_GROUPS, SETTINGS_TABS, navItemFor, settingsItemFor, type SettingsItem } from "./settings-items";
import type { ItemStatus } from "@/app/settings/use-settings-status";
import type { SettingsStatusKey } from "./settings-items";
import { focusRing, inputClass } from "./ui";
import { Tabs } from "./tabs";

/** Paths that show the settings menu. */
export function inSettings(pathname: string | null | undefined): boolean {
  const path = normalizePath(pathname);
  return path === "/settings" || path.startsWith("/settings/") || !!settingsItemFor(path);
}

/** The settings groups a person sees: their capabilities, this install, no tab pages. */
export function visibleGroups(visible: (item: SettingsItem) => boolean) {
  return SETTINGS_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.navUnder && visible(i)) })).filter((g) => g.items.length > 0);
}

/** Whether a status needs someone's attention (shown as a dot in the menu). */
export function needsAttention(s: ItemStatus | undefined): boolean {
  return s?.tone === "warning" || s?.tone === "error";
}

/**
 * Settings has one menu, in the left sidebar where the app's menu was: a way
 * back, a filter, then every settings page in groups. One column of
 * navigation, never two, on every screen size (on a phone it is the drawer).
 */
export function SettingsSidebarNav({
  visible,
  status,
}: {
  visible: (item: SettingsItem) => boolean;
  status: Partial<Record<SettingsStatusKey, ItemStatus>>;
}) {
  const pathname = usePathname();
  const path = normalizePath(pathname);
  const current = path === "/settings" ? "/settings" : navItemFor(path)?.href ?? "/settings";
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // "/" jumps to the filter, as in most dashboards, unless typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t?.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const groups = visibleGroups(visible)
    .map((g) => ({
      ...g,
      items: q ? g.items.filter((i) => `${i.title} ${i.description} ${g.label}`.toLowerCase().includes(q)) : g.items,
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div data-testid="settings-nav">
      {/* Pinned while the list scrolls, so the way back and the filter never leave view. */}
      <div data-settings-sticky="" className="sticky -top-3 z-10 -mx-3 bg-zinc-950 px-3 pb-2 pt-3">
      <Link
        href="/"
        className={`mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 ${focusRing}`}
      >
        <span aria-hidden="true">&lsaquo;</span> Back to Coderhelm
      </Link>
      <p className="px-2 text-base font-semibold text-zinc-50">Settings</p>
      <div className="mt-3 px-0.5">
        <label htmlFor="settings-filter" className="sr-only">
          Find a setting
        </label>
        <input
          ref={input}
          id="settings-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a setting  /"
          className={`${inputClass} py-1.5`}
          data-testid="settings-filter"
        />
      </div>
      </div>
      <nav aria-label="Settings" className="mt-2 space-y-4">
        {!q && (
          <ul>
            <MenuLink href="/settings" current={current === "/settings"}>
              Overview
            </MenuLink>
          </ul>
        )}
        {groups.map((g) => (
          <div key={g.id}>
            <p className="mb-1 px-2 text-xs font-medium text-zinc-400">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const s = i.status ? status[i.status] : undefined;
                return (
                  <MenuLink key={i.href} href={i.href} current={current === i.href} attention={needsAttention(s) ? s?.text : undefined}>
                    {i.title}
                  </MenuLink>
                );
              })}
            </ul>
          </div>
        ))}
        {q && groups.length === 0 && <p className="px-2 text-sm text-zinc-400">No setting matches &ldquo;{query}&rdquo;.</p>}
      </nav>
    </div>
  );
}

function MenuLink({ href, current, attention, children }: { href: string; current: boolean; attention?: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        aria-current={current ? "page" : undefined}
        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors motion-reduce:transition-none ${focusRing} ${
          current ? "bg-zinc-800 font-medium text-zinc-50" : "text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100"
        }`}
      >
        <span className="min-w-0 truncate">{children}</span>
        {attention && (
          <span className="flex shrink-0 items-center" title={attention}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="sr-only">Needs attention: {attention}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

/** Tabs above the pages that make up one settings item (Instructions). */
export function SettingsPageTabs() {
  const pathname = usePathname();
  const item = settingsItemFor(normalizePath(pathname));
  const tabs = item?.tabs ? SETTINGS_TABS[item.tabs] : undefined;
  if (!item || !tabs) return null;
  return (
    <div className="mb-6" data-testid="settings-page-tabs">
      <Tabs label="Instructions pages" items={tabs.map((t) => ({ value: t.href, label: t.label, href: t.href }))} value={item.href} className="" />
    </div>
  );
}
