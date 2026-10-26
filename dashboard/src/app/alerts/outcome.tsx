import { Chip, type StatusLook, type Tone } from "@/components/list/status";

/** What Coderhelm did with an alert, in four groups for the list's toggles. */
export type OutcomeGroup = "started" | "handled" | "ignored" | "problem";

/** The outcome toggles on the alerts list, in order. */
export const OUTCOME_GROUPS: { value: OutcomeGroup; label: string; tone: Tone }[] = [
  { value: "started", label: "Run started", tone: "success" },
  { value: "handled", label: "Handled", tone: "neutral" },
  { value: "ignored", label: "Not acted on", tone: "muted" },
  { value: "problem", label: "Problems", tone: "danger" },
];

/** Colours are the shared list tones (components/list/status). */
export const OUTCOMES: Record<
  string,
  { label: string; detail: string; tone: Tone; group: OutcomeGroup }
> = {
  run_started: {
    label: "Run started",
    detail: "Coderhelm started a run on the mapped repo to act on this alert.",
    tone: "success",
    group: "started",
  },
  duplicate: {
    label: "Repeat",
    detail:
      "The same alert already started a run in the last 6 hours, so this one was folded into it.",
    tone: "muted",
    group: "handled",
  },
  in_flight: {
    label: "Already handled",
    detail: "A run for this alert is in progress or already finished.",
    tone: "muted",
    group: "handled",
  },
  notified: {
    label: "Posted to Teams",
    detail:
      "The route only notifies: the alert was posted to Teams and no run started.",
    tone: "info",
    group: "handled",
  },
  posted: {
    label: "Posted to chat",
    detail: "The alert was posted to the team's chat channel; no run started.",
    tone: "info",
    group: "handled",
  },
  deduplicated: {
    label: "Repeat, skipped",
    detail: "The same alert came in moments ago, so this copy was skipped.",
    tone: "muted",
    group: "handled",
  },
  no_match: {
    label: "No match",
    detail: "The alert didn't contain any of the route's match terms.",
    tone: "muted",
    group: "ignored",
  },
  not_alarm: {
    label: "Recovery",
    detail:
      "The alert is a recovery or informational state change, so there was nothing to fix.",
    tone: "muted",
    group: "ignored",
  },
  recovered: {
    label: "Recovered",
    detail:
      "The alert's card was still open, so this recovery closed it. Routes that post recoveries post one green card linking the alert; later recoveries stay quiet until a new alert.",
    tone: "success",
    group: "handled",
  },
  no_open_alert: {
    label: "Recovery, not posted",
    detail:
      "Nothing was open for this alert: its card was never posted or a recovery already closed it, so nothing went to Teams.",
    tone: "muted",
    group: "ignored",
  },
  route_paused: {
    label: "Route paused",
    detail: "The route for this topic is paused.",
    tone: "waiting",
    group: "problem",
  },
  budget: {
    label: "Over token limit",
    detail: "The team's token limit was reached, so no run started.",
    tone: "waiting",
    group: "problem",
  },
  alert_budget: {
    label: "Alert budget reached",
    detail:
      "Alert runs in the last 24 hours used the team's daily alert token budget, so no run started. Change it under Alert routes.",
    tone: "waiting",
    group: "problem",
  },
  daily_cap: {
    label: "Daily cap",
    detail: "The route already started 20 runs in the last day.",
    tone: "waiting",
    group: "problem",
  },
  misconfigured: {
    label: "Route misconfigured",
    detail: "The route's repo is invalid. Edit the route in Alert routes.",
    tone: "danger",
    group: "problem",
  },
  error: {
    label: "Error",
    detail:
      "Starting the run failed. SNS retries the delivery, and this record updates when it does.",
    tone: "danger",
    group: "problem",
  },
};

/**
 * How an outcome looks. One this page doesn't know yet is a neutral
 * "Other", with its own words on hover, so it never passes for a real state.
 */
export function outcomeLook(outcome: string): StatusLook & { hover?: string } {
  const o = OUTCOMES[outcome];
  return o ? { label: o.label, tone: o.tone } : { label: "Other", tone: "neutral", hover: humanize(outcome) };
}

/** One line on what happened, for a list row. */
export function outcomeDetail(outcome: string): string {
  return OUTCOMES[outcome]?.detail ?? `Recorded as “${humanize(outcome)}”.`;
}

/** The outcome as a tag, in the shared tones. */
export function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = outcomeLook(outcome);
  return (
    <Chip tone={o.tone} title={o.hover}>
      {o.label}
    </Chip>
  );
}

/** "run_started" becomes "Run started", for values this page doesn't know yet. */
export function humanize(value?: string | null): string {
  if (!value) return "—";
  const words = value.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Where an alert came from, in words. Mirrors the platform's alert kinds. */
export const KIND_LABEL: Record<string, string> = {
  cloudwatch_alarm: "CloudWatch alarm",
  chatbot_custom: "Custom notification",
  eventbridge: "EventBridge event",
  message: "Message",
};
