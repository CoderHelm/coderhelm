"use client";

import { useEffect, useState, useRef } from "react";
import { type Repo } from "@/lib/api";

export function RepoCombobox({
  repos,
  selected,
  onSelect,
}: {
  repos: Repo[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = repos.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );
  const display = filtered.slice(0, 50);

  return (
    <div ref={ref} className="relative mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 hover:border-zinc-500 transition-colors"
      >
        <span className="font-mono truncate">{selected || "Select repo..."}</span>
        <svg className={`w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-zinc-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repos..."
              autoFocus
              className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {display.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500">No repos found</p>
            ) : (
              display.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => {
                    onSelect(r.name);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    r.name === selected
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <span className="font-mono">{r.name}</span>
                </button>
              ))
            )}
            {filtered.length > 50 && (
              <p className="px-3 py-2 text-xs text-zinc-600 border-t border-zinc-800">
                {filtered.length - 50} more — type to narrow results
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
