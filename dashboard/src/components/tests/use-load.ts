"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/data-sources";

/**
 * Loads data for a view and reloads when `key` changes (the repo picked, a
 * filter). A response that arrives after a newer request started is dropped,
 * so a fast click between repos never shows the wrong repo's data.
 */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const res = await loadRef.current();
      if (mine === seq.current) setData(res);
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e, "The request failed."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    reload();
  }, [key, reload]);

  return { data, setData, error, loading, reload };
}
