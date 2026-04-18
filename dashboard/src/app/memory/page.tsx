"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type Repo, type MemoryItem, type MemoryListResponse, type MemoryStats } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  semantic: "bg-blue-500/20 text-blue-400",
  procedural: "bg-purple-500/20 text-purple-400",
  correction: "bg-yellow-500/20 text-yellow-400",
  anti_pattern: "bg-red-500/20 text-red-400",
  episodic: "bg-green-500/20 text-green-400",
  reasoning: "bg-cyan-500/20 text-cyan-400",
};

const TYPE_LABELS: Record<string, string> = {
  semantic: "Finding",
  procedural: "Procedure",
  correction: "Correction",
  anti_pattern: "Anti-pattern",
  episodic: "Episode",
  reasoning: "Reasoning",
};

function formatDate(microseconds: number): string {
  if (!microseconds) return "—";
  const ms = microseconds > 1e15 ? microseconds / 1000 : microseconds;
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TypeBadge({ type: t }: { type: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[t] || "bg-zinc-700 text-zinc-300"}`}>
      {TYPE_LABELS[t] || t}
    </span>
  );
}

export default function MemoryPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const pageSize = 50;

  // Load repos
  useEffect(() => {
    api.listRepos().then(({ repos }) => {
      const enabled = repos.filter((r) => r.enabled);
      setRepos(enabled);
      if (enabled.length > 0 && !selectedRepo) {
        setSelectedRepo(enabled[0].name); // name is "owner/repo"
      }
    }).catch(() => {});
  }, []);

  // Load memories when repo/page/search/filter changes
  const loadMemories = useCallback(async () => {
    if (!selectedRepo) return;
    setLoading(true);
    try {
      const [memRes, statsRes] = await Promise.all([
        api.listMemories(selectedRepo, page, pageSize, search || undefined, typeFilter || undefined),
        api.getMemoryStats(selectedRepo),
      ]);
      setMemories(memRes.memories);
      setTotal(memRes.total);
      setStats(statsRes);
    } catch {
      setMemories([]);
      setTotal(0);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [selectedRepo, page, search, typeFilter]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this memory? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await api.deleteMemory(id, selectedRepo);
      await loadMemories();
    } catch {
      alert("Failed to delete memory");
    } finally {
      setDeleting(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Agent Memory</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Browse, search, and manage memories CoderHelm has learned from past runs.
        </p>
      </div>

      {repos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <svg className="w-12 h-12 mx-auto mb-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75" />
          </svg>
          <p className="text-zinc-400 text-sm">No active repositories.</p>
          <p className="text-zinc-500 text-xs mt-1">Enable a repository in Settings to start building agent memory.</p>
        </div>
      ) : (
      <>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Repo picker */}
        <select
          value={selectedRepo}
          onChange={(e) => {
            setSelectedRepo(e.target.value);
            setPage(1);
            setExpanded(new Set());
          }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
        >
          {repos.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>

        {/* Search */}
        <input
          type="text"
          placeholder="Search memories…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 w-64 focus:border-blue-500 focus:outline-none"
        />

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Stats bar */}
      {stats && stats.total > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-2">
            <span className="text-zinc-400 text-xs">Total</span>
            <p className="text-white font-semibold text-lg">{stats.total}</p>
          </div>
          {Object.entries(stats.by_type).sort((a, b) => b[1] - a[1]).map(([type_, count]) => (
            <div key={type_} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-2">
              <span className="text-zinc-400 text-xs">{TYPE_LABELS[type_] || type_}</span>
              <p className="text-white font-semibold text-lg">{count}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Loading memories…</div>
        ) : memories.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            No memories yet. CoderHelm will learn from future runs on this repository.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">Content</th>
                <th className="px-4 py-3 font-medium w-28">Type</th>
                <th className="px-4 py-3 font-medium w-40">Tags</th>
                <th className="px-4 py-3 font-medium w-28">Created</th>
                <th className="px-4 py-3 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {memories.map((m) => {
                const isExpanded = expanded.has(m.id);
                return (
                  <tr
                    key={m.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                    onClick={() => toggleExpand(m.id)}
                  >
                    <td className="px-4 py-3">
                      <div className={`text-zinc-200 ${isExpanded ? "" : "line-clamp-2"}`}>
                        {m.content}
                      </div>
                      {isExpanded && (
                        <div className="mt-2 text-xs text-zinc-500 space-y-1">
                          <div>ID: <span className="font-mono text-zinc-400">{m.id}</span></div>
                          <div>Confidence: {(m.confidence * 100).toFixed(0)}%</div>
                          <div>Accessed: {m.access_count} time{m.access_count !== 1 ? "s" : ""}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TypeBadge type={m.memory_type} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {m.tags.slice(0, isExpanded ? undefined : 2).map((tag) => (
                          <span key={tag} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                        {!isExpanded && m.tags.length > 2 && (
                          <span className="text-xs text-zinc-500">+{m.tags.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-400 text-xs">
                      {formatDate(m.created_at)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(m.id);
                        }}
                        disabled={deleting === m.id}
                        className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Delete memory"
                      >
                        {deleting === m.id ? (
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <span className="text-xs text-zinc-500">
              {total} memor{total === 1 ? "y" : "ies"} · Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
