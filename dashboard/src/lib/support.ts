// Support tickets: the words, colours and links both sides use, so the
// customer's list and the admin queue say the same thing the same way.

import type { StatusLook } from "@/components/list";
import type { SupportItem, SupportItemKind, SupportPriority, SupportStatus, SupportTicket } from "./api";

/** The status as the team that filed it reads it. */
export function customerLook(status: SupportStatus): StatusLook {
  if (status === "waiting") return { label: "Waiting on you", tone: "waiting" };
  if (status === "resolved") return { label: "Resolved", tone: "success" };
  return { label: "Open", tone: "live", live: false };
}

/** The status as support reads it: "Open" is our turn. */
export function adminLook(status: SupportStatus): StatusLook {
  if (status === "waiting") return { label: "Waiting on customer", tone: "muted" };
  if (status === "resolved") return { label: "Resolved", tone: "success" };
  return { label: "Needs reply", tone: "attention" };
}

export const PRIORITY_LABEL: Record<SupportPriority, string> = {
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const KIND_LABEL: Record<SupportItemKind, string> = {
  run: "Run",
  review: "Review",
  release: "Release",
  plan: "Plan",
  alert: "Alert",
  data_source: "Data source",
};

/** Items one ticket can carry, over the ticket and its replies (the server's limit). */
export const MAX_ATTACHMENTS = 10;

/** Everything attached to a ticket; older tickets kept one item in `item`. */
export function ticketItems(t: SupportTicket): SupportItem[] {
  if (t.context.items && t.context.items.length > 0) return t.context.items;
  return t.context.item ? [t.context.item] : [];
}

/** "Run: Fix the login page" */
export function itemWords(item: SupportItem): string {
  const name = item.label || item.id;
  const repo = item.repo && !name.includes(item.repo) ? ` (${item.repo})` : "";
  return `${KIND_LABEL[item.kind] ?? "Item"}: ${name}${repo}`;
}

/** Where the item lives in the dashboard (the filer's team's view of it). */
export function itemHref(item: SupportItem): string {
  const id = encodeURIComponent(item.id);
  switch (item.kind) {
    case "run":
      return `/runs/detail?id=${id}`;
    case "review":
      return `/reviewer/detail?sk=${id}`;
    case "plan":
      return `/plans/detail?id=${id}`;
    case "release": {
      const at = item.id.lastIndexOf("@");
      const repo = at > 0 ? item.id.slice(0, at) : item.repo;
      const tag = at > 0 ? item.id.slice(at + 1) : "";
      return `/releases?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(tag)}`;
    }
    case "alert":
      return `/alerts/detail?id=${id}`;
    case "data_source":
      return `/data-sources?source=${id}`;
  }
  return "/";
}

/** The page a ticket was filed from, as a menu-style name. */
export function pageWords(page: string): string {
  const path = page.replace(/\/+$/, "") || "/";
  const known: Record<string, string> = {
    "/": "Runs",
    "/runs/detail": "A run",
    "/reviewer": "Reviewer",
    "/reviewer/detail": "A review",
    "/releases": "Releases",
    "/plans": "Plans",
    "/plans/detail": "A plan",
    "/settings": "Settings",
  };
  return known[path] ?? path;
}

/** When a time is, in words: "in 3 h 20 min", "in 2 days". Empty once it has passed. */
export function timeLeft(untilIso: string, now = Date.now()): string {
  const ms = Date.parse(untilIso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min} min left`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min left`;
  return `${Math.floor(h / 24)} days left`;
}

export interface HelpTarget {
  kind: SupportItemKind;
  id: string;
  label?: string;
  repo?: string;
}

/**
 * The "Get help" form, with the page the person is on and, when there is
 * one, the run, review, release or plan it is about. Only ids and names go
 * in the address: never the page's contents.
 */
export function helpHref(from?: string | null, item?: HelpTarget | null): string {
  const q = new URLSearchParams({ new: "1" });
  const page = (from || "").split(/[?#]/)[0];
  if (page && page.startsWith("/") && !page.startsWith("/support")) q.set("from", page);
  if (item) {
    q.set("kind", item.kind);
    q.set("item", item.id);
    if (item.label) q.set("label", item.label.slice(0, 200));
    if (item.repo) q.set("repo", item.repo);
  }
  return `/support?${q.toString()}`;
}

/** Tickets needing support's reply first, then by most recent activity. */
export function queueOrder(a: SupportTicket, b: SupportTicket): number {
  const rank = (t: SupportTicket) => (t.status === "open" ? 0 : t.status === "waiting" ? 1 : 2);
  const prio = (t: SupportTicket) => (t.priority === "urgent" ? 0 : t.priority === "high" ? 1 : 2);
  return rank(a) - rank(b) || prio(a) - prio(b) || b.updated_at.localeCompare(a.updated_at);
}

/** Who filed, in a few words. */
export function filedBy(t: SupportTicket): string {
  return t.opened_by_name || t.opened_by_email || "Someone on the team";
}

/** The run, review or plan a dashboard address shows, if any. */
export function helpTargetFromUrl(pathname: string, search: string): HelpTarget | null {
  const path = pathname.replace(/\/+$/, "");
  const q = new URLSearchParams(search);
  if (path === "/runs/detail" && q.get("id")) return { kind: "run", id: q.get("id")! };
  if (path === "/reviewer/detail" && q.get("sk")) return { kind: "review", id: q.get("sk")! };
  if (path === "/plans/detail" && q.get("id")) return { kind: "plan", id: q.get("id")! };
  return null;
}
