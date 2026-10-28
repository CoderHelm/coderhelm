import Link from "next/link";
import type { ReactNode } from "react";
import type { RunTrigger, RunTriggerKind } from "@/lib/api";
import { focusRing } from "./ui";
import { AtlassianIcon, BellIcon, ChatIcon, GitHubIcon, LayersIcon, PlanIcon } from "./icons";
import type { SelectOption } from "./select";

// How a run was started and by whom: "Jira · ABC-123 · by Dana",
// "Started by Coderhelm · flaky test". The gateway works the words and the
// link out (`trigger` on a run); this only draws them.

/** The "Started by" filter's choices, in the order they are offered. */
export const STARTED_BY: { value: RunTriggerKind; label: string }[] = [
  { value: "jira", label: "Jira" },
  { value: "github", label: "GitHub" },
  { value: "coderhelm", label: "Coderhelm" },
  { value: "alert", label: "Alerts" },
  { value: "plan", label: "Plans" },
  { value: "dashboard", label: "Dashboard" },
  { value: "chat", label: "Chat" },
];

const isKind = (v: string): v is RunTriggerKind => STARTED_BY.some((o) => o.value === v);

/** A `started_by` address value the filter knows, or "" for any. */
export function startedByValue(v: string): RunTriggerKind | "" {
  return isKind(v) ? v : "";
}

/** The Coderhelm mark (three slanted bars) in one colour, for its own work. */
const CoderhelmMark = () => (
  <svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor">
    <polygon points="106,416 158,416 226,96 174,96" />
    <polygon points="196,416 248,416 316,96 264,96" />
    <polygon points="286,416 338,416 406,96 354,96" />
  </svg>
);

/** The icon of what started a run: Jira, GitHub, an alert, a plan, … */
export function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "jira":
      return <AtlassianIcon />;
    case "github":
      return <GitHubIcon />;
    case "alert":
      return <BellIcon />;
    case "plan":
      return <PlanIcon />;
    case "dashboard":
      return <LayersIcon />;
    case "chat":
      return <ChatIcon />;
    default:
      return <CoderhelmMark />;
  }
}

/** The "Started by" filter's choices for a <Select>, each with its source's icon; "" is anyone. */
export function startedByOptions(): SelectOption<RunTriggerKind | "">[] {
  return [
    { value: "", label: "Started by anyone" },
    ...STARTED_BY.map((o) => ({ value: o.value, label: `Started by ${o.label}`, icon: <KindIcon kind={o.value} /> })),
  ];
}

/** A link the gateway sent: a dashboard path, or an https address. Anything else is shown as text. */
function SourceLink({ url, children }: { url?: string | null; children: ReactNode }) {
  const cls = `rounded underline decoration-zinc-600 underline-offset-2 hover:text-zinc-100 hover:decoration-zinc-400 ${focusRing}`;
  if (url && url.startsWith("/") && !url.startsWith("//")) {
    return (
      <Link href={url} className={cls}>
        {children}
      </Link>
    );
  }
  if (url && url.startsWith("https://")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <>{children}</>;
}

/**
 * One line: icon, what started the run, the thing (linked) and the person.
 * `title` is the run's title: a `ref` that only repeats it (an alert's name)
 * is left out, and the label carries the link instead.
 */
export function RunTriggerLine({ trigger, title, className = "" }: { trigger: RunTrigger; title?: string; className?: string }) {
  const ref = trigger.ref && trigger.ref !== title ? trigger.ref : null;
  const parts: ReactNode[] = [
    ref ? <span key="label">{trigger.label}</span> : (
      <SourceLink key="label" url={trigger.ref_url}>
        {trigger.label}
      </SourceLink>
    ),
  ];
  if (ref) {
    parts.push(
      <SourceLink key="ref" url={trigger.ref_url}>
        {ref}
      </SourceLink>,
    );
  }
  if (trigger.by) parts.push(<span key="by">by {trigger.by}</span>);
  // Inline, not flex: a long line wraps like text, so the list's "·" after
  // it stays on its last line instead of dropping onto one of its own.
  return (
    <span className={`min-w-0 [overflow-wrap:anywhere] ${className}`} data-testid="run-trigger" data-kind={trigger.kind}>
      <span aria-hidden="true" className="mr-1.5 inline-block align-[-1px] text-zinc-500 [&>svg]:h-3 [&>svg]:w-3">
        <KindIcon kind={trigger.kind} />
      </span>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && (
            <span aria-hidden="true" className="mx-1 text-zinc-500">
              ·
            </span>
          )}
          {p}
        </span>
      ))}
    </span>
  );
}
