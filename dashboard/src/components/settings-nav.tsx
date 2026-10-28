"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { normalizePath } from "@/lib/routes";
import { SETTINGS_GROUPS, settingsItemFor, type SettingsItem } from "./settings-items";
import { focusRing } from "./ui";
import { Select } from "./select";

/** Paths that show the settings list beside the page. */
export function inSettings(pathname: string | null | undefined): boolean {
  const path = normalizePath(pathname);
  return path === "/settings" || path.startsWith("/settings/") || !!settingsItemFor(path);
}

/**
 * Settings has its own navigation: every settings page in a list on the
 * left (a select on a phone), grouped as on the Settings overview. It is the
 * only way into configuration, so the main menu has one Settings entry.
 */
export function SettingsNav({ visible }: { visible: (item: SettingsItem) => boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const path = normalizePath(pathname);
  const current = path === "/settings" ? "/settings" : settingsItemFor(path)?.href ?? "/settings";
  const groups = SETTINGS_GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* Phone and tablet: one select. */}
      <div className="mb-6 xl:hidden">
        <label htmlFor="settings-nav-select" className="sr-only">
          Settings page
        </label>
        <Select
          id="settings-nav-select"
          value={current}
          onChange={(href) => router.push(href)}
          className="w-full"
          data-testid="settings-nav-select"
          options={[
            { value: "/settings", label: "Overview" },
            ...groups.map((g) => ({ group: g.label, options: g.items.map((i) => ({ value: i.href, label: i.title })) })),
          ]}
        />
      </div>
      {/* Wide screens: a list on the left. */}
      <nav aria-label="Settings" className="hidden w-52 shrink-0 xl:block" data-testid="settings-nav">
        <div className="sticky top-20 space-y-5">
          <ul>
            <NavLink href="/settings" current={current === "/settings"}>
              Overview
            </NavLink>
          </ul>
          {groups.map((g) => (
            <div key={g.id}>
              <p className="mb-1 px-2 text-xs font-medium text-zinc-400">{g.label}</p>
              <ul className="space-y-0.5">
                {g.items.map((i) => (
                  <NavLink key={i.href} href={i.href} current={current === i.href}>
                    {i.title}
                  </NavLink>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

function NavLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        aria-current={current ? "page" : undefined}
        className={`block rounded-md px-2 py-1.5 text-sm transition-colors motion-reduce:transition-none ${focusRing} ${
          current ? "bg-zinc-800 font-medium text-zinc-50" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
        }`}
      >
        {children}
      </Link>
    </li>
  );
}
