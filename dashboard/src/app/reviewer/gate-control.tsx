"use client";

import { useCallback, useState } from "react";
import { api, type GateAction } from "@/lib/api";
import { useToast } from "@/components/toast";

export const GATE_ACTION_LABEL: Record<GateAction, string> = {
  stop: "Stop auto-merge",
  rearm: "Re-arm auto-merge",
};

/**
 * Stop or re-arm one PR's auto-merge (from a row's menu). A stop holds until
 * someone re-arms it (a new commit doesn't); a re-arm checks every condition
 * again before merging, so neither can skip a check.
 */
export function useGateControl(onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const run = useCallback(
    async (repo: string, pr: number, action: GateAction) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await api.controlGate(repo, pr, action);
        toast(res.message, res.ok ? undefined : "error");
        onDone?.();
      } catch {
        toast(
          action === "stop" ? "Couldn't stop auto-merge. Try again, or stop it from the PR page." : "Couldn't re-arm auto-merge. Try again, or re-arm it from the PR page.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, onDone, toast],
  );
  return { run, busy };
}
