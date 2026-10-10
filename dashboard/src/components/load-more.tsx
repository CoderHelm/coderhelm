"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A list read page by page from a cursor-paginated endpoint. Changing `deps`
 * (a filter) restarts from the first page; responses for an older filter are
 * dropped.
 */
export function usePagedList<T>(
  fetchPage: (cursor?: string) => Promise<{ items: T[]; next?: string | null }>,
  deps: unknown[],
) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setLoading(true);
    setError(false);
    fetchRef
      .current()
      .then((p) => {
        if (gen !== generation.current) return;
        setItems(p.items);
        setNext(p.next ?? null);
      })
      .catch(() => {
        if (gen !== generation.current) return;
        setItems([]);
        setNext(null);
        setError(true);
      })
      .finally(() => {
        if (gen === generation.current) setLoading(false);
      });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps);

  const loadMore = useCallback(() => {
    if (!next || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    fetchRef
      .current(next)
      .then((p) => {
        if (gen !== generation.current) return;
        setItems((prev) => [...prev, ...p.items]);
        setNext(p.next ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [next, loadingMore]);

  return { items, next, loading, loadingMore, error, loadMore, reload };
}

export function LoadMoreButton({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button
        onClick={onClick}
        disabled={loading}
        className="text-sm px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 disabled:opacity-50 transition-colors"
      >
        {loading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}
