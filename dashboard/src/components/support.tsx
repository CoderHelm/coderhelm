"use client";

// The pieces the customer's ticket page and the admin queue share: the
// thread, the reply box, what the ticket was filed about, and the small
// "Something wrong with this run?" link on run, review and release pages.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { SupportMessage, SupportTicket } from "@/lib/api";
import { filedBy, helpHref, itemHref, itemWords, pageWords, PRIORITY_LABEL, type HelpTarget } from "@/lib/support";
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
export function SupportThread({ messages, admin = false }: { messages: SupportMessage[]; admin?: boolean }) {
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
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]">{m.body}</p>
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
}: {
  /** Resolves true when the reply was sent (the box then empties). */
  onSend: (body: string, extra?: string) => Promise<boolean>;
  placeholder: string;
  sendLabel?: string;
  /** Other ways to send, e.g. "Send and resolve": [label, key]. */
  extra?: [string, string][];
  disabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (key?: string) => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      if (await onSend(body.trim(), key)) setBody("");
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
      <textarea
        id="support-reply"
        rows={4}
        value={body}
        maxLength={8000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={placeholder}
        className={`${inputClass} resize-y`}
        disabled={disabled}
      />
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
        <button type="submit" disabled={!body.trim() || busy || disabled} className={primaryButton}>
          {busy ? "Sending…" : sendLabel}
        </button>
      </div>
    </form>
  );
}

/** What the ticket was filed about: the page, the item, the team and role. */
export function TicketContext({ ticket, admin = false }: { ticket: SupportTicket; admin?: boolean }) {
  const { context: c } = ticket;
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
  if (c.item) {
    rows.push([
      "About",
      <Link key="item" href={itemHref(c.item)} className={`rounded text-zinc-200 underline underline-offset-4 hover:text-zinc-100 ${focusRing}`}>
        {itemWords(c.item)}
      </Link>,
    ]);
    if (c.item.status) rows.push(["Status then", c.item.status.replace(/_/g, " ")]);
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
      {admin && c.item && (
        <p className="mt-2 text-xs text-zinc-500">Links open in the team&apos;s own view; switch to that team first if you are a member.</p>
      )}
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
