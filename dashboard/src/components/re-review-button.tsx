"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { buttonClass } from "@/components/ui";

/**
 * Queue a fresh review of a PR's current head, with the toast that says how
 * it went. For a menu item or any other trigger; `ReReviewButton` wraps it.
 */
export function useReReview(onQueued?: () => void) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const run = useCallback(
    async (repo: string, pr: number) => {
      if (!repo || !pr || busy) return;
      setBusy(true);
      try {
        const res = await api.reReview(repo, pr);
        if (res.status === "queued") {
          toast(`Review queued for ${repo} #${pr}`);
          onQueued?.();
        } else toast(res.reason || "The review wasn't queued. Try again in a moment.", "error");
      } catch {
        toast("Couldn't queue the review. Check your connection and try again.", "error");
      } finally {
        setBusy(false);
      }
    },
    [busy, onQueued, toast],
  );
  return { run, busy };
}

/** Queue a fresh review of a PR's current head — no GitHub label or comment needed. */
export function ReReviewButton({
  repo,
  pr,
  label = "Review again",
  size = "sm",
  className = "",
  onQueued,
}: {
  repo: string;
  pr: number;
  label?: string;
  size?: "sm" | "md";
  className?: string;
  /** Called once the review is queued (e.g. to refresh the page's status). */
  onQueued?: () => void;
}) {
  const { run, busy } = useReReview(onQueued);
  return (
    <button
      type="button"
      onClick={() => run(repo, pr)}
      disabled={busy || !repo || !pr}
      aria-label={label === "Review again" ? `Review ${repo} #${pr} again` : undefined}
      className={`${buttonClass("secondary", size)} ${className}`.trim()}
    >
      {busy ? "Queueing…" : label}
    </button>
  );
}
