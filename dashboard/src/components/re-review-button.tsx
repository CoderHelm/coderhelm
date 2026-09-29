"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

/** Queue a fresh review of a PR's current head — no GitHub label or comment needed. */
export function ReReviewButton({
  repo,
  pr,
  label = "Re-review",
  className = "",
}: {
  repo: string;
  pr: number;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const run = async () => {
    if (!repo || !pr || busy) return;
    setBusy(true);
    try {
      const res = await api.reReview(repo, pr);
      if (res.status === "queued") toast(`Review queued for ${repo} #${pr}`);
      else toast(res.reason || "Review not queued", "error");
    } catch {
      toast("Could not queue the review", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy || !repo || !pr}
      className={`text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-colors disabled:opacity-50 ${className}`}
    >
      {busy ? "Queuing…" : label}
    </button>
  );
}
