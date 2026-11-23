"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AwsAbilityReply, type AwsPermissions } from "@/lib/api";

// Live checks of AWS roles' permissions, for every page that shows a saved
// permission warning with an update link. The saved check can be a day old
// (the worker checks once a day), so a page that shows the warning checks
// the role again at once (POST /api/aws-connections/:id/permissions/check,
// which also saves the result). After someone presses the update link the
// page checks again by itself: when they come back to the tab, and every
// POLL_MS for WATCH_MS, until the check says the update landed.

export const POLL_MS = 15_000;
/** How long after pressing Update the page keeps checking by itself. */
export const WATCH_MS = 15 * 60_000;

export type PermissionCheckReply = AwsAbilityReply & { permissions: AwsPermissions | null };

export interface AccountPermissions {
  view: AwsPermissions | null;
  checking: boolean;
  /** When someone pressed Update for this account (this page view). */
  pressedAt: number | null;
  /** The update landed while this page watched. */
  updated: boolean;
  error: string | null;
}

export const EMPTY_PERMISSIONS: AccountPermissions = { view: null, checking: false, pressedAt: null, updated: false, error: null };

/** An account to check, with the check the page already has (if any). */
export interface PermissionTarget {
  account: string;
  saved?: AwsPermissions | null;
}

export interface PermissionCheckOptions {
  /** False: show nothing live and never call (the person can't run the check). */
  enabled?: boolean;
  /** Whether a check says nothing is left to do for what this page warns about (default: up to date). */
  settled?: (view: AwsPermissions) => boolean;
  /** Every live answer, for pages that keep the account itself. */
  onReply?: (account: string, reply: PermissionCheckReply) => void;
}

const upToDate = (v: AwsPermissions) => v.status === "up_to_date";

/** The infrastructure reads a check says the role lacks, or null when the check doesn't say. */
export function infraMissingOf(view: AwsPermissions | null | undefined): string[] | null {
  if (!view || view.status === "error") return null;
  const g = view.abilities.find((a) => a.key === "infra");
  return g ? g.missing : null;
}

/** Live permission state for each account, and the actions on it. */
export function usePermissionChecks(targets: PermissionTarget[], opts: PermissionCheckOptions = {}) {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<Record<string, AccountPermissions>>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const accounts = enabled ? targets.map((t) => t.account).join(",") : "";

  const settled = useCallback((v: AwsPermissions | null | undefined) => !!v && v.status !== "error" && (optsRef.current.settled ?? upToDate)(v), []);

  const patch = useCallback((account: string, p: Partial<AccountPermissions>) => {
    setState((s) => ({ ...s, [account]: { ...EMPTY_PERMISSIONS, ...s[account], ...p } }));
  }, []);

  const check = useCallback(
    async (account: string, pressed = false) => {
      patch(account, { checking: true, error: null });
      try {
        const r = await api.checkAwsPermissions(account, pressed);
        const before = stateRef.current[account];
        const view = r.permissions;
        const done = settled(view);
        const landed = !!before?.pressedAt && !!before.view && !settled(before.view) && done;
        patch(account, {
          view,
          checking: false,
          updated: before?.updated || landed,
          pressedAt: done ? null : before?.pressedAt ?? null,
        });
        optsRef.current.onReply?.(account, r);
      } catch (e) {
        patch(account, { checking: false, error: e instanceof Error && e.message ? e.message : "The check didn't run." });
      }
    },
    [patch, settled],
  );

  // The saved check shows at once; a live check of each account follows.
  useEffect(() => {
    if (!accounts) return;
    for (const t of targetsRef.current) {
      if (!stateRef.current[t.account]) patch(t.account, { view: t.saved ?? null });
      check(t.account);
    }
  }, [accounts, check, patch]);

  // After Update: check again when the person comes back to this tab, and
  // every POLL_MS while the update is outstanding.
  const watching = Object.entries(state)
    .filter(([, s]) => s.pressedAt && Date.now() - s.pressedAt < WATCH_MS)
    .map(([a]) => a);
  const watchKey = enabled ? watching.join(",") : "";
  useEffect(() => {
    if (!watchKey) return;
    const list = watchKey.split(",");
    const again = () => {
      for (const a of list) if (!stateRef.current[a]?.checking) check(a, true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") again();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", again);
    const t = window.setInterval(again, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", again);
      window.clearInterval(t);
    };
  }, [watchKey, check]);

  const pressed = useCallback((account: string) => patch(account, { pressedAt: Date.now(), updated: false }), [patch]);
  const of = useCallback((account: string) => state[account] ?? EMPTY_PERMISSIONS, [state]);

  return { state, check, pressed, of, settled };
}

export type PermissionChecks = ReturnType<typeof usePermissionChecks>;
