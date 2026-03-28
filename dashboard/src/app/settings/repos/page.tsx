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

  useEffect(() => {
    api.listRepos().then((data) => {
      setRepos(data.repos);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

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
        Repos connected to d3ftly. d3ftly will never push directly to main — it always creates feature branches.
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
                <div>
                  <span className="text-sm font-mono text-zinc-200">{repo.name}</span>
                  <span className="ml-3 text-xs text-zinc-600">{repo.ticket_source}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs border ${
                    repo.enabled
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-zinc-800 text-zinc-500 border-zinc-700"
                  }`}
                >
                  {repo.enabled ? "Active" : "Disabled"}
                </span>
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
