"use client";

import type { NativeAccess, NativeRecovery } from "@/lib/api";
import { Callout } from "@/components/callout";
import { Time } from "@/components/list";
import { Code } from "@/components/settings/code";
import { linkButton, primaryButton } from "@/components/ui";

/**
 * A newer permission limit (boundary) or deploy role policy than the install
 * has. No update can apply it: the deploy role that runs updates may never
 * change itself or a boundary, and the stack runs every change as that role,
 * even one an AWS admin executes in the console. So updates install without
 * it, and it is its own optional item: one link that creates the install's
 * access stack from the release's signed access.json, which runs with the
 * AWS admin's own permissions. It never holds an update.
 */
export function NativeAccessCard({ access }: { access: NativeAccess | null | undefined }) {
  if (!access || access.state !== "pending") return null;
  const lines = access.summary ?? [];
  return (
    <div data-testid="native-access" data-state="pending">
      <Callout variant="info" title="Permissions: optional, for an AWS admin">
        <p>
          {access.version ?? "This release"} can do more once this install&apos;s permission limit allows it. Updates don&apos;t wait for this:
          what needs it says so where you use it.
        </p>
        {lines.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5" data-testid="native-access-summary">
            {lines.map((l) => <li key={l}>{l.charAt(0).toUpperCase() + l.slice(1)}.</li>)}
          </ul>
        ) : null}
        <p className="mt-2">
          Coderhelm can&apos;t apply this for itself. Someone with administrator rights in the AWS account opens the link, checks the box and
          chooses Create stack; it runs with their own permissions and takes about a minute. Deleting that stack later changes nothing.
        </p>
        {access.existing ? (
          <p className="mt-2" data-testid="native-access-existing">
            The stack <Code className="text-xs">{access.stack}</Code> exists from an earlier change: delete it first (that changes nothing), then open the link.{" "}
            {access.existing.link ? <a href={access.existing.link} target="_blank" rel="noopener noreferrer" className={linkButton}>Open {access.stack}</a> : null}
          </p>
        ) : null}
        {access.link ? (
          <p className="mt-3">
            <a href={access.link} target="_blank" rel="noopener noreferrer" className={primaryButton} data-testid="native-access-link">Open in the AWS console</a>
          </p>
        ) : null}
      </Callout>
    </div>
  );
}

/** A rollback AWS couldn't finish (UPDATE_ROLLBACK_FAILED), and what Coderhelm did about it. */
export function NativeRecoveryCard({ recovery }: { recovery: NativeRecovery | null | undefined }) {
  if (!recovery || recovery.status === "recovered" || recovery.status === "failed") return null;
  const stuck = recovery.status === "stuck";
  return (
    <div data-testid="native-recovery" data-state={recovery.status}>
      <Callout
        variant={stuck ? "warning" : "info"}
        title={stuck ? "The last update's rollback stopped, and Coderhelm couldn't finish it safely" : "Finishing the last update's rollback…"}
      >
        <p>
          {recovery.at ? <>Since <Time iso={recovery.at} />. </> : null}
          {stuck
            ? `Coderhelm keeps running, but no update can start until the rollback finishes. ${capital(recovery.reason)}.`
            : `${capital(recovery.reason)}. No update can start until it finishes; this page follows it by itself.`}
        </p>
        {stuck && recovery.link ? (
          <p className="mt-2">
            <a href={recovery.link} target="_blank" rel="noopener noreferrer" className={linkButton} data-testid="native-recovery-link">See the stack&apos;s events in the AWS console</a>
          </p>
        ) : null}
      </Callout>
    </div>
  );
}

function capital(s: string | null | undefined): string {
  const t = (s ?? "").trim().replace(/\.$/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}
