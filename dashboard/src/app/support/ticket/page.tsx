"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorStatus, type SupportDetail } from "@/lib/api";
import { customerLook } from "@/lib/support";
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
  const send = async (body: string) => {
    try {
      setDetail(await api.replySupportTicket(t.id, body));
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
          <ReplyBox onSend={send} placeholder="Add more detail, or answer support's question" />
        </div>
        <aside className="min-w-0 lg:order-last">
          <TicketContext ticket={t} />
        </aside>
      </div>
    </Page>
  );
}
