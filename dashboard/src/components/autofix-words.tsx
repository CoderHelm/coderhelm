import Link from "next/link";
import type { LogAutofix, LogPostsTo, LogSeverity } from "@/lib/api";
import { linkButton } from "./ui";

// Automatic fix PRs for log findings, in words: what qualifies, the daily
// limit, and where each PR is posted. Shared by the Logs page and the Alerts
// settings page so both say the same thing.

/** The severity select's choices: what gets a fix PR. */
export const AUTOFIX_SEVERITY_OPTIONS: { value: LogSeverity; label: string }[] = [
  { value: "critical", label: "Critical findings" },
  { value: "warning", label: "Warning and critical findings" },
  { value: "info", label: "Every finding" },
];

const RANK: Record<LogSeverity, number> = { info: 0, warning: 1, critical: 2 };

/** Whether a finding of `severity` meets the team's minimum. */
export function meetsSeverity(severity: LogSeverity, min: LogSeverity): boolean {
  return (RANK[severity] ?? 0) >= (RANK[min] ?? 2);
}

/** "critical findings", "warning and critical findings", "every finding". */
export function findingsWord(min: LogSeverity): string {
  return min === "critical" ? "critical findings" : min === "warning" ? "warning and critical findings" : "every finding";
}

/** "every critical finding", "every warning or critical finding", "every finding". */
export function everyFindingWord(min: LogSeverity): string {
  return min === "critical" ? "every critical finding" : min === "warning" ? "every warning or critical finding" : "every finding";
}

/** "Microsoft Teams and Slack". */
export function channelNames(p: LogPostsTo | undefined): string {
  const c = p?.channels ?? [];
  return c.length <= 1 ? (c[0] ?? "") : `${c.slice(0, -1).join(", ")} and ${c[c.length - 1]}`;
}

/** Where the posting is changed: the alerts channel, or this page's own setting. */
export function postsToHref(p: LogPostsTo | undefined): string {
  return p && p.mode !== "team" ? "/logs/?auto=1#findings-notify" : "/settings/alerts/#alert-settings";
}

/** The state sentence: "On: critical findings get a fix PR automatically, up to 3 a day, posted to Slack." */
export function autofixSentence(a: LogAutofix, p: LogPostsTo | undefined): string {
  if (!a.enabled) return "Off: no fix PRs open automatically. Fix PRs start only when someone presses Create fix PR.";
  const where = channelNames(p);
  const cap = `up to ${a.daily_cap} a day`;
  return `On: ${findingsWord(a.min_severity)} get a fix PR automatically, ${cap}, ${where ? `posted to ${where}` : "not posted anywhere"}.`;
}

/**
 * "Posts to: Slack (same as production alerts) Change", or "Not posting
 * anywhere: set up an alerts channel" when nothing is set.
 */
export function PostsTo({ p, testId = "autofix-posts-to" }: { p: LogPostsTo | undefined; testId?: string }) {
  if (!p) return null;
  const names = channelNames(p);
  if (!names) {
    const why =
      p.mode === "off" ? (
        <>
          Not posting anywhere: posting findings to chat is off.{" "}
          <Link href={postsToHref(p)} className={linkButton}>Turn it on</Link>
        </>
      ) : p.mode === "custom" ? (
        <>
          Not posting anywhere: this page&apos;s own channel has no webhook.{" "}
          <Link href={postsToHref(p)} className={linkButton}>Add one</Link>
        </>
      ) : (
        <>
          Not posting anywhere:{" "}
          <Link href="/settings/alerts/#alert-settings" className={linkButton}>set up an alerts channel</Link>
        </>
      );
    return (
      <p className="min-w-0 text-sm text-amber-200" data-testid={testId} data-state="none">
        {why}
      </p>
    );
  }
  return (
    <p className="min-w-0 text-sm text-zinc-300" data-testid={testId} data-state={p.mode}>
      Posts to: <span className="font-medium text-zinc-100">{names}</span>{" "}
      <span className="text-zinc-400">{p.mode === "team" ? "(same as production alerts)" : "(this page's own channel)"}</span>{" "}
      <Link href={postsToHref(p)} className={linkButton} aria-label="Change where fix PRs post">
        Change
      </Link>
    </p>
  );
}
