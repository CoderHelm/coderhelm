"use client";

import { useEffect, useState } from "react";
import { UPDATE_READY, UPDATE_READY_CLASS } from "@/lib/boot-recovery";
import { buttonClass, focusRing } from "./ui";
import { XIcon } from "./icons";

/**
 * A newer build is deployed (a file of this one failed to load after the app
 * started; lib/boot-recovery.ts): say so and offer Reload. The page never
 * reloads on its own. It floats, so showing it moves nothing on the page.
 */
export function UpdateReady() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (document.documentElement.classList.contains(UPDATE_READY_CLASS)) setReady(true);
    const on = () => setReady(true);
    window.addEventListener(UPDATE_READY, on);
    return () => window.removeEventListener(UPDATE_READY, on);
  }, []);
  if (!ready || hidden) return null;
  return (
    <div
      role="status"
      data-testid="update-ready"
      className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 py-2 pl-4 pr-2 text-sm text-zinc-200 shadow-2xl"
    >
      <span className="min-w-0">A new version of Coderhelm is ready.</span>
      <button type="button" data-ch-reload="" className={`${buttonClass("primary", "sm")} shrink-0`}>
        Reload
      </button>
      <button
        type="button"
        aria-label="Not now"
        title="Not now"
        onClick={() => setHidden(true)}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 [&_svg]:h-4 [&_svg]:w-4 ${focusRing}`}
      >
        <XIcon />
      </button>
    </div>
  );
}
