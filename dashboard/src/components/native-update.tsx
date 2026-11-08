"use client";

import { useRef, useState, type ReactNode } from "react";
import { api, errorStatus, type NativeUpdate } from "@/lib/api";
import { failureText } from "@/lib/update-state";
import { Callout } from "@/components/callout";
import { Time } from "@/components/list";
import { Code } from "@/components/settings/code";
import { useToast } from "@/components/toast";
import { dangerButton, primaryButton } from "@/components/ui";

/** Where an update is: the release checked, the change prepared, the change applied. */
export type UpdateStep = "check" | "prepare" | "apply";

const STEPS: [UpdateStep, string][] = [
  ["check", "Check the release"],
  ["prepare", "Prepare the change"],
  ["apply", "Apply it"],
];

/**
 * The three steps of an update and where it is, in words (no made-up
 * percentage: AWS gives none). `waiting` names why the current step waits.
 */
export function UpdateSteps({ at, waiting }: { at: UpdateStep; waiting?: string }) {
  const i = STEPS.findIndex(([k]) => k === at);
  return (
    <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Update steps" data-testid="update-steps">
      {STEPS.map(([k, label], n) => {
        const state = n < i ? "done" : n === i ? "current" : "todo";
        return (
          <li
            key={k}
            data-step={k}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className={state === "todo" ? "text-zinc-500" : state === "current" ? "font-medium text-zinc-100" : "text-zinc-300"}
          >
            <span aria-hidden="true">{state === "done" ? "\u2713 " : `${n + 1}. `}</span>
            {label}
            {state === "done" ? <span className="sr-only"> (done)</span> : null}
            {state === "current" && waiting ? <span className="font-normal text-zinc-400"> ({waiting})</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A native install updates as a CloudFormation stack update. The updater
 * prepares each release as a change set on the install's stack and applies
 * it through the install's deploy role. This shows it preparing and
 * applying, and when it waits for an admin, why: data or permission changes
 * to confirm here (then Apply), or a change to the deploy role or a
 * boundary that only an AWS admin can execute in the console. Which of
 * those it is comes from the page's one update state (`phase`), never from
 * the stored status alone: a change set executed in the AWS console is
 * applying, whatever the entry said.
 */
export function NativeUpdateCard({
  native,
  phase,
  onChanged,
  startedAt,
  startedBy,
  appliedBy,
  from,
  next,
}: {
  native: NativeUpdate;
  phase: "preparing" | "review" | "applying";
  onChanged?: () => void;
  /** When this update started (or was applied), for "Started 3 minutes ago". */
  startedAt?: string | null;
  /** Who started it, in words. */
  startedBy?: string | null;
  /** Who applied it: an admin here, or someone in the AWS console. */
  appliedBy?: string | null;
  /** The version the install is on while it updates. */
  from?: string | null;
  /** A quiet line about a newer release, next after this one. */
  next?: ReactNode;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  // One apply per click, whatever the clicks.
  const acting = useRef(false);
  const p = native.pending;
  if (!p) return null;
  const n = p.counts ?? { add: 0, modify: 0, remove: 0 };
  const total = n.add + n.modify + n.remove;
  const waiting = phase === "review";
  const canApply = waiting && !!p.can_apply && !!p.id;
  const data = p.data_changes ?? [];
  const perms = p.permission_changes ?? [];
  const toConfirm = !!p.confirm && (data.length > 0 || perms.length > 0);
  const version = p.version ?? "the update";

  const apply = async () => {
    if (!p.id || acting.current) return;
    acting.current = true;
    setBusy(true);
    try {
      // The token names exactly the changes shown on this card: if they
      // changed since, the updater refuses and the card shows the new ones.
      await api.applyUpdate(p.id, toConfirm ? p.confirm ?? "" : "");
    } catch (e) {
      const status = errorStatus(e);
      if (status !== 400 && status !== 409) {
        toast(failureText(`apply ${version}`, e instanceof Error ? e.message : null, status), "error");
      }
    } finally {
      acting.current = false;
      setBusy(false);
      // The card follows what happened: applying, or where the update is now.
      onChanged?.();
    }
  };

  const title = waiting
    ? canApply
      ? data.length
        ? `${version} would replace or remove data`
        : `${version} is ready to apply`
      : `${version} needs an AWS admin`
    : phase === "preparing"
      ? `Preparing the update to ${version}…`
      : `Applying ${version}…`;
  const working = !waiting;
  const outside = !!appliedBy && /aws console/i.test(appliedBy);
  const roles = permissionRoles(perms);
  const rolesLine = perms.length ? (
    <p className="mt-2" data-testid="native-update-permissions">
      It changes what {roles === 1 ? "1 of Coderhelm's own roles" : `${roles} of Coderhelm's own roles`} may do, all inside this install&apos;s permission limit.
    </p>
  ) : null;

  return (
    <div data-testid="native-update">
      <Callout variant={waiting && data.length ? "warning" : "info"} title={title}>
        {working && (
          <>
            <p data-testid="native-update-progress">
              {startedAt ? <>Started <Time iso={startedAt} />{startedBy && !outside ? <> by {startedBy}</> : null}. </> : null}
              {outside ? "It was applied in the AWS console. " : null}
              {phase === "preparing"
                ? "AWS is preparing the change to your stack, which takes a minute or two."
                : "AWS is applying the change to your stack, which takes 10 to 20 minutes."}
              {from ? <> Coderhelm keeps running {from} until it finishes, and this page updates by itself.</> : null}
            </p>
            <UpdateSteps at={phase === "preparing" ? "prepare" : "apply"} />
            <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={title} aria-busy="true">
              <div className="h-full w-1/3 rounded-full bg-blue-400/70 animate-pulse motion-reduce:animate-none" />
            </div>
          </>
        )}
        {waiting && canApply && data.length ? (
          <div className="mt-2" data-testid="native-update-hold">
            <p>Applying it replaces or removes this data, which can&apos;t be undone:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5" data-testid="native-update-data-changes">
              {data.map((c) => <li key={c}>{plainResource(c)}</li>)}
            </ul>
            <p className="mt-2">Nothing changes until you apply it. If what it changes is different by then, it asks you again.</p>
          </div>
        ) : waiting && canApply ? (
          <p className="mt-2" data-testid="native-update-hold">
            {perms.length
              ? "It's prepared. One press applies it."
              : p.hold
                ? `${p.hold.charAt(0).toUpperCase()}${p.hold.slice(1)}.`
                : "It's prepared. One press applies it."}
          </p>
        ) : waiting ? (
          <p className="mt-2" data-testid="native-update-hold">
            {"This install's stack doesn't have the deploy role yet, so this one update is executed in the AWS console by someone with administrator rights in the account. It adds the role; every update after it applies from here."}
          </p>
        ) : phase === "preparing" ? (
          <p className="mt-2">Nothing to do yet. It applies by itself once prepared; it only stops to ask if it would replace or remove data.</p>
        ) : null}
        {rolesLine}
        {p.held?.length ? (
          <p className="mt-2 text-zinc-400" data-testid="native-update-held">
            This install&apos;s deploy role and permission limit stay as they are in this update (no update can change them). Any newer permissions are the separate Permissions item below.
          </p>
        ) : null}
        {waiting ? <UpdateSteps at="apply" waiting={canApply ? "waits for your OK" : "waits for an AWS admin"} /> : null}
        {p.reason && !waiting ? <p className="mt-2 text-zinc-400">{p.reason}</p> : null}
        {next}
        <p className="mt-3 flex flex-wrap items-center gap-3">
          {canApply ? (
            <button type="button" className={data.length ? dangerButton : primaryButton} disabled={busy} onClick={apply} data-testid="native-update-apply">
              {busy ? "Applying…" : data.length ? "Replace the data and apply" : "Apply update"}
            </button>
          ) : waiting && p.link ? (
            <a href={p.link} target="_blank" rel="noopener noreferrer" className={primaryButton} data-testid="native-update-link">Open it in the AWS console</a>
          ) : null}
        </p>
        {p.counts || p.link || data.length || perms.length ? (
          <details className="mt-3 text-sm" data-testid="native-update-details">
            <summary className="cursor-pointer text-zinc-400">Technical details</summary>
            <div className="mt-2 space-y-2 text-zinc-300">
              {p.counts ? (
                <p data-testid="native-update-summary">
                  It changes {total} resource{total === 1 ? "" : "s"} ({n.add} to add, {n.modify} to change, {n.remove} to remove)
                  {p.parts?.length ? <> in {p.parts.join(", ")}</> : null}.
                  {p.replacements?.length ? <> Replaced: {p.replacements.join(", ")}.</> : <> Nothing is replaced.</>}
                </p>
              ) : null}
              {data.length ? (
                <ul className="list-disc space-y-1 pl-5" aria-label="Data changes as CloudFormation lists them">
                  {data.map((c) => <li key={c}><Code className="text-xs">{c}</Code></li>)}
                </ul>
              ) : null}
              {perms.length ? (
                <ul className="list-disc space-y-1 pl-5" data-testid="native-update-permission-changes" aria-label="Permission changes as CloudFormation lists them">
                  {perms.map((c) => <li key={c}><Code className="text-xs">{c}</Code></li>)}
                </ul>
              ) : null}
              {perms.length ? <p className="text-xs text-zinc-400">Every Coderhelm role stays inside the install&apos;s permissions boundary whatever its policy says, and the deploy role can&apos;t change itself or the boundary.</p> : null}
              {p.link ? (
                <a href={p.link} target="_blank" rel="noopener noreferrer" className="font-medium underline" data-testid="native-update-console">See the change in the AWS console</a>
              ) : null}
            </div>
          </details>
        ) : null}
      </Callout>
    </div>
  );
}

/**
 * How many of Coderhelm's own roles a list of permission changes touches:
 * "LogAnalyzer.LogAnalyzerServiceRoleDefaultPolicy341691CC (AWS::IAM::Policy
 * Modify: ...)" and "LogAnalyzer.LogAnalyzerServiceRole1A2B3C4D (AWS::IAM::Role
 * Modify)" are one role.
 */
export function permissionRoles(changes: string[]): number {
  const roles = new Set(
    changes.map((c) =>
      c
        .split(" ")[0]
        .replace(/[0-9A-F]{8}$/, "")
        .replace(/(DefaultPolicy|Policy)$/, "")
        .replace(/[0-9A-F]{8}$/, ""),
    ),
  );
  return Math.max(1, roles.size);
}

/** "Api.Table (AWS::DynamoDB::GlobalTable: Modify, replacement True)" in words: "Table in Api (replaced)". */
export function plainResource(c: string): string {
  const m = /^([^.\s]+)\.(\S+)\s*\(([^)]*)\)/.exec(c);
  if (!m) return c;
  const [, part, id, what] = m;
  const kind = /DynamoDB/.test(what) ? "table" : /S3::Bucket/.test(what) ? "bucket" : /Cognito/.test(what) ? "sign-in user pool" : /KMS/.test(what) ? "key" : /SecretsManager/.test(what) ? "secret" : "resource";
  const how = /Remove|Delete/i.test(what) ? "removed" : "replaced";
  return `The ${id} ${kind} in ${part} (${how})`;
}
