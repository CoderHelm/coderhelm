"use client";

import { useEffect } from "react";

/**
 * A page that moved. Sends the browser to `to`, keeping the query string
 * (a GitHub install callback, a deep link) and the #anchor when there is
 * one, else `hash`. Static export has no server redirects, so it happens here.
 */
export function Redirect({ to, hash = "" }: { to: string; hash?: string }) {
  useEffect(() => {
    const { search, hash: current } = window.location;
    window.location.replace(`${to}${search}${current || hash}`);
  }, [to, hash]);
  return (
    <p role="status" className="text-sm text-zinc-500">
      This page moved. Taking you to <a href={to} className="underline underline-offset-4">its new place</a>…
    </p>
  );
}
