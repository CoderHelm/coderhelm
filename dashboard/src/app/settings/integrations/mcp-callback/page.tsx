"use client";

import { Problem, TechnicalDetails } from "@/components/problem";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { linkButton, secondaryButton } from "@/components/ui";
import { takeReturn } from "@/lib/knowledge";
import { destination, failureView, flowOfState, providerWords, readCallback, resolveFlow, type FailureView, type OAuthFlow } from "@/lib/oauth-callback";
import { MCP_CONNECTED_MESSAGE } from "@/components/sign-in-card";
import { hybridOAuthHandoff } from "@/lib/hybrid";

// Where every OAuth sign-in comes back to: an MCP server's, a catalog
// app's, a knowledge source's, and a self-hosted install's through
// Coderhelm's app. The answer (code or error, with the provider's own
// words) is always posted to the API with this person's session: the state
// works once, only for the person and team that started the sign-in, and
// the server checks who sent the answer before the code is exchanged. The
// API answers which kind of sign-in it was and where to go back to, so a
// knowledge source's sign-in returns to Knowledge, never to this page's
// MCP wording. The code is taken out of the address bar first, so it isn't
// kept in the history.

export default function McpCallbackGuarded() {
  return (
    <RoleGuard need="mcp_connect">
      <McpCallback />
    </RoleGuard>
  );
}

type View =
  | { kind: "working"; flow: OAuthFlow | null }
  | { kind: "idle" }
  | ({ kind: "failed" } & FailureView)
  | { kind: "done"; flow: OAuthFlow; name: string; note: string; ownApp: boolean };

function McpCallback() {
  const [view, setView] = useState<View>({ kind: "working", flow: null });
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    // A self-hosted install's sign-in through Coderhelm's app goes back to
    // the install (lib/hybrid.ts); anything else carries on here unchanged.
    void hybridOAuthHandoff().then((moved) => {
      if (!moved) finish();
    });
  }, []);

  function finish() {
    const p = readCallback(window.location.search);
    if (!p.state) {
      // No state: nothing can be finished, but a provider error is still
      // shown as the provider said it.
      if (p.error) {
        window.history.replaceState(null, "", window.location.pathname);
        setView({ kind: "failed", ...failureView(new Error(providerWords(p.error, p.error_description)), "", "") });
      } else {
        setView({ kind: "idle" });
      }
      return;
    }
    setView({ kind: "working", flow: flowOfState(p.state) });
    window.history.replaceState(null, "", window.location.pathname);
    api
      .finishMcpSignIn(p)
      .then((r) => {
        const s = r.server;
        const flow = resolveFlow(r.flow, s.catalog_id, p.state);
        const knowledgeApp = flow === "ks";
        setView({ kind: "done", flow, name: knowledgeApp ? s.name.replace(/ \(knowledge\)$/, "") : s.name, note: knowledgeApp ? "" : (r.tools_error ?? ""), ownApp: !!r.own_app });
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
        window.location.replace(destination(flow, s, r.return_to, knowledgeApp ? takeReturn() : null));
      })
      .catch((e) => setView({ kind: "failed", ...failureView(e, p.state, "The sign-in didn't finish.") }));
  }

  return (
    <Page testId="mcp-callback-page">
      <PageHeader title={view.kind === "working" && view.flow === "ks" ? "Connecting a knowledge source" : view.kind === "done" && view.flow === "ks" ? "Connecting a knowledge source" : "Finishing a sign-in"} />
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
            <p>
              {view.flow === "ks"
              ? "Taking you back to Knowledge…"
              : view.ownApp
                ? view.note
                  ? `Signed in, but ${view.name} didn't accept the token. Open Integrations to see why.`
                  : "Taking you back to Integrations…"
                : view.note
                  ? "Connected, but its tools couldn't be listed yet. Open Integrations to try again."
                  : "Taking you back to pick its tools…"}
            </p>
            {view.note && <TechnicalDetails text={view.note} />}
          </Callout>
        )}
        {view.kind === "failed" && (
          <Problem
            title={view.title}
            action={
              <Link href={view.back.href} className={secondaryButton}>
                {view.back.label}
              </Link>
            }
          >
            {view.message}
            {view.code && <TechnicalDetails text={`Error code: ${view.code}`} />}
          </Problem>
        )}
      </div>
    </Page>
  );
}
