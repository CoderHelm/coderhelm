// Support tickets: the words, colours and links both sides use, so the
// customer's list and the admin queue say the same thing the same way.

import type { StatusLook } from "@/components/list";
import type { SupportItem, SupportItemKind, SupportMessage, SupportParticipant, SupportPriority, SupportStatus, SupportTicket } from "./api";

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

// ── Items, compactly ─────────────────────────────────────────────────────

/** "Run · Fix the login page · merged": the kind, a short name and the status. */
export function chipWords(item: SupportItem, max = 36): { kind: string; name: string; status: string; full: string } {
  const name = item.label || item.id;
  const short = name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
  const status = (item.status || "").replace(/_/g, " ");
  return { kind: KIND_LABEL[item.kind] ?? "Item", name: short, status, full: itemWords(item) + (status ? ` · ${status}` : "") };
}

// ── People ───────────────────────────────────────────────────────────────

/** A user id without its `USER#` prefix. */
export function bareUserId(id: string | null | undefined): string {
  return (id || "").replace(/^USER#/, "");
}

/** The most participants a ticket can have besides its filer (the gateway's limit). */
export const MAX_PARTICIPANTS = 20;

/** An email address the gateway will accept, lowercased, or null. */
export function cleanEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || email.length > 254) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  if (!/^[\x21-\x7e]+$/.test(email) || /[<>(),;:"[\]\\]/.test(email)) return null;
  return email;
}

/** "Pat Lee" from a name, or "pat" from pat@example.com when there is no name. */
export function personName(name: string | null | undefined, email: string | null | undefined): string {
  if (name && name.trim()) return name.trim();
  const e = (email || "").trim();
  if (!e) return "Someone on the team";
  return e.split("@")[0];
}

/** "PL" for Pat Lee, "PA" for pat. */
export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s._-]/gu, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

/** A steady colour per person, from a small palette that reads on dark. */
export function avatarTone(key: string): string {
  const tones = [
    "bg-sky-500/20 text-sky-200",
    "bg-violet-500/20 text-violet-200",
    "bg-emerald-500/20 text-emerald-200",
    "bg-amber-500/20 text-amber-200",
    "bg-rose-500/20 text-rose-200",
    "bg-teal-500/20 text-teal-200",
    "bg-indigo-500/20 text-indigo-200",
  ];
  let h = 0;
  for (const c of key.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tones[h % tones.length];
}

/** Everyone on a ticket, filer first. */
export function ticketPeople(t: SupportTicket): { key: string; name: string; email: string; filer: boolean; outside: boolean; p?: SupportParticipant }[] {
  const filer = { key: `filer:${t.opened_by_id}`, name: personName(t.opened_by_name, t.opened_by_email), email: t.opened_by_email, filer: true, outside: false };
  return [
    filer,
    ...(t.participants ?? []).map((p) => ({
      key: p.user_id || p.email,
      name: p.outside ? p.email : personName(p.name, p.email),
      email: p.email,
      filer: false,
      outside: p.outside,
      p,
    })),
  ];
}

/** Is `userId` on the ticket (as its filer or a participant)? */
export function isOnTicket(t: SupportTicket, userId: string): "filer" | "participant" | null {
  const me = bareUserId(userId);
  if (!me) return null;
  if (bareUserId(t.opened_by_id) === me) return "filer";
  return (t.participants ?? []).some((p) => bareUserId(p.user_id) === me) ? "participant" : null;
}

// ── Events, in words ─────────────────────────────────────────────────────

const EVENT_WORDS: Record<string, string> = {
  resolved: "marked this resolved",
  reopened: "reopened this",
  "status:open": "marked this open",
  "status:waiting": "marked this waiting on the team",
  followed: "followed this ticket",
  left: "left this ticket",
};

/** What an event did, after the actor's name: "added Pat Lee". */
export function eventWords(body: string): string {
  if (EVENT_WORDS[body]) return EVENT_WORDS[body];
  if (body === "support_viewed") return "viewed your workspace (read only)";
  if (body === "support_access_revoked") return "ended Coderhelm support's access to the workspace";
  if (body.startsWith("support_access_granted:")) {
    const until = new Date(body.slice("support_access_granted:".length));
    const when = Number.isNaN(until.getTime()) ? "" : ` until ${until.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
    return `let Coderhelm support see the workspace${when}`;
  }
  if (body.startsWith("priority:")) {
    const p = body.slice("priority:".length) as keyof typeof PRIORITY_LABEL;
    return `set the priority to ${(PRIORITY_LABEL[p] ?? p).toLowerCase()}`;
  }
  if (body.startsWith("added:")) return `added ${body.slice("added:".length)}`;
  if (body.startsWith("removed:")) return `removed ${body.slice("removed:".length)}`;
  return body;
}

/** Which small mark an event gets in the timeline. */
export function eventKind(body: string): "people" | "status" | "access" | "other" {
  if (body === "followed" || body === "left" || body.startsWith("added:") || body.startsWith("removed:")) return "people";
  if (body === "resolved" || body === "reopened" || body.startsWith("status:") || body.startsWith("priority:")) return "status";
  if (body.startsWith("support_")) return "access";
  return "other";
}

// ── The thread's shape ───────────────────────────────────────────────────

export type ThreadEntry =
  | { type: "message"; m: SupportMessage; /** Same author as the message just before, within minutes: no header repeated. */ continued: boolean }
  | { type: "event"; m: SupportMessage }
  | { type: "hidden"; count: number; messages: number; from: string; to: string }
  | { type: "unread" };

/** Minutes within which one person's messages share a header. */
const GROUP_MINUTES = 10;
/** Threads with more items than this fold their middle. */
export const COLLAPSE_OVER = 8;
/** Messages kept open at the end of a folded thread. */
export const KEEP_LAST = 3;

function sameAuthor(a: SupportMessage, b: SupportMessage): boolean {
  return a.author === b.author && (a.author === "support" ? a.author_name === b.author_name : (a.author_email || a.author_name) === (b.author_email || b.author_name));
}

/**
 * The thread as the page draws it, GitHub-style: the first message and the
 * last few stay open, the middle folds into "Show N earlier" unless
 * `expanded`; nothing unread is ever folded; an "unread" marker goes before
 * the first message newer than `seenAt` that someone else wrote; and one
 * person's consecutive messages share a header.
 */
export function threadEntries(
  messages: SupportMessage[],
  opts: { expanded?: boolean; seenAt?: string | null; isMine?: (m: SupportMessage) => boolean } = {},
): ThreadEntry[] {
  const { expanded = false, seenAt = null, isMine = () => false } = opts;
  const unreadAt = seenAt ? messages.findIndex((m) => m.kind === "message" && m.created_at > seenAt && !isMine(m)) : -1;

  // Which indexes to fold.
  let foldFrom = -1;
  let foldTo = -1; // exclusive
  if (!expanded && messages.length > COLLAPSE_OVER) {
    const firstMsg = messages.findIndex((m) => m.kind === "message");
    const msgIdx = messages.map((m, i) => (m.kind === "message" ? i : -1)).filter((i) => i >= 0);
    const tailStart = msgIdx.length > KEEP_LAST ? msgIdx[msgIdx.length - KEEP_LAST] : messages.length;
    foldFrom = firstMsg + 1;
    foldTo = unreadAt >= 0 ? Math.min(tailStart, unreadAt) : tailStart;
    // Not worth folding fewer than three.
    if (foldTo - foldFrom < 3) foldFrom = foldTo = -1;
  }

  const out: ThreadEntry[] = [];
  let prev: SupportMessage | null = null;
  for (let i = 0; i < messages.length; i++) {
    if (i === foldFrom) {
      const hidden = messages.slice(foldFrom, foldTo);
      out.push({ type: "hidden", count: hidden.length, messages: hidden.filter((m) => m.kind === "message").length, from: hidden[0].created_at, to: hidden[hidden.length - 1].created_at });
      i = foldTo - 1;
      prev = null;
      continue;
    }
    const m = messages[i];
    if (i === unreadAt) {
      out.push({ type: "unread" });
      prev = null;
    }
    if (m.kind === "event") {
      out.push({ type: "event", m });
      prev = null;
      continue;
    }
    const continued =
      !!prev && sameAuthor(prev, m) && Date.parse(m.created_at) - Date.parse(prev.created_at) < GROUP_MINUTES * 60_000 && !(m.attachments?.length && !m.body);
    out.push({ type: "message", m, continued });
    prev = m;
  }
  return out;
}

/**
 * A message split into what the person wrote and the email-style quote
 * underneath ("On … wrote:" and the `>` lines after it), which the thread
 * folds.
 */
export function splitQuoted(body: string): { main: string; quoted: string } {
  const lines = body.split("\n");
  let cut = lines.length;
  // Trailing lines that are quotes or blank.
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l === "" || l.startsWith(">")) cut = i;
    else break;
  }
  // An "On … wrote:" line just above the quote goes with it.
  let j = cut - 1;
  while (j >= 0 && lines[j].trim() === "") j--;
  if (j >= 0 && /^On .{4,200} wrote:$/.test(lines[j].trim())) cut = j;
  const quotedLines = lines.slice(cut).filter((l) => l.trim().startsWith(">"));
  // Fold only a real quote under something the person wrote.
  if (quotedLines.length < 2 || cut === 0 || !lines.slice(0, cut).some((l) => l.trim())) return { main: body, quoted: "" };
  return { main: lines.slice(0, cut).join("\n").trimEnd(), quoted: lines.slice(cut).join("\n").trim() };
}

/** Long enough to clamp behind "Show more". */
export function isLong(body: string): boolean {
  return body.length > 900 || body.split("\n").length > 14;
}

/** A message quoted for a reply: "> " on each line, with who wrote it. */
export function quoteFor(name: string, body: string): string {
  const text = splitQuoted(body).main.trim();
  const quoted = text
    .split("\n")
    .map((l) => `> ${l}`.trimEnd())
    .join("\n");
  return `${quoted}\n> — ${name}\n\n`;
}
