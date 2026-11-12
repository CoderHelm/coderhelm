"use client";

import type { NativeAccess, NativeRecovery } from "@/lib/api";
import { Callout } from "@/components/callout";
import { Time } from "@/components/list";
import { Code } from "@/components/settings/code";
import { CopyButton } from "@/components/copy-button";
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

/** "Nov 9" (with the year when it isn't this one), or null. */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** The release's access.json URL, only as the updater makes it (the release bucket), or null. */
export function safeTemplateUrl(url: string | null | undefined): string | null {
  return url && /^https:\/\/coderhelm-public\.s3\.amazonaws\.com\/launch\/v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?\/access\.json$/.test(url) ? url : null;
}

function capitalFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** What the install already has: "You allowed access for v0.8.59 on Nov 9." and the like. */
function AlreadyAllowed({ access }: { access: NativeAccess }) {
  const c = access.current;
  const when = shortDate(c?.at);
  if (!c || (!c.version && !when)) return null;
  const text =
    c.from === "stack" && c.version
      ? `You allowed access for ${c.version}${when ? ` on ${when}` : ""}.`
      : `Your install's AWS permissions were last widened${when ? ` on ${when}` : ""}.`;
  return <p data-testid="native-access-current">{text} That stays as it is.</p>;
}

/** Only the new permissions, by what in your install uses them. */
function NewPermissions({ access }: { access: NativeAccess }) {
  const needed = access.needed ?? [];
  const rules = access.rules ?? [];
  const legacy = !access.needed ? access.summary ?? [] : [];
  if (!needed.length && !rules.length && !legacy.length) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5" data-testid="native-access-summary">
      {needed.map((g) => (
        <li key={g.line}>
          {g.name ? <><strong>{capitalFirst(g.name)}</strong> (switched on): </> : null}
          read {g.services} <span className="text-zinc-400">({g.actions.join(", ")})</span>
          {g.name ? null : <span className="text-zinc-400">, which the install always uses</span>}.
        </li>
      ))}
      {[...rules, ...legacy].map((l) => <li key={l}>{capitalFirst(l)}.</li>)}
    </ul>
  );
}

function Later({ access }: { access: NativeAccess }) {
  const later = access.later ?? [];
  if (!later.length) return null;
  return (
    <p className="mt-2 text-zinc-400" data-testid="native-access-later">
      It also covers {later.map((g) => g.name).join(" and ")}, which {later.length === 1 ? "is" : "are"} off here, so {later.length === 1 ? "it works" : "they work"} the moment you switch {later.length === 1 ? "it" : "them"} on.
    </p>
  );
}

/**
 * A newer permission limit (boundary) or deploy role policy than the install
 * has. No update can apply it: the deploy role that runs updates may never
 * change itself or a boundary. So it is its own item, shown only when what it
 * adds matters to something the install uses (the updater decides: a read
 * only one switch of the AWS card uses counts only while that switch is on).
 * An install with the access stack updates it with the newer access.json
 * (never a delete); one without creates it with one link. Nothing that
 * matters: one quiet line, no card.
 */
export function NativeAccessCard({ access }: { access: NativeAccess | null | undefined }) {
  if (!access) return null;
  if (access.state === "optional") {
    const later = access.later ?? [];
    return (
      <details className="text-sm text-zinc-400" data-testid="native-access" data-state="optional">
        <summary className="cursor-pointer">AWS permissions: nothing needed for what you use</summary>
        <p className="mt-2">
          {access.version ?? "This release"} can also read {later.map((g) => g.services).join(", and ")} for{" "}
          {later.map((g) => g.name).join(" and ")}, which {later.length === 1 ? "is" : "are"} off. Switch {later.length === 1 ? "it" : "one"} on in Settings,
          Integrations, AWS, and this asks for what it needs then.
        </p>
      </details>
    );
  }
  if (access.state !== "pending") return null;
  const link = safeAccessLink(access.link);
  const existing = safeConsoleLink(access.existing?.link);
  const template = safeTemplateUrl(access.template_url);
  const status = access.existing?.status ?? "";
  const stack = access.stack ?? "this install's access stack";
  const ours = !!access.existing && access.existing.kind !== "other";
  // The stack is on this release already (its Version output): the card goes on the next read.
  const done = ours && !!access.existing?.version && access.existing.version === access.version && /_COMPLETE$/.test(status) && !/ROLLBACK|DELETE/.test(status);
  const working = /_IN_PROGRESS$/.test(status) && !/ROLLBACK|DELETE/.test(status);
  const rolledBack = /ROLLBACK_COMPLETE$/.test(status) || /_FAILED$/.test(status);
  if (status === "DELETE_IN_PROGRESS") {
    return (
      <div data-testid="native-access" data-state="deleting">
        <Callout variant="info" title="The access stack is being deleted">
          <p>
            AWS is deleting <Code className="text-xs">{stack}</Code>. That changes no permission. When it&apos;s gone, this card shows the link that makes it again.
          </p>
        </Callout>
      </div>
    );
  }
  if (access.existing && !ours) {
    return (
      <div data-testid="native-access" data-state="name-taken">
        <Callout variant="warning" title="More AWS access for what you use">
          <p>
            {access.version ?? "This release"} needs more AWS access for something you use, but a stack named <Code className="text-xs">{stack}</Code> already
            exists and wasn&apos;t made by a Coderhelm release. Don&apos;t delete it: it may hold this install&apos;s permissions. Ask Coderhelm support how to apply
            this release&apos;s permissions on your install.
          </p>
          <NewPermissions access={access} />
          {existing ? (
            <p className="mt-2">
              <a href={existing} target="_blank" rel="noopener noreferrer" className={linkButton} data-testid="native-access-existing-link">Open {stack}</a>
            </p>
          ) : null}
        </Callout>
      </div>
    );
  }
  if (done || working) {
    return (
      <div data-testid="native-access" data-state="applying">
        <Callout variant="info" title="Allowing the new AWS access…">
          <p>
            AWS is {access.existing ? "updating" : "creating"} <Code className="text-xs">{stack}</Code>. It takes about a minute, and this card goes away by itself when
            it&apos;s done.
          </p>
        </Callout>
      </div>
    );
  }
  const update = ours;
  return (
    <div data-testid="native-access" data-state={update ? "update" : "create"}>
      <Callout variant="info" title="More AWS access for what you use">
        <AlreadyAllowed access={access} />
        <p className={access.current ? "mt-2" : ""}>
          {access.version ?? "This release"} adds only this, for what your install uses (your update is done and works without it):
        </p>
        <NewPermissions access={access} />
        <Later access={access} />
        {rolledBack && update ? (
          <p className="mt-2 text-amber-300" data-testid="native-access-rolled-back">
            The last change to <Code className="text-xs">{stack}</Code> didn&apos;t finish ({status}). Nothing changed; the steps below try it again.
          </p>
        ) : null}
        {update ? (
          <>
            <p className="mt-3">An AWS admin updates the stack you already have. Don&apos;t delete it.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5" data-testid="native-access-steps">
              <li>Sign in to the AWS console as an admin of this account, then click <strong>Open {stack}</strong> below.</li>
              <li>Choose <strong>Update stack</strong>, then <strong>Make a direct update</strong>, then <strong>Replace existing template</strong>.</li>
              <li>Under <strong>Amazon S3 URL</strong>, paste the template URL below, then click <strong>Next</strong>.</li>
              <li>Keep every parameter as it is, click <strong>Next</strong> twice, tick the box that says it creates IAM resources, and click <strong>Submit</strong>.</li>
            </ol>
            {template ? (
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2" data-testid="native-access-template">
                <Code className="min-w-0 wrap-anywhere text-xs">{template}</Code>
                <CopyButton text={template} label="Copy URL" />
              </div>
            ) : null}
            {existing ? (
              <p className="mt-3">
                <a href={existing} target="_blank" rel="noopener noreferrer" className={primaryButton} data-testid="native-access-existing-link">Open {stack}</a>
              </p>
            ) : null}
            <p className="mt-2 text-zinc-400">It takes about a minute. This card goes away by itself once the stack says it applied {access.version ?? "this release"}.</p>
          </>
        ) : (
          <>
            <ol className="mt-3 list-decimal space-y-1 pl-5" data-testid="native-access-steps">
              <li>Sign in to the AWS console as an admin of this account.</li>
              <li>Click <strong>Open in the AWS console</strong> below. It opens a new stack, <Code className="text-xs">{stack}</Code>, with everything filled in.</li>
              <li>At the bottom, tick the box that says it creates IAM resources, then click <strong>Create stack</strong>.</li>
              <li>Wait about a minute. This card then goes away by itself.</li>
            </ol>
            {link ? (
              <p className="mt-3">
                <a href={link} target="_blank" rel="noopener noreferrer" className={primaryButton} data-testid="native-access-link">Open in the AWS console</a>
              </p>
            ) : null}
          </>
        )}
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
