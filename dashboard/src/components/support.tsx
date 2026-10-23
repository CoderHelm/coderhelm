"use client";

// The pieces the customer's ticket page and the admin queue share: the
// timeline, the composer, the people on a ticket, what it was filed about,
// and the small "Something wrong with this run?" link on run, review and
// release pages.
//
// How a long thread stays readable (see the PR's design note): a light
// timeline instead of a card per message, the middle of a long thread folded
// ("Show 12 earlier"), status and people changes as one-line events, one
// person's consecutive messages under one header, long messages clamped,
// email-style quotes folded, an unread divider, and "Jump to latest".

import { PageHeader } from "./page";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  api,
  type AlertEvent,
  type DataSource,
  type SupportItem,
  type SupportItemKind,
  type SupportItemRef,
  type SupportMessage,
  type SupportPersonRef,
  type SupportTicket,
  type TeamUser,
} from "@/lib/api";
import {
  avatarTone,
  bareUserId,
  chipWords,
  cleanEmail,
  eventKind,
  eventWords,
  filedBy,
  helpHref,
  initials,
  isLong,
  itemHref,
  itemWords,
  KIND_LABEL,
  MAX_ATTACHMENTS,
  MAX_PARTICIPANTS,
  pageWords,
  personName,
  PRIORITY_LABEL,
  quoteFor,
  splitQuoted,
  threadEntries,
  ticketItems,
  ticketPeople,
  type HelpTarget,
} from "@/lib/support";
import { ChatMarkdown } from "./chat-markdown";
import { MarkdownEditor, clearDraft } from "./markdown-editor";
import { Time } from "./list";
import { LifeBuoyIcon } from "./icons";
import { focusRing, inputClass, primaryButton, secondaryButton } from "./ui";

// ── Avatars ──────────────────────────────────────────────────────────────

/** A person's picture, or their initials on a steady colour. Support is the lifebuoy. */
export function Avatar({
  name,
  email,
  url,
  support = false,
  size = "md",
}: {
  name: string;
  email?: string;
  url?: string;
  support?: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  if (support) {
    return (
      <span aria-hidden="true" className={`${box} grid shrink-0 place-items-center rounded-full bg-sky-500/15 text-sky-300 ring-2 ring-zinc-950`}>
        <span className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}>
          <LifeBuoyIcon />
        </span>
      </span>
    );
  }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" aria-hidden="true" className={`${box} shrink-0 rounded-full bg-zinc-800 object-cover ring-2 ring-zinc-950`} />;
  }
  return (
    <span aria-hidden="true" className={`${box} grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-zinc-950 ${avatarTone(email || name)}`}>
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars of everyone on a ticket, with "+3" past `max`. */
export function AvatarStack({ ticket, avatars = {}, max = 5 }: { ticket: SupportTicket; avatars?: Record<string, string>; max?: number }) {
  const people = ticketPeople(ticket);
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className="flex items-center" data-testid="avatar-stack" title={people.map((p) => p.name).join(", ")}>
      <span className="sr-only">
        {people.length} {people.length === 1 ? "person" : "people"} on this ticket: {people.map((p) => p.name).join(", ")}
      </span>
      {shown.map((p, i) => (
        <span key={p.key} className={i ? "-ml-2" : ""}>
          <Avatar name={p.name} email={p.email} url={avatars[p.email.toLowerCase()]} size="sm" />
        </span>
      ))}
      {more > 0 && (
        <span aria-hidden="true" className="-ml-2 grid h-6 min-w-6 place-items-center rounded-full bg-zinc-800 px-1 text-[10px] font-medium text-zinc-300 ring-2 ring-zinc-950">
          +{more}
        </span>
      )}
    </span>
  );
}

// ── The thread ───────────────────────────────────────────────────────────

/** Who wrote a message, as the reader sees it, and the tooltip. */
function author(m: SupportMessage, admin: boolean): { name: string; title?: string } {
  if (m.author === "support") {
    return admin ? { name: personName(m.author_name, m.author_email), title: m.author_email || undefined } : { name: "Coderhelm support" };
  }
  return { name: personName(m.author_name, m.author_email), title: m.author_email || undefined };
}

const SEEN_KEY = "coderhelm.support.seen.";

function readSeen(ticketId: string): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY + ticketId);
  } catch {
    return null;
  }
}

function writeSeen(ticketId: string, at: string) {
  try {
    window.localStorage.setItem(SEEN_KEY + ticketId, at);
  } catch {
    // Private mode: the divider just will not show next time.
  }
}

/** True on a phone-width screen. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
}

const EVENT_DOT: Record<ReturnType<typeof eventKind>, string> = {
  people: "bg-violet-400",
  status: "bg-emerald-400",
  access: "bg-sky-400",
  other: "bg-zinc-500",
};

/**
 * The conversation, oldest first, as a timeline. `ticketId` keys the
 * viewer's unread marker (kept in this browser); `isMine` says which
 * messages the viewer wrote, so their own replies never count as unread.
 */
export function SupportThread({
  messages,
  ticketId,
  admin = false,
  openItem,
  avatars = {},
  isMine,
  onQuote,
}: {
  messages: SupportMessage[];
  ticketId: string;
  admin?: boolean;
  /** How a chip opens its item (the admin queue opens a support view first). */
  openItem?: ItemOpener;
  avatars?: Record<string, string>;
  isMine?: (m: SupportMessage) => boolean;
  /** Quote a message into the composer. */
  onQuote?: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [seenAt] = useState(() => (typeof window === "undefined" ? null : readSeen(ticketId)));
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const phone = usePhone();
  const endRef = useRef<HTMLDivElement>(null);
  const [endInView, setEndInView] = useState(true);

  const last = messages[messages.length - 1]?.created_at;
  useEffect(() => {
    if (last) writeSeen(ticketId, last);
  }, [ticketId, last]);

  useEffect(() => {
    const el = endRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setEndInView(e.isIntersecting), { rootMargin: "0px 0px -80px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const entries = threadEntries(messages, { expanded, seenAt, isMine });
  const unreadAt = entries.findIndex((e) => e.type === "unread");
  // On a phone, older messages show as one line each until tapped.
  const messageIdx = entries.map((e, i) => (e.type === "message" ? i : -1)).filter((i) => i >= 0);
  const keepOpenFrom = Math.min(messageIdx.length >= 2 ? messageIdx[messageIdx.length - 2] : 0, unreadAt >= 0 ? unreadAt : Infinity);

  const jump = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  };

  return (
    <div className="relative min-w-0">
      <ol
        aria-label="Conversation"
        data-testid="support-thread"
        className="relative min-w-0 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-zinc-800"
      >
        {entries.map((e, i) => {
          if (e.type === "hidden") {
            const others = e.count - e.messages;
            return (
              <li key={`hidden-${e.from}`} className="relative py-2 pl-11">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  data-testid="thread-show-earlier"
                  className={`inline-flex min-h-8 items-center gap-2 rounded-full border border-dashed border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 ${focusRing}`}
                >
                  Show {e.messages} earlier message{e.messages === 1 ? "" : "s"}
                  {others > 0 && (
                    <span className="text-zinc-500">
                      and {others} update{others === 1 ? "" : "s"}
                    </span>
                  )}
                </button>
              </li>
            );
          }
          if (e.type === "unread") {
            return (
              <li key="unread" role="separator" aria-label="New since you last looked" data-testid="unread-divider" className="relative flex items-center gap-2 py-2 pl-11 text-xs font-medium text-rose-300">
                <span className="h-px flex-1 bg-rose-500/40" aria-hidden="true" />
                New
                <span className="h-px w-6 bg-rose-500/40" aria-hidden="true" />
              </li>
            );
          }
          const m = e.m;
          const who = author(m, admin);
          if (e.type === "event") {
            return (
              <li key={m.id} className="relative flex min-w-0 items-start gap-3 py-1.5 text-xs text-zinc-500" data-testid="support-event" data-event={eventKind(m.body)}>
                <span className="grid h-8 w-8 shrink-0 place-items-center" aria-hidden="true">
                  <span className={`h-2 w-2 rounded-full ring-4 ring-zinc-950 ${EVENT_DOT[eventKind(m.body)]}`} />
                </span>
                <span className="min-w-0 pt-2 [overflow-wrap:anywhere]">
                  <span className="font-medium text-zinc-400" title={who.title}>
                    {who.name}
                  </span>{" "}
                  {eventWords(m.body)} <Time iso={m.created_at} className="text-zinc-600" />
                </span>
              </li>
            );
          }
          const compact = phone && i < keepOpenFrom && !openRows.has(m.id);
          // A message right after a one-line row shows its own header again.
          const prev = entries[i - 1];
          const afterCompact = !!prev && prev.type === "message" && phone && i - 1 < keepOpenFrom && !openRows.has(prev.m.id);
          return (
            <MessageRow
              key={m.id}
              m={m}
              who={who}
              continued={e.continued && !afterCompact}
              compact={compact}
              onExpand={() => setOpenRows(new Set(openRows).add(m.id))}
              avatarUrl={avatars[(m.author_email || "").toLowerCase()]}
              admin={admin}
              openItem={openItem}
              onQuote={onQuote}
            />
          );
        })}
      </ol>
      <div ref={endRef} data-testid="thread-end" />
      {!endInView && entries.length > 4 && (
        <div className="pointer-events-none sticky bottom-4 z-10 flex justify-center">
          <button
            type="button"
            onClick={jump}
            data-testid="jump-to-latest"
            className={`pointer-events-auto inline-flex min-h-8 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/95 px-3 text-xs font-medium text-zinc-200 shadow-lg hover:bg-zinc-800 ${focusRing}`}
          >
            Jump to latest <span aria-hidden="true">↓</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MessageRow({
  m,
  who,
  continued,
  compact,
  onExpand,
  avatarUrl,
  admin,
  openItem,
  onQuote,
}: {
  m: SupportMessage;
  who: { name: string; title?: string };
  continued: boolean;
  compact: boolean;
  onExpand: () => void;
  avatarUrl?: string;
  admin: boolean;
  openItem?: ItemOpener;
  onQuote?: (text: string) => void;
}) {
  const [more, setMore] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const support = m.author === "support";
  const { main, quoted } = splitQuoted(m.body || "");
  const long = isLong(main);

  if (compact) {
    return (
      <li className="relative min-w-0 py-1" data-testid="support-message" data-author={m.author} data-compact="">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded="false"
          className={`flex w-full min-w-0 items-center gap-3 rounded-lg py-1 pr-1 text-left text-sm hover:bg-zinc-900/60 ${focusRing}`}
        >
          <Avatar name={who.name} email={m.author_email} url={avatarUrl} support={support && !admin} />
          <span className={`shrink-0 font-medium ${support ? "text-sky-300" : "text-zinc-200"}`}>{who.name}</span>
          <span className="min-w-0 flex-1 truncate text-zinc-500">{m.body || (m.attachments?.length ? "Attached items" : "")}</span>
          <Time iso={m.created_at} className="shrink-0 text-xs text-zinc-600" />
        </button>
      </li>
    );
  }

  return (
    <li
      className={`group relative flex min-w-0 gap-3 ${continued ? "pt-1" : "pt-4 first:pt-0"} pb-1`}
      data-testid="support-message"
      data-author={m.author}
      data-continued={continued ? "" : undefined}
    >
      <span className="w-8 shrink-0">{!continued && <Avatar name={who.name} email={m.author_email} url={avatarUrl} support={support && !admin} />}</span>
      <div className="min-w-0 flex-1">
        {!continued && (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={`text-sm font-medium ${support ? "text-sky-300" : "text-zinc-100"}`} title={who.title} data-testid="message-author">
              {who.name}
            </span>
            {support && admin && <span className="rounded border border-sky-500/30 px-1 text-[10px] uppercase tracking-wide text-sky-300">Support</span>}
            <Time iso={m.created_at} className="text-xs text-zinc-500" />
          </div>
        )}
        {main && (
          <div className={`relative min-w-0 text-sm text-zinc-300 [overflow-wrap:anywhere] [&_p]:text-zinc-300 ${continued ? "" : "mt-0.5"}`}>
            <div className={long && !more ? "max-h-64 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" : ""} data-testid="support-message-body">
              <ChatMarkdown breaks>{main}</ChatMarkdown>
            </div>
            {long && (
              <button
                type="button"
                onClick={() => setMore(!more)}
                aria-expanded={more}
                className={`rounded text-xs font-medium text-zinc-400 underline underline-offset-4 hover:text-zinc-200 ${focusRing}`}
              >
                {more ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        {quoted && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowQuote(!showQuote)}
              aria-expanded={showQuote}
              aria-label={showQuote ? "Hide quoted text" : "Show quoted text"}
              title={showQuote ? "Hide quoted text" : "Show quoted text"}
              className={`rounded bg-zinc-800 px-1.5 text-xs leading-4 text-zinc-400 hover:text-zinc-200 ${focusRing}`}
              data-testid="quoted-toggle"
            >
              •••
            </button>
            {showQuote && (
              <div className="mt-1 text-sm">
                <ChatMarkdown breaks>{quoted}</ChatMarkdown>
              </div>
            )}
          </div>
        )}
        {m.attachments && m.attachments.length > 0 && (
          <div className={main ? "mt-2" : "mt-1"}>
            <AttachmentChips items={m.attachments} open={openItem} label="Attached with this message" />
          </div>
        )}
      </div>
      {onQuote && main && (
        <button
          type="button"
          onClick={() => onQuote(quoteFor(who.name, m.body))}
          aria-label={`Quote ${who.name}`}
          className={`absolute right-0 top-3 rounded px-1.5 py-0.5 text-xs text-zinc-500 opacity-0 hover:text-zinc-200 focus-visible:opacity-100 group-hover:opacity-100 ${focusRing}`}
          data-testid="quote-message"
        >
          Quote
        </button>
      )}
    </li>
  );
}

// ── The composer ─────────────────────────────────────────────────────────

/**
 * Where the text is typed: the shared markdown editor (Write / Preview,
 * toolbar, drafts kept in this browser), drawn without its own border so
 * the composer is one box.
 */
function ComposerInput({
  id,
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  inputRef,
  draftKey,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  draftKey?: string;
}) {
  return (
    <MarkdownEditor
      id={id}
      variant="prose"
      value={value}
      onChange={onChange}
      maxLength={8000}
      minRows={3}
      placeholder={placeholder}
      disabled={disabled}
      draftKey={draftKey}
      onSubmitShortcut={onSubmit}
      textareaRef={inputRef}
      className="[&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent"
    />
  );
}

/** Another way to send: "Reply & resolve", or "Mark resolved" with nothing typed. */
export interface ComposerAction {
  key: string;
  label: string;
  /** The label with nothing typed; set, the action works without text. */
  emptyLabel?: string;
}

/**
 * One composer: the editor, then a footer with Attach on the left and the
 * send buttons on the right. The primary button stays dim until there is
 * something to send.
 */
export function Composer({
  onSend,
  placeholder,
  sendLabel = "Reply",
  actions = [],
  disabled = false,
  attachRoom,
  quote,
  inputRef: givenRef,
  draftKey,
}: {
  /** Resolves true when it was sent (the composer then empties). */
  onSend: (body: string, action?: string, items?: SupportItemRef[]) => Promise<boolean>;
  placeholder: string;
  sendLabel?: string;
  actions?: ComposerAction[];
  disabled?: boolean;
  /** Room left for attachments on the ticket; omitted, nothing can be attached. */
  attachRoom?: number;
  /** Text to add, e.g. a quoted message; `n` changes on each new quote. */
  quote?: { text: string; n: number } | null;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Keeps the unsent reply in this browser under this key (one per ticket). */
  draftKey?: string;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<SupportItemRef[]>([]);
  const [picking, setPicking] = useState(false);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = givenRef ?? ownRef;
  const hasText = !!body.trim();
  const canSend = (hasText || items.length > 0) && !busy && !disabled;

  useEffect(() => {
    if (!quote) return;
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n` : "") + quote.text);
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.n]);

  const send = async (action?: string) => {
    const allowEmpty = !!actions.find((a) => a.key === action)?.emptyLabel;
    if (busy || disabled || (!canSend && !(action && allowEmpty))) return;
    setBusy(true);
    try {
      if (await onSend(body.trim(), action, items)) {
        if (draftKey) clearDraft(draftKey);
        setBody("");
        setItems([]);
        setPicking(false);
      }
    } finally {
      setBusy(false);
    }
  };
  const room = attachRoom === undefined ? 0 : attachRoom - items.length;

  return (
    <form
      className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 transition-colors focus-within:border-zinc-600 motion-reduce:transition-none"
      data-testid="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label htmlFor="support-reply" className="sr-only">
        Reply
      </label>
      <ComposerInput id="support-reply" value={body} onChange={setBody} onSubmit={() => void send()} placeholder={placeholder} disabled={disabled} inputRef={inputRef} draftKey={draftKey} />
      {items.length > 0 && (
        <div className="px-3 pb-2">
          <AttachmentChips items={items} onRemove={(i) => setItems(items.filter((x) => x !== i))} label="To attach" />
        </div>
      )}
      {picking && attachRoom !== undefined && (
        <div className="px-2 pb-2">
          <AttachPicker chosen={items} onAdd={(i) => setItems([...items, i])} room={room} onClose={() => setPicking(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-zinc-800/80 px-2 py-2">
        {attachRoom !== undefined && (
          <button
            type="button"
            onClick={() => setPicking(!picking)}
            disabled={disabled || room <= 0}
            aria-expanded={picking}
            title={room <= 0 ? `This ticket has ${MAX_ATTACHMENTS} items, the most it can carry` : "Attach a run, review, release, plan, alert or data source"}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-50 ${focusRing}`}
            data-testid="reply-attach"
          >
            <span aria-hidden="true" className="text-sm leading-none">
              +
            </span>
            Attach
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {actions.map((a) => {
            const label = !hasText && a.emptyLabel ? a.emptyLabel : a.label;
            const ok = !busy && !disabled && (hasText || items.length > 0 || !!a.emptyLabel);
            return (
              <button key={a.key} type="button" onClick={() => void send(a.key)} disabled={!ok} className={`${secondaryButton} !min-h-8 !py-1 !px-3`} data-testid={`composer-${a.key}`}>
                {label}
              </button>
            );
          })}
          <button type="submit" disabled={!canSend} className={`${primaryButton} !min-h-8 !py-1 !px-3`} data-testid="composer-send">
            {busy ? "Sending…" : sendLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── People on a ticket ───────────────────────────────────────────────────

/**
 * Who is on the ticket, with Follow / Unfollow, and, for whoever may manage
 * it, a search to add teammates or copy an outside address. `adding` opens
 * the search (the header's "Add people" sets it).
 */
export function TicketPeople({
  ticket,
  avatars = {},
  me,
  canManage,
  admin = false,
  adding,
  setAdding,
  onAdd,
  onRemove,
}: {
  ticket: SupportTicket;
  avatars?: Record<string, string>;
  /** The viewer's user id (customer side). */
  me?: string;
  canManage: boolean;
  admin?: boolean;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onAdd: (who: SupportPersonRef) => Promise<boolean>;
  onRemove: (who: SupportPersonRef) => Promise<boolean>;
}) {
  const people = ticketPeople(ticket);
  const mine = me ? people.find((p) => !p.outside && (p.filer ? bareUserId(ticket.opened_by_id) : bareUserId(p.p?.user_id)) === bareUserId(me)) : undefined;
  const full = (ticket.participants?.length ?? 0) >= MAX_PARTICIPANTS;
  return (
    <div className="min-w-0" data-testid="ticket-people">
      <ul className="space-y-1.5" aria-label="People on this ticket">
        {people.map((p) => {
          const self = mine?.key === p.key;
          const removable = !p.filer && (canManage || self);
          return (
            <li key={p.key} className="flex min-w-0 items-center gap-2 text-sm" data-testid="ticket-person">
              <Avatar name={p.name} email={p.email} url={avatars[p.email.toLowerCase()]} size="sm" />
              <span className="min-w-0 flex-1 truncate text-zinc-200" title={p.email || undefined}>
                {p.name}
                {self && <span className="text-zinc-500"> (you)</span>}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">{p.filer ? "Filed" : p.outside ? "Copied" : ""}</span>
              {removable && !self && (
                <button
                  type="button"
                  onClick={() => void onRemove(p.outside ? { email: p.email } : { user_id: p.p?.user_id })}
                  aria-label={`Remove ${p.name} from this ticket`}
                  className={`-mr-1 shrink-0 rounded px-1 text-zinc-500 hover:text-zinc-200 ${focusRing}`}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {canManage && !adding && (
          <button type="button" onClick={() => setAdding(true)} disabled={full} className={`${secondaryButton} !min-h-8 !py-1 !px-3`} data-testid="add-people">
            + Add people
          </button>
        )}
        {!admin && me && mine?.key !== `filer:${ticket.opened_by_id}` && (
          <button
            type="button"
            onClick={() => void (mine ? onRemove({ user_id: me }) : onAdd({ user_id: me }))}
            disabled={!mine && full}
            className={`${secondaryButton} !min-h-8 !py-1 !px-3`}
            data-testid="follow-ticket"
          >
            {mine ? "Unfollow" : "Follow"}
          </button>
        )}
      </div>
      {full && <p className="mt-2 text-xs text-zinc-500">A ticket can have {MAX_PARTICIPANTS} people besides the person who filed it.</p>}
      {adding && canManage && <AddPeople ticket={ticket} admin={admin} onAdd={onAdd} onClose={() => setAdding(false)} />}
      <p className="mt-2 text-xs text-zinc-500">Everyone here is emailed when support replies or the status changes.</p>
    </div>
  );
}

/** The search that adds a teammate, or copies an outside address by email. */
function AddPeople({
  ticket,
  admin,
  onAdd,
  onClose,
}: {
  ticket: SupportTicket;
  admin: boolean;
  onAdd: (who: SupportPersonRef) => Promise<boolean>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<TeamUser[] | null>(admin ? [] : null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    if (admin) return;
    api
      .listUsers()
      .then((r) => setUsers(r.users.filter((u) => u.status !== "invited")))
      .catch(() => setUsers([]));
  }, [admin]);

  const taken = new Set(
    [bareUserId(ticket.opened_by_id), ...(ticket.participants ?? []).map((p) => bareUserId(p.user_id))].filter(Boolean),
  );
  const takenEmails = new Set([ticket.opened_by_email, ...(ticket.participants ?? []).map((p) => p.email)].map((e) => (e || "").toLowerCase()));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (users ?? [])
    .filter((u) => !taken.has(bareUserId(u.user_id)))
    .filter((u) => words.every((w) => `${u.name ?? ""} ${u.github_login ?? ""} ${u.email ?? ""}`.toLowerCase().includes(w)))
    .slice(0, 6);
  const email = cleanEmail(q);
  const emailTaken = !!email && takenEmails.has(email);
  const emailIsMember = !!email && (users ?? []).some((u) => (u.email || "").toLowerCase() === email);
  const options: { key: string; who: SupportPersonRef; label: ReactNode }[] = [
    ...matches.map((u) => ({
      key: u.user_id,
      who: { user_id: u.user_id },
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={personName(u.name || u.github_login, u.email)} email={u.email ?? ""} url={u.avatar_url ?? undefined} size="sm" />
          <span className="min-w-0 truncate text-zinc-200">{personName(u.name || u.github_login, u.email)}</span>
          {u.email && <span className="min-w-0 truncate text-xs text-zinc-500">{u.email}</span>}
        </span>
      ),
    })),
    ...(email && !emailTaken && !emailIsMember
      ? [
          {
            key: `email:${email}`,
            who: { email },
            label: (
              <span className="min-w-0">
                <span className="block truncate text-zinc-200">Copy {email} by email</span>
                <span className="block text-xs text-zinc-500">{admin ? "A team member's address adds them as a member." : "Not on the team: they get the emails but can't sign in."}</span>
              </span>
            ),
          },
        ]
      : []),
  ];
  const pick = async (who: SupportPersonRef) => {
    setBusy(true);
    try {
      if (await onAdd(who)) {
        setQ("");
        setActive(0);
        inputRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  };
  const hint =
    q.includes("@") && !email
      ? "Enter a valid email address."
      : emailTaken
        ? "They are already on this ticket."
        : q && options.length === 0 && users !== null
          ? admin
            ? "Enter their email address."
            : "No one on the team matches. Enter an email address to copy someone outside the team."
          : "";

  return (
    <div className="mt-3 min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-2" data-testid="add-people-form">
      <div className="flex items-center gap-2">
        <label htmlFor="add-person" className="sr-only">
          {admin ? "Email address" : "Name or email"}
        </label>
        <input
          ref={inputRef}
          id="add-person"
          type="text"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(active + 1, options.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(active - 1, 0));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (options[active] && !busy) void pick(options[active].who);
            }
          }}
          placeholder={admin ? "name@example.com" : "Search the team, or type an email"}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="button" onClick={onClose} className={`shrink-0 rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}>
          Done
        </button>
      </div>
      {hint && (
        <p className="mt-1.5 px-1 text-xs text-zinc-500" role="status">
          {hint}
        </p>
      )}
      {options.length > 0 && (
        <ul id={listId} role="listbox" aria-label="People to add" className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => !busy && void pick(o.who)}
              onMouseEnter={() => setActive(i)}
              data-testid="add-person-option"
              className={`flex min-w-0 cursor-pointer items-center rounded-md px-2 py-1.5 text-sm ${i === active ? "bg-zinc-800/80" : ""}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── The side panel ───────────────────────────────────────────────────────

/** One titled block of the side panel. */
export function PanelSection({ title, children, testId }: { title: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="min-w-0 border-t border-zinc-800/80 pt-4 first:border-t-0 first:pt-0" data-testid={testId}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

/** What the ticket was filed about and when: the facts rows of the side panel. */
export function TicketContext({
  ticket,
  admin = false,
  openItem,
}: {
  ticket: SupportTicket;
  admin?: boolean;
  openItem?: ItemOpener;
}) {
  const { context: c } = ticket;
  const items = ticketItems(ticket);
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
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
  if (c.page) {
    rows.push([
      "Page",
      <Link key="page" href={c.page} className={`rounded text-zinc-200 underline underline-offset-4 hover:text-zinc-100 ${focusRing}`}>
        {pageWords(c.page)}
      </Link>,
    ]);
  }
  rows.push(["Created", <time key="c" dateTime={ticket.created_at}>{when(ticket.created_at)}</time>]);
  rows.push(["Updated", <time key="u" dateTime={ticket.updated_at}>{when(ticket.updated_at)}</time>]);
  if (admin && c.user_agent) rows.push(["Browser", <span key="ua" className="break-all text-zinc-500">{c.user_agent}</span>]);
  return (
    <div className="min-w-0" data-testid="ticket-context">
      {items.length > 0 && (
        <div className="mb-3">
          <p className="sr-only">Attached</p>
          <AttachmentChips items={items} open={openItem} label="Attached to this ticket" />
        </div>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-zinc-500">{k}</dt>
            <dd className="min-w-0 text-zinc-300 [overflow-wrap:anywhere]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The page's two columns. When the page area (not the window, so an open
 * sidebar counts) is at least 860px wide, the thread is on the left and the
 * details on the right; narrower (a laptop under about 1150px with the
 * sidebar open, tablets, phones), the details fold into a "Details"
 * disclosure under the header. In pixels: the app's rem is 18px.
 */
export function TicketLayout({
  thread,
  details,
  detailsSummary,
  detailsOpen,
  setDetailsOpen,
}: {
  thread: ReactNode;
  details: ReactNode;
  detailsSummary: ReactNode;
  detailsOpen: boolean;
  setDetailsOpen: (v: boolean) => void;
}) {
  return (
    <div className="@container mt-4 min-w-0" data-testid="ticket-layout">
      <div className="grid min-w-0 grid-cols-1 gap-6 @min-[860px]:grid-cols-[minmax(0,1fr)_18rem]">
        <aside className="min-w-0 @min-[860px]:col-start-2 @min-[860px]:row-start-1" aria-label="Ticket details">
          <button
            type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            aria-expanded={detailsOpen}
            aria-controls="ticket-details"
            className={`flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-left text-sm text-zinc-300 hover:text-zinc-100 @min-[860px]:hidden ${focusRing}`}
            data-testid="details-toggle"
          >
            <span aria-hidden="true" className={`shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none ${detailsOpen ? "rotate-90" : ""}`}>
              ›
            </span>
            <span className="font-medium">Details</span>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{detailsSummary}</span>
          </button>
          <div
            id="ticket-details"
            className={`${detailsOpen ? "mt-3 block" : "hidden"} min-w-0 space-y-4 rounded-lg border border-zinc-800 p-4 @min-[860px]:mt-0 @min-[860px]:block @min-[860px]:border-0 @min-[860px]:p-0`}
            data-testid="ticket-details"
          >
            {details}
          </div>
        </aside>
        <div className="min-w-0 @min-[860px]:col-start-1 @min-[860px]:row-start-1">{thread}</div>
      </div>
    </div>
  );
}

/** The header: subject, status, priority, id, who opened it, and the people. */
export function TicketHeader({
  ticket,
  status,
  note,
  people,
}: {
  ticket: SupportTicket;
  status: ReactNode;
  note?: ReactNode;
  people: ReactNode;
}) {
  const opened = new Date(ticket.created_at);
  return (
    <header className="min-w-0 border-b border-zinc-800/80 bg-zinc-950/95 pb-3 backdrop-blur md:sticky md:top-12 md:z-20 md:-mx-1 md:px-1 md:pt-2" data-testid="ticket-header">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          {/* The page's title; the top bar above names the ticket in the trail. */}
          <PageHeader detail title={ticket.subject} titleClassName="text-xl sm:text-2xl" />
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {status}
            {ticket.priority !== "normal" && (
              <span className={`rounded border px-1.5 py-0.5 font-medium ${ticket.priority === "urgent" ? "border-red-500/40 text-red-300" : "border-amber-500/40 text-amber-300"}`}>
                {PRIORITY_LABEL[ticket.priority]}
              </span>
            )}
            <span className="tabular-nums" title={ticket.id}>
              #{ticket.id.slice(-6)}
            </span>
            <span>
              Opened by {filedBy(ticket)} ·{" "}
              <time dateTime={ticket.created_at} title={opened.toLocaleString()}>
                {opened.toLocaleDateString(undefined, { dateStyle: "medium" })}
              </time>
            </span>
          </div>
          {note && <div className="mt-1 text-xs text-zinc-500">{note}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{people}</div>
      </div>
    </header>
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

/**
 * Attached items as compact chips, "Run · Fix the login page · merged",
 * each linking to the item; the full name is in the tooltip.
 */
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
        const w = chipWords(item);
        const how = onRemove ? null : open ? open(item) : { href: itemHref(item) };
        const chip =
          "inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-full border border-zinc-700/80 bg-zinc-900 px-2 text-xs text-zinc-300";
        // The chip reads its full name to screen readers (and to tests);
        // the short visible form is decoration.
        const body = (
          <>
            <span className="sr-only">{w.full}</span>
            <span aria-hidden="true" className="shrink-0 font-medium text-zinc-400">{w.kind}</span>
            <span aria-hidden="true" className="shrink-0 text-zinc-600">·</span>
            <span aria-hidden="true" className="min-w-0 truncate">{w.name}</span>
            {w.status && (
              <>
                <span aria-hidden="true" className="shrink-0 text-zinc-600">·</span>
                <span aria-hidden="true" className="shrink-0 text-zinc-500">{w.status}</span>
              </>
            )}
          </>
        );
        return (
          <li key={`${item.kind}:${item.id}`} className="min-w-0 max-w-full" data-testid="attachment-chip" data-kind={item.kind}>
            {onRemove ? (
              <span className={chip} title={w.full}>
                {body}
                <button
                  type="button"
                  onClick={() => onRemove(raw as SupportItemRef)}
                  aria-label={`Remove ${itemWords(item)}`}
                  className={`-mr-1 shrink-0 rounded-full px-1 text-zinc-500 hover:text-zinc-200 ${focusRing}`}
                >
                  ×
                </button>
              </span>
            ) : how?.href && !how.onClick ? (
              <Link href={how.href} title={w.full} className={`${chip} hover:border-zinc-500 hover:text-zinc-100 ${focusRing}`}>
                {body}
              </Link>
            ) : how?.onClick ? (
              <button type="button" title={w.full} onClick={how.onClick} className={`${chip} hover:border-zinc-500 hover:text-zinc-100 ${focusRing}`}>
                {body}
              </button>
            ) : (
              <span className={`${chip} text-zinc-400`} title={how?.reason ? `${w.full}. ${how.reason}` : w.full}>
                {body}
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
