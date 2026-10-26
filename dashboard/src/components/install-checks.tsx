"use client";

import Link from "next/link";
import type { CheckFix, CheckStatus, InstallCheck } from "@/lib/api";
import { Chip, type Tone } from "@/components/list";
import { CodeBlock } from "@/components/code-block";
import { linkButton } from "@/components/ui";
import { AlertCircleIcon, CheckIcon, InfoIcon, WarningIcon } from "@/components/icons";

/** Each status in words (never color alone), its tone and its icon. */
export const STATUS: Record<CheckStatus, { label: string; tone: Tone; icon: React.ReactNode; ring: string }> = {
  pass: { label: "Passed", tone: "success", icon: <CheckIcon />, ring: "border-emerald-400 bg-emerald-400 text-emerald-950" },
  warn: { label: "Warning", tone: "waiting", icon: <WarningIcon />, ring: "border-amber-400/60 text-amber-300" },
  fail: { label: "Needs a fix", tone: "danger", icon: <AlertCircleIcon />, ring: "border-red-400/60 text-red-300" },
  skip: { label: "Not set up", tone: "muted", icon: <InfoIcon />, ring: "border-zinc-600 text-zinc-500" },
};

/** The fix: plain words, a command to copy, a link out, a page in Coderhelm. */
export function FixBlock({ fix, testId }: { fix: CheckFix; testId?: string }) {
  return (
    <div className="mt-2 min-w-0 space-y-2" data-testid={testId}>
      {fix.text && (
        <p className="text-sm text-zinc-300">
          <span className="font-medium text-zinc-100">How to fix: </span>
          {fix.text}
        </p>
      )}
      {fix.command && <CodeBlock code={fix.command} lang="bash" label="Command to copy" testId="fix-command" />}
      {(fix.url || fix.href) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {fix.href && <Link href={fix.href} className={linkButton}>Open in Coderhelm</Link>}
          {fix.url && (
            <a href={fix.url} target="_blank" rel="noopener noreferrer" className={linkButton}>
              <span className="wrap-anywhere">{linkLabel(fix.url)}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** "Open github.com", "Open the AWS console": where the link goes, in words. */
export function linkLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("console.aws.amazon.com")) return "Open the AWS console";
    if (host === "github.com") return "Open on GitHub";
    if (host === "console.anthropic.com") return "Open the Anthropic console";
    return `Open ${host.replace(/^www\./, "")}`;
  } catch {
    return "Open";
  }
}

/** One check: its status, what is true now and, when it isn't a pass, why it matters and the fix. */
export function CheckRow({ check, children }: { check: InstallCheck; children?: React.ReactNode }) {
  const s = STATUS[check.status];
  return (
    <li id={`check-${check.key}`} data-status={check.status} className="flex min-w-0 gap-3 px-4 py-3">
      <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${s.ring}`}>
        <span className="scale-75">{s.icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
          {check.label}
          <Chip tone={s.tone}>{s.label}</Chip>
        </p>
        <p className="mt-0.5 break-words text-sm text-zinc-400">{check.detail}</p>
        {check.status !== "pass" && check.why && check.status !== "skip" && (
          <p className="mt-1 text-sm text-zinc-400"><span className="font-medium text-zinc-300">Why it matters: </span>{check.why}</p>
        )}
        {check.status !== "pass" && check.fix && <FixBlock fix={check.fix} />}
        {children}
      </div>
    </li>
  );
}

/** Failing first, then warnings, then the rest, keeping each group's order. */
export function byUrgency(checks: InstallCheck[]): InstallCheck[] {
  const rank: Record<CheckStatus, number> = { fail: 0, warn: 1, skip: 3, pass: 2 };
  return checks.map((c, i) => ({ c, i })).sort((a, b) => rank[a.c.status] - rank[b.c.status] || a.i - b.i).map((x) => x.c);
}
