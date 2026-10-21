"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type BlockedRelease, type Release, type Repo, type WaitingRelease } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { Markdown } from "@/components/markdown";
import { TableSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { usePagedList, LoadMoreButton } from "@/components/load-more";
import { Callout } from "@/components/callout";
import { focusRing, linkButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, cardClass } from "@/components/page";

// The characters the backend accepts in a tag (anything else is a bare 400).
const TAG_PATTERN = /^[A-Za-z0-9._+/-]{1,200}$/;

/** Turn a failed send into words: the endpoint answers with bare status codes. */
function sendError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/\b403\b/.test(msg)) return "Your role cannot write release notes. Ask an admin on your team.";
  // 400 = a tag the backend refuses, or no GitHub App installation for the team.
  if (/\b400\b/.test(msg)) return "Not accepted. Check the tag name, and that the GitHub App is installed.";
  return msg && !/^API \d+/.test(msg) ? msg : "Could not queue it. Try again.";
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
  const [newRepo, setNewRepo] = useState("");
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState("");
  const { toast } = useToast();
  const tagInvalid = newTag !== "" && !TAG_PATTERN.test(newTag);

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

  const send = async (repo: string, tag: string, resend: "" | "email" | "all") => {
    const key = `${repo}@${tag}:${resend}`;
    if (busy) return;
    setBusy(key);
    try {
      await api.sendRelease(repo, tag, resend);
      toast(
        resend === "email"
          ? `Email queued for ${repo} ${tag}`
          : resend === "all"
            ? `Rewriting and re-publishing ${repo} ${tag}`
            : `Release notes queued for ${repo} ${tag}`
      );
    } catch (e) {
      toast(sendError(e), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <Page>
      <PageHeader
        title="Releases"
        lead={
          <>
            Release notes Coderhelm wrote for each release tag: the GitHub Release, the Confluence changelog entry, and the
            email to your team. Turn them on for a repo in{" "}
            <Link href="/reviewer/config" className={linkButton}>Reviewer settings</Link>, under Release notes.
          </>
        }
      />

      {(blocked.length > 0 || waiting.length > 0) && (
        <div className="mt-6 space-y-3">
          {blocked.map((b) => (
            <Callout key={`blocked:${b.repo}`} variant="error" title={`Release blocked for ${b.repo}`}>
              <p className="text-xs break-words">{b.error}</p>
              <p className="mt-1 text-[11px] opacity-80">
                Tried {b.attempts} {b.attempts === 1 ? "time" : "times"}
                {b.failed_at && <>, last {new Date(b.failed_at).toLocaleString()}</>}. Fix the cause (for example a tag rule on
                GitHub), then retry.
              </p>
              <button
                type="button"
                onClick={() => releaseNow(b.repo, true)}
                disabled={!!busy}
                className={`mt-2 ${secondaryButton}`}
              >
                {busy === `now:${b.repo}` ? "Retrying…" : "Retry release"}
              </button>
            </Callout>
          ))}
          {waiting.map((w) => {
            const left = Math.max(0, w.fires_at * 1000 - now);
            const mins = Math.floor(left / 60_000);
            const secs = Math.floor((left % 60_000) / 1000);
            return (
              <div key={`waiting:${w.repo}`} className={`${cardClass} flex flex-wrap items-center gap-3`}>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200">
                    <span className="font-mono text-xs break-all">{w.repo}</span> has {w.merges}{" "}
                    {w.merges === 1 ? "merge" : "merges"} waiting to release
                  </p>
                  <p className="text-xs text-zinc-500" aria-live="polite">
                    {left > 0
                      ? `Releases from ${w.base_branch || "the default branch"} in ${mins}:${String(secs).padStart(2, "0")}`
                      : "Releasing…"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => releaseNow(w.repo, false)}
                  disabled={!!busy || left === 0}
                  className={`ml-auto ${secondaryButton}`}
                >
                  {busy === `now:${w.repo}` ? "Releasing…" : "Release now"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className={`mt-6 mb-6 ${cardClass}`}>
        <h2 className="text-sm font-semibold text-zinc-200">Write notes for a tag</h2>
        <p className="text-xs text-zinc-500 mt-1 mb-3">For a tag Coderhelm didn&apos;t cut, or an older release. Publishes to whatever the repo has set up.</p>
        <div className="flex flex-wrap items-start gap-2">
          <div className="w-full sm:w-72 [&>div]:mb-0">
            <RepoCombobox repos={repos} selected={newRepo} onSelect={setNewRepo} />
          </div>
          <input
            aria-label="Release tag"
            aria-invalid={tagInvalid || undefined}
            aria-describedby={tagInvalid ? "release-tag-error" : undefined}
            placeholder="v2.3.0"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value.trim())}
            className={`w-36 px-3 py-2 text-sm rounded-lg bg-zinc-950 border text-zinc-100 placeholder:text-zinc-600 font-mono ${tagInvalid ? "border-red-500/60" : "border-zinc-700"} ${focusRing}`}
          />
          <button
            type="button"
            onClick={() => send(newRepo, newTag, "")}
            disabled={!newRepo || !newTag || tagInvalid || !!busy}
            className={secondaryButton}
          >
            Write notes
          </button>
        </div>
        {tagInvalid && (
          <p id="release-tag-error" role="alert" className="mt-2 text-xs text-red-400">
            A tag can use letters, numbers and . _ - + / only.
          </p>
        )}
      </div>

      <div className="mb-5 max-w-sm">
        <p className="mb-1 text-xs text-zinc-500">Show releases for</p>
        <div className="[&>div]:mb-0">
          <RepoCombobox repos={repos} selected={repoFilter} onSelect={setRepoFilter} />
        </div>
        {repoFilter && (
          <button type="button" onClick={() => setRepoFilter("")} className={`mt-2 ${linkButton} text-xs`}>
            Show all repos
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : error ? (
        <Callout variant="error" title="Could not load release notes">
          <p>Check your connection and try again.</p>
          <button type="button" onClick={reload} className={`mt-2 ${secondaryButton}`}>
            Try again
          </button>
        </Callout>
      ) : releases.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500">
          <p className="text-lg mb-2">{repoFilter ? `No release notes for ${repoFilter} yet` : "No release notes yet"}</p>
          <p className="text-sm">They appear here after the next release tag on a repo with release notes on.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map((r) => {
            const key = `${r.repo}@${r.tag}`;
            const isOpen = open === key;
            return (
              <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/40">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className={`w-full text-left px-4 py-3 flex flex-wrap items-center gap-3 rounded-lg ${focusRing}`}
                >
                  <span className="font-mono text-xs text-zinc-100 break-all">{r.repo}</span>
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">{r.tag}</span>
                  {r.prev_tag && <span className="text-[11px] text-zinc-500">since {r.prev_tag} · {r.pr_count} PRs</span>}
                  <span className="text-xs text-zinc-400 truncate min-w-0 max-w-full sm:max-w-md">{r.headline}</span>
                  <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                    <Step done={!!r.github_release_url} label="GitHub" />
                    <Step done={!!r.confluence_url} label="Confluence" />
                    <Step done={!!r.email_sent_at} label="Email" />
                  </span>
                </button>
                {r.last_error && (
                  <p className="px-4 pb-2 -mt-1 text-xs text-red-400 break-words">
                    Last run failed{r.failed_at ? ` ${new Date(r.failed_at).toLocaleString()}` : ""}: {r.last_error}
                  </p>
                )}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {r.github_release_url && <a href={r.github_release_url} target="_blank" rel="noreferrer" className={`rounded text-blue-400 hover:underline ${focusRing}`}>GitHub Release <span aria-hidden="true">↗</span><span className="sr-only">(opens in a new tab)</span></a>}
                      {r.confluence_url && r.confluence_url.startsWith("http") && <a href={r.confluence_url} target="_blank" rel="noreferrer" className={`rounded text-blue-400 hover:underline ${focusRing}`}>Confluence <span aria-hidden="true">↗</span><span className="sr-only">(opens in a new tab)</span></a>}
                      {r.email_sent_at && <span className="text-zinc-500">emailed {new Date(r.email_sent_at).toLocaleString()}</span>}
                    </div>
                    {r.unclear && (
                      <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 whitespace-pre-line">
                        Listed as written (not enough in the PR or ticket to describe them):{"\n"}{r.unclear}
                      </div>
                    )}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="p-3 rounded bg-zinc-950 border border-zinc-800 min-w-0 overflow-x-auto">
                        <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Business summary (Confluence and email)</div>
                        <Markdown>{r.entry_md || "_Not written yet._"}</Markdown>
                      </div>
                      <div className="p-3 rounded bg-zinc-950 border border-zinc-800 min-w-0 overflow-x-auto">
                        <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">GitHub Release</div>
                        <Markdown>{r.github_release_md || "_Not written yet._"}</Markdown>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => send(r.repo, r.tag, "")} disabled={!!busy} className={secondaryButton}>
                        Finish missing steps
                      </button>
                      <button type="button" onClick={() => send(r.repo, r.tag, "email")} disabled={!!busy} className={secondaryButton}>
                        Send email again
                      </button>
                      <button type="button" onClick={() => send(r.repo, r.tag, "all")} disabled={!!busy} className={secondaryButton}>
                        Rewrite and publish again
                      </button>
                      <button type="button" onClick={reload} className={linkButton}>Refresh</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <LoadMoreButton hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />
    </Page>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded border whitespace-nowrap ${done ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-zinc-700 text-zinc-500"}`}>
      <span aria-hidden="true">{done ? "✓" : "·"}</span> {label}
      <span className="sr-only">{done ? ": done" : ": not done"}</span>
    </span>
  );
}
