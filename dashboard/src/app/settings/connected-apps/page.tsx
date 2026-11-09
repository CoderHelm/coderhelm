"use client";

import { useCallback, useEffect, useState } from "react";
import { Page, PageHeader, SectionHeading, cardClass } from "@/components/page";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { Chip, List, ListRow } from "@/components/list";
import { PluginIcon } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import { Skeleton } from "@/components/skeleton";
import { Code } from "@/components/settings/code";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { relativeTime } from "@/lib/team";
import { linkButton, smallDangerButton } from "@/components/ui";
import { MCP_DOCS_URL, WRITE_SCOPE, connectedAppsApi, type Connection, type ConnectionList } from "@/lib/connected-apps";

// The AI apps (MCP clients) people connected to Coderhelm, and the address
// to add. Everyone sees and removes their own; people who manage API keys
// see and remove everyone's.

export default function ConnectedAppsPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<ConnectionList | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    connectedAppsApi
      .list()
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "The request failed."));
  }, []);
  useEffect(load, [load]);

  const revoke = async (c: Connection) => {
    const ok = await confirm({
      title: `Remove ${c.client_name}?`,
      message: c.mine
        ? "The app stops working with Coderhelm at once. To use it again, add Coderhelm to it again."
        : `${c.email} connected this app. It stops working with Coderhelm at once.`,
      confirmLabel: "Remove app",
      destructive: true,
    });
    if (ok !== "primary") return;
    try {
      await connectedAppsApi.revoke(c.id);
      toast(`Removed ${c.client_name}.`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not remove the app.", "error");
    }
  };

  const live = data?.connections.filter((c) => c.status === "active") ?? [];
  const scopeLabel = Object.fromEntries((data?.scopes ?? []).map((s) => [s.key, s.label]));

  return (
    <Page>
      <PageHeader
        title="Connected AI apps"
        lead={
          <p>
            Use Coderhelm from Claude, Cursor, VS Code and other AI apps: see runs, start and retry them, and read or ask for reviews. An app
            acts as the person who connected it and can do only what their role allows.
          </p>
        }
      />

      <div className="mt-6 space-y-6">
        {error && (
          <Problem title="Couldn't load connected apps" onRetry={load} details={error}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        )}

        {!data && !error && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading connected apps">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        )}

        {data && (
          <section aria-labelledby="apps-add" className={cardClass} data-testid="mcp-url">
            <h2 id="apps-add" className="mb-2 text-sm font-semibold text-zinc-100">
              Connect an app
            </h2>
            <p className="text-sm text-zinc-400">Add Coderhelm to your app as a remote MCP server with this address:</p>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              <Code>{data.mcp_url}</Code>
              <CopyButton text={data.mcp_url} label="Copy address" />
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              The app opens Coderhelm in your browser so you can sign in and choose what it may do.{" "}
              <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className={linkButton}>
                How to add it to Claude, Cursor and VS Code
              </a>
            </p>
          </section>
        )}

        {data && (
          <section aria-labelledby="apps-live">
            <div className="mb-3">
              <SectionHeading id="apps-live" count={live.length}>
                {data.team_wide ? "Apps connected in this team" : "Your connected apps"}
              </SectionHeading>
            </div>
            {live.length === 0 ? (
              <EmptyState icon={<PluginIcon />} title="No apps connected.">
                Add the address above to an AI app, then sign in when it asks.
              </EmptyState>
            ) : (
              <List label="Connected apps">
                {live.map((c) => (
                  <ListRow
                    key={c.id}
                    testId="connected-app"
                    status={{ tone: "success" }}
                    title={c.client_name}
                    titleText={c.client_name}
                    meta={[
                      <Code key="host">{c.redirect_host}</Code>,
                      data.team_wide && !c.mine ? `Connected by ${c.email}` : null,
                      `Connected ${relativeTime(c.created_at) ?? ""}`,
                      c.last_used_at ? `Last used ${relativeTime(c.last_used_at)}` : "Not used yet",
                    ]}
                    chips={
                      <span className="flex min-w-0 flex-wrap gap-1.5" aria-label="What it may do">
                        {c.scopes.map((s) => (
                          <Chip key={s} title={scopeLabel[s] ?? s}>
                            {s === WRITE_SCOPE ? "Start runs and reviews" : "Read runs and reviews"}
                          </Chip>
                        ))}
                      </span>
                    }
                    actions={
                      <button type="button" className={smallDangerButton} onClick={() => revoke(c)} aria-label={`Remove ${c.client_name}`}>
                        Remove
                      </button>
                    }
                  />
                ))}
              </List>
            )}
          </section>
        )}

        {data && (
          <section aria-labelledby="apps-how" className={cardClass}>
            <h2 id="apps-how" className="mb-2 text-sm font-semibold text-zinc-100">
              How connected apps work
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
              <li>An app acts as you, in this team. If your role changes or you leave the team, the app stops working.</li>
              <li>Reading runs and reviews is always included. Starting runs and asking for reviews is a separate choice when you connect.</li>
              <li>Every call an app makes is written to the team&apos;s log of access changes.</li>
              <li>Removing an app here stops it at once, everywhere it is signed in.</li>
            </ul>
          </section>
        )}
      </div>
    </Page>
  );
}
