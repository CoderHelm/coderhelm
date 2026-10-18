"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { ToolSwitch } from "@/components/tools";
import { inputClass, linkButton, primaryButton, secondaryButton, focusRing } from "@/components/ui";
import Link from "next/link";
import { KIND_LABEL, agentHref, ago, handle, skillsApi, type Skill, type SkillKind, type SkillRepo, type SkillWithBody } from "@/lib/skills";

export default function SkillsPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <SkillsPage />
    </RoleGuard>
  );
}

const KINDS: SkillKind[] = ["skill", "agent", "command"];

function SkillsPage() {
  const { toast } = useToast();
  const [repos, setRepos] = useState<SkillRepo[] | null>(null);
  const [items, setItems] = useState<Skill[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [open, setOpen] = useState<SkillWithBody | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await skillsApi.list();
      setRepos(r.repos);
      setItems(r.items);
      setCanManage(r.can_manage);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
      setRepos((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A sync runs in the background: check back while one is waiting for its
  // first read.
  const waiting = repos?.some((r) => !r.synced_at) ?? false;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5_000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    const repo = newRepo.trim();
    if (!repo) return;
    run("connect", async () => {
      await skillsApi.connect(repo);
      setNewRepo("");
      toast(`Connected ${repo}. Reading it now.`);
      await load();
    });
  };

  const sync = (repo: string) =>
    run(`sync:${repo}`, async () => {
      await skillsApi.sync(repo);
      toast(`Reading ${repo} again. This takes a few seconds.`);
      setTimeout(load, 4_000);
    });

  const disconnect = (repo: string) => {
    if (!window.confirm(`Disconnect ${repo}? Coderhelm forgets every skill read from it.`)) return;
    run(`disconnect:${repo}`, async () => {
      await skillsApi.disconnect(repo);
      toast(`Disconnected ${repo}`);
      setOpen(null);
      await load();
    });
  };

  const toggle = (s: Skill) =>
    run(`${s.repo}#${s.path}`, async () => {
      const r = await skillsApi.setEnabled(s.repo, s.path, !s.enabled);
      setItems((prev) => prev.map((x) => (x.repo === s.repo && x.path === s.path ? { ...x, enabled: r.enabled } : x)));
      toast(r.enabled ? `${s.name} is on` : `${s.name} is off`);
    });

  const view = (s: Skill) => {
    if (open && open.repo === s.repo && open.path === s.path) {
      setOpen(null);
      return;
    }
    run(`view:${s.repo}#${s.path}`, async () => setOpen(await skillsApi.item(s.repo, s.path)));
  };

  const grouped = useMemo(() => KINDS.map((k) => ({ kind: k, list: items.filter((i) => i.kind === k) })).filter((g) => g.list.length > 0), [items]);
  const on = items.filter((i) => i.enabled).length;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-zinc-100 text-balance">Skills</h1>
      <p className="mt-2 max-w-prose text-sm text-zinc-400">
        Keep your team&apos;s skills, agent briefs and commands in a repository, and Coderhelm&apos;s planner, coder and reviewer read
        the ones that fit the work, and can ask your agents a question. Coderhelm reads the default branch, so only merged
        changes count, and reads it again on every push. Nothing in them is ever run, and they can&apos;t give Coderhelm any
        access it doesn&apos;t already have: an agent that&apos;s asked gets no tools, only its brief and what it&apos;s sent.
      </p>

      {error && (
        <div className="mt-6">
          <Callout variant="error" title="We couldn't load your skills">
            <p>{error} Reload the page to try again.</p>
          </Callout>
        </div>
      )}

      <section aria-labelledby="repos-heading" className="mt-8">
        <h2 id="repos-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Repositories</h2>
        {repos === null ? (
          <p role="status" className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="space-y-3">
            {repos.length === 0 && (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
                No repository connected. Coderhelm reads <code className="text-zinc-300">skills/&lt;name&gt;/SKILL.md</code>,{" "}
                <code className="text-zinc-300">agents/&lt;name&gt;.md</code> and <code className="text-zinc-300">commands/&lt;name&gt;.md</code>,
                also under <code className="text-zinc-300">.claude/</code>.
              </p>
            )}
            {repos.map((r) => (
              <div key={r.repo} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-zinc-100 [overflow-wrap:anywhere]">{r.repo}</span>
                      {!r.synced_at ? (
                        <StatusPill tone="warning">Reading…</StatusPill>
                      ) : r.error ? (
                        <StatusPill tone="error">Last sync failed</StatusPill>
                      ) : (
                        <StatusPill tone="success">In step</StatusPill>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {r.items} item{r.items === 1 ? "" : "s"}
                      {r.sha && <> · commit <span className="font-mono">{r.sha.slice(0, 7)}</span></>}
                      {r.synced_at && <> · checked {ago(r.synced_at)}</>}
                      {r.added_by && <> · added by {r.added_by}</>}
                    </p>
                    {r.error && <p className="mt-2 text-sm text-red-300">{r.error}</p>}
                    {r.skipped.length > 0 && (
                      <details className="mt-2 text-xs text-zinc-500">
                        <summary className={`cursor-pointer rounded ${focusRing}`}>{r.skipped.length} file{r.skipped.length === 1 ? "" : "s"} left out</summary>
                        <ul className="mt-1 list-disc pl-5 space-y-0.5">
                          {r.skipped.map((s) => (
                            <li key={s} className="[overflow-wrap:anywhere]">{s}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <button type="button" className={secondaryButton} disabled={busy === `sync:${r.repo}`} onClick={() => sync(r.repo)}>
                        {busy === `sync:${r.repo}` ? "Starting…" : "Sync now"}
                      </button>
                      <button type="button" className={secondaryButton} disabled={busy === `disconnect:${r.repo}`} onClick={() => disconnect(r.repo)}>
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {canManage && (
              <form onSubmit={connect} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
                <label className="min-w-0 flex-1 basis-64 text-sm text-zinc-300">
                  Connect a repository
                  <input
                    className={`${inputClass} mt-1.5 font-mono`}
                    placeholder="owner/name"
                    value={newRepo}
                    onChange={(e) => setNewRepo(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span className="mt-1.5 block text-xs text-zinc-500">
                    Coderhelm&apos;s GitHub App must be installed on it. Every item starts switched on; switch off any you don&apos;t want used.
                  </span>
                </label>
                <button type="submit" className={primaryButton} disabled={busy === "connect" || !newRepo.trim()}>
                  {busy === "connect" ? "Connecting…" : "Connect"}
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {grouped.map((g) => (
        <section key={g.kind} aria-labelledby={`${g.kind}-heading`} className="mt-8">
          <h2 id={`${g.kind}-heading`} className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            {KIND_LABEL[g.kind]} <span className="ml-1 text-zinc-600">({g.list.length})</span>
          </h2>
          <ul className="space-y-3">
            {g.list.map((s) => {
              const key = `${s.repo}#${s.path}`;
              const isOpen = open?.repo === s.repo && open.path === s.path;
              return (
                <li key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex flex-wrap items-center gap-2">
                        {s.kind === "agent" ? (
                          <Link
                            href={agentHref(s)}
                            className={`font-mono font-semibold text-zinc-100 hover:underline rounded [overflow-wrap:anywhere] ${focusRing}`}
                          >
                            {handle(s, items)}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className={`font-mono font-semibold text-zinc-100 hover:underline rounded text-left [overflow-wrap:anywhere] ${focusRing}`}
                            aria-expanded={isOpen}
                            onClick={() => view(s)}
                          >
                            {handle(s, items)}
                          </button>
                        )}
                        {s.kind === "agent" && (
                          <>
                            <StatusPill tone="success">Agent · can be asked</StatusPill>
                            <Link href={agentHref(s)} className={`${linkButton} text-xs`}>
                              {canManage ? "Open, see asks, try it" : "Open, see asks"}
                            </Link>
                          </>
                        )}
                      </div>
                      {s.description && <p className="mt-1 text-sm text-zinc-400">{s.description}</p>}
                      <p className="mt-1 text-xs text-zinc-500 [overflow-wrap:anywhere]">
                        {s.repo} · {s.path}
                        {s.files.length > 0 && <> · {s.files.length} file{s.files.length === 1 ? "" : "s"} with it</>}
                        {" · "}
                        {s.uses > 0 ? `read ${s.uses} time${s.uses === 1 ? "" : "s"}, last by the ${s.last_used_by} ${ago(s.last_used_at)}` : "not read yet"}
                      </p>
                    </div>
                    {canManage ? (
                      <ToolSwitch on={s.enabled} label={`Let Coderhelm read ${s.name}`} busy={busy === key} onToggle={() => toggle(s)} />
                    ) : (
                      <StatusPill tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "On" : "Off"}</StatusPill>
                    )}
                  </div>
                  {isOpen && open && (
                    <div className="mt-4">
                      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-300">{open.body}</pre>
                      {open.files.length > 0 && (
                        <p className="mt-2 text-xs text-zinc-500 [overflow-wrap:anywhere]">Files with it: {open.files.join(", ")}</p>
                      )}
                      <button type="button" className={`${linkButton} mt-2 text-sm`} onClick={() => setOpen(null)}>
                        Close
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {items.length > 0 && (
        <p className="mt-8 text-xs text-zinc-500">
          {on} of {items.length} switched on. Coderhelm lists the ones that are on to its agents, and each agent reads at most 20 in one
          run.
        </p>
      )}
    </div>
  );
}
