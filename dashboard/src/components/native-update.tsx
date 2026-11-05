"use client";

import { useState } from "react";
import { api, type NativeUpdate } from "@/lib/api";
import { Callout } from "@/components/callout";
import { Time } from "@/components/list";
import { Code } from "@/components/settings/code";
import { Modal, modalActions } from "@/components/modal";
import { useToast } from "@/components/toast";
import { primaryButton, secondaryButton } from "@/components/ui";

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
}) {
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
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
    if (!p.id) return;
    setBusy(true);
    try {
      await api.applyUpdate(p.id, toConfirm ? p.confirm : "");
      setAsking(false);
      toast(`Updating to ${version}. This takes 10 to 20 minutes.`);
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not apply the update", "error");
    } finally {
      setBusy(false);
    }
  };

  const title = waiting
    ? canApply
      ? toConfirm
        ? `${version} needs your OK`
        : `${version} is ready to apply`
      : `${version} needs an AWS admin`
    : phase === "preparing"
      ? `Preparing the update to ${version}…`
      : `Applying ${version}…`;
  const working = !waiting;
  const outside = !!appliedBy && /aws console/i.test(appliedBy);

  return (
    <div data-testid="native-update">
      <Callout variant={waiting ? "warning" : "info"} title={title}>
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
        {p.counts ? (
          <p data-testid="native-update-summary">
            It changes {total} resource{total === 1 ? "" : "s"} ({n.add} to add, {n.modify} to change, {n.remove} to remove)
            {p.parts?.length ? <> in {p.parts.join(", ")}</> : null}.
            {p.replacements?.length ? <> Replaced: {p.replacements.join(", ")}.</> : <> Nothing is replaced.</>}
          </p>
        ) : null}
        {waiting && canApply && toConfirm ? (
          <p className="mt-2" data-testid="native-update-hold">
            It would {data.length ? "replace or remove data" : ""}{data.length && perms.length ? " and " : ""}{perms.length ? "change permissions" : ""}, so it waits for you. Check what it changes, then apply it.
          </p>
        ) : waiting && canApply ? (
          <p className="mt-2" data-testid="native-update-hold">{p.hold ? `${p.hold.charAt(0).toUpperCase()}${p.hold.slice(1)}.` : "It is prepared and waits for you."}</p>
        ) : waiting ? (
          <p className="mt-2" data-testid="native-update-hold">
            {p.admin_changes?.length
              ? "It changes the deploy role or a permissions boundary, which Coderhelm can't apply for itself. Someone with administrator rights in the AWS account opens it in the AWS console and chooses Execute."
              : "This install's stack doesn't have the deploy role yet, so this one update is executed in the AWS console by someone with administrator rights in the account. It adds the role; every update after it applies from here."}
          </p>
        ) : phase === "preparing" ? (
          <p className="mt-2">Nothing to do yet. If it would change data or permissions, it asks you here first.</p>
        ) : null}
        {waiting ? <UpdateSteps at="apply" waiting={canApply ? "waits for your OK" : "waits for an AWS admin"} /> : null}
        {p.reason && !waiting ? <p className="mt-2 text-zinc-400">{p.reason}</p> : null}
        <p className="mt-3 flex flex-wrap items-center gap-3">
          {canApply ? (
            <button type="button" className={primaryButton} disabled={busy} onClick={() => (toConfirm ? setAsking(true) : apply())} data-testid="native-update-apply">
              {busy ? "Applying…" : toConfirm ? "Review and apply" : `Apply ${version}`}
            </button>
          ) : waiting && p.link ? (
            <a href={p.link} target="_blank" rel="noopener noreferrer" className={primaryButton} data-testid="native-update-link">Open it in the AWS console</a>
          ) : null}
          {p.link && (canApply || !waiting) ? (
            <a href={p.link} target="_blank" rel="noopener noreferrer" className="font-medium underline" data-testid="native-update-link">See the change in the AWS console</a>
          ) : null}
        </p>
      </Callout>
      <Modal
        open={asking}
        onOpenChange={(v) => !busy && setAsking(v)}
        role="alertdialog"
        title={`Apply ${version}?`}
        description="This update makes changes Coderhelm never applies without your OK. It applies only these; if they change before you confirm, it asks again."
        testId="native-update-confirm"
        initialFocus="[data-confirm-cancel]"
        footer={
          <div className={modalActions}>
            <button type="button" data-confirm-cancel className={secondaryButton} disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
            <button type="button" className={primaryButton} disabled={busy} onClick={apply} data-testid="native-update-confirm-apply">
              {busy ? "Applying…" : "Confirm and apply"}
            </button>
          </div>
        }
      >
        {data.length ? (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-zinc-100">Data it would replace or remove</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-300" data-testid="native-update-data-changes">
              {data.map((c) => <li key={c}><Code className="text-xs">{c}</Code></li>)}
            </ul>
          </div>
        ) : null}
        {perms.length ? (
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Permissions it changes</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-300" data-testid="native-update-permission-changes">
              {perms.map((c) => <li key={c}><Code className="text-xs">{c}</Code></li>)}
            </ul>
            <p className="mt-1 text-xs text-zinc-400">Every Coderhelm role stays inside the install&apos;s permissions boundary whatever its policy says.</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
