"use client";

import { useCallback, useEffect, useState } from "react";
import { request } from "@/lib/api";
import { Section } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Code } from "@/components/settings/code";
import { List, ListError, ListRow, ListSkeleton } from "@/components/list";

// Admin page: which knowledge sources' sign-in apps this install has
// (Notion, Atlassian, Google Drive), and for one that is missing, exactly
// what to register and where its keys go. Read-only; the gateway never
// sends a client secret, only whether one is set.

export interface SignInApp {
  kind: string;
  name: string;
  app: string;
  configured: boolean;
  /** The key the app was read from: always the provider's own id key (Drive never reuses the Google sign-in client). */
  source: string;
  id_key: string;
  secret_key: string;
  console: string;
  scopes: string[];
  redirect_uri: string;
}

const GUIDE = "https://docs.coderhelm.com/self-host/knowledge-sources/";

/** Each app's section in the knowledge sources guide. */
const STEPS: Record<string, string> = {
  notion: `${GUIDE}#notion`,
  confluence: `${GUIDE}#confluence-atlassian`,
  google_drive: `${GUIDE}#google-drive`,
};

export const signInAppsApi = {
  list: () => request<{ apps: SignInApp[]; secret_name: string }>("/api/admin/sign-in-apps"),
};

export function SignInAppsPanel() {
  const [data, setData] = useState<{ apps: SignInApp[]; secret_name: string } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    signInAppsApi
      .list()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The request failed."));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const missing = data ? data.apps.filter((a) => !a.configured).length : 0;
  return (
    <Section
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Sign-in apps
          {data && (missing ? <StatusPill tone="warning">{missing} not set up</StatusPill> : <StatusPill tone="success">All set up</StatusPill>)}
        </span>
      }
      id="sign-in-apps"
      description="One-click sign-in for Knowledge sources. Without an app, teams connect Notion and Confluence with a token instead, and Google Drive can't connect."
    >
      <div data-testid="sign-in-apps" data-state={data ? "ready" : error ? "error" : "loading"}>
        {error ? (
          <ListError title="Couldn't load the sign-in apps" onRetry={load}>
            {error}
          </ListError>
        ) : !data ? (
          <ListSkeleton rows={3} label="Loading the sign-in apps" />
        ) : (
          <List label="Sign-in apps">
            {data.apps.map((a) => (
              <ListRow
                key={a.kind}
                testId="sign-in-app"
                data={{ kind: a.kind, configured: a.configured ? "yes" : "no" }}
                status={{ tone: a.configured ? "success" : "attention" }}
                title={a.name}
                summary={a.configured ? `Set up, from ${a.source || a.id_key}` : `Not set up. App to register: ${a.app}`}
                summaryTone="muted"
                details={
                  <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                    <dt className="text-zinc-400">Redirect URI</dt>
                    <dd className="min-w-0">
                      <Code className="wrap-anywhere">{a.redirect_uri}</Code>
                    </dd>
                    <dt className="text-zinc-400">Scopes</dt>
                    <dd className="min-w-0 text-zinc-300">{a.scopes.length ? a.scopes.map((s) => <Code key={s} className="mr-1 wrap-anywhere">{s}</Code>) : "None (pages are picked on the consent screen)"}</dd>
                    <dt className="text-zinc-400">Keys in the secret</dt>
                    <dd className="min-w-0 text-zinc-300">
                      <Code className="wrap-anywhere">{a.id_key}</Code> and <Code className="wrap-anywhere">{a.secret_key}</Code> in{" "}
                      <Code className="wrap-anywhere">{data.secret_name}</Code>
                    </dd>
                    <dt className="text-zinc-400">Steps</dt>
                    <dd className="min-w-0">
                      <a href={STEPS[a.kind] ?? GUIDE} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline-offset-2 hover:underline" data-testid="sign-in-app-steps">
                        Knowledge sources guide
                      </a>
                    </dd>
                    <dt className="text-zinc-400">Register at</dt>
                    <dd className="min-w-0">
                      <a href={a.console} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline-offset-2 hover:underline">
                        <span className="wrap-anywhere">{a.console}</span>
                      </a>
                    </dd>
                  </dl>
                }
              />
            ))}
          </List>
        )}
      </div>
    </Section>
  );
}
