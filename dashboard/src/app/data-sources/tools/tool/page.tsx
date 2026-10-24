"use client";

import { PageHeader } from "@/components/page";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { RunResult, ToolStatus, ToolSwitch, VersionDiff } from "@/components/tools";
import { inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { api, type DataSourceActivityEvent } from "@/lib/api";
import { defText, KIND_LABEL, parseExample, toolsApi, type Tool, type ToolRunResult, type ToolVersion } from "@/lib/tools";

export default function ToolPageGuarded() {
  return (
    <RoleGuard need="data_sources">
      <Suspense fallback={null}>
        <ToolPage />
      </Suspense>
    </RoleGuard>
  );
}

function when(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function origin(v: ToolVersion) {
  return v.origin.startsWith("repo ") ? `From ${v.origin.slice(5)}` : "Written in the dashboard";
}

function ToolPage() {
  const name = useSearchParams().get("name") ?? "";
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [tool, setTool] = useState<Tool | null>(null);
  const [versions, setVersions] = useState<ToolVersion[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [run, setRun] = useState<ToolRunResult | null>(null);
  const [activity, setActivity] = useState<DataSourceActivityEvent[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await toolsApi.get(name);
      setTool(r.tool);
      setVersions(r.versions);
      setError("");
      const latest = r.versions.find((v) => v.hash === r.tool.latest);
      if (latest) setInputs((prev) => (Object.keys(prev).length ? prev : Object.fromEntries(Object.entries(latest.def.inputs).map(([k, s]) => [k, String(s.example)]))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    }
    api.listDataSourceActivity(100).then((r) => setActivity(r.events.filter((e) => (e.query ?? e.summary ?? "").startsWith(`${name}(`)))).catch(() => {});
  }, [name]);

  useEffect(() => {
    if (name) load();
  }, [name, load]);

  if (error) {
    return (
      <div className="max-w-3xl">
        <div><Callout variant="error" title="We couldn't load this tool"><p>{error}</p></Callout></div>
      </div>
    );
  }
  if (!tool) return <p role="status" className="text-sm text-zinc-500">Loading…</p>;

  const latest = versions.find((v) => v.hash === tool.latest) ?? null;
  const approved = versions.find((v) => v.hash === tool.approved) ?? null;
  const waiting = latest && tool.latest !== tool.approved ? latest : null;
  const example = parseExample(waiting);
  const live = approved ?? latest;

  const approve = async () => {
    if (!waiting) return;
    const ok = await confirm({
      title: `Approve this version of ${tool.name}?`,
      message: "Agents will run exactly this version, with inputs that match its types. A later edit needs approval again.",
      confirmLabel: "Approve",
    });
    if (!ok) return;
    setBusy("approve");
    try {
      await toolsApi.approve(tool.name, waiting.hash);
      toast("Approved");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const toggle = async () => {
    setBusy("toggle");
    try {
      const r = await toolsApi.setEnabled(tool.name, !tool.enabled);
      setTool({ ...tool, ...r.tool });
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: `Remove ${tool.name}?`, message: "Agents stop using it right away. Its versions are deleted.", confirmLabel: "Remove", destructive: true });
    if (!ok) return;
    try {
      await toolsApi.remove(tool.name);
      toast("Removed");
      router.push("/data-sources/tools");
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    }
  };

  const tryIt = async () => {
    if (!live) return;
    setBusy("run");
    setRun(null);
    try {
      const typed: Record<string, unknown> = {};
      for (const [k, s] of Object.entries(live.def.inputs)) typed[k] = s.type === "integer" ? Number(inputs[k]) : inputs[k] ?? "";
      setRun(await toolsApi.preview(tool.name, typed, live.hash));
    } catch (e) {
      setRun({ ok: false, message: e instanceof Error ? e.message : "The request failed." });
    } finally {
      setBusy("");
      api.listDataSourceActivity(100).then((r) => setActivity(r.events.filter((e) => (e.query ?? e.summary ?? "").startsWith(`${name}(`)))).catch(() => {});
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <PageHeader detail title={tool.name} titleClassName="font-mono" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ToolStatus tool={tool} />
            {live?.def.ask_me_first && <StatusPill>Ask me first</StatusPill>}
            {live && <span className="text-xs text-zinc-500">{KIND_LABEL[live.def.kind]} on {live.def.source}</span>}
          </div>
          {live && <p className="mt-2 max-w-prose text-sm text-zinc-400">{live.def.use_when}</p>}
        </div>
        {tool.approved && <ToolSwitch on={tool.enabled} label={`Let Coderhelm use ${tool.name}`} busy={busy === "toggle"} onToggle={toggle} />}
      </div>

      {waiting && (
        <section aria-labelledby="review-heading" className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 id="review-heading" className="font-semibold text-zinc-100">
            {approved ? "A new version is waiting for approval" : "Waiting for approval"}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {origin(waiting)} by {waiting.author}, {when(waiting.created_at)}. {approved ? "Agents keep running the approved version until this one is approved." : "Agents can't use it until another admin approves it."}
          </p>
          <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{approved ? "What changed" : "The whole definition"}</h3>
          <VersionDiff before={approved ? defText(approved.def) : ""} after={defText(waiting.def)} label="Changes in this version" />
          <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">What it returned with its examples</h3>
          {example ? <RunResult run={example} label="Example run" /> : <p className="text-sm text-zinc-500">No example run was recorded.</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className={primaryButton} disabled={busy === "approve" || !waiting.example_ok} onClick={approve}>
              {busy === "approve" ? "Approving…" : "Approve this version"}
            </button>
            {!waiting.example_ok && <p className="self-center text-sm text-amber-300">The example run didn&apos;t work, so it can&apos;t be approved yet.</p>}
          </div>
          <p className="mt-3 text-xs text-zinc-500">The person who wrote a version can&apos;t approve it, unless they are the team&apos;s only admin.</p>
        </section>
      )}

      {live && (
        <section aria-labelledby="try-heading" className="mt-8">
          <h2 id="try-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Try it</h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(live.def.inputs).map(([k, s]) => (
                <label key={k} className="text-sm">
                  <span className="mb-1 block font-mono text-zinc-300">{k}</span>
                  <input
                    value={inputs[k] ?? ""}
                    onChange={(e) => setInputs({ ...inputs, [k]: e.target.value })}
                    inputMode={s.type === "integer" ? "numeric" : undefined}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs text-zinc-500">
                    {s.type === "integer" ? `A whole number from ${s.min} to ${s.max}` : s.type === "date" ? "A date like 2026-01-31" : s.allowed?.length ? `One of: ${s.allowed.join(", ")}` : `Must match ${s.pattern}`}
                  </span>
                </label>
              ))}
            </div>
            <button type="button" className={`${primaryButton} mt-4`} disabled={busy === "run"} onClick={tryIt}>
              {busy === "run" ? "Running…" : approved ? "Run the approved version" : "Run this version"}
            </button>
            {run && <div className="mt-4"><RunResult run={run} /></div>}
          </div>
        </section>
      )}

      <section aria-labelledby="versions-heading" className="mt-8">
        <h2 id="versions-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Versions</h2>
        <ul className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
          {versions.map((v) => (
            <li key={v.hash} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <code className="font-mono text-zinc-300">{v.hash}</code>
              {v.hash === tool.approved && <StatusPill tone="success">Approved</StatusPill>}
              {v.hash === tool.latest && v.hash !== tool.approved && <StatusPill tone="warning">Latest</StatusPill>}
              <span className="min-w-0 text-xs text-zinc-500">
                {v.hash === tool.approved && tool.approved_by ? `Approved by ${tool.approved_by} · ` : ""}
                {origin(v)} · {v.author} · {when(v.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="activity-heading" className="mt-8">
        <h2 id="activity-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Recent runs</h2>
        {activity.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">No runs yet. Every run appears here and in the activity log, with its inputs.</p>
        ) : (
          <ul className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
            {activity.slice(0, 20).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-mono text-xs text-zinc-200">{e.query ?? e.summary}</p>
                  <p className="mt-1 text-xs text-zinc-500">{e.actor} · {when(e.at)}{e.detail ? ` · ${e.detail}` : ""}</p>
                </div>
                {e.outcome === "ok" ? <StatusPill tone="success">OK</StatusPill> : e.outcome === "refused" ? <StatusPill tone="warning">Refused</StatusPill> : <StatusPill tone="error">Failed</StatusPill>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 flex flex-wrap gap-3 border-t border-zinc-800 pt-6">
        <Link href={`/data-sources/tools/new?from=${encodeURIComponent(tool.name)}`} className={secondaryButton}>Edit (makes a new version)</Link>
        <button type="button" className={`${secondaryButton} text-red-300`} onClick={remove}>Remove</button>
      </div>
    </div>
  );
}
