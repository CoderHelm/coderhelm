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
  const [removing, setRemoving] = useState<string | null>(null);

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

  const handleRemove = async (repo: Repo) => {
    setRemoving(repo.name);
    try {
      await api.deleteRepo(repo.name);
      setRepos((prev) => prev.filter((r) => r.name !== repo.name));
    } catch { /* ignore */ }
    setRemoving(null);
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
        Repos connected via the GitHub App. Enable the ones you want d3ftly to work on.
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
            href="https://github.com/apps/d3ftly-agent"
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
                <button
                  onClick={() => handleRemove(repo)}
                  disabled={removing === repo.name}
                  className="ml-3 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                  title="Remove repo"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
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
