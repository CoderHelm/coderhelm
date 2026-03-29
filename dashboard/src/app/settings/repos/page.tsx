"use client";

import { useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";

const PAGE_SIZE = 10;

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    api.listRepos().then((data) => {
      setRepos(data.repos);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Poll while any repo is pending
  useEffect(() => {
    if (!repos.some((r) => r.onboard_status === "pending")) return;
    const timer = setInterval(() => {
      api.listRepos().then((data) => setRepos(data.repos)).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [repos]);

  const handleToggle = async (repo: Repo) => {
    setToggling(repo.name);
    try {
      await api.toggleRepo(repo.name, !repo.enabled);
      setRepos((prev) => prev.map((r) => r.name === repo.name ? { ...r, enabled: !r.enabled, onboard_status: !repo.enabled ? "pending" : undefined } : r));
    } catch { /* ignore */ }
    setToggling(null);
  };

  const filtered = repos.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to first page when search changes
  useEffect(() => { setPage(0); }, [search]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Repositories</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Repos connected via the GitHub App. Enable the ones you want Coderhelm to work on.
      </p>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : repos.length === 0 ? (
        <div className="text-zinc-500 border border-zinc-800 rounded-lg p-8 text-center">
          <p>No repos connected yet.</p>
          <a
            href="https://github.com/apps/coderhelm-agent"
            className="text-zinc-300 underline mt-2 inline-block"
          >
            Install the GitHub App
          </a>
        </div>
      ) : (
        <>
          {/* Search */}
          <input
            type="text"
            placeholder="Search repos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full mb-4 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />

          {/* Count */}
          <p className="text-xs text-zinc-500 mb-3">
            {filtered.length} repo{filtered.length !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </p>

          {/* Repo list */}
          <div className="space-y-2">
            {paged.map((repo) => (
              <div
                key={repo.name}
                className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Toggle switch */}
                  <button
                    onClick={() => handleToggle(repo)}
                    disabled={toggling === repo.name}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      repo.enabled ? "bg-green-500" : "bg-zinc-700"
                    } ${toggling === repo.name ? "opacity-50" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        repo.enabled ? "translate-x-4.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div className="min-w-0">
                    <span className="text-sm font-mono text-zinc-200 truncate block">{repo.name}</span>
                    {repo.enabled && repo.onboard_status === "pending" && (
                      <span className="text-[11px] text-yellow-400/80 flex items-center gap-1 mt-0.5">
                        <span className="inline-block w-3 h-3 border border-yellow-400/60 border-t-yellow-300 rounded-full animate-spin" />
                        Analyzing...
                      </span>
                    )}
                    {repo.enabled && repo.onboard_status === "failed" && (
                      <span className="text-[11px] text-red-400 mt-0.5 block" title={repo.onboard_error}>
                        ✕ Analysis failed{repo.onboard_error ? `: ${repo.onboard_error.slice(0, 80)}` : ""}
                      </span>
                    )}
                    {repo.enabled && repo.onboard_status === "ready" && (
                      <span className="text-[11px] text-green-400/70 mt-0.5 block">✓ Ready</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-zinc-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
