"use client";

import { useEffect, useState } from "react";
import { api, type Release, type Repo } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { Markdown } from "@/components/markdown";
import { TableSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";

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
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [newRepo, setNewRepo] = useState("");
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    api.listRepos().then((d) => setRepos(d.repos)).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    api
      .listReleases(repoFilter || undefined)
      .then((d) => setReleases(d.releases))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [repoFilter]);

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
    } catch {
      toast("Could not queue it", "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Releases</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Release notes CoderHelm wrote for each release tag: the GitHub Release, the Confluence changelog entry, and the
          email to your team. Turn it on per repo in Reviewer → Configure → Release notes.
        </p>
      </div>

      <div className="mb-6 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">Write notes for a tag</h2>
        <p className="text-xs text-zinc-500 mt-1 mb-3">For a tag CoderHelm didn&apos;t cut, or an older release. Publishes to whatever the repo has set up.</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-72">
            <RepoCombobox repos={repos} selected={newRepo} onSelect={setNewRepo} />
          </div>
          <input
            placeholder="v2.3.0"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value.trim())}
            className="w-36 px-3 py-1.5 text-sm rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 font-mono"
          />
          <button
            onClick={() => send(newRepo, newTag, "")}
            disabled={!newRepo || !newTag || !!busy}
            className="text-xs px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 disabled:opacity-50"
          >
            Write notes
          </button>
        </div>
      </div>

      <div className="mb-5 max-w-sm">
        <RepoCombobox repos={repos} selected={repoFilter} onSelect={setRepoFilter} />
        {repoFilter && (
          <button onClick={() => setRepoFilter("")} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">
            Clear filter
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : releases.length === 0 ? (
        <div className="text-zinc-500 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-lg mb-2">No release notes yet</p>
          <p className="text-sm">They appear here after the next release tag on a repo with release notes on.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map((r) => {
            const key = `${r.repo}@${r.tag}`;
            const isOpen = open === key;
            return (
              <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/40">
                <button onClick={() => setOpen(isOpen ? null : key)} className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-zinc-100">{r.repo}</span>
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">{r.tag}</span>
                  {r.prev_tag && <span className="text-[11px] text-zinc-500">since {r.prev_tag} · {r.pr_count} PRs</span>}
                  <span className="text-xs text-zinc-400 truncate max-w-md">{r.headline}</span>
                  <span className="ml-auto flex items-center gap-2 text-[11px]">
                    <Step done={!!r.github_release_url} label="GitHub" />
                    <Step done={!!r.confluence_url} label="Confluence" />
                    <Step done={!!r.email_sent_at} label="Email" />
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {r.github_release_url && <a href={r.github_release_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">GitHub Release ↗</a>}
                      {r.confluence_url && r.confluence_url.startsWith("http") && <a href={r.confluence_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Confluence ↗</a>}
                      {r.email_sent_at && <span className="text-zinc-500">emailed {new Date(r.email_sent_at).toLocaleString()}</span>}
                    </div>
                    {r.unclear && (
                      <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 whitespace-pre-line">
                        Listed as written (not enough in the PR or ticket to describe them):{"\n"}{r.unclear}
                      </div>
                    )}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="p-3 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Business summary (Confluence + email)</div>
                        <Markdown>{r.entry_md || "_Not written yet._"}</Markdown>
                      </div>
                      <div className="p-3 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">GitHub Release</div>
                        <Markdown>{r.github_release_md || "_Not written yet._"}</Markdown>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => send(r.repo, r.tag, "")} disabled={!!busy} className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 disabled:opacity-50">
                        Finish missing steps
                      </button>
                      <button onClick={() => send(r.repo, r.tag, "email")} disabled={!!busy} className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 disabled:opacity-50">
                        Send email again
                      </button>
                      <button onClick={() => send(r.repo, r.tag, "all")} disabled={!!busy} className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 disabled:opacity-50">
                        Rewrite + re-publish
                      </button>
                      <button onClick={load} className="text-xs px-2.5 py-1 text-zinc-500 hover:text-zinc-300">Refresh</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded border ${done ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-zinc-700 text-zinc-500"}`}>
      {done ? "✓" : "·"} {label}
    </span>
  );
}
