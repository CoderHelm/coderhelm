// The app's top-level destinations: eight places a person goes, each with
// the pages that belong to it. The sidebar lists the destinations; when a
// destination has more than one page, the shell shows its pages as tabs
// above the page (components/section-tabs.tsx). Settings has its own left
// list of pages (components/settings-nav.tsx), read from settings-items.tsx.

import { ANY_CHANGE } from "./capabilities";
import { KNOWLEDGE_HREF, normalizePath } from "./routes";

export type NavIconKey = "runs" | "plans" | "reviews" | "logs" | "chat" | "knowledge" | "plugins" | "insights" | "settings" | "admin" | "queue";

export interface NavPage {
  href: string;
  label: string;
  /** Shown only to someone whose role includes this capability (or `ANY_CHANGE`). */
  need?: string;
}

export interface NavSection {
  key: string;
  label: string;
  icon: NavIconKey;
  /** The section's pages, the first one the person can open is where the menu item goes. */
  pages: NavPage[];
  /** Paths that also mark the section as current (an item's page, a sub page). */
  alsoUnder?: string[];
  superAdminOnly?: boolean;
  /** A count beside the label. */
  countKey?: "betaSignups" | "supportQueue";
  /** Shown only while this team flag is on. */
  flag?: "plugins";
}

export const NAV_SECTIONS: NavSection[] = [
  { key: "runs", label: "Runs", icon: "runs", pages: [{ href: "/", label: "Runs" }], alsoUnder: ["/runs"] },
  {
    key: "plans",
    label: "Plans",
    icon: "plans",
    pages: [
      { href: "/plans", label: "Plans" },
      { href: "/plans/templates", label: "Templates" },
    ],
  },
  {
    key: "reviews",
    label: "Code review",
    icon: "reviews",
    pages: [
      { href: "/reviewer", label: "Reviewer", need: ANY_CHANGE },
      { href: "/tests", label: "Tests", need: ANY_CHANGE },
      { href: "/releases", label: "Releases", need: "reviews" },
    ],
  },
  {
    // Production signal: what the log analyzer found and the alerts that
    // fired, each one a start on a fix.
    key: "logs",
    label: "Logs",
    icon: "logs",
    pages: [
      { href: "/logs", label: "Logs", need: "recommendations" },
      { href: "/alerts", label: "Alerts", need: "view_alerts" },
    ],
  },
  { key: "chat", label: "Chat", icon: "chat", pages: [{ href: "/chat", label: "Chat", need: "brain_read" }] },
  { key: "knowledge", label: "Knowledge", icon: "knowledge", pages: [{ href: KNOWLEDGE_HREF, label: "Knowledge", need: "brain_read" }] },
  {
    // Packages a team installs; hidden until the team's plugins flag is on.
    key: "plugins",
    label: "Plugins",
    icon: "plugins",
    flag: "plugins",
    pages: [
      { href: "/plugins", label: "Plugins", need: "plugins.view" },
      { href: "/plugins/review", label: "Review", need: "plugins.view" },
      { href: "/audit", label: "Audit log", need: "plugins.audit" },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    icon: "insights",
    pages: [
      { href: "/analytics", label: "Analytics", need: ANY_CHANGE },
      { href: "/learning", label: "Learning", need: ANY_CHANGE },
      { href: "/memory", label: "Memory", need: ANY_CHANGE },
      { href: "/graph", label: "Code graph", need: ANY_CHANGE },
      { href: "/infrastructure", label: "Infrastructure", need: ANY_CHANGE },
      { href: "/health", label: "Health", need: "system" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    pages: [{ href: "/settings", label: "Settings" }],
    // Data sources, Skills and Connections are configured from Settings too.
    alsoUnder: ["/settings", "/data-sources", "/skills", "/connections"],
  },
];

/** Only for the install's platform admins. */
export const ADMIN_SECTIONS: NavSection[] = [
  { key: "admin", label: "Admin", icon: "admin", pages: [{ href: "/admin", label: "Platform admin" }], superAdminOnly: true, countKey: "betaSignups" },
  { key: "queue", label: "Support queue", icon: "queue", pages: [{ href: "/admin/tickets", label: "Support queue" }], superAdminOnly: true, countKey: "supportQueue" },
];

function under(path: string, href: string): boolean {
  // Hrefs may end in a slash (Knowledge's does); paths never do.
  const base = normalizePath(href);
  if (base === "/") return path === "/";
  return path === base || path.startsWith(`${base}/`);
}

/** The pages of a section this person can open. */
export function visiblePages(section: NavSection, allowed: (need?: string) => boolean): NavPage[] {
  return section.pages.filter((p) => allowed(p.need));
}

/**
 * The section the path belongs to: the one with the longest matching page
 * or `alsoUnder` prefix, so /brain/knowledge is Knowledge, not Chat.
 */
export function sectionFor(pathname: string | null | undefined, sections: NavSection[] = [...NAV_SECTIONS, ...ADMIN_SECTIONS]): NavSection | undefined {
  const path = normalizePath(pathname);
  let best: { s: NavSection; len: number } | undefined;
  for (const s of sections) {
    for (const href of [...s.pages.map((p) => p.href), ...(s.alsoUnder ?? [])]) {
      if (under(path, href) && (!best || href.length > best.len)) best = { s, len: href.length };
    }
  }
  return best?.s;
}

/**
 * The tabs to show above a page: its section's pages, when the section has
 * more than one the person can open and the path is one of them (not an
 * item's page underneath).
 */
export function sectionTabs(pathname: string | null | undefined, allowed: (need?: string) => boolean): { section: NavSection; pages: NavPage[]; current: string } | null {
  const path = normalizePath(pathname);
  const section = sectionFor(path, NAV_SECTIONS);
  if (!section) return null;
  const pages = visiblePages(section, allowed);
  if (pages.length < 2) return null;
  const current = pages.find((p) => normalizePath(p.href) === path);
  return current ? { section, pages, current: current.href } : null;
}
