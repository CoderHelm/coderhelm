"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type NewSupportTicket, type SupportItemKind, type SupportItemRef, type SupportPriority, type SupportTicket } from "@/lib/api";
import { customerLook, filedBy, itemWords, MAX_ATTACHMENTS, pageWords, ticketItems } from "@/lib/support";
import { AttachmentChips, AttachPicker } from "@/components/support";
import { Page, PageHeader, cardClass } from "@/components/page";
import { Field } from "@/components/field";
import { focusRing, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { List, ListEmpty, ListError, ListRow, ListSkeleton, ListToolbar, StatusText, useListParams } from "@/components/list";

const KINDS: SupportItemKind[] = ["run", "review", "release", "plan", "alert", "data_source"];

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
                        filedBy(t),
                        ticketItems(t).length === 1
                          ? itemWords(ticketItems(t)[0])
                          : ticketItems(t).length > 1
                            ? `${ticketItems(t).length} items attached`
                            : null,
                        `${t.message_count} message${t.message_count === 1 ? "" : "s"}`,
                      ]}
                      summary={t.status === "waiting" ? "Coderhelm support answered. Reply when you can." : undefined}
                      summaryTone="waiting"
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
  const intro =
    type === "issue"
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
      : "",
  );
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<SupportPriority>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!subject.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError("");
    const req: NewSupportTicket = { subject: subject.trim(), body: body.trim(), priority };
    if (page) req.page = page;
    if (items.length > 0) req.items = items.map((i) => ({ kind: i.kind, id: i.id, label: i.label || undefined, repo: i.repo || undefined }));
    try {
      const r = await api.openSupportTicket(req);
      router.push(`/support/ticket?id=${encodeURIComponent(r.ticket.id)}&new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the ticket.");
      setBusy(false);
    }
  };

  return (
    <Page narrow>
      <PageHeader
        breadcrumb={
          <Link href="/support" className={`rounded text-sm text-zinc-500 hover:text-zinc-300 ${focusRing}`}>
            ← Support
          </Link>
        }
        title={intro.title}
        lead={intro.lead}
      />
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field id="ticket-subject" label="Subject">
          {(p) => (
            <input
              {...p}
              type="text"
              value={subject}
              maxLength={150}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={intro.placeholder}
              className={inputClass}
              autoFocus
            />
          )}
        </Field>
        <Field
          id="ticket-body"
          label="What happened?"
          helper="What you expected, what you saw, and when. Please leave out passwords, keys and code: support never needs them, and likely secrets are hidden before the ticket is saved."
        >
          {(p) => (
            <textarea
              {...p}
              rows={7}
              value={body}
              maxLength={8000}
              onChange={(e) => setBody(e.target.value)}
              className={`${inputClass} resize-y`}
            />
          )}
        </Field>
        <Field id="ticket-priority" label="How urgent is it?">
          {(p) => (
            <select {...p} value={priority} onChange={(e) => setPriority(e.target.value as SupportPriority)} className={`${inputClass} sm:w-72`}>
              <option value="normal">Normal: it can wait a little</option>
              <option value="high">High: it blocks some of our work</option>
              <option value="urgent">Urgent: nothing works for us</option>
            </select>
          )}
        </Field>

        <section aria-labelledby="attached-heading" className={cardClass} data-testid="ticket-attached">
          <h2 id="attached-heading" className="text-sm font-semibold text-zinc-100">
            Sent with your ticket
          </h2>
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
                className={`rounded text-sm text-zinc-300 underline underline-offset-4 hover:text-zinc-100 disabled:opacity-50 ${focusRing}`}
              >
                Attach runs, reviews, releases, plans, alerts or data sources
              </button>
            )}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-400">
            {page && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 [overflow-wrap:anywhere]">Page: {pageWords(page)}</span>
                <button type="button" onClick={() => setPage("")} className={`rounded text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300 ${focusRing}`}>
                  Remove
                </button>
              </li>
            )}
            <li>Your team, your role and your email, so we can answer.</li>
          </ul>
          <p className="mt-2 text-xs text-zinc-500">Never your code, diffs or settings.</p>
        </section>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/support" className={secondaryButton}>
            Cancel
          </Link>
          <button type="submit" disabled={busy || !subject.trim() || !body.trim()} className={primaryButton}>
            {busy ? "Sending…" : "Send to support"}
          </button>
        </div>
      </form>
    </Page>
  );
}
