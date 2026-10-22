"use client";

import { useState } from "react";
import { api, type GateAction } from "@/lib/api";
import { useToast } from "@/components/toast";
import { focusRing } from "@/components/ui";

export const GATE_ACTION_LABEL: Record<GateAction, string> = {
  stop: "Stop auto-merge",
  rearm: "Re-arm auto-merge",
};

/**
 * Stop or re-arm one PR's auto-merge from its row. A stop holds until someone
 * re-arms it (a new commit doesn't); a re-arm checks every condition again
 * before merging, so neither can skip a check.
 */
export function GateControlButton({
  repo,
  pr,
  action,
  onDone,
}: {
  repo: string;
  pr: number;
  action: GateAction;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const label = GATE_ACTION_LABEL[action];

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.controlGate(repo, pr, action);
      toast(res.message, res.ok ? undefined : "error");
      onDone?.();
    } catch {
      toast(action === "stop" ? "Could not stop auto-merge" : "Could not re-arm auto-merge", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      aria-label={`${label} on ${repo} #${pr}`}
      data-testid={`gate-${action}`}
      className={`text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-colors disabled:opacity-50 ${focusRing}`}
    >
      {busy ? (action === "stop" ? "Stopping…" : "Re-arming…") : label}
    </button>
  );
}
