"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorStatus, type SupportDetail, type SupportItemRef, type SupportMessage, type SupportPersonRef } from "@/lib/api";
import { customerLook, isOnTicket, MAX_ATTACHMENTS, PRIORITY_LABEL, ticketItems, ticketPeople } from "@/lib/support";
import { hasRole } from "@/lib/roles";
import { SupportAccessControl } from "@/components/support-access";
import { Page } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { ListError, StatusText } from "@/components/list";
import { AvatarStack, Composer, PanelSection, SupportThread, TicketContext, TicketHeader, TicketLayout, TicketPeople } from "@/components/support";
import { useToast } from "@/components/toast";
import { focusRing, secondaryButton } from "@/components/ui";

interface Me {
  user_id: string;
  email: string;
  role: string;
  support_view?: unknown;
}

export default function TicketPageWithParams() {
  return (
    <Suspense fallback={<Page><Skeleton className="h-8 w-64" /></Page>}>
      <TicketPage />
    </Suspense>
  );
}

function TicketPage() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const justOpened = params.get("new") === "1";
  const { toast } = useToast();
  const [detail, setDetail] = useState<SupportDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<{ text: string; n: number } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api
      .me()
      .then((u) => setMe(u))
      .catch(() => setMe(null));
  }, []);

  const load = useCallback(() => {
    if (!id) {
      setState("missing");
      return;
    }
    api
      .supportTicket(id)
      .then((d) => {
        setDetail(d);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (errorStatus(e) === 404) setState("missing");
        else {
          setError(e instanceof Error ? e.message : "The request failed.");
          setState("error");
        }
      });
  }, [id]);
  useEffect(load, [load]);

  if (state === "loading") {
    return (
      <Page className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
      </Page>
    );
  }
  if (state === "missing" || !detail) {
    return (
      <Page className="space-y-4">
        {state === "error" ? (
          <ListError title="Couldn't load this ticket" onRetry={load}>
            {error}
          </ListError>
        ) : (
          <Callout variant="info" title="Ticket not found">
            <p>It may belong to another team. Switch teams, or open a new ticket.</p>
          </Callout>
        )}
      </Page>
    );
  }

  const t = detail.ticket;
  const look = customerLook(t.status);
  const role = me?.user_id ? isOnTicket(t, me.user_id) : null;
  const canManage = role === "filer" || hasRole(me?.role, "admin");
  const canGrant = hasRole(me?.role, "admin") && !me?.support_view;
  const people = ticketPeople(t);
  const isMine = (m: SupportMessage) => m.author === "customer" && !!me?.email && m.author_email.toLowerCase() === me.email.toLowerCase();

  const run = async (what: () => Promise<SupportDetail>, failed: string) => {
    try {
      setDetail(await what());
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : failed, "error");
      return false;
    }
  };
  const send = async (body: string, action?: string, items: SupportItemRef[] = []) => {
    if (body || items.length > 0) {
      if (!(await run(() => api.replySupportTicket(t.id, body, items), "Could not send your reply."))) return false;
    }
    if (action === "resolve") {
      if (!(await run(() => api.resolveSupportTicket(t.id), "Could not mark it resolved."))) return false;
      toast("Marked resolved. Coderhelm support was told.");
    }
    return true;
  };
  const addPerson = (who: SupportPersonRef) => run(() => api.addSupportPerson(t.id, who), "Could not add them.");
  const removePerson = (who: SupportPersonRef) => run(() => api.removeSupportPerson(t.id, who), "Could not remove them.");
  const openAdding = () => {
    setDetailsOpen(true);
    setAdding(true);
  };

  return (
    <Page>
      <TicketHeader
        ticket={t}
        status={<StatusText look={look} />}
        note={
          t.status === "waiting"
            ? "Coderhelm support is waiting for your answer."
            : t.status === "resolved"
              ? "Reply to open it again."
              : "Coderhelm support will answer here and by email."
        }
        people={
          <>
            <AvatarStack ticket={t} avatars={detail.avatars} />
            {canManage ? (
              <button type="button" onClick={openAdding} className={`${secondaryButton} !min-h-8 !py-1 !px-3`} data-testid="header-add-people">
                + Add people
              </button>
            ) : (
              me && (
                <button
                  type="button"
                  onClick={() => void (role === "participant" ? removePerson({ user_id: me.user_id }) : addPerson({ user_id: me.user_id }))}
                  className={`${secondaryButton} !min-h-8 !py-1 !px-3`}
                  data-testid="header-follow"
                >
                  {role === "participant" ? "Unfollow" : "Follow"}
                </button>
              )
            )}
          </>
        }
      />
      {justOpened && (
        <p role="status" className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
          Sent. We emailed Coderhelm support and will email you when they answer.
        </p>
      )}
      <TicketLayout
        detailsOpen={detailsOpen}
        setDetailsOpen={setDetailsOpen}
        detailsSummary={`${look.label} · ${people.length} ${people.length === 1 ? "person" : "people"}${ticketItems(t).length ? ` · ${ticketItems(t).length} attached` : ""}`}
        details={
          <>
            <PanelSection title="Status">
              <div className="space-y-1 text-sm">
                <StatusText look={look} />
                <p className="text-zinc-400">Priority: {PRIORITY_LABEL[t.priority] ?? t.priority}</p>
              </div>
            </PanelSection>
            <PanelSection title="People" testId="panel-people">
              <TicketPeople
                ticket={t}
                avatars={detail.avatars}
                me={me?.user_id}
                canManage={canManage}
                adding={adding}
                setAdding={setAdding}
                onAdd={addPerson}
                onRemove={removePerson}
              />
            </PanelSection>
            <PanelSection title="About">
              <TicketContext ticket={t} />
            </PanelSection>
            {canGrant && t.status !== "resolved" && (
              <PanelSection title="Let support look at this" testId="ticket-support-access">
                <p className="mb-3 text-xs text-zinc-500">
                  Coderhelm support sees your workspace read only, for the time you choose. You can end it any time in{" "}
                  <Link href="/settings/support-access" className={`rounded underline underline-offset-4 hover:text-zinc-300 ${focusRing}`}>
                    Settings
                  </Link>
                  .
                </p>
                <SupportAccessControl ticketId={t.id} compact />
              </PanelSection>
            )}
          </>
        }
        thread={
          <>
            <SupportThread
              messages={detail.messages}
              ticketId={t.id}
              avatars={detail.avatars}
              isMine={isMine}
              onQuote={(text) => setQuote({ text, n: (quote?.n ?? 0) + 1 })}
            />
            <div className="mt-4 pb-2 @min-[860px]:sticky @min-[860px]:bottom-0 @min-[860px]:z-10 @min-[860px]:bg-gradient-to-t @min-[860px]:from-zinc-950 @min-[860px]:from-80% @min-[860px]:to-transparent @min-[860px]:pt-4">
              <Composer
                onSend={send}
                placeholder={t.status === "resolved" ? "Reply to open this ticket again" : "Add more detail, or answer support's question"}
                attachRoom={MAX_ATTACHMENTS - ticketItems(t).length}
                actions={canManage && t.status !== "resolved" ? [{ key: "resolve", label: "Reply & mark resolved", emptyLabel: "Mark resolved" }] : []}
                quote={quote}
                draftKey={`support:reply:${t.id}`}
                inputRef={composerRef}
              />
            </div>
          </>
        }
      />
    </Page>
  );
}
