"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RoleGuard } from "@/components/role-guard";
import { ActivitySummaryStrip } from "@/components/activity-summary";
import { StatusPill } from "@/components/status-pill";
import {
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSection,
  ListSkeleton,
  ListToolbar,
  Time,
  useListParams,
  type Tone,
} from "@/components/list";
import { useToast } from "@/components/toast";
import { ToolSwitch } from "@/components/tools";
import { inputClass, linkButton, primaryButton, secondaryButton, focusRing } from "@/components/ui";
import Link from "next/link";
import { KIND_LABEL, agentHref, ago, handle, pageHref, skillsApi, thinDescription, type Skill, type SkillKind, type SkillRepo, type SkillStats } from "@/lib/skills";
import { Page, PageHeader } from "@/components/page";
import { CompatBadge, CompatOverview, matchesCompatFilter } from "./compat";
import { AlwaysApplyBadge, SuggestionHint } from "./always-apply";
import { ReviewStepsBadge } from "./review-steps";
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
      <Suspense fallback={<Page><PageHeader title="Skills" /><div className="mt-8"><ListSkeleton rows={4} label="Loading your skills" /></div></Page>}>
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

type LibraryFilter = "all" | "on" | "off" | "look";

/** Items whose check found something to fix: tools it needs, a failed or partial check. */
function needsALook(s: Skill): boolean {
  return ["needs_tools", "failed", "partial"].some((f) => matchesCompatFilter(s, f)) || (!s.compat && (s.missing_tools?.length ?? 0) > 0);
}

function repoTone(r: SkillRepo): Tone {
  if (!r.synced_at) return "live";
  return r.error ? "danger" : "success";
}

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
    filters: params.get("tab") === "activity" ? filtersFrom(params) : NO_FILTERS,
  }));
  const written = useRef(new Set<string>());
  useEffect(() => {
    if (written.current.has(paramString)) return;
    written.current.clear();
    const q = new URLSearchParams(paramString);
    // The library's own search (?q=) is not the activity log's.
    const activity = q.get("tab") === "activity";
    setNav({ tab: activity ? "activity" : "library", filters: activity ? filtersFrom(q) : NO_FILTERS });
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
  // The library's toolbar: ?q=, ?status=, ?repo= (only read on the Library tab).
  const [lib, setLib] = useListParams({ q: "", status: "all", repo: "" });
  const libFilter: LibraryFilter = (["on", "off", "look"] as const).find((f) => f === lib.status) ?? "all";

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

  const libQ = lib.q.trim().toLowerCase();
  const searched = useMemo(
    () =>
      items.filter(
        (i) =>
          (!lib.repo || i.repo === lib.repo) &&
          (!libQ || [i.name, `${i.kind}:${i.name}`, i.description, i.repo, i.path].some((t) => t.toLowerCase().includes(libQ))),
      ),
    [items, lib.repo, libQ],
  );
  const grouped = useMemo(() => {
    const keep: Record<LibraryFilter, (s: Skill) => boolean> = {
      all: () => true,
      on: (s) => s.enabled,
      off: (s) => !s.enabled,
      look: needsALook,
    };
    return KINDS.map((k) => ({
      kind: k,
      list: searched.filter((i) => i.kind === k && matchesCompatFilter(i, compatFilter) && keep[libFilter](i)),
    })).filter((g) => g.list.length > 0);
  }, [searched, compatFilter, libFilter]);
  const libFiltered = !!libQ || libFilter !== "all" || !!lib.repo;
  const clearLib = () => setLib({ q: "", status: "all", repo: "" });
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
          <ListError title="We couldn't load your skills" onRetry={load}>
            {error}
          </ListError>
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

        <div className="mt-8">
          <ListSection id="repos" title="Repositories" count={repos?.length || undefined}>
            {repos === null ? (
              <ListSkeleton rows={2} label="Loading your repositories" />
            ) : (
              <div className="space-y-3">
                {repos.length === 0 && (
                  <ListEmpty title="No repository connected.">
                    Coderhelm reads <code className="text-zinc-300">skills/&lt;name&gt;/SKILL.md</code>,{" "}
                    <code className="text-zinc-300">agents/&lt;name&gt;.md</code> and <code className="text-zinc-300">commands/&lt;name&gt;.md</code>,
                    also under <code className="text-zinc-300">.claude/</code>.
                  </ListEmpty>
                )}
                {repos.length > 0 && (
                  <List label="Connected repositories">
                    {repos.map((r) => (
                      <ListRow
                        key={r.repo}
                        testId="skills-repo"
                        status={{ tone: repoTone(r) }}
                        title={r.repo}
                        meta={[
                          `${r.items} item${r.items === 1 ? "" : "s"}`,
                          r.sha ? <>commit <span className="font-mono">{r.sha.slice(0, 7)}</span></> : null,
                          r.synced_at ? <>checked <Time iso={r.synced_at} /></> : null,
                          r.added_by ? `added by ${r.added_by}` : null,
                        ]}
                        chips={
                          !r.synced_at ? (
                            <StatusPill tone="warning">Reading…</StatusPill>
                          ) : r.error ? (
                            <StatusPill tone="error">Last sync failed</StatusPill>
                          ) : (
                            <StatusPill tone="success">In step</StatusPill>
                          )
                        }
                        actions={
                          canManage ? (
                            <>
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
                            </>
                          ) : undefined
                        }
                      >
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
                      </ListRow>
                    ))}
                  </List>
                )}
                {canManage && (
                  <form onSubmit={connect} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-zinc-800 px-4 py-4">
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
          </ListSection>
        </div>

        {items.length >= 2 && (
          <ListToolbar
            className="mt-8"
            search={{
              value: lib.q,
              onChange: (v) => setLib({ q: v }, { replace: true }),
              placeholder: "Find by name, description, repo or path",
              label: "Find a skill, agent or command",
            }}
            status={{
              label: "Show items",
              value: libFilter,
              onChange: (v) => setLib({ status: v }),
              options: [
                { value: "all", label: "All", count: searched.length },
                { value: "on", label: "On", count: searched.filter((i) => i.enabled).length, tone: "success" },
                { value: "off", label: "Off", count: searched.filter((i) => !i.enabled).length, tone: "muted" },
                { value: "look", label: "Needs a look", count: searched.filter(needsALook).length, tone: "waiting" },
              ],
            }}
            repo={{ value: lib.repo, onChange: (v) => setLib({ repo: v }), repos: (repos ?? []).map((r) => r.repo) }}
            onClear={libFiltered ? clearLib : undefined}
          />
        )}
        {libFiltered && items.length > 0 && grouped.length === 0 && (
          <div className="mt-6">
            <ListEmpty title="Nothing matches these filters." onClear={clearLib} />
          </div>
        )}

        {compatFilter && (
          <p className="mt-6 text-sm text-zinc-400" role="status">
            Showing {grouped.reduce((n, g) => n + g.list.length, 0)} of {items.length} items.{" "}
            <button type="button" className={linkButton} onClick={() => setCompatFilter("")}>
              Show all
            </button>
          </p>
        )}
        {grouped.map((g) => (
          <div key={g.kind} className="mt-8">
            <ListSection id={`${g.kind}-list`} title={KIND_LABEL[g.kind]} count={g.list.length}>
              <List label={KIND_LABEL[g.kind]}>
                {g.list.map((s) => {
                  const key = `${s.repo}#${s.path}`;
                  return (
                    <ListRow
                      key={key}
                      testId="skill-item"
                      status={{ tone: !s.enabled ? "muted" : needsALook(s) ? "waiting" : "success" }}
                      title={<span className="font-mono">{handle(s, items)}</span>}
                      href={pageHref(s)}
                      meta={[
                        <span key="where" className="[overflow-wrap:anywhere]">{s.repo} · {s.path}</span>,
                        s.files.length > 0 ? `${s.files.length} file${s.files.length === 1 ? "" : "s"} with it` : null,
                        s.kind === "agent"
                          ? s.asks > 0
                            ? `asked ${s.asks} time${s.asks === 1 ? "" : "s"}, last ${ago(s.last_asked_at)}`
                            : "not asked yet"
                          : s.uses > 0
                            ? `read ${s.uses} time${s.uses === 1 ? "" : "s"}, last by the ${s.last_used_by} ${ago(s.last_used_at)}`
                            : "not read yet",
                      ]}
                      chips={
                        <>
                          <CompatBadge item={s} />
                          <AlwaysApplyBadge item={s} short />
                          <ReviewStepsBadge item={s} />
                          {s.kind === "agent" && <StatusPill tone="success">Agent · can be asked</StatusPill>}
                        </>
                      }
                      actions={
                        canManage ? (
                          <ToolSwitch on={s.enabled} label={`Let Coderhelm read ${s.name}`} busy={busy === key} onToggle={() => toggle(s)} />
                        ) : (
                          <StatusPill tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "On" : "Off"}</StatusPill>
                        )
                      }
                    >
                      {s.description && <p className="mt-1 text-sm text-zinc-400">{s.description}</p>}
                      {s.kind === "agent" && (
                        <Link href={agentHref(s)} className={`${linkButton} mt-1 text-xs`}>
                          {canManage ? "Open, see asks, try it" : "Open, see asks"}
                        </Link>
                      )}
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
                    </ListRow>
                  );
                })}
              </List>
            </ListSection>
          </div>
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
