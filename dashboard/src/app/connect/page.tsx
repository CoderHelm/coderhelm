"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { Chip, List, ListRow } from "@/components/list";
import { PluginIcon } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import { CodeBlock } from "@/components/code-block";
import { Callout } from "@/components/callout";
import { Segmented } from "@/components/segmented";
import { Skeleton } from "@/components/skeleton";
import { Code } from "@/components/settings/code";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { relativeTime } from "@/lib/team";
import { linkButton, primaryButton, secondaryButton, smallDangerButton } from "@/components/ui";
import { connectedAppsApi, type Connection, type ConnectionList } from "@/lib/connected-apps";
import {
  TOOLS,
  TOOL_DOCS,
  claudeCodeCommand,
  claudeCodeProjectFile,
  cursorFile,
  cursorInstallLink,
  publishedScopes,
  scopeRows,
  scopeTitle,
  vscodeCommand,
  vscodeFile,
  vscodeInstallLink,
  windsurfFile,
  type ScopeRow,
  type ToolKey,
} from "@/lib/connect";

// Connect your AI tools: the team's MCP address, the setup each tool needs,
// what people can ask, which scopes the server offers, the person's own
// connected tools and, for people who manage the team's API keys, who has
// connected. Everything comes from the dashboard API's connected apps list
// and the MCP server's own published metadata.

export default function ConnectPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<ConnectionList | null>(null);
  const [published, setPublished] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [tool, setTool] = useState<ToolKey>("claude");

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
  useEffect(() => {
    let live = true;
    publishedScopes().then((s) => {
      if (live) setPublished(s);
    });
    return () => {
      live = false;
    };
  }, []);

  const revoke = async (c: Connection) => {
    const ok = await confirm({
      title: `Remove ${c.client_name}?`,
      message: "The tool stops working with Coderhelm at once. To use it again, connect it again.",
      confirmLabel: "Remove tool",
      destructive: true,
    });
    if (ok !== "primary") return;
    try {
      await connectedAppsApi.revoke(c.id);
      toast(`Removed ${c.client_name}.`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not remove the tool.", "error");
    }
  };

  const labels = useMemo(() => Object.fromEntries((data?.scopes ?? []).map((s) => [s.key, s.label])), [data]);
  const live = useMemo(() => data?.connections.filter((c) => c.status === "active") ?? [], [data]);
  const mine = live.filter((c) => c.mine);
  const rows = useMemo(() => {
    // What the server publishes to every AI tool; the dashboard API's list
    // when that document can't be read.
    const offered = published ?? (data?.scopes ?? []).map((s) => s.key);
    const held = new Set(mine.flatMap((c) => c.scopes));
    return scopeRows(offered, labels, held);
  }, [published, data, labels, mine]);
  const offered = rows.filter((r) => r.offered);

  return (
    <Page testId="connect-page">
      <PageHeader
        title="Connect your AI tools"
        lead={
          <p>
            Ask about your team&apos;s code, tickets, runs and documents from Claude, ChatGPT, Cursor, VS Code and other AI tools. A tool acts as
            you and reads only what you can read in Coderhelm.
          </p>
        }
      />

      {error && (
        <div className="mt-6">
          <Problem title="Couldn't load your connections" onRetry={load} details={error}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        </div>
      )}

      {!data && !error && (
        <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      )}

      {data && (
        <>
          <section aria-labelledby="connect-address" className={`mt-6 ${cardClass}`} data-testid="connect-address">
            <h2 id="connect-address" className="mb-2 text-sm font-semibold text-zinc-100">
              Your team&apos;s address
            </h2>
            <p className="text-sm text-zinc-400">Every tool connects to this one address. It opens Coderhelm in your browser so you can sign in.</p>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              <Code>{data.mcp_url}</Code>
              <CopyButton text={data.mcp_url} label="Copy address" />
            </div>
          </section>

          <Section id="connect-setup" title="Set it up" description="Pick your tool. Each needs one step, then you sign in to Coderhelm when it asks.">
            <Segmented label="AI tool" options={TOOLS.map((t) => ({ value: t.key, label: t.label }))} value={tool} onChange={setTool} />
            <div className={`mt-4 ${cardClass}`} data-testid={`tool-${tool}`}>
              <ToolSetup tool={tool} url={data.mcp_url} />
            </div>
          </Section>

          <Section id="connect-ask" title="What you can ask" description="Once connected, ask in plain words. The tool looks it up in Coderhelm and links to where each answer came from.">
            {offered.filter((r) => r.examples.length > 0).length === 0 ? (
              <p className="text-sm text-zinc-400">This server doesn&apos;t offer anything to read yet.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2" aria-label="Example questions">
                {offered
                  .filter((r) => r.examples.length > 0)
                  .map((r) => (
                    <li key={r.key} className={cardClass} data-testid="ask-group">
                      <h3 className="text-sm font-medium text-zinc-100">{r.title}</h3>
                      <ul className="mt-2 space-y-1.5 text-sm text-zinc-300">
                        {r.examples.map((q) => (
                          <li key={q}>&ldquo;{q}&rdquo;</li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            )}
          </Section>

          <Section
            id="connect-scopes"
            title="What tools can read"
            description="When you connect, you choose which of these the tool may use. The server lists what it offers; anything it doesn't offer can't be chosen."
          >
            <List label="Scopes">
              {rows.map((r) => (
                <ScopeListRow key={r.key} row={r} />
              ))}
            </List>
          </Section>

          <Section id="connect-mine" title={`Your connected tools${mine.length ? ` (${mine.length})` : ""}`}>
            {mine.length === 0 ? (
              <EmptyState icon={<PluginIcon />} title="No tools connected.">
                Set one up above, then sign in when it asks.
              </EmptyState>
            ) : (
              <List label="Your connected tools">
                {mine.map((c) => (
                  <ListRow
                    key={c.id}
                    testId="my-connection"
                    status={{ tone: "success" }}
                    title={c.client_name}
                    titleText={c.client_name}
                    meta={[
                      <Code key="host">{c.redirect_host}</Code>,
                      `Connected ${relativeTime(c.created_at) ?? ""}`,
                      c.last_used_at ? `Last used ${relativeTime(c.last_used_at)}` : "Not used yet",
                    ]}
                    chips={
                      <span className="flex min-w-0 flex-wrap gap-1.5" aria-label="What it may use">
                        {c.scopes.map((s) => (
                          <Chip key={s} title={labels[s] ?? s}>
                            {scopeTitle(s, labels)}
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
          </Section>

          {data.team_wide && <TeamConnections connections={live} />}
        </>
      )}
    </Page>
  );
}

function ScopeListRow({ row }: { row: ScopeRow }) {
  return (
    <ListRow
      testId="scope-row"
      data={{ scope: row.key, offered: row.offered ? "yes" : "no" }}
      status={{ tone: row.offered ? "success" : "neutral" }}
      quiet={!row.offered}
      title={row.title}
      titleText={row.title}
      meta={[<Code key="key">{row.key}</Code>, row.covers || null]}
      chips={
        <span className="flex min-w-0 flex-wrap gap-1.5">
          <Chip tone={row.offered ? "success" : "neutral"}>{row.offered ? "Offered" : "Not offered on this server yet"}</Chip>
          {row.acts && <Chip tone="attention">Makes changes</Chip>}
          {row.yours && <Chip>In your tools</Chip>}
        </span>
      }
    />
  );
}

/** For people who manage the team's API keys: who has connected, and where that is controlled. */
function TeamConnections({ connections }: { connections: Connection[] }) {
  const people = useMemo(() => {
    const by = new Map<string, { email: string; apps: string[]; last: string | null }>();
    for (const c of connections) {
      const p = by.get(c.email) ?? { email: c.email, apps: [], last: null };
      if (!p.apps.includes(c.client_name)) p.apps.push(c.client_name);
      const used = c.last_used_at ?? null;
      if (used && (!p.last || used > p.last)) p.last = used;
      by.set(c.email, p);
    }
    return [...by.values()].sort((a, b) => a.email.localeCompare(b.email));
  }, [connections]);

  return (
    <Section
      id="connect-team"
      title={`Who has connected${people.length ? ` (${people.length})` : ""}`}
      description="You see this because you manage the team's API keys. Each tool can do only what the person's role allows."
      className="pb-4"
      actions={
        <>
          <Link href="/settings/connected-apps/" className={primaryButton}>
            Manage connected apps
          </Link>
          <Link href="/settings/team/" className={secondaryButton}>
            Members and roles
          </Link>
        </>
      }
    >
      <div data-testid="connect-admin">
        {people.length === 0 ? (
          <EmptyState icon={<PluginIcon />} title="Nobody has connected a tool yet." compact />
        ) : (
          <List label="People with connected tools">
            {people.map((p) => (
              <ListRow
                key={p.email}
                testId="team-connection"
                title={p.email}
                titleText={p.email}
                meta={[`${p.apps.length} ${p.apps.length === 1 ? "tool" : "tools"}: ${p.apps.join(", ")}`, p.last ? `Last used ${relativeTime(p.last)}` : "Not used yet"]}
              />
            ))}
          </List>
        )}
        <p className="mt-3 text-sm text-zinc-400">
          Remove anyone&apos;s tool under{" "}
          <Link href="/settings/connected-apps/" className={linkButton}>
            Settings, Connected AI apps
          </Link>
          . What a tool may do follows the person&apos;s role, set under{" "}
          <Link href="/settings/team/" className={linkButton}>
            Settings, Members and roles
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}

// ── Each tool's setup ───────────────────────────────────────────────

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">{children}</ol>;
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-sm font-medium text-zinc-100">{children}</h3>;
}

function Docs({ tool, name }: { tool: keyof typeof TOOL_DOCS; name: string }) {
  return (
    <p className="mt-4 text-sm text-zinc-400">
      <a href={TOOL_DOCS[tool]} target="_blank" rel="noreferrer" className={linkButton}>
        {name}&apos;s own guide
      </a>
    </p>
  );
}

function ToolSetup({ tool, url }: { tool: ToolKey; url: string }) {
  const copy = <CopyButton text={url} label="Copy address" />;
  switch (tool) {
    case "claude":
      return (
        <div className="space-y-5">
          <p className="text-sm text-zinc-400">claude.ai, Claude Desktop and the Claude mobile apps share connectors: add it once and it works in all of them.</p>
          <div>
            <Sub>Free, Pro and Max</Sub>
            <Steps>
              <li>In Claude, open Customize, then Connectors.</li>
              <li>Press Add, then Add custom connector.</li>
              <li>Name it Coderhelm, paste the address and press Add. {copy}</li>
              <li>Press Connect and sign in to Coderhelm.</li>
            </Steps>
            <p className="mt-2 text-sm text-zinc-400">Free plans can add one custom connector.</p>
          </div>
          <div>
            <Sub>Team and Enterprise</Sub>
            <Steps>
              <li>An owner adds it once: Organization settings, Connectors, Add, then Custom and Web. Name it Coderhelm and paste the address.</li>
              <li>Then each person opens Customize, Connectors, finds Coderhelm and presses Connect.</li>
            </Steps>
          </div>
          <Docs tool="claude" name="Claude" />
        </div>
      );
    case "claude-code":
      return (
        <div className="space-y-5">
          <div>
            <Sub>Run this once</Sub>
            <CodeBlock code={claudeCodeCommand(url)} lang="bash" testId="snippet-claude-code" />
            <p className="mt-2 text-sm text-zinc-400">
              Then run <Code>/mcp</Code> in Claude Code, choose <Code>coderhelm</Code> and sign in.
            </p>
          </div>
          <div>
            <Sub>Or share it with a repository</Sub>
            <p className="mb-2 text-sm text-zinc-400">Commit this file at the repository&apos;s root, so everyone who opens it in Claude Code gets Coderhelm.</p>
            <CodeBlock code={claudeCodeProjectFile(url)} lang="json" filename=".mcp.json" testId="snippet-claude-code-file" />
          </div>
          <Docs tool="claude-code" name="Claude Code" />
        </div>
      );
    case "chatgpt":
      return (
        <div className="space-y-5">
          <div>
            <Sub>Business, Enterprise and Edu workspaces</Sub>
            <Steps>
              <li>A workspace admin or owner turns on developer mode: Settings, Apps, Advanced settings.</li>
              <li>They create an app from a custom MCP server: name it Coderhelm, paste the address, and choose OAuth to sign in. {copy}</li>
              <li>They publish it to the workspace from Workspace settings, Apps. Each person then connects it and signs in to Coderhelm.</li>
            </Steps>
          </div>
          <Callout variant="info" live={false} title="Deep research and company knowledge">
            ChatGPT&apos;s deep research and company knowledge read through only two tools, <Code>search</Code> and <Code>fetch</Code>. Chats in developer mode
            can use every tool Coderhelm offers.
          </Callout>
          <Docs tool="chatgpt" name="ChatGPT" />
        </div>
      );
    case "cursor":
      return (
        <div className="space-y-5">
          <div>
            <Sub>One click</Sub>
            <a href={cursorInstallLink(url)} className={primaryButton} data-testid="add-to-cursor">
              Add to Cursor
            </a>
            <p className="mt-2 text-sm text-zinc-400">Cursor opens and asks to install. Then sign in to Coderhelm when it asks.</p>
          </div>
          <div>
            <Sub>Or add it by hand</Sub>
            <p className="mb-2 text-sm text-zinc-400">
              Add this to <Code>~/.cursor/mcp.json</Code> for every project, or <Code>.cursor/mcp.json</Code> in one repository.
            </p>
            <CodeBlock code={cursorFile(url)} lang="json" filename="mcp.json" testId="snippet-cursor" />
          </div>
          <Docs tool="cursor" name="Cursor" />
        </div>
      );
    case "vscode":
      return (
        <div className="space-y-5">
          <div>
            <Sub>One click</Sub>
            <a href={vscodeInstallLink(url)} className={primaryButton} data-testid="add-to-vscode">
              Add to VS Code
            </a>
            <p className="mt-2 text-sm text-zinc-400">VS Code shows the server to check, then installs it. Sign in to Coderhelm when it asks.</p>
          </div>
          <div>
            <Sub>Or from a terminal</Sub>
            <CodeBlock code={vscodeCommand(url)} lang="bash" testId="snippet-vscode-command" />
          </div>
          <div>
            <Sub>Or in a file</Sub>
            <p className="mb-2 text-sm text-zinc-400">
              Add this to <Code>~/.copilot/mcp-config.json</Code> for yourself, or <Code>.mcp.json</Code> at a workspace&apos;s root to share it.
            </p>
            <CodeBlock code={vscodeFile(url)} lang="json" filename="mcp-config.json" testId="snippet-vscode" />
          </div>
          <Callout variant="info" live={false} title="GitHub Copilot Business and Enterprise">
            An admin must turn on the &ldquo;MCP servers in Copilot&rdquo; policy before anyone in the organization can use MCP servers.
          </Callout>
          <Docs tool="vscode" name="VS Code" />
        </div>
      );
    case "windsurf":
      return (
        <div className="space-y-5">
          <div>
            <Sub>Add it to Cascade</Sub>
            <p className="mb-2 text-sm text-zinc-400">
              In Cascade, open the MCP config file (<Code>~/.config/devin/mcp_config.json</Code> on macOS and Linux, <Code>%AppData%\devin\mcp_config.json</Code>{" "}
              on Windows) and add this. Then sign in to Coderhelm when it asks.
            </p>
            <CodeBlock code={windsurfFile(url)} lang="json" filename="mcp_config.json" testId="snippet-windsurf" />
          </div>
          <Docs tool="windsurf" name="Windsurf" />
        </div>
      );
    case "other":
      return (
        <div className="space-y-3 text-sm text-zinc-300">
          <p>Any tool that adds a remote MCP server over HTTP with sign-in (OAuth) works. Give it the address and sign in when it asks. {copy}</p>
          <p className="text-zinc-400">Tools that only run local MCP servers can&apos;t connect to an address.</p>
        </div>
      );
  }
}
