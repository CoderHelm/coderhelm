"use client";

import type { NativeAccess, NativeRecovery } from "@/lib/api";
import { Callout } from "@/components/callout";
import { Time } from "@/components/list";
import { Code } from "@/components/settings/code";
import { linkButton, primaryButton } from "@/components/ui";

/**
 * The access stack's quick-create link, only as the updater makes it: the AWS
 * console, a quick-create of coderhelm-<name>-access from a release's signed
 * access.json in the release bucket. Anything else is not linked.
 */
export function safeAccessLink(link: string | null | undefined): string | null {
  if (!link) return null;
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== "console.aws.amazon.com" || u.pathname !== "/cloudformation/home") return null;
  const [route, query = ""] = u.hash.replace(/^#/, "").split("?");
  if (route !== "/stacks/quickcreate") return null;
  const q = new URLSearchParams(query);
  if (!/^coderhelm-[a-z][a-z0-9]{0,19}-access$/.test(q.get("stackName") ?? "")) return null;
  if (!/^https:\/\/coderhelm-public\.s3\.amazonaws\.com\/launch\/v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?\/access\.json$/.test(q.get("templateURL") ?? "")) return null;
  return u.toString();
}

/** A link to a stack in the CloudFormation console of the install's region, or null. */
export function safeConsoleLink(link: string | null | undefined): string | null {
  if (!link) return null;
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !/^([a-z]{2}(-gov)?-[a-z]+-\d\.)?console\.aws\.amazon\.com$/.test(u.hostname) || u.pathname !== "/cloudformation/home") return null;
  if (!/^#\/stacks\/(stackinfo|events)\?/.test(u.hash)) return null;
  return u.toString();
}

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
  const link = safeAccessLink(access.link);
  const existing = safeConsoleLink(access.existing?.link);
  const creating = /_IN_PROGRESS$/.test(access.existing?.status ?? "") && !/DELETE/.test(access.existing?.status ?? "");
  if (creating) {
    return (
      <div data-testid="native-access" data-state="creating">
        <Callout variant="info" title="Allowing more AWS access…">
          <p>
            AWS is creating <Code className="text-xs">{access.stack}</Code>. It takes about a minute, and this card goes away by itself when it&apos;s done.
          </p>
        </Callout>
      </div>
    );
  }
  return (
    <div data-testid="native-access" data-state="pending">
      <Callout variant="info" title="Optional: allow more AWS access">
        <p>
          Your update is done and nothing here is required. {access.version ?? "This release"} can read more of your AWS account if an AWS admin allows it.
        </p>
        {access.existing ? (
          <p className="mt-2" data-testid="native-access-existing">
            First delete the stack <Code className="text-xs">{access.stack}</Code> left from an earlier change (deleting it changes nothing).{" "}
            {existing ? <a href={existing} target="_blank" rel="noopener noreferrer" className={linkButton}>Open {access.stack}</a> : null}
          </p>
        ) : null}
        <ol className="mt-2 list-decimal space-y-1 pl-5" data-testid="native-access-steps">
          <li>Sign in to the AWS console as an admin of this account.</li>
          <li>Click <strong>Open in the AWS console</strong> below. It opens a new stack, {access.stack ? <Code className="text-xs">{access.stack}</Code> : "this install's access stack"}, with everything filled in.</li>
          <li>At the bottom, tick the box that says it creates IAM resources, then click <strong>Create stack</strong>.</li>
          <li>Wait about a minute for CREATE_COMPLETE. This card then goes away by itself.</li>
        </ol>
        {link ? (
          <p className="mt-3">
            <a href={link} target="_blank" rel="noopener noreferrer" className={primaryButton} data-testid="native-access-link">Open in the AWS console</a>
          </p>
        ) : null}
        {lines.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-zinc-400">What it allows</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5" data-testid="native-access-summary">
              {lines.map((l) => <li key={l}>{l.charAt(0).toUpperCase() + l.slice(1)}.</li>)}
            </ul>
            <p className="mt-2 text-zinc-400">It&apos;s a small stack of its own, next to the install&apos;s. Updates never change it and never wait for it.</p>
          </details>
        ) : null}
      </Callout>
    </div>
  );
}

/** A rollback AWS couldn't finish (UPDATE_ROLLBACK_FAILED), and what Coderhelm did about it. */
export function NativeRecoveryCard({ recovery }: { recovery: NativeRecovery | null | undefined }) {
  if (!recovery || recovery.status === "recovered" || recovery.status === "failed") return null;
  const stuck = recovery.status === "stuck";
  const link = safeConsoleLink(recovery.link);
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
        {stuck && link ? (
          <p className="mt-2">
            <a href={link} target="_blank" rel="noopener noreferrer" className={linkButton} data-testid="native-recovery-link">See the stack&apos;s events in the AWS console</a>
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
