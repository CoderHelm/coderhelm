"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError, errorStatus, type SupportDetail, type SupportPersonRef, type SupportPriority, type SupportStatus, type SupportTicket } from "@/lib/api";
import { adminLook, filedBy, itemHref, itemWords, PRIORITY_LABEL, queueOrder, ticketItems, ticketPeople, timeLeft } from "@/lib/support";
import { Page, PageHeader } from "@/components/page";
import { Skeleton } from "@/components/skeleton";
import { Chip, List, ListEmpty, ListError, ListRow, ListSkeleton, ListToolbar, StatusText, useListParams } from "@/components/list";
import { AvatarStack, Composer, PanelSection, SupportThread, TicketContext, TicketHeader, TicketLayout, TicketPeople, type ItemOpener, ThreadDock } from "@/components/support";
import type { SupportItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { focusRing, inputClass, primaryButton, secondaryButton } from "@/components/ui";

/**
 * Opens a read-only support view of the team (leaving any other one first),
 * then goes to `to` in that view. The gateway refuses unless the team's
 * support access is on.
 */
async function viewAsSupport(teamId: string, ticketId: string, to: string) {
  await api.exitSupportView().catch(() => {});
  await api.startSupportView(teamId, ticketId);
  window.location.href = to;
}

export default function AdminTicketsWithParams() {
  return (
    <Suspense fallback={<Page><ListSkeleton rows={4} /></Page>}>
      <AdminTickets />
    </Suspense>
  );
}

function AdminTickets() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <AdminTicket id={id} /> : <Queue />;
}

function Denied() {
  return (
    <Page>
      <PageHeader detail crumb={false} title="Access denied" lead="This page is only for Coderhelm platform administrators." />
    </Page>
  );
}

// ── The queue ────────────────────────────────────────────────────────────

function Queue() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [access, setAccess] = useState<Record<string, string>>({});
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [params, setParams] = useListParams({ q: "", status: "open", sort: "queue" });

  const load = useCallback(() => {
    setError("");
    api
      .adminSupportTickets()
      .then((r) => {
        setTickets(r.tickets);
        setAccess(r.support_access ?? {});
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setDenied(true);
        else setError(e instanceof Error ? e.message : "The request failed.");
      });
  }, []);
  useEffect(load, [load]);

  if (denied) return <Denied />;

  const words = params.q.toLowerCase().split(/\s+/).filter(Boolean);
  const searched = (tickets ?? []).filter((t) => {
    const hay = `${t.subject} ${t.team_name} ${t.team_id} ${t.opened_by_email} ${t.opened_by_name} ${(t.participants ?? []).map((p) => `${p.name} ${p.email}`).join(" ")} ${ticketItems(t).map(itemWords).join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const count = (s: string) => searched.filter((t) => t.status === s).length;
  const status = ["open", "waiting", "resolved", "all"].includes(params.status) ? params.status : "open";
  const shown = searched
    .filter((t) => status === "all" || t.status === status)
    .sort(params.sort === "new" ? (a, b) => b.updated_at.localeCompare(a.updated_at) : queueOrder);
  const filtered = !!params.q || status !== "open";
  const clear = () => setParams({ q: "", status: "open" });
  const teams = new Set((tickets ?? []).filter((t) => t.status === "open").map((t) => t.team_id)).size;

  return (
    <Page>
      <PageHeader
        title="Support queue"
        lead={
          tickets
            ? `${count("open")} need a reply${teams ? ` from ${teams} team${teams === 1 ? "" : "s"}` : ""}. Every team's tickets, answered here.`
            : "Every team's tickets, answered here."
        }
      />
      <div className="mt-6 space-y-4">
        {error ? (
          <ListError title="Couldn't load the queue" onRetry={load}>
            {error}
          </ListError>
        ) : tickets === null ? (
          <ListSkeleton rows={4} label="Loading the support queue" />
        ) : (
          <>
            <ListToolbar
              search={{
                value: params.q,
                onChange: (v) => setParams({ q: v }, { replace: true }),
                placeholder: "Search by subject, team or person",
                label: "Search tickets",
              }}
              status={{
                label: "Show tickets",
                value: status,
                onChange: (v) => setParams({ status: v }),
                options: [
                  { value: "open", label: "Needs reply", count: count("open"), tone: "attention" },
                  { value: "waiting", label: "Waiting on customer", count: count("waiting"), tone: "muted" },
                  { value: "resolved", label: "Resolved", count: count("resolved"), tone: "success" },
                  { value: "all", label: "All", count: searched.length },
                ],
              }}
              sort={{
                value: params.sort,
                onChange: (v) => setParams({ sort: v }),
                options: [
                  { value: "queue", label: "Most urgent first" },
                  { value: "new", label: "Latest activity" },
                ],
              }}
              onClear={filtered ? clear : undefined}
            />
            {shown.length === 0 ? (
              <ListEmpty
                title={tickets.length === 0 ? "No tickets yet" : status === "open" && !params.q ? "Nothing needs a reply" : "No tickets match"}
                onClear={filtered ? clear : undefined}
              />
            ) : (
              <List label="Support queue">
                {shown.map((t) => {
                  const look = adminLook(t.status);
                  return (
                    <ListRow
                      key={t.id}
                      testId="queue-row"
                      data={{ status: t.status, team: t.team_id }}
                      status={look}
                      title={t.subject}
                      titleText={t.subject}
                      href={`/admin/tickets?id=${encodeURIComponent(t.id)}`}
                      meta={[
                        t.team_name || t.team_id,
                        `${filedBy(t)}${t.role ? ` (${t.role})` : ""}`,
                        ticketItems(t).length === 1
                          ? itemWords(ticketItems(t)[0])
                          : ticketItems(t).length > 1
                            ? `${ticketItems(t).length} items attached`
                            : null,
                        `${t.message_count} message${t.message_count === 1 ? "" : "s"}`,
                        t.participants?.length ? `${ticketPeople(t).length} people` : null,
                      ]}
                      summary={t.last_snippet ? `${t.last_author_name || "Someone"}: ${t.last_snippet}` : undefined}
                      chips={
                        <>
                          {t.priority !== "normal" && <Chip tone={t.priority === "urgent" ? "danger" : "waiting"}>{PRIORITY_LABEL[t.priority]}</Chip>}
                          {access[t.team_id] && t.status !== "resolved" && (
                            <Chip tone="success" title={`Support access on, ${timeLeft(access[t.team_id])}`}>
                              Access on
                            </Chip>
                          )}
                          <StatusText look={look} />
                        </>
                      }
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

// ── One ticket ───────────────────────────────────────────────────────────

function AdminTicket({ id }: { id: string }) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<SupportDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "denied" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<{ text: string; n: number } | null>(null);

  const load = useCallback(() => {
    api
      .adminSupportTicket(id)
      .then((d) => {
        setDetail(d);
        setState("ready");
      })
      .catch((e: unknown) => {
        const s = errorStatus(e);
        if (s === 401 || s === 403) setState("denied");
        else if (s === 404) setState("missing");
        else {
          setError(e instanceof Error ? e.message : "The request failed.");
          setState("error");
        }
      });
  }, [id]);
  useEffect(load, [load]);

  if (state === "denied") return <Denied />;
  if (state === "loading") {
    return (
      <Page className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
      </Page>
    );
  }
  if (state !== "ready" || !detail) {
    return (
      <Page className="space-y-4">
        <ListError title={state === "missing" ? "Ticket not found" : "Couldn't load this ticket"} onRetry={state === "error" ? load : undefined}>
          {state === "missing" ? "It may have been removed with its team." : error}
        </ListError>
      </Page>
    );
  }

  const t = detail.ticket;
  const look = adminLook(t.status);
  const accessUntil = detail.support_access?.until ?? null;
  const open = async (to: string) => {
    try {
      await viewAsSupport(t.team_id, t.id, to);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open the support view.", "error");
    }
  };
  // Items live in the team's workspace: a link only works inside a support view.
  const openItem: ItemOpener = (item: SupportItem) =>
    accessUntil
      ? { onClick: () => void open(itemHref(item)) }
      : { reason: "Opens in the team's workspace. Ask the team to let support look (on the ticket or in Settings → Support access)." };
  const reply = async (body: string, key?: string) => {
    try {
      setDetail(await api.adminReplySupportTicket(t.id, body, key === "resolve" ? "resolved" : undefined));
      toast(key === "resolve" ? "Sent and resolved. Everyone on the ticket was emailed." : "Sent. Everyone on the ticket was emailed.");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not send the reply.", "error");
      return false;
    }
  };
  const change = async (c: { status?: SupportStatus; priority?: SupportPriority }) => {
    setBusy(true);
    try {
      setDetail(await api.adminSetSupportTicket(t.id, c));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not change the ticket.", "error");
    } finally {
      setBusy(false);
    }
  };
  const people = async (what: () => Promise<SupportDetail>, failed: string) => {
    try {
      setDetail(await what());
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : failed, "error");
      return false;
    }
  };
  const addPerson = (who: SupportPersonRef) => people(() => api.addSupportPerson(t.id, who, true), "Could not add them.");
  const removePerson = (who: SupportPersonRef) => people(() => api.removeSupportPerson(t.id, who, true), "Could not remove them.");
  const count = ticketPeople(t).length;

  return (
    <Page>
      <TicketHeader
        ticket={t}
        status={<StatusText look={look} />}
        note={t.team_name || t.team_id}
        people={
          <>
            <AvatarStack ticket={t} avatars={detail.avatars} />
            <button
              type="button"
              onClick={() => {
                setDetailsOpen(true);
                setAdding(true);
              }}
              className={`${secondaryButton} !min-h-8 !py-1 !px-3`}
              data-testid="header-add-people"
            >
              + Add people
            </button>
          </>
        }
      />
      <TicketLayout
        detailsOpen={detailsOpen}
        setDetailsOpen={setDetailsOpen}
        detailsSummary={`${look.label} · ${count} ${count === 1 ? "person" : "people"}`}
        details={
          <>
            <PanelSection title="Status">
              <div className="grid grid-cols-2 gap-3 @min-[860px]:grid-cols-1">
                <div className="text-sm">
                  <label htmlFor="ticket-status-select" className="mb-1.5 block font-medium text-zinc-300">Status</label>
                  <select
                    id="ticket-status-select"
                    value={t.status}
                    disabled={busy}
                    onChange={(e) => void change({ status: e.target.value as SupportStatus })}
                    className={inputClass}
                    data-testid="ticket-status"
                  >
                    <option value="open">Needs reply</option>
                    <option value="waiting">Waiting on customer</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div className="text-sm">
                  <label htmlFor="ticket-priority-select" className="mb-1.5 block font-medium text-zinc-300">Priority</label>
                  <select
                    id="ticket-priority-select"
                    value={t.priority}
                    disabled={busy}
                    onChange={(e) => void change({ priority: e.target.value as SupportPriority })}
                    className={inputClass}
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
            </PanelSection>
            <PanelSection title="People" testId="panel-people">
              <TicketPeople ticket={t} avatars={detail.avatars} canManage admin adding={adding} setAdding={setAdding} onAdd={addPerson} onRemove={removePerson} />
            </PanelSection>
            <PanelSection title="Support view" testId="admin-support-view">
              {accessUntil ? (
                <>
                  <p className="mb-3 text-xs text-zinc-400">
                    The team lets support look, read only, until {new Date(accessUntil).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ({timeLeft(accessUntil)}).
                    The team sees every page you read.
                  </p>
                  <button type="button" className={primaryButton} onClick={() => void open("/")} data-testid="view-as-support">
                    View as support
                  </button>
                </>
              ) : (
                <p className="text-xs text-zinc-500">
                  Off. Ask the team to choose &quot;Let support look at this&quot; on the ticket, or turn it on in Settings → Support access.
                </p>
              )}
            </PanelSection>
            <PanelSection title="About">
              <TicketContext ticket={t} admin openItem={openItem} />
            </PanelSection>
          </>
        }
        thread={
          <>
            <SupportThread
              messages={detail.messages}
              ticketId={t.id}
              admin
              openItem={openItem}
              avatars={detail.avatars}
              isMine={(m) => m.author === "support"}
              onQuote={(text) => setQuote({ text, n: (quote?.n ?? 0) + 1 })}
            />
            <ThreadDock>
              <Composer
                onSend={reply}
                placeholder="Reply as Coderhelm support. Everyone on the ticket gets this by email."
                actions={t.status === "resolved" ? [] : [{ key: "resolve", label: "Reply & resolve" }]}
                quote={quote}
                draftKey={`support-admin:reply:${t.id}`}
              />
            </ThreadDock>
          </>
        }
      />
    </Page>
  );
}
