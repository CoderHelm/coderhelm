"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/role-guard";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { ToolStatus, ToolSwitch } from "@/components/tools";
import { linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import {
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSection,
  ListSkeleton,
  ListToolbar,
  useListParams,
  type Tone,
} from "@/components/list";
import { KIND_LABEL, toolsApi, type Tool, type ToolAsk } from "@/lib/tools";

export default function ToolsPageGuarded() {
  return (
    <RoleGuard minRole="admin">
      <Suspense fallback={<Page><PageHeader title="Your own tools" /><div className="mt-8"><ListSkeleton rows={3} label="Loading your tools" /></div></Page>}>
        <ToolsPage />
      </Suspense>
    </RoleGuard>
  );
}

type ToolFilter = "all" | "on" | "off" | "approval";

const toolOn = (t: Tool) => !!t.approved && t.enabled;
const toolOff = (t: Tool) => !!t.approved && !t.enabled;
const toolWaits = (t: Tool) => !t.approved || t.awaiting_approval;

function toolTone(t: Tool): Tone {
  if (toolWaits(t)) return "waiting";
  return t.enabled ? "success" : "muted";
}

function ToolsPage() {
  const { toast } = useToast();
  const [params, setParams] = useListParams({ q: "", status: "all" });
  const filter: ToolFilter = (["on", "off", "approval"] as const).find((f) => f === params.status) ?? "all";
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [asks, setAsks] = useState<ToolAsk[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([toolsApi.list(), toolsApi.asks()]);
      setTools(t.tools);
      setAsks(a.asks);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
      setTools((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    // Ask-me-first requests wait for a person: keep the inbox fresh.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") toolsApi.asks().then((a) => setAsks(a.asks)).catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const toggle = async (t: Tool) => {
    setBusy(t.name);
    try {
      const r = await toolsApi.setEnabled(t.name, !t.enabled);
      setTools((prev) => prev?.map((x) => (x.name === t.name ? { ...x, ...r.tool } : x)) ?? null);
      toast(r.tool.enabled ? `${t.name} is on` : `${t.name} is off`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const decide = async (a: ToolAsk, approve: boolean) => {
    setBusy(a.id);
    try {
      await toolsApi.decide(a.id, approve);
      toast(approve ? "Approved: that one call will run" : "Declined");
      const r = await toolsApi.asks();
      setAsks(r.asks);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const pending = asks.filter((a) => a.status === "pending");
  const all = tools ?? [];
  const q = params.q.trim().toLowerCase();
  const searched = all.filter((t) => {
    if (!q) return true;
    const v = t.latest_version?.def;
    return [t.name, v?.use_when ?? "", v?.source ?? ""].some((x) => x.toLowerCase().includes(q));
  });
  const keep: Record<ToolFilter, (t: Tool) => boolean> = { all: () => true, on: toolOn, off: toolOff, approval: toolWaits };
  const shown = searched.filter(keep[filter]);
  const filtered = !!q || filter !== "all";
  const clear = () => setParams({ q: "", status: "all" });

  return (
    <Page>
      <PageHeader
        breadcrumb={<Link href="/data-sources" className={`${linkButton} text-sm`}>Back to data sources</Link>}
        title="Your own tools"
        titleClassName="text-balance"
        lead={
          <>
            Named lookups your engineers already trust, like &quot;find order by number&quot;. Someone writes the read once, another
            admin approves it after seeing it run, and Coderhelm calls it with the inputs it needs. It can only read.
          </>
        }
        actions={<Link href="/data-sources/tools/new" className={primaryButton}>New tool</Link>}
      />

      {error && (
        <div className="mt-6">
          <ListError title="We couldn't load your tools">{error} Reload the page to try again.</ListError>
        </div>
      )}

      <div className="mt-8">
        <ListSection id="inbox" title="Waiting for your yes" count={pending.length || undefined} tone={pending.length ? "waiting" : undefined}>
          {pending.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-4 text-sm text-zinc-400">
              Nothing waiting. Tools marked &quot;ask me first&quot; show up here when Coderhelm wants to run them, and wait up to 10 minutes.
            </p>
          ) : (
            <List label="Calls waiting for approval">
              {pending.map((a) => (
                <ListRow
                  key={a.id}
                  testId="tool-ask"
                  status={{ tone: "waiting" }}
                  title={<><span className="font-mono">{a.tool}</span> wants to run</>}
                  meta={[`${a.actor}${a.repo ? ` on ${a.repo}${a.pr ? ` #${a.pr}` : ""}` : ""} · ${Math.ceil(a.expires_in_s / 60)} min left`]}
                  actions={
                    <>
                      <button type="button" className={primaryButton} disabled={busy === a.id} onClick={() => decide(a, true)}>
                        Approve this call
                      </button>
                      <button type="button" className={secondaryButton} disabled={busy === a.id} onClick={() => decide(a, false)}>
                        Decline
                      </button>
                    </>
                  }
                >
                  <pre className="mt-1.5 whitespace-pre-wrap break-words rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">{JSON.stringify(a.inputs, null, 2)}</pre>
                </ListRow>
              ))}
            </List>
          )}
        </ListSection>
      </div>

      <div className="mt-8">
        <ListSection id="tools" title="Tools" count={all.length || undefined}>
          {all.length >= 2 && (
            <ListToolbar
              className="mb-3"
              search={{
                value: params.q,
                onChange: (v) => setParams({ q: v }, { replace: true }),
                placeholder: "Find a tool by name, use or source",
                label: "Find a tool",
              }}
              status={{
                label: "Show tools",
                value: filter,
                onChange: (v) => setParams({ status: v }),
                options: [
                  { value: "all", label: "All", count: searched.length },
                  { value: "on", label: "On", count: searched.filter(toolOn).length, tone: "success" },
                  { value: "off", label: "Off", count: searched.filter(toolOff).length, tone: "muted" },
                  { value: "approval", label: "Needs approval", count: searched.filter(toolWaits).length, tone: "waiting" },
                ],
              }}
              onClear={filtered ? clear : undefined}
            />
          )}
          {tools === null ? (
            <ListSkeleton rows={3} label="Loading your tools" />
          ) : all.length === 0 ? (
            <ListEmpty title="No tools yet" action={<Link href="/data-sources/tools/new" className={secondaryButton}>Write your first tool</Link>}>
              Write one here, or commit a file to <code className="text-zinc-300">.coderhelm/tools/</code> in a repo: it shows up as a
              proposal to approve.
            </ListEmpty>
          ) : shown.length === 0 ? (
            <ListEmpty title="No tool matches" onClear={clear} />
          ) : (
            <List label="Tools">
              {shown.map((t) => {
                const v = t.latest_version;
                const inputs = v ? Object.keys(v.def.inputs).length : 0;
                const href = `/data-sources/tools/tool?name=${encodeURIComponent(t.name)}`;
                return (
                  <ListRow
                    key={t.name}
                    testId="tool-row"
                    status={{ tone: toolTone(t) }}
                    title={<span className="font-mono">{t.name}</span>}
                    href={href}
                    meta={
                      v
                        ? [
                            `${KIND_LABEL[v.def.kind]} on ${v.def.source}`,
                            `${inputs} input${inputs === 1 ? "" : "s"}`,
                            v.origin.startsWith("repo ") ? `from ${v.origin.slice(5).split(" ")[0]}` : null,
                          ]
                        : undefined
                    }
                    summary={v?.def.use_when}
                    chips={
                      <>
                        <ToolStatus tool={t} />
                        {v?.def.ask_me_first && <StatusPill>Ask me first</StatusPill>}
                      </>
                    }
                    actions={
                      t.approved ? (
                        <ToolSwitch on={t.enabled} label={`Let Coderhelm use ${t.name}`} busy={busy === t.name} onToggle={() => toggle(t)} />
                      ) : (
                        <Link href={href} className={secondaryButton}>Review</Link>
                      )
                    }
                  />
                );
              })}
            </List>
          )}
        </ListSection>
      </div>
    </Page>
  );
}
