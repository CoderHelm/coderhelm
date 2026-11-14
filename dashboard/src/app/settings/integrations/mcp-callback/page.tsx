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
import { hybridOAuthHandoff } from "@/lib/hybrid";
import { ApiError } from "@/lib/api";
import { SIGNED_IN, SIGN_IN_FAILED, announceSignIn } from "@/lib/sign-in-flow";

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
//
// A sign-in opened in its own tab (from a card on Integrations, a sign-in
// card in a chat or a run, or Knowledge) ends by telling the page that
// started it how it went, connected or not and why, and closing this tab:
// that page is never left waiting. With nobody waiting, it carries on here.

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
  | ({ kind: "failed"; heard: boolean } & FailureView)
  | { kind: "done"; flow: OAuthFlow; name: string; note: string; ownApp: boolean; heard: boolean };

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
        const view = failureView(new Error(providerWords(p.error, p.error_description)), "", "");
        void announceSignIn({ type: SIGN_IN_FAILED, message: view.message, code: p.error }).then((heard) => {
          setView({ kind: "failed", heard: heard.acked, ...view });
          if (heard.acked) window.close();
        });
      } else {
        setView({ kind: "idle" });
      }
      return;
    }
    setView({ kind: "working", flow: flowOfState(p.state) });
    window.history.replaceState(null, "", window.location.pathname);
    api
      .finishMcpSignIn(p)
      .then(async (r) => {
        const s = r.server;
        const flow = resolveFlow(r.flow, s.catalog_id, p.state);
        const knowledgeApp = flow === "ks";
        const done = { kind: "done" as const, flow, name: knowledgeApp ? s.name.replace(/ \(knowledge\)$/, "") : s.name, note: knowledgeApp ? "" : (r.tools_error ?? ""), ownApp: !!r.own_app };
        setView({ ...done, heard: false });
        // Opened in its own tab (a card on Integrations, a sign-in card in
        // a chat or a run, or Knowledge signing in without leaving its
        // page): tell the page that started it, and close. That page
        // carries on by itself.
        const heard = await announceSignIn({ type: SIGNED_IN, server: s.id, catalog_id: s.catalog_id ?? "" });
        if (heard.opener || heard.acked) {
          setView({ ...done, heard: true });
          window.close();
          return;
        }
        window.location.replace(destination(flow, s, r.return_to, knowledgeApp ? takeReturn() : null));
      })
      .catch(async (e) => {
        const view = failureView(e, p.state, "The sign-in didn't finish.");
        const body = (e instanceof ApiError ? e.body : undefined) ?? {};
        const heard = await announceSignIn({
          type: SIGN_IN_FAILED,
          catalog_id: typeof body.catalog_id === "string" ? body.catalog_id : "",
          message: e instanceof Error ? e.message : "",
          code: view.code,
        });
        setView({ kind: "failed", heard: heard.acked, ...view });
        // A card that answered shows why itself, so this tab closes. A page
        // that only opened it (a sign-in card, Knowledge) doesn't: the
        // reason stays here to read.
        if (heard.acked) window.close();
      });
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
              {view.heard
              ? "You can close this tab. The page you started from has been updated."
              : view.flow === "ks"
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
            {view.heard ? view.message.replace(/ Go back to (Knowledge|Integrations) and connect it again\.$/, " You can close this tab: the page you started from says what to do next.") : view.message}
            {view.code && <TechnicalDetails text={`Error code: ${view.code}`} />}
          </Problem>
        )}
      </div>
    </Page>
  );
}
