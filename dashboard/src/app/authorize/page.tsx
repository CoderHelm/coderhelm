"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Page, PageHeader, cardClass } from "@/components/page";
import { Problem } from "@/components/problem";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Code } from "@/components/settings/code";
import { CheckIcon } from "@/components/icons";
import { focusRing, fullWidthOnPhone, primaryButton, secondaryButton } from "@/components/ui";
import { connectedAppsApi, WRITE_SCOPE, type ConsentRequest } from "@/lib/connected-apps";

// The consent page an MCP client (Claude, Cursor, VS Code...) sends someone
// to: who is asking, where the answer goes, what the app may do. The answer
// is the person's own, from their signed-in session; the gateway turns it
// into a one-time code for the app, or a refusal.

export default function AuthorizePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Consent />
    </Suspense>
  );
}

function Loading() {
  return (
    <Page narrow>
      <div className="space-y-3" aria-busy="true" aria-label="Loading the request">
        <Skeleton className="h-8 w-2/3 rounded" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </Page>
  );
}

function Consent() {
  const params = useSearchParams();
  const token = params.get("request") || "";
  const [req, setReq] = useState<ConsentRequest | null>(null);
  const [error, setError] = useState(token ? "" : "This page needs the link the app opened. Go back to the app and connect again.");
  const [allowWrite, setAllowWrite] = useState(false);
  const [sending, setSending] = useState<"" | "allow" | "deny">("");
  const [leaving, setLeaving] = useState("");
  const writeId = useId();

  useEffect(() => {
    if (!token) return;
    let live = true;
    connectedAppsApi
      .describe(token)
      .then((r) => {
        if (!live) return;
        setReq(r);
        const write = r.scopes.find((s) => s.key === WRITE_SCOPE);
        setAllowWrite(!!write?.requested && r.can_act);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "The request failed."));
    return () => {
      live = false;
    };
  }, [token]);

  const answer = async (approve: boolean) => {
    if (!req) return;
    setSending(approve ? "allow" : "deny");
    try {
      const r = await connectedAppsApi.decide(token, approve, approve && allowWrite);
      setLeaving(approve ? `Done. Going back to ${req.client_name}…` : `Going back to ${req.client_name}…`);
      window.location.assign(r.redirect_to);
    } catch (e) {
      setSending("");
      setError(e instanceof Error ? e.message : "The request failed.");
    }
  };

  if (error) {
    return (
      <Page narrow testId="consent">
        <PageHeader title="Connect an app" />
        <div className="mt-6">
          <Problem title="This request can't be used" testId="consent-problem">
            {error}
          </Problem>
        </div>
      </Page>
    );
  }
  if (!req) return <Loading />;

  const read = req.scopes.filter((s) => s.key !== WRITE_SCOPE);
  const write = req.scopes.find((s) => s.key === WRITE_SCOPE);

  return (
    <Page narrow testId="consent">
      <PageHeader
        title={`Let ${req.client_name} use Coderhelm as you?`}
        lead={
          <p>
            It will act as <strong className="font-medium text-zinc-200">{req.email}</strong> in this team, and can do only what your role
            allows. You can remove it at any time.
          </p>
        }
      />

      <div className="mt-6 space-y-4">
        <section aria-labelledby="consent-who" className={cardClass} data-testid="consent-who">
          <h2 id="consent-who" className="mb-2 text-sm font-semibold text-zinc-100">
            Who is asking
          </h2>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-zinc-400">App</dt>
            <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]" data-testid="consent-app">
              {req.client_name}
            </dd>
            <dt className="text-zinc-400">Sends you back to</dt>
            <dd className="min-w-0" data-testid="consent-host">
              <Code>{req.redirect_host}</Code>
            </dd>
          </dl>
          <p className="mt-3 text-xs text-zinc-400">
            The app chose its own name, so check the address it sends you back to. If you didn&apos;t just add Coderhelm to an app, choose
            Don&apos;t allow.
          </p>
        </section>

        <section aria-labelledby="consent-what" className={cardClass}>
          <h2 id="consent-what" className="mb-3 text-sm font-semibold text-zinc-100">
            What it may do
          </h2>
          <ul className="space-y-3 text-sm" aria-label="What the app may do">
            {read.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-zinc-200" data-testid="consent-scope">
                <span aria-hidden="true" className="mt-0.5 text-emerald-400">
                  <CheckIcon />
                </span>
                <span>{s.label}</span>
              </li>
            ))}
            {write && (
              <li className="flex items-start gap-2" data-testid="consent-scope">
                <input
                  id={writeId}
                  type="checkbox"
                  className={`mt-0.5 h-4 w-4 shrink-0 accent-blue-500 ${focusRing}`}
                  checked={allowWrite}
                  disabled={!req.can_act}
                  onChange={(e) => setAllowWrite(e.target.checked)}
                />
                <label htmlFor={writeId} className={req.can_act ? "text-zinc-200" : "text-zinc-400"}>
                  {write.label}
                  {!write.requested && req.can_act && <span className="block text-xs text-zinc-400">The app didn&apos;t ask for this. Leave it off unless you want the app to act.</span>}
                </label>
              </li>
            )}
          </ul>
          {!req.can_act && (
            <p className="mt-3 text-xs text-zinc-400" data-testid="consent-read-only">
              Your role only reads, so the app can only read too.
            </p>
          )}
        </section>

        {leaving ? (
          <Callout variant="success" title={leaving} testId="consent-leaving" />
        ) : (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className={`${secondaryButton} ${fullWidthOnPhone}`} disabled={!!sending} onClick={() => answer(false)}>
              {sending === "deny" ? "Sending…" : "Don't allow"}
            </button>
            <button type="button" className={`${primaryButton} ${fullWidthOnPhone}`} disabled={!!sending} onClick={() => answer(true)}>
              {sending === "allow" ? "Connecting…" : "Allow"}
            </button>
          </div>
        )}

        <p className="text-xs text-zinc-400">
          Every call the app makes is checked against your role and written to the team&apos;s log. See and remove connected apps in{" "}
          <Link href="/settings/connected-apps/" className="text-zinc-300 underline underline-offset-2 hover:text-zinc-100">
            Settings, Connected AI apps
          </Link>
          .
        </p>
      </div>
    </Page>
  );
}
