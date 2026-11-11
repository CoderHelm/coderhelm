"use client";

// Pieces the Security pages share: the tier and verdict tags, the fix state
// and the deadline countdown, and the banner for a missing GitHub permission.

import Link from "next/link";
import { Callout } from "@/components/callout";
import { Chip, TONES } from "@/components/list";
import { linkButton } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import {
  STATUS_LOOK,
  TIER_LOOK,
  VERDICT_LOOK,
  dueIn,
  isActive,
  type Finding,
  type SecurityConfig,
  type Tier,
  type Verdict,
} from "@/lib/security";

export function TierPill({ tier }: { tier: Tier }) {
  const look = TIER_LOOK[tier] ?? TIER_LOOK.P3;
  return (
    <span title={look.words} data-testid="tier-pill" data-tier={tier}>
      <Chip tone={look.tone}>{tier}</Chip>
    </span>
  );
}

export function VerdictPill({ verdict, scope }: { verdict: Verdict; scope?: Finding["scope"] }) {
  const look = VERDICT_LOOK[verdict] ?? VERDICT_LOOK.unknown;
  // A package only used in development reads better as just that.
  const label = verdict === "not_loaded" && scope === "dev" ? "Dev only" : look.label;
  return (
    <span title={look.hover} data-testid="verdict-pill" data-verdict={verdict}>
      <Chip tone={look.tone}>{label}</Chip>
    </span>
  );
}

const CI_WORDS: Record<string, string> = { passing: "CI passing", failing: "fixing CI", pending: "CI running" };

/** What is happening with the fix: the pull request and its CI, or what comes next. */
export function FixState({ f, config }: { f: Finding; config?: SecurityConfig | null }) {
  if (f.pr) {
    const state = f.pr.state === "merged" ? "merged" : f.pr.state === "closed" ? "closed" : f.pr.ci ? CI_WORDS[f.pr.ci] ?? null : null;
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 whitespace-normal" data-testid="fix-state">
        <a href={f.pr.url} target="_blank" rel="noreferrer" className={`${linkButton} !text-xs`}>
          PR #{f.pr.number}
        </a>
        {state && <span className={`text-xs ${f.pr.ci === "failing" && f.pr.state === "open" ? TONES.waiting.text : "text-zinc-400"}`}>{state}</span>}
      </span>
    );
  }
  return (
    <span className="text-xs text-zinc-400" data-testid="fix-state">
      {nextStep(f, config)}
    </span>
  );
}

function nextStep(f: Finding, config?: SecurityConfig | null): string {
  if (f.status === "fixing") return "Working on the fix";
  if (f.status === "no_fix") return "No fixed version yet";
  if (f.status === "fixed") return "Fixed";
  if (f.status === "dismissed") return "Dismissed";
  if (f.status === "withdrawn") return "Advisory withdrawn";
  if (!config) return STATUS_LOOK[f.status]?.label ?? "Open";
  if (!config.enabled || config.dry_run) return "Preview only, no PR";
  const mode = config.open_prs[f.tier];
  if (mode === "off") return "No PR for this tier";
  if (mode === "daily") return "In the daily PR";
  if (mode === "weekly") return "In the weekly PR";
  return mode === "now" ? "PR opening" : "PR within the hour";
}

/** The time left before the deadline, red once it has passed. */
export function DueText({ f, now }: { f: Pick<Finding, "due_at" | "status">; now?: number }) {
  if (!isActive(f)) return <span className="text-zinc-500">—</span>;
  const d = dueIn(f.due_at, now);
  if (!d) return <span className="text-zinc-500">—</span>;
  return (
    <span className={`tabular-nums ${d.overdue ? TONES.danger.text : "text-zinc-200"}`} title={new Date(f.due_at).toLocaleString()} data-testid="due">
      {d.text}
    </span>
  );
}

/**
 * The GitHub App can't read Dependabot alerts: say what that costs and how
 * an owner of the GitHub organization grants it.
 */
export function PermissionBanner() {
  return (
    <Callout
      variant="warning"
      title="Coderhelm can't read your Dependabot alerts yet"
      testId="permission-banner"
      actions={
        <Link href="/settings/integrations/github" className={linkButton}>
          GitHub integration
        </Link>
      }
    >
      <p>
        The Coderhelm GitHub App needs one more permission: <b>Dependabot alerts: read</b>. Until it has it, Coderhelm still checks your
        dependencies against public advisories, but it hears about new Dependabot alerts later and can&apos;t mark them dismissed for you.
      </p>
      <ol className="list-decimal space-y-0.5 pl-5">
        <li>An owner of your GitHub organization opens GitHub, then Settings, then GitHub Apps, then Coderhelm.</li>
        <li>GitHub shows a request for new permissions. Review it and accept.</li>
        <li>On a self-hosted install, the App&apos;s owner first adds the permission and the Dependabot alert event in the App&apos;s settings.</li>
      </ol>
    </Callout>
  );
}

/** A link that leaves the app, with the icon that says so. */
export function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${linkButton} gap-1`}>
      <span className="[overflow-wrap:anywhere]">{children}</span>
      <span aria-hidden="true" className="inline-flex shrink-0">
        <ExternalLinkIcon />
      </span>
    </a>
  );
}
