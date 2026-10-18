"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { secondaryButton } from "./ui";

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
  const [moreFailed, setMoreFailed] = useState(false);
  const generation = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setLoading(true);
    setError(false);
    setMoreFailed(false);
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
    setMoreFailed(false);
    fetchRef
      .current(next)
      .then((p) => {
        if (gen !== generation.current) return;
        setItems((prev) => [...prev, ...p.items]);
        setNext(p.next ?? null);
      })
      .catch(() => {
        // Keep `next` so the button can try the same page again.
        if (gen === generation.current) setMoreFailed(true);
      })
      .finally(() => setLoadingMore(false));
  }, [next, loadingMore]);

  return { items, next, loading, loadingMore, error, moreFailed, loadMore, reload };
}

export function LoadMoreButton({
  hasMore,
  loading,
  onClick,
  failed = false,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  /** The last "load more" failed; say so and offer the same page again. */
  failed?: boolean;
}) {
  if (!hasMore) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      {failed && !loading && (
        <p role="alert" className="text-sm text-red-400">
          The next page did not load.
        </p>
      )}
      <button type="button" onClick={onClick} disabled={loading} className={secondaryButton}>
        {loading ? "Loading…" : failed ? "Try again" : "Load more"}
      </button>
    </div>
  );
}
