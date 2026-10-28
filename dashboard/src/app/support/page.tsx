"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  api,
  type NewSupportTicket,
  type SupportItemKind,
  type SupportItemRef,
  type SupportParticipant,
  type SupportPersonRef,
  type SupportPriority,
  type SupportTicket,
  type TeamUser,
} from "@/lib/api";
import { bareUserId, customerLook, filedBy, itemWords, MAX_ATTACHMENTS, pageWords, ticketItems } from "@/lib/support";
import { AttachmentChips, AttachPicker, TicketPeople } from "@/components/support";
import { Page, PageHeader } from "@/components/page";
import { Field } from "@/components/settings";
import { MarkdownEditor, clearDraft } from "@/components/markdown-editor";
import { Segmented } from "@/components/segmented";
import { buttonClass, focusRing, fullWidthOnPhone, primaryButton, secondaryButton } from "@/components/ui";
import { isSelfHosted } from "@/lib/runtime-config";
import { List, ListEmpty, ListError, ListRow, ListSkeleton, ListToolbar, StatusText, useListParams } from "@/components/list";

const KINDS: SupportItemKind[] = ["run", "review", "release", "plan", "alert", "data_source"];

const URGENCY: { value: SupportPriority; label: string; means: string }[] = [
  { value: "normal", label: "Normal", means: "It can wait a little." },
  { value: "high", label: "High", means: "It blocks some of our work." },
  { value: "urgent", label: "Urgent", means: "Nothing works for us." },
];

/** Offered under the body's toolbar, never forced. */
const ISSUE_TEMPLATE = "### What happened\n\n\n### What you expected\n\n\n### Steps to see it\n1. ";

const BODY_TIPS = [
  <>Say what you expected, what you saw, and when. A run, review or page attached below helps more than a description of it.</>,
  <>Leave out passwords, keys and code: support never needs them, and likely secrets are hidden before the ticket is saved.</>,
  <>Paste error messages as they are. The code button in the toolbar keeps them readable.</>,
  <>Select words and paste a link to make them a link.</>,
];

const NEW_TICKET_DRAFT = "support:new-ticket";

// "Move to your own AWS account" (Settings, hosted only): a normal ticket
// whose subject names the topic and whose body carries these answers. A
// person helps with the move; nothing is copied automatically.
const MOVE_TOPIC = "Move to self-host";
const TEAM_SIZES = ["1 to 10 people", "11 to 50 people", "51 to 200 people", "More than 200 people"];
const AWS_REGIONS = ["us-east-1", "us-east-2", "us-west-2", "ca-central-1", "eu-west-1", "eu-west-2", "eu-central-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1"];
const BRING_OVER = [
  "Settings and instructions",
  "Repositories and their settings",
  "Knowledge and data sources",
  "Memory and what Coderhelm learned",
  "Run and review history",
  "People and roles",
];

/** The ticket body for a move: the answers first, then anything else they wrote. */
function moveTicketBody(a: { size: string; region: string; bring: string[]; notes: string }): string {
  const lines = [
    `**Topic:** ${MOVE_TOPIC}`,
    `**Team size:** ${a.size || "Not given"}`,
    `**AWS region:** ${a.region || "Not sure yet"}`,
    `**What to bring over:** ${a.bring.length ? a.bring.join(", ") : "Not sure yet"}`,
  ];
  return a.notes.trim() ? `${lines.join("\n")}\n\n${a.notes.trim()}` : lines.join("\n");
}

export default function SupportPageWithParams() {
  return (
    <Suspense
      fallback={
        <Page>
          <PageHeader title="Support" />
          <div className="mt-6">
            <ListSkeleton rows={3} />
          </div>
        </Page>
      }
    >
      <SupportPage />
    </Suspense>
  );
}

function SupportPage() {
  const params = useSearchParams();
  return params.get("new") === "1" ? <NewTicket /> : <Tickets />;
}

// ── The team's tickets ──────────────────────────────────────────────────

function Tickets() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState("");
  const [params, setParams] = useListParams({ q: "", status: "all" });

  const load = useCallback(() => {
    setError("");
    api
      .supportTickets()
      .then((r) => setTickets(r.tickets))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The request failed."));
  }, []);
  useEffect(load, [load]);

  const words = params.q.toLowerCase().split(/\s+/).filter(Boolean);
  const searched = (tickets ?? []).filter((t) => {
    const hay = `${t.subject} ${filedBy(t)} ${ticketItems(t).map(itemWords).join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const count = (s: string) => searched.filter((t) => t.status === s).length;
  const status = ["open", "waiting", "resolved"].includes(params.status) ? params.status : "all";
  const shown = searched.filter((t) => status === "all" || t.status === status);
  const filtered = !!params.q || status !== "all";
  const clear = () => setParams({ q: "", status: "all" });

  return (
    <Page>
      <PageHeader
        title="Support"
        lead="Ask Coderhelm for help. Everyone on your team can see these tickets and the answers."
        actions={
          <Link href="/support?new=1" className={primaryButton}>
            New ticket
          </Link>
        }
      />
      <div className="mt-6 space-y-4">
        {error ? (
          <ListError title="Couldn't load your tickets" onRetry={load}>
            {error}
          </ListError>
        ) : tickets === null ? (
          <ListSkeleton rows={3} label="Loading your tickets" />
        ) : tickets.length === 0 ? (
          <ListEmpty
            title="No tickets yet"
            action={
              <Link href="/support?new=1" className={secondaryButton}>
                Ask for help
              </Link>
            }
          >
            When something goes wrong, open a ticket here. You can also start one from any run, review or release.
          </ListEmpty>
        ) : (
          <>
            <ListToolbar
              search={{ value: params.q, onChange: (v) => setParams({ q: v }, { replace: true }), placeholder: "Search tickets", label: "Search tickets" }}
              status={{
                label: "Show tickets",
                value: status,
                onChange: (v) => setParams({ status: v }),
                options: [
                  { value: "all", label: "All", count: searched.length },
                  { value: "waiting", label: "Waiting on you", count: count("waiting"), tone: "waiting" },
                  { value: "open", label: "Open", count: count("open"), tone: "live" },
                  { value: "resolved", label: "Resolved", count: count("resolved"), tone: "success" },
                ],
              }}
              onClear={filtered ? clear : undefined}
            />
            {shown.length === 0 ? (
              <ListEmpty title="No tickets match" onClear={clear} />
            ) : (
              <List label="Support tickets">
                {shown.map((t) => {
                  const look = customerLook(t.status);
                  return (
                    <ListRow
                      key={t.id}
                      testId="support-ticket-row"
                      data={{ status: t.status }}
                      status={look}
                      title={t.subject}
                      titleText={t.subject}
                      href={`/support/ticket?id=${encodeURIComponent(t.id)}`}
                      meta={[
                        // The summary already names who wrote last; say the filer only when it's someone else.
                        t.last_snippet && t.last_author_name === filedBy(t) ? null : filedBy(t),
                        ticketItems(t).length === 1
                          ? itemWords(ticketItems(t)[0])
                          : ticketItems(t).length > 1
                            ? `${ticketItems(t).length} items attached`
                            : null,
                        `${t.message_count} message${t.message_count === 1 ? "" : "s"}`,
                        t.participants?.length ? `${t.participants.length + 1} people` : null,
                      ]}
                      summary={
                        t.last_snippet
                          ? `${t.last_author_name || "Someone"}: ${t.last_snippet}`
                          : t.status === "waiting"
                            ? "Coderhelm support answered. Reply when you can."
                            : undefined
                      }
                      summaryTone={undefined}
                      chips={<StatusText look={look} />}
                      time={t.updated_at}
                    />
                  );
                })}
              </List>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

// ── A new ticket ─────────────────────────────────────────────────────────

function NewTicket() {
  const params = useSearchParams();
  const router = useRouter();
  const from = params.get("from") || "";
  // Where the person came from: "Report an issue", "Contact us", or "Get help".
  const type = params.get("type");
  // Only the hosted service offers the move; on an install it is plain help.
  const isMove = type === "selfhost" && !isSelfHosted();
  const intro = isMove
    ? { title: "Move to your own AWS account", lead: "Tell us a little about your team. A person from Coderhelm support will help you plan the move and bring your settings and data over.", placeholder: MOVE_TOPIC }
    : type === "issue"
      ? { title: "Report an issue", lead: "Tell us what went wrong. The page you were on is attached; remove it below if it doesn't help.", placeholder: "A run stopped at the test step" }
      : type === "contact"
        ? { title: "Contact us", lead: "Questions, feedback or anything else. Coderhelm support answers here and by email.", placeholder: "A question about auto-merge" }
        : { title: "Get help", lead: "Tell us what happened. Coderhelm support answers here and by email.", placeholder: "A run stopped at the test step" };
  const kindParam = params.get("kind") as SupportItemKind | null;
  const itemId = params.get("item") || "";
  const initialItem: SupportItemRef | null =
    kindParam && KINDS.includes(kindParam) && itemId
      ? { kind: kindParam, id: itemId, label: params.get("label") || "", repo: params.get("repo") || "" }
      : null;
  // The item from the page the person came from is attached to start with.
  const [items, setItems] = useState<SupportItemRef[]>(initialItem ? [initialItem] : []);
  const [picking, setPicking] = useState(false);
  const [page, setPage] = useState(from);
  const [subject, setSubject] = useState(
    initialItem
      ? `Something is wrong with ${initialItem.kind === "review" || initialItem.kind === "alert" ? `an ${initialItem.kind}` : initialItem.kind === "data_source" ? "a data source" : `a ${initialItem.kind}`}`
      : isMove
        ? MOVE_TOPIC
        : "",
  );
  const [body, setBody] = useState("");
  const [size, setSize] = useState("");
  const [region, setRegion] = useState("");
  const [bring, setBring] = useState<string[]>([]);
  const [priority, setPriority] = useState<SupportPriority>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Who goes on the ticket besides the person filing it. Checked again by
  // the gateway when it is sent, the same way as adding someone later.
  const [me, setMe] = useState<{ user_id: string; email: string; name: string; avatar_url: string } | null>(null);
  const [people, setPeople] = useState<SupportParticipant[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [addingPeople, setAddingPeople] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(async (u) => {
        setMe({ user_id: u.user_id, email: u.email, name: u.github_login || "", avatar_url: u.avatar_url || "" });
        // The name the team's member list has, as the ticket will show it.
        const mine = (await api.listUsers().catch(() => ({ users: [] as TeamUser[] }))).users.find((x) => bareUserId(x.user_id) === bareUserId(u.user_id));
        if (mine?.name) setMe((m) => (m ? { ...m, name: mine.name! } : m));
      })
      .catch(() => setMe(null));
  }, []);

  const addPerson = async (who: SupportPersonRef, user?: TeamUser) => {
    const p: SupportParticipant = user
      ? { user_id: user.user_id, email: (user.email || "").toLowerCase(), name: user.name || user.github_login || "", outside: false, added_by: "", added_at: "" }
      : { user_id: "", email: (who.email || "").toLowerCase(), name: "", outside: true, added_by: "", added_at: "" };
    if (!p.user_id && !p.email) return false;
    setPeople((now) => (now.some((q) => (p.user_id ? bareUserId(q.user_id) === bareUserId(p.user_id) : q.email === p.email)) ? now : [...now, p]));
    if (user?.avatar_url && p.email) setAvatars((a) => ({ ...a, [p.email]: user.avatar_url! }));
    return true;
  };
  const removePerson = async (who: SupportPersonRef) => {
    setPeople((now) => now.filter((q) => (who.user_id ? bareUserId(q.user_id) !== bareUserId(who.user_id) : q.email !== (who.email || "").toLowerCase())));
    return true;
  };

  const submit = async () => {
    if (!subject.trim() || (!isMove && !body.trim()) || busy) return;
    setBusy(true);
    setError("");
    const text = isMove ? moveTicketBody({ size, region, bring, notes: body }) : body.trim();
    const req: NewSupportTicket = { subject: subject.trim(), body: text, priority };
    if (page) req.page = page;
    if (items.length > 0) req.items = items.map((i) => ({ kind: i.kind, id: i.id, label: i.label || undefined, repo: i.repo || undefined }));
    if (people.length > 0) req.people = people.map((p) => (p.outside ? { email: p.email } : { user_id: p.user_id }));
    try {
      const r = await api.openSupportTicket(req);
      clearDraft(NEW_TICKET_DRAFT);
      router.push(`/support/ticket?id=${encodeURIComponent(r.ticket.id)}&new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the ticket.");
      setBusy(false);
    }
  };

  return (
    <Page narrow>
      <PageHeader
        title={intro.title}
        crumb={intro.title}
        lead={intro.lead}
      />
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          id="ticket-subject"
          label="Subject"
          value={subject}
          maxLength={150}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={intro.placeholder}
          autoFocus
        />
        {isMove && (
          <fieldset className="space-y-4" data-testid="move-form">
            <legend className="sr-only">About your move</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                as="select"
                id="move-size"
                label="Team size"
                value={size}
                onChange={setSize}
                options={[{ value: "", label: "Choose one" }, ...TEAM_SIZES.map((t) => ({ value: t, label: t }))]}
              />
              <Field
                as="select"
                id="move-region"
                label="AWS region"
                value={region}
                onChange={setRegion}
                options={[{ value: "", label: "Not sure yet" }, ...AWS_REGIONS.map((r) => ({ value: r, label: r }))]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-zinc-200">What to bring over</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {BRING_OVER.map((b) => (
                  <li key={b}>
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={bring.includes(b)}
                        onChange={() => setBring((now) => (now.includes(b) ? now.filter((x) => x !== b) : [...now, b]))}
                        className="h-4 w-4 shrink-0 accent-emerald-500"
                      />
                      {b}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </fieldset>
        )}
        <Field as="custom" id="ticket-body" label={isMove ? "Anything else? (optional)" : "What happened?"}>
          {(ids) => (
            <MarkdownEditor
              {...ids}
              variant="prose"
              value={body}
              onChange={setBody}
              maxLength={8000}
              minRows={7}
              draftKey={NEW_TICKET_DRAFT}
              placeholder={isMove ? "Dates that matter, anything you must keep, questions about the move." : "What happened, what you expected, and when. The template above gives you a head start."}
              template={isMove ? undefined : { label: "Use issue template", text: ISSUE_TEMPLATE }}
              tips={BODY_TIPS}
              onSubmitShortcut={() => void submit()}
            />
          )}
        </Field>
        <div>
          <p id="ticket-priority-label" className="mb-1.5 text-sm font-medium text-zinc-200">
            How urgent is it?
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Segmented label="How urgent is it?" options={URGENCY} value={priority} onChange={setPriority} />
            <span className="text-xs text-zinc-400" data-testid="ticket-urgency-means">
              {URGENCY.find((u) => u.value === priority)?.means}
            </span>
          </div>
        </div>

        <section aria-labelledby="ticket-people-label" data-testid="new-ticket-people">
          <h2 id="ticket-people-label" className="mb-1.5 text-sm font-medium text-zinc-200">
            People
          </h2>
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5">
            <TicketPeople
              ticket={{
                opened_by_id: me?.user_id ?? "",
                opened_by_email: me?.email ?? "",
                opened_by_name: me ? me.name : "You",
                participants: people,
              }}
              avatars={me?.avatar_url && me.email ? { ...avatars, [me.email.toLowerCase()]: me.avatar_url } : avatars}
              me={me?.user_id}
              canManage
              adding={addingPeople}
              setAdding={setAddingPeople}
              onAdd={addPerson}
              onRemove={removePerson}
              note="They are added when you send the ticket. Everyone here is emailed when support replies or the status changes."
            />
          </div>
        </section>

        <section
          aria-labelledby="attached-heading"
          className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5 text-xs text-zinc-400"
          data-testid="ticket-attached"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="attached-heading" className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Sent with your ticket
            </h2>
            <span className="text-zinc-400">Never your code, diffs or settings.</span>
          </div>
          <ul className="mt-2 space-y-1">
            {page && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 [overflow-wrap:anywhere]">Page: {pageWords(page)}</span>
                <button type="button" onClick={() => setPage("")} className={`rounded text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-300 ${focusRing}`}>
                  Remove
                </button>
              </li>
            )}
            <li>Your team, your role and your email, so we can answer.</li>
          </ul>
          <div className="mt-2 space-y-2">
            {items.length > 0 && (
              <AttachmentChips items={items} onRemove={(i) => setItems(items.filter((x) => x !== i))} label="Attached to your ticket" />
            )}
            {picking ? (
              <AttachPicker chosen={items} onAdd={(i) => setItems([...items, i])} room={MAX_ATTACHMENTS - items.length} onClose={() => setPicking(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={items.length >= MAX_ATTACHMENTS}
                data-testid="ticket-attach"
                className={buttonClass("secondary", "sm")}
                title="Runs, reviews, releases, plans, alerts or data sources"
              >
                Attach something
              </button>
            )}
          </div>
        </section>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/support" className={`${secondaryButton} ${fullWidthOnPhone}`}>
            Cancel
          </Link>
          <button type="submit" disabled={busy || !subject.trim() || (!isMove && !body.trim())} className={`${primaryButton} ${fullWidthOnPhone}`}>
            {busy ? "Sending…" : "Send to support"}
          </button>
        </div>
      </form>
    </Page>
  );
}
