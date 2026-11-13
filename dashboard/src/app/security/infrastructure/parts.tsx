"use client";

// Pieces the infrastructure screens share (Security › Infrastructure and
// Insights › Infrastructure): the fix chip, the exposure line, an account
// that lacks the reads, and one finding's details: why it is a pull request
// or a runbook, where the code is and how sure that is, and the whole
// runbook when a person applies it.

import Link from "next/link";
import { Callout } from "@/components/callout";
import { CodeBlock } from "@/components/code-block";
import { Chip, DetailBlock, Time } from "@/components/list";
import { Code } from "@/components/settings";
import { linkButton } from "@/components/ui";
import {
  CONFIDENCE_LOOK,
  FIX_LOOK,
  howWords,
  locationHref,
  locationWords,
  viaWords,
  type InfraAccount,
  type InfraCited,
  type InfraExposure,
  type InfraFinding,
  type InfraFix,
  type InfraPrNotes,
  type InfraRunbook,
  type InfraStep,
} from "@/lib/infra-security";
import { OutLink } from "../parts";

export function FixChip({ fix }: { fix: Pick<InfraFix, "kind"> }) {
  const look = FIX_LOOK[fix.kind] ?? FIX_LOOK.pr;
  return (
    <span title={look.hover} data-testid="fix-chip" data-fix={fix.kind}>
      <Chip tone={look.tone}>{look.label}</Chip>
    </span>
  );
}

export function ExposureText({ exposure }: { exposure: InfraExposure }) {
  return (
    <span className={exposure.public ? "text-orange-300" : undefined} data-testid="exposure">
      {exposure.public ? "Internet-facing" : "Not internet-facing"}
      {exposure.why ? `: ${exposure.why}` : ""}
    </span>
  );
}

/** Where the resource is defined, linked to the file on GitHub. */
export function LocationLink({ fix }: { fix: InfraFix }) {
  const href = locationHref(fix.location);
  const words = locationWords(fix.location);
  if (!words) return <span className="text-zinc-400">Not found in your connected repos yet</span>;
  return href ? <OutLink href={href}>{words}</OutLink> : <span className="text-zinc-300 [overflow-wrap:anywhere]">{words}</span>;
}

/**
 * Accounts where Infrastructure vulnerabilities is on but the role lacks the
 * reads: a warning that names the feature, and the one-click update.
 */
export function MissingReads({ accounts }: { accounts: InfraAccount[] }) {
  const short = accounts.filter((a) => a.on && a.missing.length > 0);
  if (short.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="missing-reads">
      {short.map((a) => (
        <Callout
          key={a.account}
          variant="warning"
          title={`Infrastructure vulnerabilities needs ${a.missing.length} more read-only permission${a.missing.length === 1 ? "" : "s"} in account ${a.account}`}
          actions={
            <>
              {a.update_url && (
                <a href={a.update_url} target="_blank" rel="noreferrer" className={linkButton}>
                  Update the role in AWS
                </a>
              )}
              <Link href={`/settings/integrations/aws?account=${encodeURIComponent(a.account)}`} className={linkButton}>
                See the account
              </Link>
            </>
          }
        >
          <p>
            An AWS admin signs in to account {a.account} and creates the update stack. It adds only describe and list calls:{" "}
            {a.missing.map((m, i) => (
              <span key={m}>
                <Code>{m}</Code>
                {i < a.missing.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        </Callout>
      ))}
    </div>
  );
}

/** "2026-12-01" as "Dec 1, 2026", the day AWS gave (no time zone shift). */
export function dayWords(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

/** "16.4 to 16.6" says something; a runbook's "16.4 to system-update" doesn't. */
export function showFromTo(f: InfraFinding): boolean {
  const to = f.fix.to?.trim() ?? "";
  if (!to) return false;
  if (f.fix.kind === "runbook" && f.sources.some((s) => s.kind === "maintenance" && s.id.split(":").includes(to))) return false;
  return to !== f.fix.summary && !/^(system-update|db-upgrade|os-patch|service-update|service-software)$/.test(to);
}

/** Inspector's word on a finding, when Inspector is on. */
export function InspectorChips({ f }: { f: InfraFinding }) {
  const i = f.inspector;
  if (!i) return null;
  return (
    <>
      {i.exploit_available && (
        <span title="Amazon Inspector knows of a working exploit." data-testid="chip-exploit">
          <Chip tone="danger">Exploit known</Chip>
        </span>
      )}
      {i.reachable === true && (
        <span title="Amazon Inspector found a network path to the vulnerable port." data-testid="chip-reachable">
          <Chip tone="attention">Reachable (Inspector)</Chip>
        </span>
      )}
    </>
  );
}

/** Server text with `names` in backticks: each name is shown as code. */
export function Ticks({ text }: { text: string }) {
  const parts = text.split("`");
  if (parts.length < 3) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 && i < parts.length - 1 ? <Code key={i}>{part}</Code> : <span key={i}>{i % 2 === 1 ? `\`${part}` : part}</span>))}
    </>
  );
}

/** Lines of text as a list (one line stays a paragraph). */
function Lines({ items, testid }: { items: string[]; testid?: string }) {
  if (items.length === 0) return null;
  if (items.length === 1)
    return (
      <p className="max-w-prose text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]" data-testid={testid}>
        <Ticks text={items[0]} />
      </p>
    );
  return (
    <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]" data-testid={testid}>
      {items.map((t) => (
        <li key={t}>
          <Ticks text={t} />
        </li>
      ))}
    </ul>
  );
}

/** Steps with their commands, in order. */
function Steps({ steps, testid }: { steps: InfraStep[]; testid?: string }) {
  if (steps.length === 0) return null;
  return (
    <ol className="max-w-full list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300" data-testid={testid}>
      {steps.map((s) => (
        <li key={`${s.text}${s.cli ?? ""}`} className="min-w-0 [overflow-wrap:anywhere]">
          <Ticks text={s.text} />
          {s.cli && (
            <div className="mt-1 min-w-0 max-w-full">
              <CodeBlock code={s.cli} lang="bash" wrap />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The pages the facts came from, each with the day it was last read. */
function Sources({ sources }: { sources: InfraCited[] }) {
  if (sources.length === 0) return null;
  return (
    <DetailBlock title="Where this comes from">
      <ul className="space-y-1 text-xs" data-testid="guidance-sources">
        {sources.map((s) => (
          <li key={s.url} className="[overflow-wrap:anywhere]">
            <OutLink href={s.url}>{s.url.replace(/^https:\/\//, "")}</OutLink>{" "}
            <span className="text-zinc-400">
              read {dayWords(s.reviewed_on)}
              {s.stale ? ". Not re-read lately: check the page before relying on it" : ""}
            </span>
          </li>
        ))}
      </ul>
    </DetailBlock>
  );
}

/** Where the resource is defined, how it was found and how sure that is. */
export function LocationBlock({ fix }: { fix: InfraFix }) {
  const l = fix.location;
  if (!l) return null;
  const look = l.confidence ? CONFIDENCE_LOOK[l.confidence] : null;
  const e = l.edit;
  return (
    <DetailBlock title="Where it's defined">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <LocationLink fix={fix} />
        {look && (
          <span title={look.hover} data-testid="location-confidence" data-confidence={l.confidence}>
            <Chip tone={look.tone}>{look.label}</Chip>
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-400" data-testid="location-how">
        Found by {howWords(l.how)}
        {l.tool ? ` (${l.tool})` : ""}
        {l.environment ? `, ${l.environment}` : ""}.
      </p>
      {e && (
        <p className="mt-1 text-xs text-zinc-300 [overflow-wrap:anywhere]" data-testid="location-edit">
          The value to change: <Code>{e.attribute}</Code> in {e.file}
          {e.line ? `:${e.line}` : ""}
          {e.value ? (
            <>
              , now <Code>{e.value}</Code>
            </>
          ) : null}{" "}
          ({viaWords(e.via)}).{e.shared ? " " : ""}
          {e.shared ? <Ticks text={`${e.shared}.`} /> : null}
        </p>
      )}
      {(l.evidence?.length ?? 0) > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-400 [overflow-wrap:anywhere]" data-testid="location-evidence">
          {l.evidence!.map((x) => (
            <li key={x}>
              <Ticks text={x} />
            </li>
          ))}
        </ul>
      )}
      {(l.candidates?.length ?? 0) > 0 && (
        <p className="mt-1 text-xs text-zinc-400 [overflow-wrap:anywhere]" data-testid="location-candidates">
          It could also be: {l.candidates!.join("; ")}.
        </p>
      )}
    </DetailBlock>
  );
}

/** The whole runbook a person follows in AWS. Coderhelm never runs it. */
export function RunbookBlocks({ rb }: { rb: InfraRunbook }) {
  return (
    <>
      <DetailBlock title="Scope">
        <Lines items={rb.scope} testid="runbook-scope" />
      </DetailBlock>
      {rb.what.length > 0 && (
        <DetailBlock title="What it is">
          <Lines items={rb.what} />
        </DetailBlock>
      )}
      {rb.interruption.length > 0 && (
        <DetailBlock title="Expected interruption">
          <Lines items={rb.interruption} testid="runbook-interruption" />
        </DetailBlock>
      )}
      {rb.prerequisites.length > 0 && (
        <DetailBlock title="You need">
          <Lines items={rb.prerequisites} />
        </DetailBlock>
      )}
      {rb.prechecks.length > 0 && (
        <DetailBlock title="Check first">
          <Steps steps={rb.prechecks} testid="runbook-prechecks" />
        </DetailBlock>
      )}
      {rb.backup.length > 0 && (
        <DetailBlock title="Back up">
          <Steps steps={rb.backup} testid="runbook-backup" />
        </DetailBlock>
      )}
      {rb.console.length > 0 && (
        <DetailBlock title="In the AWS console">
          <Lines items={rb.console} />
        </DetailBlock>
      )}
      {rb.steps.length > 0 && (
        <DetailBlock title="Run this in AWS">
          <div className="min-w-0 max-w-full" data-testid="runbook-cli">
            <Steps steps={rb.steps} />
          </div>
          <p className="mt-1 text-xs text-zinc-400">Coderhelm never runs this. A person with access to the account does.</p>
        </DetailBlock>
      )}
      {rb.validation.length > 0 && (
        <DetailBlock title="Check after">
          <Steps steps={rb.validation} testid="runbook-validation" />
        </DetailBlock>
      )}
      {rb.rollback.length > 0 && (
        <DetailBlock title="Rollback">
          <Steps steps={rb.rollback} testid="runbook-rollback" />
        </DetailBlock>
      )}
      {(rb.apply_by || rb.if_nothing.length > 0) && (
        <DetailBlock title="If nothing is done">
          {rb.apply_by && (
            <p className="text-sm text-zinc-300" data-testid="apply-by">
              AWS&apos;s date for this action: {dayWords(rb.apply_by)}.
            </p>
          )}
          <Lines items={rb.if_nothing} />
        </DetailBlock>
      )}
      {rb.notes.length > 0 && (
        <DetailBlock title="Notes">
          <Lines items={rb.notes} />
        </DetailBlock>
      )}
      <Sources sources={rb.sources} />
    </>
  );
}

/** What a pull request for a code change says before anyone merges it. */
export function PrNotesBlocks({ n }: { n: InfraPrNotes }) {
  return (
    <>
      {n.takes_effect.length > 0 && (
        <DetailBlock title="When it takes effect">
          <Lines items={n.takes_effect} testid="notes-takes-effect" />
        </DetailBlock>
      )}
      {n.interruption.length > 0 && (
        <DetailBlock title="Expected interruption">
          <Lines items={n.interruption} />
        </DetailBlock>
      )}
      {n.replacement.length > 0 && (
        <DetailBlock title="Replacement">
          <Lines items={n.replacement} testid="notes-replacement" />
        </DetailBlock>
      )}
      {n.plan.length > 0 && (
        <DetailBlock title="What the plan must show">
          <Lines items={n.plan} />
        </DetailBlock>
      )}
      {n.prechecks.length > 0 && (
        <DetailBlock title="Before it is applied">
          <Steps steps={n.prechecks} />
        </DetailBlock>
      )}
      {n.rollback.length > 0 && (
        <DetailBlock title="Rollback">
          <Lines items={n.rollback} testid="notes-rollback" />
        </DetailBlock>
      )}
      {n.traps.length > 0 && (
        <DetailBlock title="Known traps">
          <Lines items={n.traps} />
        </DetailBlock>
      )}
      <Sources sources={n.sources} />
    </>
  );
}

/** What opens under a finding's row. */
export function FindingDetails({ f }: { f: InfraFinding }) {
  const fix = f.fix;
  const rb = fix.kind === "runbook" ? (fix.runbook ?? null) : null;
  const order = fix.order ?? [];
  return (
    <>
      {fix.kind === "aws" ? (
        <DetailBlock title="Why there's nothing to do">
          <p className="max-w-prose text-sm leading-relaxed text-zinc-300">{fix.reason || "AWS patches this service itself."}</p>
        </DetailBlock>
      ) : (
        <DetailBlock title="The fix">
          <p className="text-sm text-zinc-200">
            <Ticks text={fix.summary} />
          </p>
          {showFromTo(f) && (
            <p className="mt-1 text-xs text-zinc-400 [overflow-wrap:anywhere]" data-testid="from-to">
              {fix.from || "?"} to {fix.to || "?"}
            </p>
          )}
        </DetailBlock>
      )}
      {fix.kind !== "aws" && fix.decision && (
        <DetailBlock title={fix.kind === "pr" ? "Why a pull request" : "Why a runbook"}>
          <p className="max-w-prose text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]" data-testid="fix-decision">
            <Ticks text={fix.decision} />
          </p>
          {fix.code_note && (
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-zinc-400 [overflow-wrap:anywhere]" data-testid="code-note">
              <Ticks text={fix.code_note} />
            </p>
          )}
        </DetailBlock>
      )}
      {(f.refused?.length ?? 0) > 0 && (
        <DetailBlock title={f.drafted ? "Coderhelm made its pull request a draft" : "Coderhelm is correcting its own change"}>
          <Lines items={f.refused!} testid="fix-refused" />
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-zinc-400" data-testid="fix-refused-note">
            {f.note ||
              (f.drafted
                ? "The change would have replaced or destroyed a resource that holds data. The pull request is kept as a draft and nothing was applied."
                : "The change would have replaced or destroyed a resource that holds data. One fix round is correcting these lines.")}
          </p>
          {f.drafted && f.pr?.url && (
            <p className="mt-1 text-xs">
              <OutLink href={f.pr.url}>The draft pull request #{f.pr.number}</OutLink>
            </p>
          )}
        </DetailBlock>
      )}
      {order.length > 0 && (
        <DetailBlock title="Order">
          <Lines items={order} testid="fix-order" />
        </DetailBlock>
      )}
      {fix.kind === "pr" && !fix.location && (
        <DetailBlock title="Where it's defined">
          <LocationLink fix={fix} />
        </DetailBlock>
      )}
      {fix.kind !== "aws" && <LocationBlock fix={fix} />}
      {fix.kind === "pr" && fix.notes && <PrNotesBlocks n={fix.notes} />}
      {rb && <RunbookBlocks rb={rb} />}
      {!rb && fix.kind !== "aws" && fix.cli.length > 0 && (
        <DetailBlock title={fix.kind === "runbook" ? "Run this in AWS" : "Then roll it out"}>
          <div className="min-w-0 max-w-full" data-testid="runbook-cli">
            <CodeBlock code={fix.cli.join("\n")} lang="bash" wrap />
          </div>
          {fix.kind === "runbook" && <p className="mt-1 text-xs text-zinc-400">Coderhelm never runs this. A person with access to the account does.</p>}
        </DetailBlock>
      )}
      {!rb && fix.kind === "runbook" && fix.console && (
        <DetailBlock title="In the AWS console">
          <p className="text-sm text-zinc-300 [overflow-wrap:anywhere]">
            <Ticks text={fix.console} />
          </p>
        </DetailBlock>
      )}
      {!rb && fix.apply_by && (
        <DetailBlock title="AWS's date">
          <p className="text-sm text-zinc-300" data-testid="apply-by">
            Apply by {dayWords(fix.apply_by)}. AWS applies it itself after that, in the maintenance window.
          </p>
        </DetailBlock>
      )}
      <DetailBlock title="Advisories">
        <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
          {f.sources.filter((s) => s.kind !== "maintenance").map((s) =>
            s.url && s.kind !== "inspector" ? (
              <OutLink key={s.id} href={s.url}>
                {s.id}
              </OutLink>
            ) : (
              <span key={s.id} className="text-zinc-300 [overflow-wrap:anywhere]" data-testid={s.kind === "inspector" ? "source-inspector" : undefined}>
                {s.kind === "inspector" ? `Amazon Inspector ${s.id}` : s.id}
              </span>
            ),
          )}
        </div>
        {f.sources.some((s) => s.kind === "maintenance") && <p className="text-sm text-zinc-300">AWS lists it as pending maintenance on the resource.</p>}
        {f.cves.length > 0 && (
          <p className="mt-1 text-xs text-zinc-400 [overflow-wrap:anywhere]" data-testid="finding-cves">
            {f.cves.join(" · ")}
          </p>
        )}
        {fix.advisory_note && (
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-zinc-400 [overflow-wrap:anywhere]" data-testid="advisory-note">
            <Ticks text={fix.advisory_note} />
          </p>
        )}
      </DetailBlock>
      <DetailBlock title="Resources">
        <p className="text-sm text-zinc-300 [overflow-wrap:anywhere]">
          {f.resources.join(", ")} in account {f.account}, {f.region}
        </p>
        <p className="mt-1 text-xs">
          <ExposureText exposure={f.exposure} />
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          First seen <Time iso={f.first_seen_at} />. It closes when Coderhelm reads the account again and sees the fix running.
        </p>
      </DetailBlock>
    </>
  );
}
