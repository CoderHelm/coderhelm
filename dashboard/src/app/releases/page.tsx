"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  api,
  type BlockedRelease,
  type Release,
  type Repo,
  type ReviewerConfig,
  type WaitingRelease,
} from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { Markdown } from "@/components/markdown";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { usePagedList, LoadMoreButton } from "@/components/load-more";
import { Callout } from "@/components/callout";
import { Segmented } from "@/components/segmented";
import { AtlassianIcon, ChevronRightIcon, ExternalLinkIcon, GitHubIcon, MailIcon } from "@/components/icons";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, cardClass } from "@/components/page";

// The characters the backend accepts in a tag (anything else is a bare 400).
const TAG_PATTERN = /^[A-Za-z0-9._+/-]{1,200}$/;

/** A compact button for rows and banners. */
const smallButton = `inline-flex min-h-8 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 transition-colors motion-reduce:transition-none ${focusRing}`;

/** Up to this many repos the filter is a row of tabs; more get a searchable picker. */
const MAX_TABS = 5;

/** Turn a failed send into words: the endpoint answers with bare status codes. */
function sendError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/\b403\b/.test(msg)) return "Your role cannot write release notes. Ask an admin on your team.";
  // 400 = a tag the backend refuses, or no GitHub App installation for the team.
  if (/\b400\b/.test(msg)) return "Not accepted. Check the tag name, and that the GitHub App is installed.";
  return msg && !/^API \d+/.test(msg) ? msg : "Could not queue it. Try again.";
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date after a month. */
function timeAgo(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/** "owner/name" → "name" (the org is the same for every repo of a team). */
function shortName(repo: string): string {
  return repo.split("/").pop() || repo;
}

export default function ReleasesGuarded() {
  return (
    <RoleGuard minRole="member">
      <ReleasesPage />
    </RoleGuard>
  );
}

function ReleasesPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoFilter, setRepoFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    api.listRepos().then((d) => setRepos(d.repos)).catch(() => {});
  }, []);

  const [waiting, setWaiting] = useState<WaitingRelease[]>([]);
  const [blocked, setBlocked] = useState<BlockedRelease[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const loadPending = useCallback(() => {
    api
      .pendingReleases(repoFilter || undefined)
      .then((d) => {
        setWaiting(d.waiting);
        setBlocked(d.blocked);
      })
      .catch(() => {});
  }, [repoFilter]);
  useEffect(() => {
    loadPending();
    const poll = setInterval(loadPending, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [loadPending]);

  const releaseNow = async (repo: string, retry: boolean) => {
    if (busy) return;
    setBusy(`now:${repo}`);
    try {
      await api.releaseNow(repo);
      toast(retry ? `Retrying the release for ${repo}` : `Releasing ${repo} now`);
      setWaiting((w) => w.filter((x) => x.repo !== repo));
      setTimeout(loadPending, 5_000);
    } catch (e) {
      toast(sendError(e), "error");
    } finally {
      setBusy("");
    }
  };

  const {
    items: releases,
    next,
    loading,
    loadingMore,
    error,
    moreFailed,
    loadMore,
    reload,
  } = usePagedList<Release>(
    (cursor) => api.listReleases(repoFilter || undefined, cursor).then((d) => ({ items: d.releases, next: d.next })),
    [repoFilter],
  );

  // Each listed repo's release-notes settings, so a step it never set up reads
  // "not set up" instead of looking like a failure. undefined = still loading,
  // null = could not read them.
  const [configs, setConfigs] = useState<Record<string, ReviewerConfig | null>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const repo of new Set(releases.map((r) => r.repo))) {
      if (asked.current.has(repo)) continue;
      asked.current.add(repo);
      api
        .getReviewerConfig(repo)
        .then((c) => setConfigs((m) => ({ ...m, [repo]: c })))
        .catch(() => setConfigs((m) => ({ ...m, [repo]: null })));
    }
  }, [releases]);

  const send = async (repo: string, tag: string, resend: "" | "email" | "all"): Promise<boolean> => {
    const key = `${repo}@${tag}:${resend}`;
    if (busy) return false;
    setBusy(key);
    try {
      await api.sendRelease(repo, tag, resend);
      toast(
        resend === "email"
          ? `Email queued for ${repo} ${tag}`
          : resend === "all"
            ? `Rewriting and re-publishing ${repo} ${tag}`
            : `Release notes queued for ${repo} ${tag}`,
      );
      return true;
    } catch (e) {
      toast(sendError(e), "error");
      return false;
    } finally {
      setBusy("");
    }
  };

  const used = usedSteps(releases);
  // Group by repo (newest release first) when the list spans more than one.
  const groups = useMemo(() => {
    const m = new Map<string, Release[]>();
    for (const r of releases) m.set(r.repo, [...(m.get(r.repo) ?? []), r]);
    return [...m.entries()];
  }, [releases]);
  const grouped = !repoFilter && groups.length > 1;
  const showRepoInBanner = !repoFilter && repos.length !== 1;

  const renderList = (list: Release[]) => (
    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
      {list.map((r) => {
        const key = `${r.repo}@${r.tag}`;
        return (
          <ReleaseRow
            key={key}
            release={r}
            dests={destinations(r, configs[r.repo], used.get(r.repo))}
            isOpen={open === key}
            onToggle={() => setOpen(open === key ? null : key)}
            busy={!!busy}
            missing={missingSteps(r, configs[r.repo], used.get(r.repo))}
            emailOn={emailSetUp(configs[r.repo], used.get(r.repo))}
            onSend={(resend) => send(r.repo, r.tag, resend)}
          />
        );
      })}
    </ul>
  );

  return (
    <Page>
      <PageHeader
        title="Releases"
        lead={
          <>
            Notes Coderhelm writes for each release tag, published to GitHub, Confluence and email. Turn them on in{" "}
            <Link href="/reviewer/config" className={linkButton}>Reviewer settings</Link>.
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setWriting((w) => !w)}
            aria-expanded={writing}
            aria-controls="write-notes"
            className={secondaryButton}
          >
            Write notes for a tag
          </button>
        }
      />

      {writing && (
        <WriteNotesForm
          repos={repos}
          initialRepo={repoFilter || (repos.length === 1 ? repos[0].name : "")}
          busy={!!busy}
          onSubmit={async (repo, tag) => {
            if (await send(repo, tag, "")) setWriting(false);
          }}
          onClose={() => setWriting(false)}
        />
      )}

      {(blocked.length > 0 || waiting.length > 0) && (
        <div className="mt-6 flex flex-col gap-2">
          {blocked.map((b) => (
            <Callout key={`blocked:${b.repo}`} variant="error" title={`Release blocked for ${b.repo}`}>
              <p className="text-xs break-words">{b.error}</p>
              <p className="mt-1 text-[11px] opacity-80">
                Tried {plural(b.attempts, "time")}
                {b.failed_at && <>, last {fullDate(b.failed_at)}</>}. Fix the cause (for example a tag rule on GitHub),
                then retry.
              </p>
              <button type="button" onClick={() => releaseNow(b.repo, true)} disabled={!!busy} className={`mt-2 ${smallButton}`}>
                {busy === `now:${b.repo}` ? "Retrying…" : "Retry release"}
              </button>
            </Callout>
          ))}
          {waiting.map((w) => {
            const left = Math.max(0, w.fires_at * 1000 - now);
            const mins = Math.floor(left / 60_000);
            const secs = Math.floor((left % 60_000) / 1000);
            return (
              <div
                key={`waiting:${w.repo}`}
                data-testid="pending-release"
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-sky-500/25 bg-sky-500/5 px-4 py-2"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400 animate-pulse motion-reduce:animate-none" />
                <p className="min-w-0 flex-1 text-sm text-zinc-300" aria-live="polite">
                  {showRepoInBanner && <span className="font-medium text-zinc-100">{shortName(w.repo)}: </span>}
                  {plural(w.merges, "merge")} waiting
                  <span className="text-zinc-500">
                    {" · "}
                    {left > 0
                      ? `releases from ${w.base_branch || "the default branch"} in ${mins}:${String(secs).padStart(2, "0")}`
                      : "releasing…"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => releaseNow(w.repo, false)}
                  disabled={!!busy || left === 0}
                  className={smallButton}
                >
                  {busy === `now:${w.repo}` ? "Releasing…" : "Release now"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ReleasesRepoFilter repos={repos} value={repoFilter} onChange={setRepoFilter} />

      <div className="mt-4">
        {loading ? (
          <ReleaseListSkeleton />
        ) : error ? (
          <Callout variant="error" title="Could not load release notes">
            <p>Check your connection and try again.</p>
            <button type="button" onClick={reload} className={`mt-2 ${secondaryButton}`}>
              Try again
            </button>
          </Callout>
        ) : releases.length === 0 ? (
          <div className={`${cardClass} p-8 text-center`}>
            <p className="mb-1 text-base text-zinc-300">
              {repoFilter ? `No release notes for ${shortName(repoFilter)} yet` : "No release notes yet"}
            </p>
            <p className="text-sm text-zinc-500">
              They appear here after the next release tag on a repo with release notes on, or use Write notes for a tag.
            </p>
          </div>
        ) : grouped ? (
          <div className="flex flex-col gap-8">
            {groups.map(([repo, list]) => (
              <section key={repo} aria-labelledby={`releases-${repo}`}>
                <h2
                  id={`releases-${repo}`}
                  className="mb-2 flex min-w-0 items-baseline gap-2 text-sm font-semibold text-zinc-200"
                >
                  <span className="min-w-0 truncate" title={repo}>{shortName(repo)}</span>
                  <span className="text-xs font-normal text-zinc-500">{plural(list.length, "release")}</span>
                </h2>
                {renderList(list)}
              </section>
            ))}
          </div>
        ) : (
          renderList(releases)
        )}
      </div>
      <LoadMoreButton hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />
    </Page>
  );
}

/**
 * Which repo's releases to show. Self-contained so the shared list toolbar can
 * replace it: hidden with one repo, tabs for a few, a searchable picker beyond.
 */
function ReleasesRepoFilter({
  repos,
  value,
  onChange,
}: {
  repos: Repo[];
  value: string;
  onChange: (repo: string) => void;
}) {
  if (repos.length <= 1) return null;
  if (repos.length <= MAX_TABS) {
    const options = [{ value: "", label: "All repos" }, ...repos.map((r) => ({ value: r.name, label: shortName(r.name) }))];
    return (
      <div className="mt-6 max-w-full overflow-x-auto" data-testid="releases-filter">
        <Segmented label="Show releases for" options={options} value={value} onChange={onChange} />
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="releases-filter">
      <div className="w-full sm:w-72 [&>div]:mb-0">
        <RepoCombobox repos={repos} selected={value} onSelect={onChange} label="Show releases for" placeholder="All repos" />
      </div>
      {value && (
        <button type="button" onClick={() => onChange("")} className={`${linkButton} text-xs`}>
          Show all repos
        </button>
      )}
    </div>
  );
}

/** Write notes for a tag Coderhelm didn't cut (or an older one). */
function WriteNotesForm({
  repos,
  initialRepo,
  busy,
  onSubmit,
  onClose,
}: {
  repos: Repo[];
  initialRepo: string;
  busy: boolean;
  onSubmit: (repo: string, tag: string) => void;
  onClose: () => void;
}) {
  const [repo, setRepo] = useState(initialRepo);
  const [tag, setTag] = useState("");
  const tagRef = useRef<HTMLInputElement>(null);
  const tagInvalid = tag !== "" && !TAG_PATTERN.test(tag);
  const ready = !!repo && !!tag && !tagInvalid && !busy;

  useEffect(() => {
    if (initialRepo) tagRef.current?.focus();
  }, [initialRepo]);

  return (
    <form
      id="write-notes"
      aria-labelledby="write-notes-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit(repo, tag);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className={`mt-6 ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="write-notes-title" className="text-sm font-semibold text-zinc-200">Write notes for a tag</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            For a tag Coderhelm didn&apos;t cut, or an older release. Publishes wherever the repo is set up to.
          </p>
        </div>
        <button type="button" onClick={onClose} className={`${linkButton} shrink-0 text-xs`}>
          Cancel
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {repos.length !== 1 && (
          <div className="w-full sm:w-72 [&>div]:mb-0">
            <RepoCombobox repos={repos} selected={repo} onSelect={setRepo} />
          </div>
        )}
        <input
          ref={tagRef}
          aria-label="Release tag"
          aria-invalid={tagInvalid || undefined}
          aria-describedby={tagInvalid ? "release-tag-error" : undefined}
          placeholder="Tag, e.g. v2.3.0"
          value={tag}
          onChange={(e) => setTag(e.target.value.trim())}
          className={`${inputClass} w-full font-mono sm:w-44 ${tagInvalid ? "border-red-500/60" : ""}`}
        />
        <button type="submit" disabled={!ready} className={primaryButton}>
          Write notes
        </button>
      </div>
      {tagInvalid && (
        <p id="release-tag-error" role="alert" className="mt-2 text-xs text-red-400">
          A tag can use letters, numbers and . _ - + / only.
        </p>
      )}
    </form>
  );
}

// ── Where a release went ─────────────────────────────────────────────

type DestTone = "done" | "failed" | "pending" | "off";

interface Dest {
  key: "github" | "confluence" | "email";
  name: string;
  tone: DestTone;
  /** The state in words, e.g. "published", "not set up for this repo". */
  state: string;
  href?: string;
}

/** Per repo, the steps any of its listed releases has done (used when its settings can't be read). */
type UsedSteps = Map<string, { confluence: boolean; email: boolean }>;
type Used = { confluence: boolean; email: boolean } | undefined;

function usedSteps(releases: Release[]): UsedSteps {
  const m: UsedSteps = new Map();
  for (const r of releases) {
    const u = m.get(r.repo) ?? { confluence: false, email: false };
    m.set(r.repo, { confluence: u.confluence || !!r.confluence_url, email: u.email || !!r.email_sent_at });
  }
  return m;
}

function confluenceSetUp(cfg: ReviewerConfig | null | undefined, used: Used): boolean {
  return cfg ? !!cfg.release_notes_confluence_parent_id?.trim() : !!used?.confluence;
}

function emailSetUp(cfg: ReviewerConfig | null | undefined, used: Used): boolean {
  return cfg ? !!cfg.release_notes_email_webhook_url?.trim() : !!used?.email;
}

/**
 * The state of each destination. Coderhelm publishes in order (GitHub, then
 * Confluence, then email) and stops at the first error, so a failed run's
 * error belongs to the first set-up step that hasn't happened.
 */
function destinations(r: Release, cfg: ReviewerConfig | null | undefined, used: Used): Dest[] {
  const confluenceOn = confluenceSetUp(cfg, used);
  const emailOn = emailSetUp(cfg, used);
  // Settings unknown (still loading, or unreadable) and never used: say "not posted", not "not set up".
  const settingsKnown = !!cfg;
  const steps: { key: Dest["key"]; name: string; done: boolean; on: boolean; doneText: string; todoText: string; href?: string }[] = [
    {
      key: "github",
      name: "GitHub release",
      done: !!r.github_release_url,
      on: true,
      doneText: "published",
      todoText: r.entry_md || r.github_release_md ? "not created yet" : "notes not written yet",
      href: r.github_release_url || undefined,
    },
    {
      key: "confluence",
      name: "Confluence",
      done: !!r.confluence_url,
      on: confluenceOn,
      doneText: "published",
      todoText: "not posted yet",
      href: r.confluence_url.startsWith("http") ? r.confluence_url : undefined,
    },
    {
      key: "email",
      name: "Email",
      done: !!r.email_sent_at,
      on: emailOn,
      doneText: r.email_sent_at ? `sent ${timeAgo(r.email_sent_at)}` : "sent",
      todoText: "not sent yet",
    },
  ];
  let failureTaken = false;
  return steps.map((s): Dest => {
    if (s.done) return { key: s.key, name: s.name, tone: "done", state: s.doneText, href: s.href };
    if (!s.on) {
      return { key: s.key, name: s.name, tone: "off", state: settingsKnown ? "not set up for this repo" : "not posted" };
    }
    if (r.last_error && !failureTaken) {
      failureTaken = true;
      return { key: s.key, name: s.name, tone: "failed", state: `failed: ${r.last_error}` };
    }
    return { key: s.key, name: s.name, tone: "pending", state: s.todoText };
  });
}

/**
 * The button for what this release hasn't done yet, named by what it will
 * do ("Create the GitHub Release and send the email"), or "" when nothing is
 * missing.
 */
function missingSteps(r: Release, cfg: ReviewerConfig | null | undefined, used: Used): string {
  const todo: string[] = [];
  if (!r.entry_md && !r.github_release_md) todo.push("write the notes");
  if (!r.github_release_url) todo.push("create the GitHub Release");
  if (!r.confluence_url && confluenceSetUp(cfg, used)) todo.push("post to Confluence");
  if (!r.email_sent_at && emailSetUp(cfg, used)) todo.push("send the email");
  if (todo.length === 0) return "";
  const words = todo.length === 1 ? todo[0] : `${todo.slice(0, -1).join(", ")} and ${todo[todo.length - 1]}`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const DEST_ICONS: Record<Dest["key"], () => ReactNode> = {
  github: () => <GitHubIcon />,
  confluence: () => <AtlassianIcon />,
  email: () => <MailIcon />,
};

const DEST_TONES: Record<DestTone, string> = {
  done: "text-emerald-400",
  failed: "text-red-400",
  pending: "text-amber-400",
  off: "text-zinc-600",
};

/** One small icon per destination; the color and tooltip carry its state. */
function DestIcon({ dest }: { dest: Dest }) {
  const label = `${dest.name}: ${dest.state}`;
  return (
    <span
      title={label}
      data-dest={dest.key}
      data-state={dest.tone}
      className={`relative inline-flex h-6 w-6 items-center justify-center [&_svg]:h-3.5 [&_svg]:w-3.5 ${DEST_TONES[dest.tone]}`}
    >
      <span aria-hidden="true">{DEST_ICONS[dest.key]()}</span>
      {dest.tone === "failed" && (
        <span aria-hidden="true" className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-zinc-900" />
      )}
      <span className="sr-only">{label}.</span>
    </span>
  );
}

/** PR numbers the GitHub notes mention (#123), in order, without repeats. */
function mentionedPrs(md: string): number[] {
  const seen = new Set<number>();
  for (const m of md.matchAll(/(?:^|[\s(\[])#(\d{1,7})\b/g)) seen.add(Number(m[1]));
  return [...seen];
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 rounded text-sm text-zinc-300 underline-offset-4 hover:text-zinc-100 hover:underline [&_svg]:h-3 [&_svg]:w-3 ${focusRing}`}
    >
      {children}
      <span aria-hidden="true" className="text-zinc-500"><ExternalLinkIcon /></span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function ReleaseRow({
  release: r,
  dests,
  isOpen,
  onToggle,
  busy,
  missing,
  emailOn,
  onSend,
}: {
  release: Release;
  dests: Dest[];
  isOpen: boolean;
  onToggle: () => void;
  busy: boolean;
  missing: string;
  emailOn: boolean;
  onSend: (resend: "" | "email" | "all") => void;
}) {
  const panelId = `release-${`${r.repo}-${r.tag}`.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const failed = dests.find((d) => d.tone === "failed");
  const prs = mentionedPrs(r.github_release_md);
  const both = !!r.entry_md && !!r.github_release_md;
  const [notesView, setNotesView] = useState<"summary" | "github">(r.entry_md ? "summary" : "github");
  const notes = notesView === "summary" ? r.entry_md : r.github_release_md;

  return (
    <li data-testid="release-row">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 ${focusRing} focus-visible:-outline-offset-2`}
      >
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="sr-only">{r.repo} </span>
            <span className="font-mono text-sm font-semibold text-zinc-100 break-all">{r.tag}</span>
            <span className="text-xs text-zinc-500">
              {r.pr_count > 0 && <>{plural(r.pr_count, "PR")}</>}
              {r.pr_count > 0 && r.updated_at && <span aria-hidden="true"> · </span>}
              {r.updated_at && (
                <time dateTime={r.updated_at} title={`Notes written ${fullDate(r.updated_at)}`}>
                  {timeAgo(r.updated_at)}
                </time>
              )}
            </span>
          </p>
          <p className={`mt-1 line-clamp-2 text-sm ${r.headline ? "text-zinc-300" : "italic text-zinc-500"}`}>
            {r.headline || "No summary written yet"}
          </p>
          {failed && (
            <p className="mt-1 line-clamp-1 text-xs text-red-400">
              {failed.name} failed{r.failed_at ? ` ${timeAgo(r.failed_at)}` : ""}. Open for details.
            </p>
          )}
        </div>
        <span className="flex shrink-0 items-start gap-0.5 pt-px">
          {dests.map((d) => (
            <DestIcon key={d.key} dest={d} />
          ))}
          <span
            aria-hidden="true"
            className={`ml-1 inline-flex h-6 items-center text-zinc-500 transition-transform motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`}
          >
            <ChevronRightIcon />
          </span>
        </span>
      </button>

      {isOpen && (
        <div id={panelId} className="flex min-w-0 flex-col gap-4 border-t border-zinc-800/70 bg-zinc-950/40 px-4 py-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {r.github_release_url && <ExternalLink href={r.github_release_url}>GitHub release</ExternalLink>}
            {r.confluence_url.startsWith("http") && <ExternalLink href={r.confluence_url}>Confluence page</ExternalLink>}
            {r.prev_tag && (
              <ExternalLink
                href={`https://github.com/${r.repo}/compare/${encodeURIComponent(r.prev_tag)}...${encodeURIComponent(r.tag)}`}
              >
                <span>
                  Changes since <span className="font-mono text-xs">{r.prev_tag}</span>
                </span>
              </ExternalLink>
            )}
          </div>

          {prs.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-400">Pull requests</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {prs.map((n) => (
                  <li key={n}>
                    <a
                      href={`https://github.com/${r.repo}/pull/${n}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded text-sm text-zinc-300 hover:text-zinc-100 hover:underline ${focusRing}`}
                    >
                      #{n}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-400">Published to</p>
            <ul className="flex flex-col gap-1 text-sm">
              {dests.map((d) => (
                <li key={d.key} className="flex min-w-0 items-start gap-2">
                  <span aria-hidden="true" className={`mt-0.5 shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5 ${DEST_TONES[d.tone]}`}>
                    {DEST_ICONS[d.key]()}
                  </span>
                  <span className="min-w-0 break-words">
                    <span className="text-zinc-300">{d.name}</span>
                    <span className={d.tone === "failed" ? "text-red-400" : "text-zinc-500"}>: {d.state}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {r.unclear && (
            <div className="whitespace-pre-line rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              Listed as written (not enough in the PR or ticket to describe them):{"\n"}
              {r.unclear}
            </div>
          )}

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-zinc-400">
                {both ? "Notes" : notesView === "summary" ? "Team summary (Confluence and email)" : "GitHub release notes"}
              </p>
              {both && (
                <Segmented
                  label="Which notes"
                  options={[
                    { value: "summary", label: "Team summary" },
                    { value: "github", label: "GitHub release" },
                  ]}
                  value={notesView}
                  onChange={setNotesView}
                />
              )}
            </div>
            <div className="min-w-0 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <Markdown>{notes || "_Not written yet._"}</Markdown>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {missing && (
              <button type="button" onClick={() => onSend("")} disabled={busy} className={smallButton}>
                {missing}
              </button>
            )}
            {emailOn && (
              <button type="button" onClick={() => onSend("email")} disabled={busy} className={smallButton}>
                Send the email again
              </button>
            )}
            <button
              type="button"
              onClick={() => onSend("all")}
              disabled={busy}
              className={smallButton}
              title="Write the notes from scratch and update the GitHub release, Confluence and the email"
            >
              Rewrite the notes
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ReleaseListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading releases" className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-2 h-3.5 w-28" />
            <Skeleton className="h-3 w-3/4 max-w-md" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
