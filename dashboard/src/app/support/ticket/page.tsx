"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorStatus, type SupportDetail, type SupportItemRef } from "@/lib/api";
import { customerLook, MAX_ATTACHMENTS, ticketItems } from "@/lib/support";
import { hasRole } from "@/lib/roles";
import { SupportAccessControl } from "@/components/support-access";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { ListError, StatusText } from "@/components/list";
import { ReplyBox, SupportThread, TicketContext } from "@/components/support";
import { useToast } from "@/components/toast";
import { focusRing } from "@/components/ui";

const backLink = (
  <Link href="/support" className={`rounded text-sm text-zinc-500 hover:text-zinc-300 ${focusRing}`}>
    ← Support
  </Link>
);

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
  const [canGrant, setCanGrant] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((u) => setCanGrant(hasRole(u.role, "admin") && !u.support_view))
      .catch(() => setCanGrant(false));
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
        {backLink}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
      </Page>
    );
  }
  if (state === "missing" || !detail) {
    return (
      <Page className="space-y-4">
        {backLink}
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
  const send = async (body: string, _key?: string, items: SupportItemRef[] = []) => {
    try {
      setDetail(await api.replySupportTicket(t.id, body, items));
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not send your reply.", "error");
      return false;
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={backLink}
        title={t.subject}
        lead={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusText look={look} />
            <span className="text-xs text-zinc-500">
              {t.status === "waiting"
                ? "Coderhelm support is waiting for your answer."
                : t.status === "resolved"
                  ? "Reply to open it again."
                  : "Coderhelm support will answer here and by email."}
            </span>
          </span>
        }
      />
      {justOpened && (
        <p role="status" className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
          Sent. We emailed Coderhelm support and will email you when they answer.
        </p>
      )}
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <SupportThread messages={detail.messages} />
          <ReplyBox onSend={send} placeholder="Add more detail, or answer support's question" attachRoom={MAX_ATTACHMENTS - ticketItems(t).length} draftKey={`support:reply:${t.id}`} />
        </div>
        <aside className="min-w-0 space-y-5 lg:order-last">
          <TicketContext ticket={t} />
          {canGrant && t.status !== "resolved" && (
            <section aria-labelledby="let-support" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4" data-testid="ticket-support-access">
              <h2 id="let-support" className="mb-1 text-sm font-semibold text-zinc-100">
                Let support look at this
              </h2>
              <p className="mb-3 text-xs text-zinc-500">
                Coderhelm support sees your workspace read only, for the time you choose. You can end it any time in{" "}
                <Link href="/settings/support-access" className={`rounded underline underline-offset-4 hover:text-zinc-300 ${focusRing}`}>
                  Settings
                </Link>
                .
              </p>
              <SupportAccessControl ticketId={t.id} compact />
            </section>
          )}
        </aside>
      </div>
    </Page>
  );
}
