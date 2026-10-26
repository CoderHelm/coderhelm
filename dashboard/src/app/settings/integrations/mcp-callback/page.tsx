"use client";

import { Problem, TechnicalDetails } from "@/components/problem";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { linkButton, secondaryButton } from "@/components/ui";
import { returnAddress, takeReturn } from "@/lib/knowledge";
import { MCP_CONNECTED_MESSAGE } from "@/components/sign-in-card";

// Where an MCP server's sign-in page sends the browser back. The code and
// state are posted to the API with this person's session: the state works
// once, only for the person and team that started the sign-in, and the
// server checks who sent the answer before the code is exchanged. The code
// is taken out of the address bar first, so it isn't kept in the history.

export default function McpCallbackGuarded() {
  return (
    <RoleGuard need="mcp_connect">
      <McpCallback />
    </RoleGuard>
  );
}

type View = { kind: "working" } | { kind: "idle" } | { kind: "failed"; message: string } | { kind: "done"; name: string; note: string };

function McpCallback() {
  const [view, setView] = useState<View>({ kind: "working" });
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const q = new URLSearchParams(window.location.search);
    const state = q.get("state") ?? "";
    if (!state) {
      setView({ kind: "idle" });
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    api
      .finishMcpSignIn({
        state,
        code: q.get("code") ?? undefined,
        error: q.get("error") ?? undefined,
        iss: q.get("iss") ?? undefined,
      })
      .then((r) => {
        const s = r.server;
        const knowledgeApp = s.catalog_id?.startsWith("source:");
        setView({ kind: "done", name: knowledgeApp ? s.name.replace(/ \(knowledge\)$/, "") : s.name, note: knowledgeApp ? "" : (r.tools_error ?? "") });
        // Opened as a popup (a sign-in card in a chat or a run, or Knowledge
        // signing in without leaving its page): tell the page that opened
        // it, and close. That page carries on by itself.
        const opener = window.opener as Window | null;
        if (opener && !opener.closed) {
          try {
            opener.postMessage({ type: MCP_CONNECTED_MESSAGE, server: s.id, catalog_id: s.catalog_id ?? "" }, window.location.origin);
            window.close();
            return;
          } catch {
            // Fall through to the page it was started from.
          }
        }
        // A Knowledge app's sign-in goes back to where it was started.
        if (knowledgeApp) {
          window.location.replace(returnAddress(takeReturn(), s.catalog_id!.slice("source:".length)));
          return;
        }
        const row = s.catalog_id ? s.catalog_id : `mcp:${s.id}`;
        window.location.replace(`/settings/integrations/#integration-${row}`);
      })
      .catch((e) => setView({ kind: "failed", message: errorMessage(e, "The sign-in didn't finish.") }));
  }, []);

  return (
    <Page testId="mcp-callback-page">
      <PageHeader title="Connecting an MCP server" />
      <div className="mt-6 max-w-xl" data-testid="mcp-callback" data-state={view.kind}>
        {view.kind === "working" && (
          <p role="status" className="flex items-center gap-2.5 text-sm text-zinc-300">
            <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200 motion-reduce:animate-none" />
            Finishing the sign-in…
          </p>
        )}
        {view.kind === "idle" && (
          <p className="text-sm text-zinc-400">
            Nothing to finish here. To connect an MCP server, start from{" "}
            <Link href="/settings/integrations/#mcp-servers" className={linkButton}>
              Integrations
            </Link>
            .
          </p>
        )}
        {view.kind === "done" && (
          <Callout variant="success" title={`${view.name} is connected`}>
            <p>{view.note ? "Connected, but its tools couldn't be listed yet. Open Integrations to try again." : "Taking you back to pick its tools…"}</p>
            {view.note && <TechnicalDetails text={view.note} />}
          </Callout>
        )}
        {view.kind === "failed" && (
          <Problem
            title="The server isn't connected"
            action={
              <Link href="/settings/integrations/#mcp-servers" className={secondaryButton}>
                Back to Integrations
              </Link>
            }
          >
            {view.message} Go back to Integrations and connect the server again.
          </Problem>
        )}
      </div>
    </Page>
  );
}
