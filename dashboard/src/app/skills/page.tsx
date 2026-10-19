"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RoleGuard } from "@/components/role-guard";
import { ActivitySummaryStrip } from "@/components/activity-summary";
import { Skeleton } from "@/components/skeleton";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { ToolSwitch } from "@/components/tools";
import { inputClass, linkButton, primaryButton, secondaryButton, focusRing } from "@/components/ui";
import Link from "next/link";
import { KIND_LABEL, agentHref, ago, handle, pageHref, skillsApi, thinDescription, type Skill, type SkillKind, type SkillRepo, type SkillStats } from "@/lib/skills";
import { Page, PageHeader } from "@/components/page";
import { CompatBadge, CompatOverview, matchesCompatFilter } from "./compat";
import { AlwaysApplyBadge, SuggestionHint } from "./always-apply";
import { UsageStats } from "./usage-stats";
import { NO_FILTERS, SkillActivity, type ActivityFilters } from "./skill-activity";
import { RANGES, type Range } from "@/lib/activity";

/** The tools an item asks for in its front matter that it won't get. */
function MissingTools({ item }: { item: Skill }) {
  const tools = item.missing_tools ?? [];
  return (
    <div role="note" className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <p>
        {item.kind === "agent" ? "Lists tools it won't get" : "Asks for tools Coderhelm doesn't have"}:{" "}
        <span className="font-mono [overflow-wrap:anywhere]">{tools.join(", ")}</span>.
      </p>
      <p className="mt-0.5 text-amber-200/80">
        {item.kind === "agent"
          ? "Team agents answer without tools, so Coderhelm will run it without those tools."
          : "Coderhelm will run it without those tools."}
      </p>
    </div>
  );
}

export default function SkillsPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <SkillsPage />
      </Suspense>
    </RoleGuard>
  );
}

type Tab = "library" | "activity";

/** The activity filters an address carries. */
function filtersFrom(params: URLSearchParams): ActivityFilters {
  const repo = params.get("repo") ?? "";
  const path = params.get("path") ?? "";
  const action = params.get("action");
  const range = params.get("range") as Range | null;
  return {
    item: repo && path ? `${repo}#${path}` : "",
    by: params.get("by") ?? "",
    action: action === "read" || action === "ask" || action === "apply" ? action : "",
    outcome: params.get("outcome") ?? "",
    range: range && RANGES.some((r) => r.value === range) ? range : "all",
    q: params.get("q") ?? "",
  };
}

/** Library and Activity, as tabs. Arrow keys move between them. */
function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "library", label: "Library" },
    { id: "activity", label: "Activity" },
  ];
  return (
    <div role="tablist" aria-label="Skills" className="mt-6 flex gap-1 border-b border-zinc-800">
      {tabs.map((t, i) => {
        const on = t.id === tab;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const nextTab = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
              onChange(nextTab.id);
              document.getElementById(`tab-${nextTab.id}`)?.focus();
            }}
            className={`-mb-px min-h-10 rounded-t-md border-b-2 px-4 py-2 text-sm ${
              on ? "border-zinc-100 font-semibold text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200"
            } ${focusRing}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const KINDS: SkillKind[] = ["skill", "agent", "command"];

function SkillsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramString = params.toString();
  // The page's own state leads; the address follows it, so quick changes in a
  // row never read a stale address. A change to the address from outside (a
  // summary link, back) is taken in.
  const [nav, setNav] = useState(() => ({
    tab: (params.get("tab") === "activity" ? "activity" : "library") as Tab,
    filters: filtersFrom(params),
  }));
  const written = useRef(new Set<string>());
  useEffect(() => {
    if (written.current.has(paramString)) return;
    written.current.clear();
    const q = new URLSearchParams(paramString);
    setNav({ tab: q.get("tab") === "activity" ? "activity" : "library", filters: filtersFrom(q) });
  }, [paramString]);
  const { tab, filters } = nav;

  const go = useCallback(
    (nextTab: Tab, f: ActivityFilters) => {
      const q = new URLSearchParams();
      if (nextTab === "activity") {
        q.set("tab", "activity");
        const i = f.item.indexOf("#");
        if (i > 0) {
          q.set("repo", f.item.slice(0, i));
          q.set("path", f.item.slice(i + 1));
        }
        if (f.by) q.set("by", f.by);
        if (f.action) q.set("action", f.action);
        if (f.outcome) q.set("outcome", f.outcome);
        if (f.range !== "all") q.set("range", f.range);
        if (f.q) q.set("q", f.q);
      }
      const s = q.toString();
      setNav({ tab: nextTab, filters: f });
      written.current.add(s);
      router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
    },
    [router, pathname],
  );
  const setFilters = useCallback((f: ActivityFilters) => go("activity", f), [go]);
  const [repos, setRepos] = useState<SkillRepo[] | null>(null);
  const [items, setItems] = useState<Skill[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [stats, setStats] = useState<SkillStats | null>(null);
  const [compatFilter, setCompatFilter] = useState("");

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
    // The stats are extra: the page works without them.
    skillsApi.stats().then((s) => setStats(Array.isArray(s?.days) ? s : null), () => setStats(null));
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
      await load();
    });
  };

  const toggle = (s: Skill) =>
    run(`${s.repo}#${s.path}`, async () => {
      const r = await skillsApi.setEnabled(s.repo, s.path, !s.enabled);
      setItems((prev) => prev.map((x) => (x.repo === s.repo && x.path === s.path ? { ...x, enabled: r.enabled } : x)));
      toast(r.enabled ? `${s.name} is on` : `${s.name} is off`);
    });

  const recheck = (repo: string) =>
    run(`recheck:${repo}`, async () => {
      await skillsApi.recheck(repo);
      toast(`Checking every item in ${repo} again. Each takes about a minute; this page updates as they land.`);
      setTimeout(load, 20_000);
    });

  const grouped = useMemo(
    () =>
      KINDS.map((k) => ({ kind: k, list: items.filter((i) => i.kind === k && matchesCompatFilter(i, compatFilter)) })).filter((g) => g.list.length > 0),
    [items, compatFilter],
  );
  const on = items.filter((i) => i.enabled).length;

  return (
    <Page>
      <PageHeader
        title="Skills"
        lead={
          <>
            Keep your team&apos;s skills, agent briefs and commands in a repository, and Coderhelm&apos;s planner, coder and reviewer read
            the ones that fit the work, and can ask your agents a question. Coderhelm reads the default branch, so only merged changes
            count, and reads it again on every push. Nothing in them is ever run, and they can&apos;t give Coderhelm any access it
            doesn&apos;t already have: an agent that&apos;s asked gets only the read-only tools its own file lists, its brief and what it&apos;s sent.
          </>
        }
      />

      {error && (
        <div className="mt-6">
          <Callout variant="error" title="We couldn't load your skills">
            <p>{error} Reload the page to try again.</p>
          </Callout>
        </div>
      )}

      <Tabs tab={tab} onChange={(t) => go(t, t === "activity" ? filters : NO_FILTERS)} />

      {tab === "activity" ? (
        <div role="tabpanel" id="panel-activity" aria-labelledby="tab-activity">
          <p className="mt-4 max-w-prose text-sm text-zinc-400">
            Every time Coderhelm&apos;s planner, coder or reviewer reads a skill, a brief or a command, or asks one of your agents a
            question: who, during which pull request or ticket, the reason it gave, and how it went. Only that is kept, never the text
            read or the answer, for 180 days.
          </p>
          <ActivitySummaryStrip />
          <SkillActivity items={items} filters={filters} onFiltersChange={setFilters} heading="Reads and asks" />
        </div>
      ) : (
        <div role="tabpanel" id="panel-library" aria-labelledby="tab-library">
        <CompatOverview items={items} filter={compatFilter} onFilter={setCompatFilter} />
        {stats && items.length > 0 && <UsageStats stats={stats} />}

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
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={secondaryButton} disabled={busy === `sync:${r.repo}`} onClick={() => sync(r.repo)}>
                          {busy === `sync:${r.repo}` ? "Starting…" : "Sync now"}
                        </button>
                        {r.items > 0 && (
                          <button
                            type="button"
                            className={secondaryButton}
                            disabled={busy === `recheck:${r.repo}`}
                            onClick={() => recheck(r.repo)}
                            title="Check every item again against what your team has connected"
                          >
                            {busy === `recheck:${r.repo}` ? "Starting…" : "Re-check all"}
                          </button>
                        )}
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

        {compatFilter && (
          <p className="mt-6 text-sm text-zinc-400" role="status">
            Showing {grouped.reduce((n, g) => n + g.list.length, 0)} of {items.length} items.{" "}
            <button type="button" className={linkButton} onClick={() => setCompatFilter("")}>
              Show all
            </button>
          </p>
        )}
        {grouped.map((g) => (
          <section key={g.kind} aria-labelledby={`${g.kind}-heading`} className="mt-8">
            <h2 id={`${g.kind}-heading`} className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
              {KIND_LABEL[g.kind]} <span className="ml-1 text-zinc-600">({g.list.length})</span>
            </h2>
            <ul className="space-y-3">
              {g.list.map((s) => {
                const key = `${s.repo}#${s.path}`;
                return (
                  <li key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 basis-64">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={pageHref(s)}
                            className={`font-mono font-semibold text-zinc-100 hover:underline rounded [overflow-wrap:anywhere] ${focusRing}`}
                          >
                            {handle(s, items)}
                          </Link>
                          <CompatBadge item={s} />
                          <AlwaysApplyBadge item={s} />
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
                        <SuggestionHint item={s} />
                        {s.kind === "agent" && thinDescription(s.description) && (
                          <p className="mt-1 text-xs text-amber-300">
                            {s.description ? "Short description" : "No description"}: Coderhelm&apos;s agents decide when to ask it from this line.
                          </p>
                        )}
                        {s.compat?.summary && s.compat.current && (
                          <p className="mt-1 text-xs text-zinc-400">
                            <Link href={pageHref(s)} className={`hover:text-zinc-200 hover:underline rounded ${focusRing}`}>
                              {s.compat.summary}
                            </Link>
                            {s.use_translated && <span className="text-sky-300"> · agents read the translated version</span>}
                          </p>
                        )}
                        {!s.compat && (s.missing_tools?.length ?? 0) > 0 && <MissingTools item={s} />}
                        <p className="mt-1 text-xs text-zinc-500 [overflow-wrap:anywhere]">
                          {s.repo} · {s.path}
                          {s.files.length > 0 && <> · {s.files.length} file{s.files.length === 1 ? "" : "s"} with it</>}
                          {" · "}
                          {s.kind === "agent"
                            ? s.asks > 0
                              ? `asked ${s.asks} time${s.asks === 1 ? "" : "s"}, last ${ago(s.last_asked_at)}`
                              : "not asked yet"
                            : s.uses > 0
                              ? `read ${s.uses} time${s.uses === 1 ? "" : "s"}, last by the ${s.last_used_by} ${ago(s.last_used_at)}`
                              : "not read yet"}
                        </p>
                      </div>
                      {canManage ? (
                        <ToolSwitch on={s.enabled} label={`Let Coderhelm read ${s.name}`} busy={busy === key} onToggle={() => toggle(s)} />
                      ) : (
                        <StatusPill tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "On" : "Off"}</StatusPill>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {items.length > 0 && (
          <p className="mt-8 text-xs text-zinc-500">
            {on} of {items.length} switched on. Coderhelm lists the ones that are on to its agents, and each agent reads at most 20 in one
            run. Ones set to always apply are given in full to matching work instead.
          </p>
        )}
        </div>
      )}
    </Page>
  );
}
