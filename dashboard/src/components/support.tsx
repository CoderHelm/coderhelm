"use client";

// The pieces the customer's ticket page and the admin queue share: the
// thread, the reply box, what the ticket was filed about, and the small
// "Something wrong with this run?" link on run, review and release pages.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChatMarkdown } from "./chat-markdown";
import { MarkdownEditor, clearDraft } from "./markdown-editor";
import { api, type AlertEvent, type DataSource, type SupportItem, type SupportItemKind, type SupportItemRef, type SupportMessage, type SupportTicket } from "@/lib/api";
import {
  filedBy,
  helpHref,
  itemHref,
  itemWords,
  KIND_LABEL,
  MAX_ATTACHMENTS,
  pageWords,
  PRIORITY_LABEL,
  ticketItems,
  type HelpTarget,
} from "@/lib/support";
import { DetailBlock, Time } from "./list";
import { LifeBuoyIcon } from "./icons";
import { focusRing, inputClass, primaryButton } from "./ui";

const EVENT_WORDS: Record<string, string> = {
  resolved: "marked this resolved",
  reopened: "reopened this",
  "status:open": "marked this open",
  "status:waiting": "marked this waiting on the team",
};

function eventWords(body: string): string {
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
  return body;
}

function who(m: SupportMessage, admin: boolean): string {
  if (m.author === "support") return admin ? `${m.author_name || m.author_email || "Support"} (support)` : "Coderhelm support";
  return m.author_name || m.author_email || "Your team";
}

/** The conversation, oldest first, with status changes inline. */
export function SupportThread({
  messages,
  admin = false,
  openItem,
}: {
  messages: SupportMessage[];
  admin?: boolean;
  /** How a chip opens its item (the admin queue opens a support view first). */
  openItem?: ItemOpener;
}) {
  return (
    <ol className="space-y-4" aria-label="Conversation" data-testid="support-thread">
      {messages.map((m) =>
        m.kind === "event" ? (
          <li key={m.id} className="flex items-center gap-2 pl-1 text-xs text-zinc-500" data-testid="support-event">
            <span aria-hidden="true" className="h-px w-4 bg-zinc-700" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {who(m, admin)} {eventWords(m.body)}
            </span>
            <Time iso={m.created_at} />
          </li>
        ) : (
          <li
            key={m.id}
            data-testid="support-message"
            data-author={m.author}
            className={`min-w-0 rounded-lg border p-3 sm:p-4 ${
              m.author === "support" ? "border-sky-500/20 bg-sky-500/5" : "border-zinc-800 bg-zinc-900/50"
            }`}
          >
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className={`text-sm font-medium ${m.author === "support" ? "text-sky-300" : "text-zinc-200"}`}>{who(m, admin)}</span>
              <Time iso={m.created_at} className="text-xs text-zinc-500" />
            </div>
            {m.body && <div className="[overflow-wrap:anywhere]" data-testid="support-message-body"><ChatMarkdown breaks>{m.body}</ChatMarkdown></div>}
            {m.attachments && m.attachments.length > 0 && (
              <div className={m.body ? "mt-2" : ""}>
                <AttachmentChips items={m.attachments} open={openItem} label="Attached with this message" />
              </div>
            )}
          </li>
        ),
      )}
    </ol>
  );
}

/** A reply box with a send button and room for more buttons beside it. */
export function ReplyBox({
  onSend,
  placeholder,
  sendLabel = "Send reply",
  extra,
  disabled = false,
  attachRoom,
  draftKey,
}: {
  /** Resolves true when the reply was sent (the box then empties). */
  onSend: (body: string, extra?: string, items?: SupportItemRef[]) => Promise<boolean>;
  placeholder: string;
  sendLabel?: string;
  /** Other ways to send, e.g. "Send and resolve": [label, key]. */
  extra?: [string, string][];
  disabled?: boolean;
  /** Room left for attachments on the ticket; omitted, the box attaches nothing. */
  attachRoom?: number;
  /** Keeps the unsent reply in this browser under this key (one per ticket). */
  draftKey?: string;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<SupportItemRef[]>([]);
  const [picking, setPicking] = useState(false);
  const canSend = (!!body.trim() || items.length > 0) && !busy && !disabled;
  const send = async (key?: string) => {
    if (!canSend) return;
    setBusy(true);
    try {
      if (await onSend(body.trim(), key, items)) {
        if (draftKey) clearDraft(draftKey);
        setBody("");
        setItems([]);
        setPicking(false);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="mt-6 border-t border-zinc-800 pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label htmlFor="support-reply" className="mb-1.5 block text-sm font-medium text-zinc-300">
        Reply
      </label>
      <MarkdownEditor
        id="support-reply"
        variant="prose"
        value={body}
        onChange={setBody}
        maxLength={8000}
        minRows={4}
        placeholder={placeholder}
        disabled={disabled}
        draftKey={draftKey}
        onSubmitShortcut={() => void send()}
      />
      {attachRoom !== undefined && (
        <div className="mt-2 space-y-2">
          {items.length > 0 && <AttachmentChips items={items} onRemove={(i) => setItems(items.filter((x) => x !== i))} label="To attach" />}
          {picking ? (
            <AttachPicker chosen={items} onAdd={(i) => setItems([...items, i])} room={attachRoom - items.length} onClose={() => setPicking(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              disabled={disabled || attachRoom - items.length <= 0}
              className={`rounded text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-200 disabled:opacity-50 ${focusRing}`}
              data-testid="reply-attach"
            >
              {attachRoom - items.length <= 0 ? `This ticket has ${MAX_ATTACHMENTS} items, the most it can carry` : "Attach a run, review, release, plan, alert or data source"}
            </button>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {extra?.map(([label, key]) => (
          <button
            key={key}
            type="button"
            onClick={() => void send(key)}
            disabled={!body.trim() || busy || disabled}
            className={`inline-flex min-h-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 ${focusRing}`}
          >
            {label}
          </button>
        ))}
        <button type="submit" disabled={!canSend} className={primaryButton}>
          {busy ? "Sending…" : sendLabel}
        </button>
      </div>
    </form>
  );
}

/** What the ticket was filed about: the page, the item, the team and role. */
export function TicketContext({
  ticket,
  admin = false,
  openItem,
  footer,
}: {
  ticket: SupportTicket;
  admin?: boolean;
  openItem?: ItemOpener;
  footer?: ReactNode;
}) {
  const { context: c } = ticket;
  const items = ticketItems(ticket);
  const rows: [string, ReactNode][] = [];
  rows.push(["Filed by", `${filedBy(ticket)}${ticket.role ? ` · ${ticket.role}` : ""}`]);
  if (admin) {
    rows.push(["Email", ticket.opened_by_email || "Unknown"]);
    rows.push([
      "Team",
      <span key="team">
        {ticket.team_name || "(no name)"} <span className="font-mono text-[11px] text-zinc-500">{ticket.team_id}</span>
      </span>,
    ]);
  }
  if (items.length > 0) {
    rows.push(["Attached", <AttachmentChips key="items" items={items} open={openItem} label="Attached to this ticket" />]);
  }
  if (c.page) {
    rows.push([
      "Page",
      <Link key="page" href={c.page} className={`rounded text-zinc-200 underline underline-offset-4 hover:text-zinc-100 ${focusRing}`}>
        {pageWords(c.page)}
      </Link>,
    ]);
  }
  rows.push(["Priority", PRIORITY_LABEL[ticket.priority] ?? ticket.priority]);
  if (admin && c.user_agent) rows.push(["Browser", <span key="ua" className="break-all text-zinc-500">{c.user_agent}</span>]);
  return (
    <DetailBlock title="Details">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm" data-testid="ticket-context">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-zinc-500">{k}</dt>
            <dd className="min-w-0 text-zinc-300 [overflow-wrap:anywhere]">{v}</dd>
          </div>
        ))}
      </dl>
      {footer}
    </DetailBlock>
  );
}

/** "Something wrong with this run?" — opens the help form with the item attached. */
export function HelpLink({ item, children, className = "" }: { item: HelpTarget; children: ReactNode; className?: string }) {
  const pathname = usePathname();
  return (
    <Link
      href={helpHref(pathname, item)}
      data-testid="help-link"
      className={`inline-flex items-center gap-1.5 rounded text-xs text-zinc-500 hover:text-zinc-300 ${focusRing} ${className}`}
    >
      <span className="h-3.5 w-3.5" aria-hidden="true">
        <LifeBuoyIcon />
      </span>
      {children}
    </Link>
  );
}

// ── Attachments ──────────────────────────────────────────────────────────

/**
 * How a chip opens its item. Returns the link to show, or `null` to show the
 * chip as text with a reason (an admin without the team's support access).
 */
export type ItemOpener = (item: SupportItem) => { href?: string; onClick?: () => void; reason?: string } | null;

/** Attached items as chips; each links to the item in the team's view. */
export function AttachmentChips({
  items,
  onRemove,
  open,
  label,
}: {
  items: (SupportItem | SupportItemRef)[];
  onRemove?: (item: SupportItemRef) => void;
  open?: ItemOpener;
  label: string;
}) {
  return (
    <ul aria-label={label} className="flex min-w-0 flex-wrap gap-1.5" data-testid="attachment-chips">
      {items.map((raw) => {
        const item: SupportItem = { label: "", repo: "", status: "", ...raw } as SupportItem;
        const words = itemWords(item);
        const how = onRemove ? null : open ? open(item) : { href: itemHref(item) };
        const chip = "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300";
        const status = item.status ? <span className="shrink-0 text-zinc-500">· {item.status.replace(/_/g, " ")}</span> : null;
        const text = <span className="min-w-0 truncate">{words}</span>;
        return (
          <li key={`${item.kind}:${item.id}`} className="min-w-0 max-w-full" data-testid="attachment-chip" data-kind={item.kind}>
            {onRemove ? (
              <span className={chip}>
                {text}
                <button
                  type="button"
                  onClick={() => onRemove(raw as SupportItemRef)}
                  aria-label={`Remove ${words}`}
                  className={`-mr-0.5 shrink-0 rounded px-1 text-zinc-500 hover:text-zinc-200 ${focusRing}`}
                >
                  ×
                </button>
              </span>
            ) : how?.href && !how.onClick ? (
              <Link href={how.href} className={`${chip} hover:border-zinc-500 hover:text-zinc-100 ${focusRing}`}>
                {text}
                {status}
              </Link>
            ) : how?.onClick ? (
              <button type="button" onClick={how.onClick} className={`${chip} hover:border-zinc-500 hover:text-zinc-100 ${focusRing}`}>
                {text}
                {status}
              </button>
            ) : (
              <span className={`${chip} text-zinc-400`} title={how?.reason}>
                {text}
                {status}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface Hit {
  item: SupportItemRef;
  sub: string;
}

const SEARCH_KINDS: SupportItemKind[] = ["run", "review", "release", "plan", "alert", "data_source"];

/** Matches every word of `q` in any of `fields`. */
function matches(q: string, fields: (string | null | undefined)[]): boolean {
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/**
 * Finds the team's runs, reviews, releases and plans through the ⌘K search,
 * and its alerts and data sources from their lists (loaded once), to attach.
 * Only ids and names leave the page; the server checks each is the team's.
 */
export function AttachPicker({
  chosen,
  onAdd,
  room,
  onClose,
}: {
  chosen: SupportItemRef[];
  onAdd: (item: SupportItemRef) => void;
  room: number;
  onClose?: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const catalogs = useRef<{ alerts?: AlertEvent[]; sources?: DataSource[] }>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const words = q.trim();
    if (!words) {
      setHits(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      const found: Hit[] = [];
      const [search] = await Promise.all([
        api.search(words, { limit: 5 }, { signal: ctrl.signal }).catch(() => null),
        catalogs.current.alerts
          ? null
          : api.listAlerts().then((r) => (catalogs.current.alerts = r.alerts)).catch(() => (catalogs.current.alerts = [])),
        catalogs.current.sources
          ? null
          : api.listDataSources().then((r) => (catalogs.current.sources = r.sources)).catch(() => (catalogs.current.sources = [])),
      ]);
      if (ctrl.signal.aborted) return;
      for (const r of search?.runs ?? []) found.push({ item: { kind: "run", id: r.run_id, label: r.title || r.ticket_id, repo: r.repo }, sub: [r.repo, r.status].filter(Boolean).join(" · ") });
      for (const r of search?.reviews ?? [])
        found.push({ item: { kind: "review", id: r.sk, label: `${r.repo} #${r.pr_number}`, repo: r.repo }, sub: [r.title, r.verdict].filter(Boolean).join(" · ") });
      for (const r of search?.releases ?? []) found.push({ item: { kind: "release", id: `${r.repo}@${r.tag}`, label: `${r.repo} ${r.tag}`, repo: r.repo }, sub: r.headline });
      for (const p of search?.plans ?? []) found.push({ item: { kind: "plan", id: p.plan_id, label: p.title, repo: p.repo }, sub: [p.repo, p.status].filter(Boolean).join(" · ") });
      for (const a of (catalogs.current.alerts ?? []).filter((a) => matches(words, [a.title, a.repo, a.kind, a.outcome])).slice(0, 5))
        found.push({ item: { kind: "alert", id: a.id, label: a.title || a.id, repo: a.repo || undefined }, sub: [a.repo, a.outcome].filter(Boolean).join(" · ") });
      for (const d of (catalogs.current.sources ?? []).filter((d) => matches(words, [d.name, d.kind])).slice(0, 5))
        found.push({ item: { kind: "data_source", id: d.id, label: d.name }, sub: d.kind });
      found.sort((a, b) => SEARCH_KINDS.indexOf(a.item.kind) - SEARCH_KINDS.indexOf(b.item.kind));
      setHits(found);
      setBusy(false);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const taken = (i: SupportItemRef) => chosen.some((c) => c.kind === i.kind && c.id === i.id);

  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-2" data-testid="attach-picker">
      <div className="flex items-center gap-2">
        <label htmlFor="attach-search" className="sr-only">
          Find something to attach
        </label>
        <input
          ref={inputRef}
          id="attach-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose?.();
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Search runs, reviews, releases, plans, alerts, data sources"
          className={`${inputClass} min-w-0 flex-1`}
          autoComplete="off"
        />
        {onClose && (
          <button type="button" onClick={onClose} className={`shrink-0 rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}>
            Done
          </button>
        )}
      </div>
      <p className="mt-1.5 px-1 text-xs text-zinc-500">
        {room > 0 ? `You can attach ${room} more.` : `A ticket carries at most ${MAX_ATTACHMENTS} items.`} Only the name and a link are sent, never the contents.
      </p>
      {busy && hits === null && <p className="mt-2 px-1 text-xs text-zinc-500">Searching…</p>}
      {hits && hits.length === 0 && <p className="mt-2 px-1 text-xs text-zinc-500" role="status">Nothing matches.</p>}
      {hits && hits.length > 0 && (
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto" aria-label="Matches">
          {hits.map((h) => {
            const already = taken(h.item);
            return (
              <li key={`${h.item.kind}:${h.item.id}`}>
                <button
                  type="button"
                  disabled={already || room <= 0}
                  onClick={() => onAdd(h.item)}
                  data-testid="attach-result"
                  className={`flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-800/70 disabled:opacity-50 ${focusRing}`}
                >
                  <span className="mt-0.5 shrink-0 rounded border border-zinc-700 px-1 text-[10px] uppercase tracking-wide text-zinc-400">{KIND_LABEL[h.item.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-zinc-200">{h.item.label || h.item.id}</span>
                    {h.sub && <span className="block truncate text-xs text-zinc-500">{h.sub}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{already ? "Attached" : "Attach"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
