"use client";

// Stale PRs, a tab of Code review: what the stale cleanup marked, what it
// would mark or close next, what it closed, what it leaves alone, and its
// settings. Activity first; the settings are the last view, with one
// "Settings for" control (all repositories, or one).

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ANY_CHANGE } from "@/lib/capabilities";
import { useCan } from "@/hooks/use-can";
import { api, type StaleActivity, type StaleConfigView, type StaleKeptOpen } from "@/lib/api";
import {
  STATE_WORD,
  closesAt,
  closesWords,
  daysQuiet,
  daysUntil,
  exemptRows,
  isMarked,
  isUpNext,
  otherRepoModes,
  plansOf,
  plural,
  rowsOf,
  staleState,
  type StaleRow,
  type StaleState,
} from "@/lib/stale";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Tabs } from "@/components/tabs";
import { useToast } from "@/components/toast";
import { Disclosure } from "@/components/disclosure";
import { Code } from "@/components/settings";
import { SettingsScope } from "@/components/settings-scope";
import { buttonClass, linkButton, primaryButton } from "@/components/ui";
import {
  Chip,
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  StatusText,
  formatDate,
  timeAgo,
  useListParams,
  useTeamRepos,
  type StatusLook,
} from "@/components/list";
import { StaleSection, staleSummary } from "../config/stale";

export default function StalePageGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <Suspense
        fallback={
          <Page>
            <PageHeader title="Stale pull requests" />
            <div className="mt-6">
              <ListSkeleton />
            </div>
          </Page>
        }
      >
        <StalePage />
      </Suspense>
    </RoleGuard>
  );
}

const VIEWS = ["stale", "next", "closed", "exempt", "settings"] as const;
type View = (typeof VIEWS)[number];

const STATE_LOOK: Record<StaleState, StatusLook> = {
  off: { label: STATE_WORD.off, tone: "muted" },
  dry_run: { label: STATE_WORD.dry_run, tone: "waiting" },
  on: { label: STATE_WORD.on, tone: "success" },
};

const LEAD = "Marks pull requests nobody has worked on for a while, warns on them, and closes them after a grace period. The branch is kept.";

const shortRepo = (r: string) => r.split("/").pop() || r;

function matches(q: string, ...bits: (string | number | undefined)[]): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().replace(/^#/, "");
  return bits.some((b) => b !== undefined && String(b).toLowerCase().includes(needle));
}

function StalePage() {
  const { toast } = useToast();
  const { ready, can } = useCan();
  const admin = ready && can("agent_settings");
  const readOnly = ready && !admin;
  const [params, setParams] = useListParams({ view: "stale", repo: "", q: "" });
  const view: View = (VIEWS as readonly string[]).includes(params.view) ? (params.view as View) : "stale";
  const repo = params.repo;
  const q = params.q.trim();
  const teamRepos = useTeamRepos();

  const [config, setConfig] = useState<StaleConfigView | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [activity, setActivity] = useState<StaleActivity | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // What applies to the repository picked (or the team's), for the state at the top.
  useEffect(() => {
    let live = true;
    setConfigFailed(false);
    api
      .getStaleConfig(repo || undefined)
      .then((c) => live && setConfig(c))
      .catch(() => live && setConfigFailed(true));
    return () => {
      live = false;
    };
  }, [repo, attempt]);

  // Every repository's plan at once; the repo filter and search narrow it here.
  useEffect(() => {
    let live = true;
    setFailed(null);
    api
      .getStaleActivity()
      .then((a) => live && setActivity(a))
      .catch((e: unknown) => live && setFailed(e instanceof Error ? e.message : "Could not load"));
    return () => {
      live = false;
    };
  }, [attempt]);

  const state: StaleState | null = config ? staleState(config.effective) : configFailed ? "off" : null;
  const applies = config?.effective;

  const allRows = useMemo(() => rowsOf(activity, repo), [activity, repo]);
  const inRepo = useCallback((r: string | undefined) => !repo || r === repo, [repo]);
  const rows = allRows.filter((r) => inRepo(r.repo));
  const kept: StaleKeptOpen[] = (activity?.kept_open ?? []).filter((k) => inRepo(k.repo ?? repo));
  const closed = (activity?.log ?? []).filter((e) => e.action === "closed" && inRepo(e.repo));

  const marked = rows.filter(isMarked).sort((a, b) => (closesAt(a) ?? "").localeCompare(closesAt(b) ?? ""));
  const upNext = rows.filter(isUpNext);
  const exempt = exemptRows(rows, kept);

  const shownMarked = marked.filter((r) => matches(q, r.pr, r.title, r.author, r.repo));
  const shownNext = upNext.filter((r) => matches(q, r.pr, r.title, r.author, r.repo));
  const shownClosed = closed.filter((e) => matches(q, e.pr, e.title, e.author, e.repo));
  const shownExempt = exempt.filter((r) => matches(q, r.pr, r.title, r.author, r.repo, r.why));
  const shownKept = kept.filter((k) => matches(q, k.pr, k.title, k.by, k.repo));

  const repoNames = useMemo(() => {
    const s = new Set(teamRepos);
    for (const p of plansOf(activity)) if (p.repo) s.add(p.repo);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [teamRepos, activity]);

  const nextLabel = state === "on" ? "Up next" : "Would mark or close";
  const tabHref = (v: View) => {
    const sp = new URLSearchParams();
    if (v !== "stale") sp.set("view", v);
    if (repo) sp.set("repo", repo);
    if (q && v !== "settings") sp.set("q", q);
    const s = sp.toString();
    return `/reviewer/stale${s ? `?${s}` : ""}`;
  };
  const count = (n: number | null) => (n === null || n === 0 ? undefined : <span className="tabular-nums text-xs text-zinc-400">{n}</span>);
  const loaded = !!activity;
  const tabs = [
    { value: "stale", label: "Marked stale", href: tabHref("stale"), count: count(loaded ? marked.length : null), countText: loaded ? String(marked.length) : undefined },
    { value: "next", label: nextLabel, href: tabHref("next"), count: count(loaded ? upNext.length : null), countText: loaded ? String(upNext.length) : undefined },
    { value: "closed", label: "Recently closed", href: tabHref("closed"), count: count(loaded ? closed.length : null), countText: loaded ? String(closed.length) : undefined },
    { value: "exempt", label: "Exempt", href: tabHref("exempt"), count: count(loaded ? exempt.length + kept.length : null), countText: loaded ? String(exempt.length + kept.length) : undefined },
    { value: "settings", label: "Settings", href: tabHref("settings") },
  ];

  const turnOn = async () => {
    if (!config) return;
    setBusy("turn-on");
    try {
      // Preview only (enabled with dry_run): nothing changes on GitHub until someone picks On.
      await api.saveStaleConfig({ ...config.team, enabled: true, dry_run: true });
      toast("Turned on as Preview only. Nothing changes on GitHub until you pick On.");
      setParams({ view: "next" });
      reload();
    } catch (e) {
      toast(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can turn it on." : "Could not turn it on. Try again.", "error");
    }
    setBusy(null);
  };

  const checkNow = async () => {
    const targets = repo ? [repo] : repoNames.slice(0, 25);
    if (!targets.length) return;
    setBusy("check");
    let ok = 0;
    for (const r of targets) {
      try {
        await api.previewStale(r);
        ok += 1;
      } catch {
        /* counted below */
      }
    }
    if (ok) {
      toast(`Checking ${repo ? shortRepo(repo) : plural(ok, "repository", "repositories")} now. The list updates in a minute or two.`);
      window.setTimeout(reload, 20_000);
    } else {
      toast("Could not start the check. Try again.", "error");
    }
    setBusy(null);
  };

  const keep = async (r: { repo?: string; pr: number; title: string; url: string }, value: boolean) => {
    const target = r.repo || repo;
    if (!target) return;
    setBusy(`keep-${target}-${r.pr}`);
    try {
      await api.setStaleKeepOpen(target, r.pr, value, r.title, r.url);
      toast(value ? `#${r.pr} stays open` : `#${r.pr} can be closed again`);
      reload();
    } catch {
      toast("Could not change it. Try again.", "error");
    }
    setBusy(null);
  };

  // The header's one action follows the state. Settings is never one: the
  // Settings tab right below is the way there. Off, the banner under the
  // header carries the way to turn it on.
  const primary =
    state === "dry_run" ? (
      <Link href={tabHref("next")} className={primaryButton} data-testid="stale-primary" aria-current={view === "next" ? "page" : undefined}>
        Preview what it would close
      </Link>
    ) : null;

  const filtered = !!q || !!repo;
  const clear = () => setParams({ q: "", repo: "" });

  const freshness = (() => {
    const plans = plansOf(activity).filter((p) => inRepo(p.repo));
    if (!activity) return null;
    if (!plans.length) return "Not checked yet. Checking reads GitHub and changes nothing.";
    const latest = plans.map((p) => p.computed_at).sort().pop();
    const stopped = plans.find((p) => p.stopped)?.stopped;
    const where = repo ? shortRepo(repo) : plural(plans.length, "repository", "repositories");
    return `${where} checked, latest ${timeAgo(latest)}.${stopped ? ` Stopped early: ${stopped}.` : ""}`;
  })();

  return (
    <Page>
      <PageHeader
        title="Stale pull requests"
        status={state ? <span data-testid="stale-state" data-state={state}><StatusText look={STATE_LOOK[state]} /></span> : undefined}
        lead={
          <>
            <p>{LEAD}</p>
            {applies && state !== "off" && (
              <p className="mt-1 text-zinc-500" data-testid="stale-applies">
                {staleSummary(applies)}
                {repo && config?.repo ? ` ${shortRepo(repo)} has its own settings.` : ""}
              </p>
            )}
          </>
        }
        actions={primary}
      />

      {state === "off" && view !== "settings" && (
        <OffBanner
          admin={admin}
          busy={busy === "turn-on"}
          onTurnOn={turnOn}
          settingsHref={tabHref("settings")}
          others={otherRepoModes(config?.repo_configs, "off").filter((g) => !repo)}
        />
      )}

      <Tabs label="Stale pull request views" value={view} items={tabs} />

      <div className="mt-6 min-w-0" data-testid="stale-view" data-view={view}>
        {view === "settings" ? (
          <div className="min-w-0 space-y-6">
            <SettingsScope repos={repoNames.map((name) => ({ name }))} value={repo} onChange={(r) => setParams({ repo: r })} />
            <StaleSection
              key={repo || "all"}
              repo={repo}
              readOnly={readOnly}
              onSaved={reload}
              counts={loaded ? { marked: marked.length, next: upNext.length, nextHref: tabHref("next"), markedHref: tabHref("stale") } : undefined}
            />
          </div>
        ) : (
          <>
            <ListToolbar
              className="mb-4"
              search={{ value: params.q, onChange: (v) => setParams({ q: v }, { replace: true }), placeholder: "Search pull requests…", label: "Search stale pull requests" }}
              repo={{ value: repo, onChange: (v) => setParams({ repo: v }), repos: repoNames }}
              actions={
                view === "next" ? (
                  <button type="button" className={buttonClass("secondary", "sm")} onClick={checkNow} disabled={busy === "check" || (!repo && !repoNames.length)} data-testid="stale-check">
                    {busy === "check" ? "Starting…" : repo ? `Check ${shortRepo(repo)} now` : "Check all repos now"}
                  </button>
                ) : undefined
              }
              onClear={filtered ? clear : undefined}
              summary={freshness}
            />
            {failed ? (
              <ListError title="Could not load stale pull requests" onRetry={reload} details={failed} />
            ) : !activity ? (
              <ListSkeleton rows={4} label="Loading stale pull requests" />
            ) : view === "stale" ? (
              shownMarked.length ? (
                <List label="Marked stale">
                  {shownMarked.map((r) => (
                    <PlanRow key={`${r.repo}#${r.pr}`} r={r} state={state} admin={admin} busy={busy === `keep-${r.repo}-${r.pr}`} onKeep={() => keep(r, true)} />
                  ))}
                </List>
              ) : (
                <div data-testid="stale-empty-stale"><ListEmpty title={filtered ? "No marked pull requests match" : "Nothing is marked stale"} onClear={filtered ? clear : undefined}>
                  {state === "off"
                    ? "No open pull request carries the stale label. One marked earlier, or labeled by hand, shows here."
                    : state === "dry_run"
                      ? "Preview only marks nothing. What it would mark is under Would mark or close."
                      : "No open pull request has gone quiet long enough. Marked ones show here with the day they close."}
                </ListEmpty></div>
              )
            ) : view === "next" ? (
              shownNext.length ? (
                <List label={nextLabel}>
                  {shownNext.map((r) => (
                    <PlanRow key={`${r.repo}#${r.pr}`} r={r} state={state} admin={admin} busy={busy === `keep-${r.repo}-${r.pr}`} onKeep={() => keep(r, true)} />
                  ))}
                </List>
              ) : (
                <div data-testid="stale-empty-next"><ListEmpty title={filtered ? "Nothing matches" : "Nothing to mark or close"} onClear={filtered ? clear : undefined}>
                  {state === "off"
                    ? "No open pull request has gone quiet long enough to be marked if it were turned on. Check now to read GitHub again; it changes nothing."
                    : "No open pull request has gone quiet long enough. Check now to read GitHub again; it changes nothing."}
                </ListEmpty></div>
              )
            ) : view === "closed" ? (
              shownClosed.length ? (
                <List label="Recently closed">
                  {shownClosed.map((e) => (
                    <ListRow
                      key={`${e.at}-${e.repo}-${e.pr}`}
                      status={{ tone: "muted" }}
                      title={`#${e.pr} ${e.title}`}
                      titleText={e.title}
                      externalHref={e.url}
                      meta={[shortRepo(e.repo), e.author, `closed ${formatDate(e.at)}`, e.run_id ? "its run was closed" : ""]}
                      summary={e.why}
                      summaryTone="muted"
                      actions={
                        <a href={e.url} target="_blank" rel="noreferrer" className={`${linkButton} !text-sm`} data-testid="stale-reopen">
                          Reopen on GitHub
                        </a>
                      }
                      testId="stale-closed-row"
                    />
                  ))}
                </List>
              ) : (
                <div data-testid="stale-empty-closed"><ListEmpty title={filtered ? "No closed pull requests match" : "Nothing closed yet"} onClear={filtered ? clear : undefined}>
                  {state === "on"
                    ? "Pull requests closed as stale in the last 90 days show here, with a link to reopen each one."
                    : `${state === "off" ? "Cleanup is off" : "Preview only"}, so nothing is closed. Once it is On, pull requests closed as stale show here with a link to reopen each one.`}
                </ListEmpty></div>
              )
            ) : shownExempt.length + shownKept.length ? (
              <List label="Exempt">
                {shownKept.map((k) => (
                  <ListRow
                    key={`kept-${k.repo}-${k.pr}`}
                    status={{ tone: "info" }}
                    title={`#${k.pr} ${k.title || "Pull request"}`}
                    titleText={k.title}
                    externalHref={k.url}
                    meta={[k.repo ? shortRepo(k.repo) : "", `kept open by ${k.by}${k.via === "comment" ? " (comment)" : ""}`, formatDate(k.at)]}
                    chips={<Chip tone="info">Kept open</Chip>}
                    actions={
                      admin ? (
                        <button type="button" className={buttonClass("secondary", "sm")} disabled={busy === `keep-${k.repo ?? repo}-${k.pr}`} onClick={() => keep(k, false)}>
                          Allow closing
                        </button>
                      ) : undefined
                    }
                    testId="stale-kept-row"
                  />
                ))}
                {shownExempt.map((r) => (
                  <ListRow
                    key={`ex-${r.repo}-${r.pr}`}
                    status={{ tone: "neutral" }}
                    title={`#${r.pr} ${r.title}`}
                    titleText={r.title}
                    externalHref={r.url}
                    meta={[shortRepo(r.repo), r.author]}
                    summary={r.why ? r.why.charAt(0).toUpperCase() + r.why.slice(1) : undefined}
                    summaryTone="muted"
                    chips={<Chip tone="neutral">Exempt</Chip>}
                    testId="stale-exempt-row"
                  />
                ))}
              </List>
            ) : (
              <div data-testid="stale-empty-exempt"><ListEmpty title={filtered ? "Nothing exempt matches" : "Nothing exempt"} onClear={filtered ? clear : undefined}>
                Pull requests with an exempt label, by an exempt author, drafts, and ones kept open show here.
              </ListEmpty></div>
            )}
            <div className="mt-6 max-w-2xl">
              <Disclosure summary="Keep one open from GitHub">
                <p>
                  Comment <Code>@coderhelm keep open</Code> on the pull request, push a commit, or remove the stale label.
                </p>
              </Disclosure>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

function PlanRow({ r, state, admin, busy, onKeep }: { r: StaleRow; state: StaleState | null; admin: boolean; busy: boolean; onKeep: () => void }) {
  const quiet = daysQuiet(r);
  const days = daysUntil(closesAt(r));
  const would = r.dry_run;
  // A marked one while nothing acts: it carries the label, and nothing closes it.
  const idle = isMarked(r) && (state === "off" || state === "dry_run");
  const chip = idle ? (
    <Chip tone="muted">{state === "off" ? "Nothing closes it" : "Preview: not closed"}</Chip>
  ) : r.action === "mark" ? (
      <Chip tone="waiting">{would ? "Would mark" : "Marks next"}</Chip>
    ) : r.action === "close" ? (
      <Chip tone="danger">{would ? "Would close" : "Closing now"}</Chip>
    ) : (
      <Chip tone={days !== null && days <= 1 ? "danger" : "waiting"} title={closesAt(r) ? formatDate(closesAt(r)) : undefined}>
        {closesWords(days)}
      </Chip>
    );
  return (
    <ListRow
      status={{ tone: idle ? "muted" : r.action === "close" ? "danger" : "waiting" }}
      title={`#${r.pr} ${r.title}`}
      titleText={r.title}
      externalHref={r.url}
      meta={[
        shortRepo(r.repo),
        r.author,
        quiet !== null ? `quiet ${plural(quiet, "day")}` : "",
        r.action === "mark" && days !== null ? closesWords(days, would).toLowerCase() : "",
      ]}
      summary={
        [
          r.last_what ? `Last activity: ${r.last_what}, ${formatDate(r.last_activity)}.` : "",
          idle ? (state === "off" ? "Cleanup is off, so nothing closes it." : "Preview only, so nothing closes it.") : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      summaryTone="muted"
      chips={chip}
      actions={
        admin ? (
          <button type="button" className={buttonClass("secondary", "sm")} disabled={busy} onClick={onKeep} data-testid="stale-keep-open">
            Keep open
          </button>
        ) : undefined
      }
      testId="stale-row"
      data={idle ? { action: r.action, repo: r.repo, idle: "true" } : { action: r.action, repo: r.repo }}
    />
  );
}

/** Off: one compact line above the tabs, with the way to turn it on. The lists below still show. */
function OffBanner({
  admin,
  busy,
  onTurnOn,
  settingsHref,
  others,
}: {
  admin: boolean;
  busy: boolean;
  onTurnOn: () => void;
  settingsHref: string;
  others: { state: StaleState; repos: string[] }[];
}) {
  return (
    <div
      role="status"
      className="mb-2 mt-4 flex min-w-0 flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="stale-off"
    >
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-zinc-100">Stale pull request cleanup is off</p>
        <p className="text-zinc-400">
          Nothing is labeled, commented on or closed. The lists below show what carries the stale label now and what it would do once it is turned on.
          {admin ? "" : " Only admins can turn it on."}
        </p>
        {others.map((g) => (
          <p key={g.state} className="text-zinc-400" data-testid="stale-off-others">
            {STATE_WORD[g.state]} on {g.repos.length > 3 ? plural(g.repos.length, "repository", "repositories") : g.repos.map(shortRepo).join(", ")}, which {g.repos.length === 1 ? "has its" : "have their"} own settings.
          </p>
        ))}
      </div>
      {admin ? (
        <button type="button" className={`${primaryButton} shrink-0 self-start sm:self-auto`} onClick={onTurnOn} disabled={busy} data-testid="stale-turn-on">
          {busy ? "Turning on…" : "Turn on Preview only"}
        </button>
      ) : (
        <Link href={settingsHref} className={`${linkButton} shrink-0 !text-sm`}>
          See the settings
        </Link>
      )}
    </div>
  );
}
