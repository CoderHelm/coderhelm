"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { ToolStatus, ToolSwitch } from "@/components/tools";
import { linkButton, primaryButton, secondaryButton, focusRing } from "@/components/ui";
import { KIND_LABEL, toolsApi, type Tool, type ToolAsk } from "@/lib/tools";

export default function ToolsPageGuarded() {
  return (
    <RoleGuard minRole="admin">
      <ToolsPage />
    </RoleGuard>
  );
}

function ToolsPage() {
  const { toast } = useToast();
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

  return (
    <div className="max-w-4xl">
      <Link href="/data-sources" className={`${linkButton} text-sm`}>Back to data sources</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-zinc-100 text-balance">Your own tools</h1>
          <p className="mt-2 max-w-prose text-sm text-zinc-400">
            Named lookups your engineers already trust, like &quot;find order by number&quot;. Someone writes the read once,
            another admin approves it after seeing it run, and Coderhelm calls it with the inputs it needs. It can only read.
          </p>
        </div>
        <Link href="/data-sources/tools/new" className={primaryButton}>New tool</Link>
      </div>

      {error && (
        <div className="mt-6">
          <Callout variant="error" title="We couldn't load your tools">
            <p>{error} Reload the page to try again.</p>
          </Callout>
        </div>
      )}

      <section aria-labelledby="inbox-heading" className="mt-8">
        <h2 id="inbox-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Waiting for your yes {pending.length > 0 && <span className="ml-1 text-amber-400">({pending.length})</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
            Nothing waiting. Tools marked &quot;ask me first&quot; show up here when Coderhelm wants to run them, and wait up to 10 minutes.
          </p>
        ) : (
          <ul className="rounded-lg border border-amber-500/30 bg-amber-500/5 divide-y divide-zinc-800">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm text-zinc-100">
                    <span className="font-mono">{a.tool}</span> wants to run
                  </p>
                  <pre className="mt-1.5 whitespace-pre-wrap break-words rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">{JSON.stringify(a.inputs, null, 2)}</pre>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {a.actor}
                    {a.repo ? ` on ${a.repo}${a.pr ? ` #${a.pr}` : ""}` : ""} · {Math.ceil(a.expires_in_s / 60)} min left
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={primaryButton} disabled={busy === a.id} onClick={() => decide(a, true)}>
                    Approve this call
                  </button>
                  <button type="button" className={secondaryButton} disabled={busy === a.id} onClick={() => decide(a, false)}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tools-heading" className="mt-8">
        <h2 id="tools-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Tools</h2>
        {tools === null ? (
          <p role="status" className="text-sm text-zinc-500">Loading your tools…</p>
        ) : tools.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
            <p>No tools yet. Write one here, or commit a file to <code className="text-zinc-300">.coderhelm/tools/</code> in a repo: it shows up as a proposal to approve.</p>
            <Link href="/data-sources/tools/new" className={`${linkButton} mt-3`}>Write your first tool</Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {tools.map((t) => {
              const v = t.latest_version;
              return (
                <li key={t.name} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/data-sources/tools/tool?name=${encodeURIComponent(t.name)}`} className={`font-mono font-semibold text-zinc-100 hover:underline rounded ${focusRing}`}>
                          {t.name}
                        </Link>
                        <ToolStatus tool={t} />
                        {v?.def.ask_me_first && <StatusPill>Ask me first</StatusPill>}
                      </div>
                      {v && <p className="mt-1 text-sm text-zinc-400">{v.def.use_when}</p>}
                      {v && (
                        <p className="mt-1 text-xs text-zinc-500">
                          {KIND_LABEL[v.def.kind]} on {v.def.source} · {Object.keys(v.def.inputs).length} input
                          {Object.keys(v.def.inputs).length === 1 ? "" : "s"}
                          {v.origin.startsWith("repo ") ? ` · from ${v.origin.slice(5).split(" ")[0]}` : ""}
                        </p>
                      )}
                    </div>
                    {t.approved ? (
                      <ToolSwitch on={t.enabled} label={`Let Coderhelm use ${t.name}`} busy={busy === t.name} onToggle={() => toggle(t)} />
                    ) : (
                      <Link href={`/data-sources/tools/tool?name=${encodeURIComponent(t.name)}`} className={secondaryButton}>Review</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
