"use client";

// Pieces the infrastructure screens share (Security › Infrastructure and
// Insights › Infrastructure): the fix chip, the exposure line, an account
// that lacks the reads, and one finding's details.

import Link from "next/link";
import { Callout } from "@/components/callout";
import { CodeBlock } from "@/components/code-block";
import { Chip, DetailBlock, Time } from "@/components/list";
import { Code } from "@/components/settings";
import { linkButton } from "@/components/ui";
import {
  FIX_LOOK,
  locationHref,
  locationWords,
  type InfraAccount,
  type InfraExposure,
  type InfraFinding,
  type InfraFix,
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

/** What opens under a finding's row. */
export function FindingDetails({ f }: { f: InfraFinding }) {
  const fix = f.fix;
  return (
    <>
      {fix.kind === "aws" ? (
        <DetailBlock title="Why there's nothing to do">
          <p className="max-w-prose text-sm leading-relaxed text-zinc-300">{fix.reason || "AWS patches this service itself."}</p>
        </DetailBlock>
      ) : (
        <DetailBlock title="The fix">
          <p className="text-sm text-zinc-200">{fix.summary}</p>
          {showFromTo(f) && (
            <p className="mt-1 text-xs text-zinc-400 [overflow-wrap:anywhere]" data-testid="from-to">
              {fix.from || "?"} to {fix.to || "?"}
            </p>
          )}
        </DetailBlock>
      )}
      {fix.kind === "pr" && (
        <DetailBlock title="Where it's defined">
          <LocationLink fix={fix} />
        </DetailBlock>
      )}
      {fix.kind !== "aws" && fix.cli.length > 0 && (
        <DetailBlock title={fix.kind === "runbook" ? "Run this in AWS" : "Then roll it out"}>
          <div className="min-w-0 max-w-full" data-testid="runbook-cli">
            <CodeBlock code={fix.cli.join("\n")} lang="bash" wrap />
          </div>
          {fix.kind === "runbook" && <p className="mt-1 text-xs text-zinc-400">Coderhelm never runs this. A person with access to the account does.</p>}
        </DetailBlock>
      )}
      {fix.kind === "runbook" && fix.console && (
        <DetailBlock title="In the AWS console">
          <p className="text-sm text-zinc-300 [overflow-wrap:anywhere]">{fix.console}</p>
        </DetailBlock>
      )}
      {fix.apply_by && (
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
        {f.cves.length > 0 && <p className="mt-1 text-xs text-zinc-400 [overflow-wrap:anywhere]">{f.cves.join(" · ")}</p>}
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
