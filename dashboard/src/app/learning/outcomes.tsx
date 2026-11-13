"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  api,
  errorStatus,
  type GuideSetting,
  type OutcomeLesson,
  type OutcomeLessons,
  type ReviewerAsks,
  type Scorecard,
  type ScorecardRow,
} from "@/lib/api";
import { Callout } from "@/components/callout";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { Disclosure } from "@/components/disclosure";
import { ListSkeleton, Time } from "@/components/list";
import { cardClass, Section } from "@/components/page";
import { Segmented } from "@/components/segmented";
import { SettingsRow, Switch } from "@/components/settings";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { StatusPill } from "@/components/status-pill";
import { smallSecondaryButton } from "@/components/ui";

// What became of the pull requests Coderhelm opened (the scorecard), the
// lessons it took from what people did with them, and what each reviewer
// keeps asking for. Three sections of the Learning page, each loading by
// itself; a gateway from before them has no such routes and they show
// nothing.

const count = (v: number) => v.toLocaleString();
const pct = (v: number | null) => (v === null ? "No data yet" : `${Math.round(v * 100)}%`);
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const emptyBox = "rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400";

/** "2026-11" reads "November 2026". */
function monthWords(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function hours(h: number | null): string {
  if (h === null) return "No data yet";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toLocaleString(undefined, { maximumFractionDigits: 1 })} h`;
  return `${(h / 24).toLocaleString(undefined, { maximumFractionDigits: 1 })} days`;
}

/** The median as the counters know it: the span it falls in, never an invented number. */
function medianWords(r: ScorecardRow): string | undefined {
  if (r.median_hours_to_merge_at_most !== null) return `Half merged within ${hours(r.median_hours_to_merge_at_most)}`;
  if (r.median_past_hours !== null) return `Half took longer than ${hours(r.median_past_hours)}`;
  return undefined;
}

/** A route this gateway doesn't have, or an answer without the fields: the section shows nothing. */
function useSection<T>(fetcher: () => Promise<T>, ok: (v: T) => boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [gone, setGone] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const v = await fetcher();
      if (ok(v)) setData(v);
      else setGone(true);
    } catch (e) {
      if (errorStatus(e) === 404) setGone(true);
      else setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [fetcher, ok]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, gone, loading, load };
}

function LoadProblem({ title, error, onRetry }: { title: string; error: string; onRetry: () => void }) {
  return (
    <Callout
      variant="warning"
      title={title}
      live={false}
      actions={
        <button type="button" className={smallSecondaryButton} onClick={onRetry}>
          Try again
        </button>
      }
    >
      <p className="[overflow-wrap:anywhere]">{error}</p>
    </Callout>
  );
}

// ── Scorecard ──────────────────────────────────────────────────────────────

const WINDOWS = [
  { value: "1", label: "This month" },
  { value: "3", label: "3 months" },
  { value: "12", label: "12 months" },
  { value: "0", label: "All time" },
] as const;
type Span = (typeof WINDOWS)[number]["value"];

const isScorecard = (v: Scorecard) => !!v && typeof v.team === "object" && v.team !== null && Array.isArray(v.repos);

type RepoRow = ScorecardRow & { repo: string };

const REPO_COLUMNS: Column<RepoRow>[] = [
  { key: "repo", header: "Repository", width: "grow", cell: (r) => <span className="[overflow-wrap:anywhere]">{r.repo}</span> },
  { key: "opened", header: "Opened", width: "fit", align: "right", cell: (r) => count(r.opened) },
  { key: "merged", header: "Merged", width: "fit", align: "right", cell: (r) => `${count(r.merged)}${r.merge_rate === null ? "" : ` (${pct(r.merge_rate)})`}` },
  { key: "closed", header: "Closed", width: "fit", align: "right", cell: (r) => count(r.closed_unmerged) },
  { key: "reverted", header: "Reverted", width: "fit", align: "right", cell: (r) => count(r.reverted) },
  { key: "edited", header: "Needed a commit", width: "fit", align: "right", cell: (r) => count(r.human_edited) },
  { key: "items", header: "Open items", width: "fit", align: "right", cell: (r) => count(r.open_items) },
  { key: "rounds", header: "Review rounds", width: "fit", align: "right", cell: (r) => (r.avg_review_rounds === null ? "No data yet" : r.avg_review_rounds.toLocaleString()) },
  { key: "time", header: "Time to merge", width: "fit", align: "right", cell: (r) => hours(r.avg_hours_to_merge) },
];

/** What became of the pull requests Coderhelm opened, for the team and each repository. */
export function ScorecardSection({ repo }: { repo: string }) {
  const [span, setSpan] = useState<Span>("3");
  const fetcher = useCallback(() => api.getScorecard(Number(span), repo || undefined), [span, repo]);
  const { data, error, gone, loading, load } = useSection(fetcher, isScorecard);
  if (gone) return null;
  const t = data?.team;
  const period = span === "0" ? "since counting began" : span === "1" ? "opened this month" : `opened in the last ${span} months`;
  return (
    <Section
      title="Pull request scorecard"
      id="scorecard"
      description={
        <>
          What became of the pull requests Coderhelm opened, counted as each one is merged, closed, reviewed or reverted. A pull request counts in the month it was opened.
          {data?.since ? ` Counting began in ${monthWords(data.since)}; pull requests opened before that are not included.` : ""}
        </>
      }
      actions={<Segmented label="Scorecard period" options={[...WINDOWS]} value={span} onChange={setSpan} />}
    >
      {error ? (
        <LoadProblem title="Couldn't load the scorecard" error={error} onRetry={() => void load()} />
      ) : !data || !t ? (
        <ListSkeleton rows={2} label="Loading the scorecard" />
      ) : t.opened === 0 ? (
        <p className={emptyBox} data-testid="scorecard-empty">
          No pull request from Coderhelm has been counted {period}
          {repo ? ` in ${repo}` : ""}. The scorecard fills in as pull requests open, merge and close from now on.
        </p>
      ) : (
        <div aria-busy={loading} data-testid="scorecard">
          <StatGrid>
            <StatTile testId="score-opened" label="Opened" value={count(t.opened)} note={`${period}${t.open ? `, ${plural(t.open, "still open", "still open")}` : ""}`} />
            <StatTile
              testId="score-merged"
              label="Merged"
              value={count(t.merged)}
              note={t.merge_rate === null ? "None has finished yet" : `${pct(t.merge_rate)} of the ${count(t.merged + t.closed_unmerged)} that finished`}
            />
            <StatTile testId="score-closed" label="Closed without merging" value={count(t.closed_unmerged)} tone={t.closed_unmerged > 0 ? "warning" : "neutral"} />
            <StatTile
              testId="score-reverted"
              label="Reverted after merging"
              value={count(t.reverted)}
              tone={t.reverted > 0 ? "danger" : "neutral"}
              note={t.revert_rate === null ? undefined : `${pct(t.revert_rate)} of merged`}
            />
            <StatTile
              testId="score-edited"
              label="Needed a person's commit"
              value={count(t.human_edited)}
              note={t.human_edited_rate === null ? undefined : `${pct(t.human_edited_rate)} of merged; ${count(t.merged_as_written)} merged as written`}
            />
            <StatTile
              testId="score-open-items"
              label="Finished with open items"
              value={count(t.open_items)}
              note={t.open_items_rate === null ? undefined : `${pct(t.open_items_rate)} of finished, with something deferred`}
            />
            <StatTile
              testId="score-rounds"
              label="Review rounds to approval"
              value={t.avg_review_rounds === null ? "No data yet" : t.avg_review_rounds.toLocaleString()}
              note={t.reviewed ? `on average; ${count(t.first_pass)} of ${count(t.reviewed)} passed with no changes asked` : "No review from a person yet"}
            />
            <StatTile testId="score-time" label="Open to merge" value={hours(t.avg_hours_to_merge)} note={t.avg_hours_to_merge === null ? undefined : `on average. ${medianWords(t) ?? ""}`.trim()} />
          </StatGrid>
          {!repo && data.repos.length > 0 && (
            <div className="mt-4 min-w-0 overflow-x-auto">
              <div className="sm:min-w-[960px]">
                <DataTable label="Scorecard by repository" testId="scorecard-repos" columns={REPO_COLUMNS} rows={data.repos} rowKey={(r) => r.repo} />
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ── Lessons from outcomes ──────────────────────────────────────────────────

const isLessons = (v: OutcomeLessons) => !!v && Array.isArray(v.lessons) && Array.isArray(v.guide_prs);

const SOURCE: Record<string, string> = {
  edited: "People edited the pull request before merging",
  closed: "A pull request was closed without merging",
  reverted: "A merged change was reverted",
};

const STATUS: Record<string, { label: string; tone: "success" | "neutral" | "warning" | "error"; says: string }> = {
  recalled: { label: "In use", tone: "success", says: "Given to every run in this repository." },
  in_guide: { label: "In the guide file", tone: "success", says: "The team merged it into the repository's guide file, which every run reads." },
  contradicted: { label: "Contradicted", tone: "warning", says: "Later pull requests went against it, so it is no longer given to runs." },
  faded: { label: "Faded", tone: "neutral", says: "Not seen again for a long time, so it is no longer given to runs." },
  off: { label: "Turned off", tone: "neutral", says: "An admin turned it off under What changed and why." },
};

const GUIDE_STATE: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  open: { label: "Waiting for review", tone: "warning" },
  merged: { label: "Merged", tone: "success" },
  declined: { label: "Closed without merging", tone: "neutral" },
};

/** "acme/web#12" reads "#12" inside its own repository's card. */
const prWords = (key: string, repo: string) => (key.startsWith(`${repo}#`) ? `#${key.slice(repo.length + 1)}` : key);

function LessonCard({ l }: { l: OutcomeLesson }) {
  const status = STATUS[l.status] ?? { label: l.status, tone: "neutral" as const, says: "" };
  return (
    <li className={cardClass} data-testid={`lesson-${l.id}`} data-status={l.status}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 basis-64 text-sm text-zinc-100 [overflow-wrap:anywhere]">{l.text}</p>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      {l.check && (
        <p className="mt-1 text-sm text-zinc-300 [overflow-wrap:anywhere]">
          <span className="text-zinc-400">How it is checked: </span>
          {l.check}
        </p>
      )}
      <p className="mt-1 text-xs text-zinc-400 [overflow-wrap:anywhere]">
        {l.repo}
        {l.applies_to ? ` · ${l.applies_to}` : ""} · seen on {plural(l.seen, "pull request")}
        {l.prs.length > 0 ? ` (${l.prs.map((p) => prWords(p, l.repo)).join(", ")})` : ""}
        {l.contradicted > 0 ? ` · contradicted ${plural(l.contradicted, "time")}` : ""}
        {l.last_seen_at ? " · last seen " : ""}
        {l.last_seen_at && <Time iso={l.last_seen_at} />}
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        {status.says}
        {l.guide_ready ? " Seen often enough to be proposed for the guide file." : ""}
        {l.guide_declined ? " The team declined it for the guide file." : ""}
      </p>
      {l.evidence.length > 0 && (
        <div className="mt-2">
          <Disclosure summary={`Evidence (${plural(l.evidence.length, "line")})${SOURCE[l.source] ? `: ${SOURCE[l.source].toLowerCase()}` : ""}`}>
            <ul className="space-y-1.5">
              {l.evidence.map((e, i) => (
                <li key={i} className="min-w-0 whitespace-pre-wrap text-xs text-zinc-300 [overflow-wrap:anywhere]">
                  {e}
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      )}
    </li>
  );
}

// ── The switch for guide pull requests ─────────────────────────────────────

const isGuideSetting = (v: GuideSetting) => !!v && typeof v.enabled === "boolean" && typeof v.repos === "object" && v.repos !== null;

const REPO_CHOICES = [
  { value: "team", label: "Follow the team" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;
type RepoChoice = (typeof REPO_CHOICES)[number]["value"];

/**
 * Whether Coderhelm may open guide pull requests: one switch for the team,
 * and, with a repository picked in the page's filter, that repository's own
 * setting. Each change is saved at once. Everyone sees how it is set; only
 * an admin can change it.
 */
function GuidePrSetting({ repo, canManage }: { repo: string; canManage: boolean }) {
  const fetcher = useCallback(() => api.getGuideSetting(), []);
  const { data, error, gone, load } = useSection(fetcher, isGuideSetting);
  const [saved, setSaved] = useState<GuideSetting | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  if (gone) return null;
  if (error) return <LoadProblem title="Couldn't load the guide pull request setting" error={error} onRetry={() => void load()} />;
  const setting = saved ?? data;
  if (!setting) return null;

  const save = async (next: { enabled: boolean; repos: Record<string, boolean> }) => {
    setBusy(true);
    setProblem("");
    try {
      setSaved(await api.putGuideSetting(next));
    } catch (e) {
      setProblem(errorStatus(e) === 403 ? "Your role does not allow this. Only an admin or the owner can change it (error 403)." : e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };
  const choice: RepoChoice = repo in setting.repos ? (setting.repos[repo] ? "on" : "off") : "team";
  const setRepo = (c: RepoChoice) => {
    const repos = { ...setting.repos };
    if (c === "team") delete repos[repo];
    else repos[repo] = c === "on";
    void save({ enabled: setting.enabled, repos });
  };
  const apart = Object.entries(setting.repos).sort(([a], [b]) => a.localeCompare(b));
  const cannot = canManage ? undefined : "Only an admin or the owner can change this.";

  return (
    <div className="min-w-0 divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50" data-testid="guide-setting" aria-busy={busy}>
      <SettingsRow
        label="Open guide pull requests"
        layout="toggle"
        testId="guide-setting-team"
        notDefault={!setting.enabled}
        help={
          <>
            When a lesson has been seen on several pull requests, Coderhelm proposes it for the repository&apos;s guide file as a pull request for the team to review. Off, Coderhelm writes nothing to any repository for this; its lessons still go to every run.
            {cannot ? ` ${cannot}` : ""}
          </>
        }
        control={(ids) => (
          <Switch id={ids.inputId} checked={setting.enabled} disabled={!canManage || busy} onChange={(on) => void save({ enabled: on, repos: setting.repos })} labelledBy={ids.labelId} describedBy={ids.helpId} testId="guide-switch" />
        )}
      />
      {repo ? (
        <SettingsRow
          label={`In ${repo}`}
          testId="guide-setting-repo"
          notDefault={choice !== "team"}
          help={
            choice === "team"
              ? `Follows the team's setting: ${setting.enabled ? "on" : "off"}.`
              : `Set apart from the team: ${choice === "on" ? "guide pull requests are opened here" : "nothing is written to this repository"}.`
          }
          control={() => <Segmented label={`Guide pull requests in ${repo}`} options={[...REPO_CHOICES]} value={choice} onChange={setRepo} disabled={!canManage || busy} />}
        />
      ) : (
        <p className="px-4 py-3 text-sm text-zinc-400" data-testid="guide-setting-apart">
          {apart.length === 0
            ? "Every repository follows this. To set one apart, pick it in the repository filter at the top."
            : `Set apart from the team: ${apart.map(([r, on]) => `${r} (${on ? "on" : "off"})`).join(", ")}. To change one, pick it in the repository filter at the top.`}
        </p>
      )}
      {problem && (
        <div className="px-4 py-3">
          <Callout variant="error" title="That was not saved">
            <p>{problem}</p>
          </Callout>
        </div>
      )}
    </div>
  );
}

/** The coding agent's lessons from what people did with its pull requests, and the guide pull requests that propose them. */
export function OutcomeLessonsSection({ repo, canManage }: { repo: string; canManage: boolean }) {
  const fetcher = useCallback(() => api.getOutcomeLessons(repo || undefined), [repo]);
  const { data, error, gone, load } = useSection(fetcher, isLessons);
  if (gone) return null;
  return (
    <Section
      title="Lessons from pull requests"
      id="lessons"
      description="What the coding agent took from people's own edits to its pull requests, the comments they closed one with, and the reasons they reverted one. Each lesson says how it is checked and shows what it came from. A lesson seen on several pull requests is proposed for the repository's guide file as a pull request the team reviews."
    >
      {error ? (
        <LoadProblem title="Couldn't load the lessons" error={error} onRetry={() => void load()} />
      ) : !data ? (
        <ListSkeleton rows={3} label="Loading the lessons" />
      ) : (
        <div className="space-y-3">
          <GuidePrSetting repo={repo} canManage={canManage} />
          {data.guide_prs.length > 0 && (
            <ul className="space-y-2" data-testid="guide-prs">
              {data.guide_prs.map((g) => {
                const state = GUIDE_STATE[g.state] ?? { label: g.state, tone: "neutral" as const };
                return (
                  <li key={`${g.repo}#${g.pr}`} className={`${cardClass} flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1`}>
                    <p className="min-w-0 flex-1 basis-64 text-sm text-zinc-300 [overflow-wrap:anywhere]">
                      Guide pull request{" "}
                      <a href={g.url} target="_blank" rel="noreferrer" className="text-zinc-100 underline underline-offset-2 hover:text-white">
                        {g.repo} #{g.pr}
                      </a>{" "}
                      proposes {plural(g.lessons, "lesson")} for {g.path || "the guide file"}.
                    </p>
                    <StatusPill tone={state.tone}>{state.label}</StatusPill>
                  </li>
                );
              })}
            </ul>
          )}
          {data.lessons.length === 0 ? (
            <p className={emptyBox} data-testid="lessons-empty">
              No lessons yet{repo ? ` in ${repo}` : ""}. One is written when people edit one of Coderhelm&apos;s pull requests before merging it, close one with a comment, or revert one and say why.
            </p>
          ) : (
            <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
              {data.lessons.map((l) => (
                <LessonCard key={`${l.repo}#${l.id}`} l={l} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}

// ── What reviewers ask for ─────────────────────────────────────────────────

const isAsks = (v: ReviewerAsks) => !!v && Array.isArray(v.reviewers);

const CATEGORY: Record<string, string> = {
  error_handling: "Error handling",
  api: "API",
};
const categoryWords = (c: string) => CATEGORY[c] ?? `${c.charAt(0).toUpperCase()}${c.slice(1).replace(/_/g, " ")}`;

/** What each reviewer repeatedly asks for on Coderhelm's pull requests, with a way to forget it. */
export function ReviewerAsksSection({ canManage }: { canManage: boolean }) {
  const fetcher = useCallback(() => api.getReviewerAsks(), []);
  const { data, error, gone, load } = useSection(fetcher, isAsks);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReactNode>(null);
  const { confirm } = useConfirm();
  if (gone) return null;

  const forget = async (login: string, id?: string) => {
    const ok = await confirm({
      title: id ? "Forget this ask?" : `Forget everything kept about ${login}?`,
      message: id
        ? "Coderhelm stops applying it. It is kept again only if the reviewer asks for it on later pull requests."
        : `Every ask kept for ${login} is removed, and where they reviewed. Coderhelm learns them again only from later pull requests.`,
      confirmLabel: "Forget",
      destructive: true,
    });
    if (ok !== "primary") return;
    setBusy(true);
    setProblem(null);
    try {
      await api.forgetReviewer(login, id);
      await load();
    } catch (e) {
      setProblem(errorStatus(e) === 403 ? "Your role does not allow this. Only an admin or the owner can forget what was learned (error 403)." : e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="What reviewers ask for"
      id="reviewers"
      description={`What each person repeatedly asks for when reviewing Coderhelm's pull requests. An ask seen on ${data?.min_seen ?? 2} or more pull requests is given to the coding agent, and to Coderhelm's own review, when that person is likely to review the change: a code owner of the files, or someone who reviewed that part of the repository recently. Only the ask, its kind and the pull requests are kept; never the reviewer's comments, and nothing about the person.`}
    >
      {error ? (
        <LoadProblem title="Couldn't load what reviewers ask for" error={error} onRetry={() => void load()} />
      ) : !data ? (
        <ListSkeleton rows={2} label="Loading what reviewers ask for" />
      ) : data.reviewers.length === 0 ? (
        <p className={emptyBox} data-testid="reviewers-empty">
          Nothing kept yet. Asks are learned when people review Coderhelm&apos;s pull requests.
        </p>
      ) : (
        <div className="space-y-3" aria-busy={busy}>
          {problem && (
            <Callout variant="error" title="That was not forgotten">
              <p>{problem}</p>
            </Callout>
          )}
          <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
            {data.reviewers.map((r) => (
              <li key={r.login} className={cardClass} data-testid={`reviewer-${r.login}`}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h3 className="min-w-0 text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">{r.login}</h3>
                  {canManage && (
                    <button type="button" className={smallSecondaryButton} disabled={busy} onClick={() => void forget(r.login)}>
                      Forget {r.login}
                    </button>
                  )}
                </div>
                <ul className="mt-2 space-y-2">
                  {r.asks.map((a) => (
                    <li key={a.id} className="min-w-0 border-t border-zinc-800 pt-2 first:border-t-0 first:pt-0" data-testid={`ask-${a.id}`}>
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <p className="min-w-0 flex-1 basis-48 text-sm text-zinc-200 [overflow-wrap:anywhere]">{a.text}</p>
                        <StatusPill tone={a.given ? "success" : "neutral"}>{a.given ? "In use" : "Seen once"}</StatusPill>
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="min-w-0 text-xs text-zinc-400 [overflow-wrap:anywhere]">
                          {categoryWords(a.category)} · on {plural(a.seen, "pull request")}
                          {a.prs.length > 0 ? ` (${a.prs.join(", ")})` : ""}
                        </p>
                        {canManage && (
                          <button type="button" className={smallSecondaryButton} disabled={busy} aria-label={`Forget this ask of ${r.login}: ${a.text}`} onClick={() => void forget(r.login, a.id)}>
                            Forget
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
