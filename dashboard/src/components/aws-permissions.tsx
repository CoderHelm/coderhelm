"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AwsConnection, type AwsPermissions } from "@/lib/api";
import { timeAgo } from "@/lib/data-sources";
import { Callout } from "./callout";
import { CheckIcon, ExternalLinkIcon, WarningIcon, AlertCircleIcon } from "./icons";
import { buttonClass, primaryButton, secondaryButton } from "./ui";
import { Code } from "./settings/code";

// Whether each connected AWS account's read-only role has every permission
// this release uses, checked live (IAM's policy simulator on the role, or one
// read of each kind for older roles), with the one-click update: a small
// stack that adds exactly the new permissions to the existing role. After
// someone presses Update the page checks again by itself, when they come
// back to the tab and every 15 seconds for a while, and shows the result.

const POLL_MS = 15_000;
/** How long after pressing Update the page keeps checking by itself. */
const WATCH_MS = 15 * 60_000;

export interface AccountPermissions {
  view: AwsPermissions | null;
  checking: boolean;
  /** When someone pressed Update for this account (this page view). */
  pressedAt: number | null;
  /** The update landed while this page watched. */
  updated: boolean;
  error: string | null;
}

const EMPTY: AccountPermissions = { view: null, checking: false, pressedAt: null, updated: false, error: null };

function accountOf(c: AwsConnection): string {
  return c.abilities?.account ?? c.connection_id;
}

/** Live permission state for every connected account, and the actions on it. */
export function useAwsPermissions(connections: AwsConnection[]) {
  const [state, setState] = useState<Record<string, AccountPermissions>>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const accounts = connections.map(accountOf).join(",");

  const patch = useCallback((account: string, p: Partial<AccountPermissions>) => {
    setState((s) => ({ ...s, [account]: { ...EMPTY, ...s[account], ...p } }));
  }, []);

  const check = useCallback(
    async (account: string, pressed = false) => {
      patch(account, { checking: true, error: null });
      try {
        const r = await api.checkAwsPermissions(account, pressed);
        const before = stateRef.current[account];
        const view = r.permissions;
        const landed = !!before?.pressedAt && before.view?.status === "update_needed" && view?.status === "up_to_date";
        patch(account, {
          view,
          checking: false,
          updated: before?.updated || landed,
          pressedAt: view?.status === "up_to_date" ? null : before?.pressedAt ?? null,
        });
      } catch (e) {
        patch(account, { checking: false, error: e instanceof Error && e.message ? e.message : "The check didn't run." });
      }
    },
    [patch],
  );

  // The stored check shows at once; a live check of each account follows.
  useEffect(() => {
    for (const c of connections) {
      const a = accountOf(c);
      if (!stateRef.current[a]) patch(a, { view: c.abilities?.permissions ?? null });
      check(a);
    }
    // Only when the set of accounts changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // After Update: check again when the person comes back to this tab, and
  // every POLL_MS while the update is outstanding.
  const watching = Object.entries(state).filter(([, s]) => s.pressedAt && Date.now() - s.pressedAt < WATCH_MS).map(([a]) => a);
  const watchKey = watching.join(",");
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

  return { state, check, pressed, of: (account: string) => state[account] ?? EMPTY };
}

export type AwsPermissionsApi = ReturnType<typeof useAwsPermissions>;

/** "Update needed: 3 new read-only permissions" and friends. */
export function stateLabel(s: AccountPermissions): string {
  const v = s.view;
  if (!v) return s.checking ? "Checking permissions" : s.error ? "Couldn't check permissions" : "Not checked yet";
  if (v.status === "up_to_date") return "Permissions up to date";
  if (v.status === "error") return "Can't check: Coderhelm can't take on the role";
  return `Update needed: ${v.missing_count} new read-only permission${v.missing_count === 1 ? "" : "s"}`;
}

function StateIcon({ s }: { s: AccountPermissions }) {
  const v = s.view;
  if (!v)
    return <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300 motion-reduce:animate-none" />;
  if (v.status === "up_to_date")
    return (
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 [&_svg]:h-3 [&_svg]:w-3">
        <CheckIcon />
      </span>
    );
  if (v.status === "error")
    return (
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center text-red-400 [&_svg]:h-4 [&_svg]:w-4">
        <AlertCircleIcon />
      </span>
    );
  return (
    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center text-amber-400 [&_svg]:h-4 [&_svg]:w-4">
      <WarningIcon />
    </span>
  );
}

function UpdateLink({ url, onPress, size = "md" }: { url: string; onPress: () => void; size?: "sm" | "md" }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={onPress} className={`${size === "sm" ? buttonClass("primary", "sm") : primaryButton} gap-2`}>
      Update in AWS
      <span aria-hidden="true" className="scale-90">
        <ExternalLinkIcon />
      </span>
      <span className="sr-only">(opens the AWS console in a new tab)</span>
    </a>
  );
}

/** Every account's permission state in one list, with an update link for each (two or more accounts). */
export function PermissionsOverview({ connections, perms, canEdit }: { connections: AwsConnection[]; perms: AwsPermissionsApi; canEdit: boolean }) {
  const rows = connections.map((c) => ({ account: accountOf(c), region: c.region, s: perms.of(accountOf(c)) }));
  const needing = rows.filter((r) => r.s.view?.status === "update_needed").length;
  return (
    <section aria-labelledby="aws-perms-heading" className="rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid="aws-permissions-overview">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-zinc-800 px-4 py-3">
        <h2 id="aws-perms-heading" className="font-semibold text-zinc-100">
          Permissions
        </h2>
        <p className="text-sm text-zinc-400">
          {needing === 0 ? "Every account is up to date." : `${needing} of ${rows.length} accounts need an update.`}
        </p>
      </div>
      <ul className="divide-y divide-zinc-800">
        {rows.map(({ account, region, s }) => (
          <li key={account} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <StateIcon s={s} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100">
                <a href={`#aws-account-${account}`} className="hover:underline">
                  Account {account}
                </a>
                <span className="ml-2 font-normal text-zinc-500">{region}</span>
              </p>
              <p className={`text-sm ${s.view?.status === "update_needed" ? "text-amber-300" : s.view?.status === "error" ? "text-red-300" : "text-zinc-400"}`}>
                {stateLabel(s)}
                {s.pressedAt && s.view?.status === "update_needed" && <span className="text-zinc-400"> · waiting for the update</span>}
              </p>
            </div>
            {canEdit && s.view?.update && <UpdateLink size="sm" url={s.view.update.url} onPress={() => perms.pressed(account)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One account's permission state, the update and its result. */
export function PermissionsPanel({ account, perms, canEdit }: { account: string; perms: AwsPermissionsApi; canEdit: boolean }) {
  const s = perms.of(account);
  const v = s.view;
  const checkAgain = (
    <button type="button" onClick={() => perms.check(account, !!s.pressedAt)} disabled={s.checking} className={secondaryButton}>
      {s.checking ? "Checking…" : "Check again"}
    </button>
  );

  if (!v) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400" data-testid={`aws-perms-${account}`}>
        <StateIcon s={s} />
        {s.error ? (
          <span className="min-w-0 [overflow-wrap:anywhere]">Couldn&apos;t check the role&apos;s permissions: {s.error}</span>
        ) : (
          <span>Checking the role&apos;s permissions…</span>
        )}
      </div>
    );
  }

  if (v.status === "up_to_date") {
    const total = v.abilities.reduce((n, a) => n + a.actions.length, 0);
    return (
      <div className="flex flex-col gap-3" data-testid={`aws-perms-${account}`}>
        {s.updated && (
          <Callout variant="success" title="Permissions updated">
            <p>The role now has everything this release reads. Nothing else changed in your account, and everything stays read-only.</p>
          </Callout>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <StateIcon s={s} />
          <p className="text-sm font-medium text-zinc-100">Permissions up to date</p>
          <p className="text-sm text-zinc-500">
            All {total} read-only permissions this release uses · checked {timeAgo(v.checked_at)}
          </p>
        </div>
      </div>
    );
  }

  if (v.status === "error") {
    return (
      <div data-testid={`aws-perms-${account}`}>
        <Callout variant="error" title="Coderhelm can't check this role" actions={canEdit ? checkAgain : undefined}>
          <p>{v.problem?.message}</p>
          {v.problem?.fix && <p>{v.problem.fix}</p>}
        </Callout>
      </div>
    );
  }

  const missingGroups = v.abilities.filter((a) => a.missing.length > 0);
  const waiting = !!s.pressedAt && !v.problem;
  return (
    <section
      aria-labelledby={`aws-perms-title-${account}`}
      className="overflow-hidden rounded-lg border border-amber-500/30 bg-amber-500/[0.04]"
      data-testid={`aws-perms-${account}`}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5">
            <StateIcon s={s} />
          </span>
          <div className="min-w-0">
            <h3 id={`aws-perms-title-${account}`} className="font-semibold text-zinc-100">
              {stateLabel(s)}
            </h3>
            <p className="mt-1 text-sm text-zinc-300">
              This release reads a little more from account {v.account}. Everything stays read-only: Coderhelm can list, describe and query, never change
              anything. Until the role is updated, Coderhelm skips what needs these and keeps working with the rest.
            </p>
          </div>
        </div>

        {v.problem && (
          <div className="sm:pl-8">
            <Callout variant="error" title={v.problem.message}>
              <p>{v.problem.fix}</p>
            </Callout>
          </div>
        )}

        <ul className="flex flex-col gap-3 sm:pl-8">
          {missingGroups.map((g) => (
            <li key={g.key} className="min-w-0">
              <p className="text-sm font-medium text-zinc-100">{g.name}</p>
              <p className="mt-0.5 text-sm text-zinc-400">{g.why}</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {g.missing.map((a) => (
                  <Code key={a} className="!text-xs">
                    {a}
                  </Code>
                ))}
              </p>
            </li>
          ))}
        </ul>

        {canEdit && v.update && (
          <div className="flex flex-col gap-3 sm:pl-8">
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-zinc-300">
              <li>
                Sign in to AWS account <span className="font-medium text-zinc-100">{v.update.sign_in_account}</span>, the role&apos;s account.
              </li>
              <li>
                Press <span className="font-medium text-zinc-100">Update in AWS</span>, review the stack and press{" "}
                <span className="font-medium text-zinc-100">Create stack</span>.
              </li>
              <li>Come back here. This page checks again by itself.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <UpdateLink url={v.update.url} onPress={() => perms.pressed(account)} />
              {checkAgain}
            </div>
            {waiting && (
              <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
                <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300 motion-reduce:animate-none" />
                Waiting for the update. Last checked {timeAgo(v.checked_at)}.
              </p>
            )}
            <details className="text-sm text-zinc-400">
              <summary className="cursor-pointer text-zinc-300 hover:text-zinc-100">Made the role by hand?</summary>
              <p className="mt-2">
                Add these actions to <Code>CoderhelmLogReader</Code>&apos;s policy instead, then press Check again. The stack is{" "}
                <Code>{v.update.stack_name}</Code>, from <span className="[overflow-wrap:anywhere]">{v.update.template_url}</span>.
              </p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {v.missing.map((m) => (
                  <Code key={m.action} className="!text-xs">
                    {m.action}
                  </Code>
                ))}
              </p>
            </details>
          </div>
        )}
        {!canEdit && <p className="text-sm text-zinc-400 sm:pl-8">An admin can update the role in one click from this page.</p>}
      </div>
    </section>
  );
}
