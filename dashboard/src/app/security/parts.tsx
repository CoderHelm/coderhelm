"use client";

// Pieces the Security pages share: the tier and verdict tags, the fix state
// and the deadline countdown, and the banner for a missing GitHub permission.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Callout } from "@/components/callout";
import { Chip, TONES } from "@/components/list";
import { linkButton } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import {
  STATUS_LOOK,
  TIER_LOOK,
  VERDICT_LOOK,
  dueDate,
  dueIn,
  isActive,
  type Finding,
  type SecurityConfig,
  type Tier,
  type Verdict,
} from "@/lib/security";

/** What a tier still being checked says, on hover and to a screen reader. */
export function provisionalWords(tier: Tier): string {
  return `Likely ${tier}. Still checking whether your code uses this package; the tier can change.`;
}

/**
 * The tier. While the verdict is still being checked it is a muted, low-contrast
 * outline of the same size with a clock in it, never a question mark; once
 * the check settles it turns solid (a short fade, none with reduced motion).
 */
export function TierPill({ tier, provisional }: { tier: Tier; provisional?: boolean }) {
  const look = TIER_LOOK[tier] ?? TIER_LOOK.P3;
  const was = useRef(provisional);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (was.current && !provisional) setSettled(true);
    was.current = provisional;
  }, [provisional]);
  if (provisional) {
    const words = provisionalWords(tier);
    return (
      <span title={words} data-testid="tier-pill" data-tier={tier} data-provisional="true" className="inline-flex">
        <span className="sr-only">{words}</span>
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-zinc-700 bg-transparent px-2 py-0.5 text-xs font-medium text-zinc-300"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="8" cy="8" r="6.2" />
            <path d="M8 4.6V8l2.3 1.5" />
          </svg>
          {tier}
        </span>
      </span>
    );
  }
  return (
    <span title={look.words} data-testid="tier-pill" data-tier={tier} className={`inline-flex ${settled ? "tier-settle" : ""}`}>
      <Chip tone={look.tone}>{tier}</Chip>
    </span>
  );
}

/**
 * The verdict: "Checking" is a quiet spinner, "Unknown" carries its reason on
 * hover, reachable and not reachable say how many code lines back them.
 */
export function VerdictPill({
  verdict,
  scope,
  reason,
  lines,
}: {
  verdict: Verdict;
  scope?: Finding["scope"];
  reason?: string | null;
  lines?: number;
}) {
  const look = VERDICT_LOOK[verdict] ?? VERDICT_LOOK.unknown;
  if (verdict === "pending") {
    return (
      <span title={reason || look.hover} data-testid="verdict-pill" data-verdict={verdict} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-zinc-400">
        <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-300 motion-reduce:animate-none" />
        Checking
      </span>
    );
  }
  // A package only used in development reads better as just that.
  const label = verdict === "not_loaded" && scope === "dev" ? "Dev only" : look.label;
  const count = (verdict === "reachable" || verdict === "not_reachable") && lines ? ` · ${lines} line${lines === 1 ? "" : "s"}` : "";
  return (
    <span title={reason || look.hover} data-testid="verdict-pill" data-verdict={verdict} className="whitespace-nowrap">
      <Chip tone={look.tone}>
        {label}
        {count}
      </Chip>
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

/** The deadline as a date and the time to it; coloured only when overdue or under a day. */
export function DueDate({ due, active = true, now }: { due: string; active?: boolean; now?: number }) {
  if (!active) return <span className="text-zinc-500">—</span>;
  const d = dueDate(due, now);
  if (!d) return <span className="text-zinc-500">—</span>;
  const tone = d.overdue ? TONES.danger.text : d.soon ? TONES.attention.text : "text-zinc-400";
  return (
    <span className="inline-flex flex-col items-end whitespace-nowrap leading-tight" title={new Date(due).toLocaleString()} data-testid="due">
      <span className="tabular-nums text-zinc-200">{d.date}</span>
      <span className={`text-xs tabular-nums ${tone}`}>{d.text}</span>
    </span>
  );
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
 * Dependabot alerts aren't read: one line on why (the organization hasn't
 * accepted the permission, or the app lacks it) and where to fix it.
 */
export function PermissionBanner({ reason }: { reason?: string | null }) {
  return (
    <Callout
      variant="warning"
      title="Dependabot alerts aren't read yet"
      testId="permission-banner"
      actions={
        <Link href="/settings/integrations/github" className={linkButton}>
          GitHub integration
        </Link>
      }
    >
      <p>
        {reason ||
          "The GitHub App needs Dependabot alerts: read. An owner of your GitHub organization accepts it in Settings, GitHub Apps, Coderhelm."}{" "}
        OSV and GitHub&apos;s advisory feed still cover your repos meanwhile.
      </p>
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
