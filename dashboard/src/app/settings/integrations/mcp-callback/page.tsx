"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { linkButton } from "@/components/ui";
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
        const row = s.catalog_id ? s.catalog_id : `mcp:${s.id}`;
        setView({ kind: "done", name: s.name, note: r.tools_error ?? "" });
        // Opened as a popup from a sign-in card (a chat or a run): tell the
        // page that opened it, and close. The chat carries on by itself.
        const opener = window.opener as Window | null;
        if (opener && !opener.closed) {
          try {
            opener.postMessage({ type: MCP_CONNECTED_MESSAGE, server: s.id }, window.location.origin);
            window.close();
            return;
          } catch {
            // Fall through to the integrations page.
          }
        }
        window.location.replace(`/settings/integrations/#integration-${row}`);
      })
      .catch((e) => setView({ kind: "failed", message: errorMessage(e, "The sign-in didn't finish.") }));
  }, []);

  return (
    <Page testId="mcp-callback-page">
      <PageHeader title="Connecting an MCP server" />
      <div className="mt-6 max-w-xl" data-testid="mcp-callback" data-state={view.kind}>
        {view.kind === "working" && <p className="text-sm text-zinc-400">Finishing the sign-in…</p>}
        {view.kind === "idle" && (
          <p className="text-sm text-zinc-400">
            This page finishes a sign-in to an MCP server. Start one from{" "}
            <Link href="/settings/integrations/#mcp-servers" className={linkButton}>
              Integrations
            </Link>
            .
          </p>
        )}
        {view.kind === "done" && (
          <Callout variant="success" title={`${view.name} is connected`}>
            <p>{view.note ? `Its tools couldn't be listed yet: ${view.note}` : "Taking you back to pick its tools…"}</p>
          </Callout>
        )}
        {view.kind === "failed" && (
          <Callout variant="error" title="The server isn't connected">
            <p>{view.message}</p>
            <p>
              <Link href="/settings/integrations/#mcp-servers" className={linkButton}>
                Back to Integrations
              </Link>
            </p>
          </Callout>
        )}
      </div>
    </Page>
  );
}
