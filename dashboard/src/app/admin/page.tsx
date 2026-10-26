"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError, api, type AdminOrg, type AdminTeam, type BetaSignup, type BetaSignupStatus, type UsageCheck } from "@/lib/api";
import {
  BETA_SIGNUPS_CHANGED,
  LINK_WORDS,
  TEAM_SORTS,
  filterOrgs,
  filterSignups,
  orgName,
  sortOrgs,
  teamCounts,
  teamName,
  words,
  type SignupFilter,
  type TeamFilter,
} from "@/lib/admin";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";
import { CopyButton } from "@/components/copy-button";
import { focusRing, inputClass, primaryButton, secondaryButton, smallSecondaryButton } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Switch } from "@/components/teams-webhook";
import { pluginsApi } from "@/lib/plugins";
import { SignInAppsPanel } from "@/components/sign-in-apps";
import { resetPluginsFlag } from "@/hooks/use-plugins-flag";
import {
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  Chip,
  Time,
  formatDate,
  useListParams,
  type Tone,
} from "@/components/list";

const fmtInt = (n: number) => n.toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => formatDate(iso);
const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/** The allowlist gets its own search once it is this long. */
const ALLOWLIST_SEARCH_AT = 6;

type Tab = "teams" | "beta" | "allowlist";
const TABS: { value: Tab; label: string }[] = [
  { value: "teams", label: "Teams" },
  { value: "beta", label: "Beta sign-ups" },
  { value: "allowlist", label: "Allowlist" },
];

const SIGNUP_LOOK: Record<BetaSignupStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "waiting" },
  invited: { label: "Invited", tone: "live" },
  joined: { label: "Joined", tone: "success" },
};


function planWord(plan: string): string {
  return plan ? `${plan[0].toUpperCase()}${plan.slice(1)} plan` : "Beta";
}

export default function AdminPageWithParams() {
  return (
    <Suspense fallback={<Page><ListSkeleton rows={3} /></Page>}>
      <AdminPage />
    </Suspense>
  );
}

function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [month, setMonth] = useState("");
  const [loadError, setLoadError] = useState("");
  const [signups, setSignups] = useState<BetaSignup[] | null>(null);
  const [signupError, setSignupError] = useState("");
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(false);
  // Every view's search, filter and sort live in the address.
  const [params, setParams] = useListParams({
    tab: "teams",
    q: "",
    status: "active",
    sort: "busy",
    bq: "",
    bstatus: "all",
    bsort: "new",
    aq: "",
  });
  const tab: Tab = TABS.some((t) => t.value === params.tab) ? (params.tab as Tab) : "teams";

  const loadSignups = useCallback(() => {
    setSignupError("");
    api
      .adminBetaSignups()
      .then((r) => setSignups(r.signups))
      .catch((e: unknown) => setSignupError(e instanceof Error ? e.message : "The request failed."));
  }, []);

  const loadList = useCallback(() => {
    setListLoading(true);
    setListError("");
    api
      .listAllowlist()
      .then((r) => setAllowlist(r.emails))
      .catch((e: unknown) => setListError(e instanceof Error ? e.message : "The request failed."))
      .finally(() => setListLoading(false));
  }, []);

  // The server decides who is a platform admin: anyone else gets a 403.
  useEffect(() => {
    api
      .adminTeams()
      .then((r) => {
        setOrgs(r.orgs ?? []);
        setTeamTotal(r.counts?.teams ?? r.teams.length);
        setMonth(r.month);
        setAuthorized(true);
        loadSignups();
        loadList();
      })
      .catch((e: unknown) => {
        // 401/403: not a platform admin. Anything else is a real failure to show.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return;
        setLoadError(e instanceof Error ? e.message : "The request failed.");
      })
      .finally(() => setLoading(false));
  }, [loadSignups, loadList]);

  const newSignups = signups?.filter((s) => s.status === "new").length ?? 0;

  if (loading) {
    return (
      <Page className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <ListSkeleton rows={4} label="Loading the admin page" />
      </Page>
    );
  }

  if (!authorized && loadError) {
    return (
      <Page>
        <ListError title="Couldn't load the admin page" onRetry={() => window.location.reload()}>
          {loadError}
        </ListError>
      </Page>
    );
  }

  if (!authorized) {
    return (
      <Page>
      <PageHeader detail crumb={false} title="Access denied" lead="This page is only for Coderhelm platform administrators." />
      </Page>
    );
  }

  const counts: Record<Tab, ReactNode> = {
    teams: <span className="tabular-nums text-zinc-500">{fmtInt(teamTotal)}</span>,
    beta:
      newSignups > 0 ? (
        <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-medium tabular-nums text-amber-300">
          {newSignups}
          <span className="sr-only"> new</span>
        </span>
      ) : signups ? (
        <span className="tabular-nums text-zinc-500">{fmtInt(signups.length)}</span>
      ) : null,
    allowlist: <span className="tabular-nums text-zinc-500">{fmtInt(allowlist.length)}</span>,
  };

  return (
    <Page>
      <PageHeader
        title="Platform admin"
        lead="Every organization using Coderhelm, who is waiting to get in, and who may sign up."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/queue" className={secondaryButton}>
              Shared queue
            </Link>
            <Link href="/admin/tickets" className={primaryButton}>
              Support queue
            </Link>
          </div>
        }
      />

      <UsageCheckPanel />

      <SignInAppsPanel />

      <Tabs
        label="Admin views"
        value={tab}
        items={TABS.map((t) => ({
          value: t.value,
          label: t.label,
          href: t.value === "teams" ? "/admin" : `/admin?tab=${t.value}`,
          count: counts[t.value],
        }))}
      />

      {tab === "teams" && (
        <TeamsView
          orgs={orgs}
          teamTotal={teamTotal}
          month={month}
          q={params.q}
          status={params.status}
          sort={params.sort}
          setParams={setParams}
        />
      )}
      {tab === "beta" && (
        <BetaView
          signups={signups}
          error={signupError}
          onRetry={loadSignups}
          onInvited={(email, invitedAt) => {
            setSignups((prev) =>
              (prev ?? []).map((s) => (s.email === email && s.status === "new" ? { ...s, status: "invited", invited_at: invitedAt } : s)),
            );
            setAllowlist((prev) => (prev.includes(email) ? prev : [...prev, email]));
            window.dispatchEvent(new Event(BETA_SIGNUPS_CHANGED));
          }}
          q={params.bq}
          status={params.bstatus}
          sort={params.bsort}
          setParams={setParams}
        />
      )}
      {tab === "allowlist" && (
        <AllowlistView
          allowlist={allowlist}
          setAllowlist={setAllowlist}
          error={listError}
          loading={listLoading}
          onRetry={loadList}
          q={params.aq}
          setParams={setParams}
        />
      )}
    </Page>
  );
}

// ── Usage check ──────────────────────────────────────────────────────

interface UsageProblem {
  key: string;
  tone: Tone;
  title: string;
  summary: string;
}

/** What the last run of the usage check found wrong; none means it is OK. */
function usageProblems(c: UsageCheck): UsageProblem[] {
  if (c.state === "never") {
    return [{ key: "never", tone: "waiting", title: "Not run yet", summary: "The daily check hasn't run since it was deployed. It runs once a day." }];
  }
  if (c.state === "off") {
    return [
      {
        key: "off",
        tone: "waiting",
        title: "The check is off",
        summary: `No Anthropic admin key is set, so recorded usage isn't compared with Anthropic's report.${c.secret ? ` Add the key to ${c.secret}.` : ""}`,
      },
    ];
  }
  const out: UsageProblem[] = [];
  const flagged = c.flagged_models ?? 0;
  const failed = c.failed_teams ?? 0;
  if (flagged > 0) {
    out.push({
      key: "flagged",
      tone: "danger",
      title: `${plural(flagged, "model")} off from Anthropic's report`,
      summary: "Recorded usage differs from Anthropic's own report by more than the allowed drift. The worker logs name each team and model.",
    });
  }
  if (failed > 0) {
    out.push({
      key: "failed",
      tone: "waiting",
      title: `${plural(failed, "team")} not checked`,
      summary: "Anthropic's report for these teams couldn't be read, so they weren't compared.",
    });
  }
  return out;
}

function UsageCheckPanel() {
  const [check, setCheck] = useState<UsageCheck | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api
      .adminUsageCheck()
      .then(setCheck)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The request failed."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const problems = check ? usageProblems(check) : [];
  const ok = !!check && problems.length === 0;
  const pill = !check ? null : ok ? (
    <StatusPill tone="success">OK</StatusPill>
  ) : problems.some((x) => x.tone === "danger") ? (
    <StatusPill tone="error">{plural(problems.length, "problem")}</StatusPill>
  ) : (
    <StatusPill tone="warning">{check.state === "ran" ? plural(problems.length, "problem") : problems[0].title}</StatusPill>
  );

  return (
    <Section
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Usage check
          {pill}
        </span>
      }
      id="usage-check"
      description="Once a day, the model usage Coderhelm recorded for each team is compared with Anthropic's own report."
    >
      <div data-testid="usage-check" data-state={check ? (ok ? "ok" : check.state === "ran" ? "problems" : check.state) : error ? "error" : "loading"}>
        {error ? (
          <ListError title="Couldn't load the usage check" onRetry={load}>
            {error}
          </ListError>
        ) : !check ? (
          <ListSkeleton rows={1} label="Loading the usage check" />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
            {check.state === "ran" && (
              <p className="px-4 py-3 text-sm text-zinc-300">
                {ok ? "Recorded usage matches Anthropic's report: " : ""}
                {plural(check.teams ?? 0, "team")} compared for {check.day || "the last day"}
                {check.checked_at && (
                  <>
                    {", checked "}
                    <Time iso={check.checked_at} />
                  </>
                )}
                .
              </p>
            )}
            {problems.length > 0 && (
              <List label="Usage check problems" className={`rounded-none border-0 bg-transparent ${check.state === "ran" ? "border-t border-zinc-800" : ""}`}>
                {problems.map((x) => (
                  <ListRow key={x.key} testId="usage-problem" data={{ problem: x.key }} status={{ tone: x.tone }} title={x.title} summary={x.summary} summaryTone="muted" />
                ))}
              </List>
            )}
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

type SetParams = (patch: Partial<Record<"tab" | "q" | "status" | "sort" | "bq" | "bstatus" | "bsort" | "aq", string>>, opts?: { replace?: boolean }) => void;

// ── Teams ────────────────────────────────────────────────────────────

function TeamsView({
  orgs,
  teamTotal,
  month,
  q,
  status,
  sort,
  setParams,
}: {
  orgs: AdminOrg[];
  teamTotal: number;
  month: string;
  q: string;
  status: string;
  sort: string;
  setParams: SetParams;
}) {
  const filter: TeamFilter = status === "inactive" || status === "all" ? status : "active";
  const counts = useMemo(() => teamCounts(orgs, q), [orgs, q]);
  const shown = useMemo(() => sortOrgs(filterOrgs(orgs, q, filter), sort), [orgs, q, filter, sort]);
  const shownTeams = shown.reduce((n, o) => n + o.teams.length, 0);
  const filtered = !!q || filter !== "active";
  const clear = () => setParams({ q: "", status: "active" });
  const full = useMemo(() => new Map(orgs.map((o) => [o.key, o])), [orgs]);

  return (
    <section aria-labelledby="teams-heading" className="mt-6">
      <h2 id="teams-heading" className="sr-only">Teams</h2>
      <p className="mb-4 text-sm text-zinc-500">
        {plural(orgs.length, "organization")} with {plural(teamTotal, "team")}. Teams on the same GitHub installation, Jira site,
        people or company email domain sit under one organization; runs and cost this month are for {month || "this month"}.
      </p>
      <ListToolbar
        className="mb-4"
        search={{
          value: q,
          onChange: (v) => setParams({ q: v }, { replace: true }),
          placeholder: "Search organizations, teams, ids or domains",
          label: "Search teams",
        }}
        status={{
          label: "Show teams",
          value: filter,
          onChange: (v) => setParams({ status: v }),
          options: [
            { value: "active", label: "Active", count: counts.active, tone: "success" },
            { value: "inactive", label: "No activity", count: counts.inactive, tone: "muted" },
            { value: "all", label: "All", count: counts.all },
          ],
        }}
        sort={{ value: sort, onChange: (v) => setParams({ sort: v }), options: TEAM_SORTS }}
        summary={`Showing ${plural(shown.length, "organization")}, ${plural(shownTeams, "team")}`}
        onClear={filtered ? clear : undefined}
      />
      {shown.length === 0 ? (
        <ListEmpty title={orgs.length === 0 ? "No teams yet" : "No teams match"} onClear={filtered ? clear : undefined} />
      ) : (
        <List label="Organisations">
          {shown.map((o) => (
            <OrgRow key={o.key} org={o} hidden={(full.get(o.key)?.teams.length ?? o.teams.length) - o.teams.length} filter={filter} />
          ))}
        </List>
      )}
    </section>
  );
}

function OrgRow({ org, hidden, filter }: { org: AdminOrg; hidden: number; filter: TeamFilter }) {
  const name = orgName(org);
  const hiddenWords = filter === "active" ? "with no activity" : filter === "inactive" ? "active" : "not matching";
  return (
    <ListRow
      testId="admin-org"
      data={{ org: org.key }}
      status={{ tone: org.active ? "success" : "muted" }}
      title={name}
      meta={[
        plural(org.members, "member"),
        plural(org.repos, "repo"),
        plural(org.runs_total, "run"),
        plural(org.reviews_total, "review"),
        org.created_at && `Created ${fmtDate(org.created_at)}`,
      ]}
      summary={hidden > 0 ? `${plural(hidden, "more team")} ${hiddenWords}` : undefined}
      summaryTone="muted"
      chips={<Chip>{planWord(org.plan)}</Chip>}
      time={org.last_active_at || null}
      detailsLabel={plural(org.teams.length, "team")}
      detailsFor={`teams of ${name}`}
      details={
        <ul aria-label={`Teams of ${name}`} className="divide-y divide-zinc-800/70 -my-1">
          {org.teams.map((t) => (
            <TeamLine key={t.team_id} team={t} />
          ))}
        </ul>
      }
    />
  );
}

function TeamLine({ team: t }: { team: AdminTeam }) {
  return (
    <li className="py-2" data-testid="admin-team" data-team={t.team_id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm text-zinc-100">{teamName(t)}</span>
        {t.link !== "main" && <Chip tone="muted">{LINK_WORDS[t.link]}</Chip>}
        {t.personal && <Chip tone="muted">Personal</Chip>}
        {!t.active && <Chip tone="muted">No activity</Chip>}
        {t.status !== "active" && <Chip tone="waiting">{t.status}</Chip>}
      </div>
      <p className="mt-0.5 font-mono text-xs text-zinc-400 [overflow-wrap:anywhere]">{t.team_id}</p>
      <p className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-zinc-400">
        <span>{plural(t.members, "member")}{t.invites > 0 ? ` (+${t.invites} invited)` : ""}</span>
        <span aria-hidden="true">·</span>
        <span>{plural(t.repos, "repo")}</span>
        <span aria-hidden="true">·</span>
        <span>{plural(t.runs_total, "run")} ({fmtInt(t.runs_month)} this month)</span>
        <span aria-hidden="true">·</span>
        <span>{plural(t.reviews_total, "review")}</span>
        {t.cost_month_usd > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{fmtUsd(t.cost_month_usd)} this month</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{t.last_active_at ? `Active ${fmtDate(t.last_active_at)}` : "No use recorded"}</span>
        {t.created_at && (
          <>
            <span aria-hidden="true">·</span>
            <span>Created {fmtDate(t.created_at)}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{planWord(t.plan)}</span>
      </p>
      <PluginsFlag team={t} />
    </li>
  );
}

/** The team's plugins switch: plugins stay hidden and refused for a team until it is on. */
function PluginsFlag({ team }: { team: AdminTeam }) {
  const [on, setOn] = useState(!!team.flags?.plugins);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flip = async (next: boolean) => {
    setBusy(true);
    setError("");
    try {
      const r = await pluginsApi.setTeamFlag(team.team_id, next);
      setOn(!!r.flags.plugins);
      resetPluginsFlag();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change it.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400" data-testid="team-plugins-flag">
      <Switch checked={on} disabled={busy} label={`Plugins for ${teamName(team)}`} onLabel="Plugins on" offLabel="Plugins off" onChange={flip} />
      {error && <span role="alert" className="text-red-400">{error}</span>}
    </div>
  );
}

// ── Beta sign-ups ────────────────────────────────────────────────────

function BetaView({
  signups,
  error,
  onRetry,
  onInvited,
  q,
  status,
  sort,
  setParams,
}: {
  signups: BetaSignup[] | null;
  error: string;
  onRetry: () => void;
  onInvited: (email: string, invitedAt: string) => void;
  q: string;
  status: string;
  sort: string;
  setParams: SetParams;
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [inviting, setInviting] = useState<string | null>(null);
  const filter: SignupFilter = status === "new" || status === "invited" || status === "joined" ? status : "all";
  const all = signups ?? [];
  const searched = filterSignups(all, q, "all", sort);
  const count = (s: BetaSignupStatus) => searched.filter((x) => x.status === s).length;
  const shown = filterSignups(all, q, filter, sort);
  const filtered = !!q || filter !== "all";
  const clear = () => setParams({ bq: "", bstatus: "all" });

  const invite = async (s: BetaSignup) => {
    const ok = await confirm({
      title: "Mark as invited?",
      message: `${s.email} is added to the sign-up allowlist, so they can create an account. No email is sent: let them know yourself.`,
      confirmLabel: "Mark invited",
    });
    if (!ok) return;
    setInviting(s.email);
    api
      .inviteBetaSignup(s.email)
      .then((r) => {
        onInvited(s.email, r.invited_at);
        toast(`Marked ${s.email} invited`);
      })
      .catch((e: unknown) => toast(e instanceof Error ? `Could not mark invited: ${e.message}` : "Could not mark invited", "error"))
      .finally(() => setInviting(null));
  };

  return (
    <section aria-labelledby="beta-heading" className="mt-6">
      <h2 id="beta-heading" className="sr-only">Beta sign-ups</h2>
      <p className="mb-4 text-sm text-zinc-500">
        People who joined the waitlist from the sign-in page. A sign-up reads as joined once their email is on a team.
      </p>
      {error ? (
        <ListError title="Couldn't load the beta sign-ups" onRetry={onRetry}>
          {error}
        </ListError>
      ) : signups === null ? (
        <ListSkeleton rows={3} label="Loading the beta sign-ups" />
      ) : all.length === 0 ? (
        <ListEmpty title="No beta sign-ups yet">People who join the waitlist from the sign-in page show up here.</ListEmpty>
      ) : (
        <>
          <ListToolbar
            className="mb-4"
            search={{
              value: q,
              onChange: (v) => setParams({ bq: v }, { replace: true }),
              placeholder: "Search email, company or message",
              label: "Search beta sign-ups",
            }}
            status={{
              label: "Show sign-ups",
              value: filter,
              onChange: (v) => setParams({ bstatus: v }),
              options: [
                { value: "all", label: "All", count: searched.length },
                { value: "new", label: "New", count: count("new"), tone: "waiting" },
                { value: "invited", label: "Invited", count: count("invited"), tone: "live" },
                { value: "joined", label: "Joined", count: count("joined"), tone: "success" },
              ],
            }}
            sort={{
              value: sort,
              onChange: (v) => setParams({ bsort: v }),
              options: [
                { value: "new", label: "Newest first" },
                { value: "old", label: "Oldest first" },
              ],
            }}
            onClear={filtered ? clear : undefined}
          />
          {shown.length === 0 ? (
            <ListEmpty title="No sign-ups match" onClear={clear} />
          ) : (
            <List label="Beta sign-ups">
              {shown.map((s) => {
                const look = SIGNUP_LOOK[s.status];
                return (
                  <ListRow
                    key={s.email}
                    testId="beta-signup"
                    data={{ status: s.status }}
                    status={{ tone: look.tone }}
                    title={s.email}
                    titleText={s.original_email || s.email}
                    meta={[
                      s.company || s.domain || "No company given",
                      s.created_at && `Signed up ${fmtDate(s.created_at)}`,
                      s.status === "invited" && s.invited_at && `Invited ${fmtDate(s.invited_at)}`,
                    ]}
                    summary={s.reason || undefined}
                    chips={<Chip tone={look.tone}>{look.label}</Chip>}
                    actions={
                      <>
                        <CopyButton text={s.email} label="Copy email" />
                        {s.status === "new" && (
                          <button
                            type="button"
                            onClick={() => void invite(s)}
                            disabled={inviting === s.email}
                            aria-label={`Mark ${s.email} invited`}
                            className={`${smallSecondaryButton}`}
                          >
                            {inviting === s.email ? "Saving..." : "Mark invited"}
                          </button>
                        )}
                      </>
                    }
                  />
                );
              })}
            </List>
          )}
        </>
      )}
    </section>
  );
}

// ── Allowlist ────────────────────────────────────────────────────────

function AllowlistView({
  allowlist,
  setAllowlist,
  error,
  loading,
  onRetry,
  q,
  setParams,
}: {
  allowlist: string[];
  setAllowlist: (fn: (prev: string[]) => string[]) => void;
  error: string;
  loading: boolean;
  onRetry: () => void;
  q: string;
  setParams: SetParams;
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [allowEmail, setAllowEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const aWords = words(q);
  const shownEmails = allowlist.filter((e) => aWords.every((x) => e.toLowerCase().includes(x)));

  const handleAdd = () => {
    const value = allowEmail.trim();
    if (!value) return;
    setAdding(true);
    api
      .addToAllowlist(value)
      .then((r) => {
        // The server stores the address in lower case; show what it stored, once.
        const stored = r?.email || value.toLowerCase();
        setAllowlist((prev) => (prev.includes(stored) ? prev : [...prev, stored]));
        setAllowEmail("");
        toast(`Added ${stored}`);
      })
      .catch((e: unknown) => toast(e instanceof Error ? `Could not add: ${e.message}` : "Could not add", "error"))
      .finally(() => setAdding(false));
  };

  const handleRemove = async (email: string) => {
    const ok = await confirm({
      title: "Remove from the allowlist?",
      message: `${email} will no longer be able to create an account. Existing accounts keep working.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setRemoving(email);
    api
      .removeFromAllowlist(email)
      .then(() => {
        setAllowlist((prev) => prev.filter((x) => x !== email));
        toast(`Removed ${email}`);
      })
      .catch((e: unknown) => toast(e instanceof Error ? `Could not remove: ${e.message}` : "Could not remove", "error"))
      .finally(() => setRemoving(null));
  };

  return (
    <section aria-labelledby="allowlist-heading" className="mt-6">
      <h2 id="allowlist-heading" className="sr-only">Signup allowlist</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Only these emails can create accounts. Use <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">*@domain.com</code> to allow a whole domain.
      </p>

      <form
        className="flex flex-col gap-2 mb-4 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
      >
        <label htmlFor="allow-email" className="sr-only">Email or domain to allow</label>
        <input
          id="allow-email"
          type="text"
          autoComplete="off"
          placeholder="user@example.com or *@company.com"
          value={allowEmail}
          onChange={(e) => setAllowEmail(e.target.value)}
          className={`${inputClass} sm:flex-1`}
        />
        <button type="submit" disabled={adding || !allowEmail.trim()} className={primaryButton}>
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      {allowlist.length >= ALLOWLIST_SEARCH_AT && !error && (
        <ListToolbar
          className="mb-3"
          search={{
            value: q,
            onChange: (v) => setParams({ aq: v }, { replace: true }),
            placeholder: "Find an allowed email or domain",
            label: "Search allowed emails",
          }}
        />
      )}
      {error ? (
        <ListError title="Couldn't load the allowlist" onRetry={onRetry}>
          {error}
        </ListError>
      ) : loading ? (
        <ListSkeleton rows={2} label="Loading the allowlist" />
      ) : allowlist.length === 0 ? (
        <p className="text-sm text-zinc-500">No allowed emails yet, so nobody can sign up.</p>
      ) : shownEmails.length === 0 ? (
        <ListEmpty title="No allowed email matches" onClear={() => setParams({ aq: "" })} />
      ) : (
        <List label="Allowed emails">
          {shownEmails.map((email) => (
            <ListRow
              key={email}
              title={email}
              actions={
                <button
                  type="button"
                  onClick={() => void handleRemove(email)}
                  disabled={removing === email}
                  aria-label={`Remove ${email}`}
                  className={`shrink-0 rounded text-xs text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50 ${focusRing}`}
                >
                  {removing === email ? "Removing..." : "Remove"}
                </button>
              }
            />
          ))}
        </List>
      )}
    </section>
  );
}
