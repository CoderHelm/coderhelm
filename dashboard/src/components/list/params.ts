"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A list's filters, kept in the address (`?q=…&status=…&repo=…&sort=…`), so a
 * filtered list can be shared, reloaded, and stepped back through.
 *
 * Toggling a filter adds a history entry (Back undoes it); typing in the
 * search replaces the current one, so Back doesn't replay every keystroke.
 * Other query keys on the page (a tab, an open row) are left alone. A value
 * equal to its default is dropped from the address.
 *
 * Needs a <Suspense> boundary above it (it reads `useSearchParams`).
 */
export function useListParams<K extends string>(defaults: Record<K, string>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramString = params.toString();
  // `defaults` is usually an inline object: key it by content.
  const defaultsKey = JSON.stringify(defaults);

  const values = useMemo(() => {
    const d = JSON.parse(defaultsKey) as Record<K, string>;
    const q = new URLSearchParams(paramString);
    const out = { ...d };
    for (const k of Object.keys(d) as K[]) {
      const v = q.get(k);
      if (v !== null) out[k] = v;
    }
    return out;
  }, [paramString, defaultsKey]);

  // The address a change was just sent to. Navigation lands a moment later,
  // so a second quick change builds on this, not on the old address.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (pending.current === paramString) pending.current = null;
  }, [paramString]);
  // Back and Forward replace whatever was on its way.
  useEffect(() => {
    const drop = () => {
      pending.current = null;
    };
    window.addEventListener("popstate", drop);
    return () => window.removeEventListener("popstate", drop);
  }, []);

  const set = useCallback(
    (patch: Partial<Record<K, string>>, opts: { replace?: boolean } = {}) => {
      const d = JSON.parse(defaultsKey) as Record<K, string>;
      // Two quick changes must not undo each other: start from the address
      // the last change asked for if it hasn't landed yet.
      const current = pending.current ?? window.location.search.replace(/^\?/, "");
      const q = new URLSearchParams(current);
      for (const [k, v] of Object.entries(patch) as [K, string | undefined][]) {
        if (v === undefined) continue;
        if (v === "" || v === d[k]) q.delete(k);
        else q.set(k, v);
      }
      const s = q.toString();
      if (s === new URLSearchParams(current).toString()) return;
      pending.current = s;
      const url = `${pathname}${s ? `?${s}` : ""}`;
      if (opts.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname, defaultsKey],
  );

  return [values, set] as const;
}
