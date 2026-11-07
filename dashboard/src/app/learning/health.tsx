"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorStatus, type LearningHealth as Health, type LearningLoop } from "@/lib/api";
import { Callout } from "@/components/callout";
import { ListSkeleton, Time } from "@/components/list";
import { StatusPill } from "@/components/status-pill";
import { cardClass, Section } from "@/components/page";
import { smallSecondaryButton } from "@/components/ui";

// "Is Coderhelm still learning?": one card per learning loop (GET
// /api/learning/health), saying what it learns from, when it last learned,
// how much it learned this week against what should have fed it, and, for a
// loop that went quiet, what to check. The week is fixed by the gateway, so
// the page's period and repository filters don't apply here.

/**
 * Each loop's title, what it learns from, and what to check when it goes quiet,
 * by the loop's id. The titles are the dashboard's own; the API's `label` is
 * never shown. An id this dashboard doesn't know reads as its words.
 */
const LOOPS: Record<string, { title: string; from: string; check: string }> = {
  pr_outcomes: {
    title: "What happens to Coderhelm's pull requests",
    from: "Whether Coderhelm's pull requests were merged as written, merged after people's edits, or closed.",
    check: "Pull requests closed this week were never scored. Check that the GitHub App still gets pull request events (Settings, Integrations, GitHub), then look in the gateway's log for the pull requests named above.",
  },
  review_outcomes: {
    title: "What people do with review comments",
    from: "Whether people acted on the reviewer's comments, dismissed them, or left them open.",
    check: "Reviews ran this week but none of their comments was scored. Check that the GitHub App still gets review comment and pull request events.",
  },
  calibration: {
    title: "What the reviewer raises",
    from: "How often each kind of review comment is acted on, per repository, which tunes what the reviewer raises.",
    check: "Comments were scored but no category moved. Look in the gateway's log for the learning step that follows a scored comment.",
  },
  reviewer_variants: {
    title: "Ways of reviewing",
    from: "Which way of reviewing gets the better outcomes.",
    check: "Reviews ran but no variant was picked or credited this week. Look in the reviewer's log for the variant it chose.",
  },
  coder_variants: {
    title: "Ways of writing code",
    from: "Which way of writing code gets its pull requests merged.",
    check: "Pull requests closed but no coding variant was picked or credited this week. Look in the worker's log for the variant each run chose.",
  },
  examples: {
    title: "Examples to follow or avoid",
    from: "Past comments and changes that landed well or badly, put in the agents' prompts as examples to follow or to avoid.",
    check: "Reviews ran but no example was used in a prompt this week. Check that the repositories reviewed have examples under Examples in use.",
  },
  coder_lessons: {
    title: "Lessons for the coding agent",
    from: "Repeated setbacks in one area of the code: closed pull requests, reverts, checks that failed.",
    check: "Some areas had enough setbacks for a lesson, but none was written or reinforced. Look in the worker's log for the lessons step.",
  },
  review_lessons: {
    title: "Lessons for the reviewer",
    from: "People pushing back on the reviewer's comments.",
    check: "Pull requests with pushback have waited more than 2 hours to be judged. Look in the worker's log for the review lessons step.",
  },
  stop_outcomes: {
    title: "What people do after Coderhelm asks or stops",
    from: "What people did after Coderhelm asked a question, stopped, or blocked a merge.",
    check: "Asks, stops and blocks from this week have no recorded follow up. Check that pull request and ticket events still arrive.",
  },
};

const STATE: Record<string, { label: string; tone: "success" | "neutral" | "error" }> = {
  ok: { label: "Learning", tone: "success" },
  idle: { label: "Nothing to learn from yet", tone: "neutral" },
  quiet: { label: "Not learning", tone: "error" },
};
const stateOf = (s: string) => STATE[s] ?? { label: s, tone: "neutral" as const };

/** "coder_lessons" reads "Coder lessons" when this dashboard has no title for it. */
function titleOf(key: string): string {
  const known = LOOPS[key]?.title;
  if (known) return known;
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function amount(l: LearningLoop, days: number): string {
  const period = days === 7 ? "this week" : `in ${days} days`;
  if (l.expected == null) return `${l.count.toLocaleString()} ${period}`;
  return `${l.count.toLocaleString()} of ${l.expected.toLocaleString()} ${period}`;
}

function LoopCard({ l, days }: { l: LearningLoop; days: number }) {
  const known = LOOPS[l.key];
  const state = stateOf(l.state);
  const quiet = l.state === "quiet";
  return (
    <li className={quiet ? "min-w-0 rounded-lg border border-red-500/30 bg-red-500/5 p-4" : cardClass} data-testid={`loop-${l.key}`} data-state={l.state}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 flex-1 basis-48 text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">{titleOf(l.key)}</h3>
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
      </div>
      {known && (
        <p className="mt-1 text-sm text-zinc-300">
          <span className="text-zinc-400">Learns from: </span>
          {known.from}
        </p>
      )}
      <p className="mt-1 text-sm text-zinc-300">
        <span className="text-zinc-400">Last learned: </span>
        {l.last_signal_at ? <Time iso={l.last_signal_at} /> : "never"}
        <span className="text-zinc-400"> · </span>
        {amount(l, days)}
      </p>
      {l.detail && <p className="mt-1 text-xs text-zinc-400 [overflow-wrap:anywhere]">{l.detail}</p>}
      {quiet && (
        <p className="mt-2 rounded-md border border-red-500/30 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200" data-testid={`loop-${l.key}-check`}>
          <span className="font-medium text-red-300">What to check: </span>
          {known?.check ?? "This loop should have learned from this week's work and did not. Look in the gateway's and the worker's logs for it."}
        </p>
      )}
    </li>
  );
}

export function LearningHealthSection() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [gone, setGone] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setHealth(await api.getLearningHealth());
    } catch (e) {
      // A gateway from before the health check has no such route: show nothing.
      if (errorStatus(e) === 404) setGone(true);
      else setError(e instanceof Error ? e.message : "The request failed.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (gone) return null;
  const days = health?.window_days ?? 7;
  const quiet = health?.loops.filter((l) => l.state === "quiet") ?? [];
  const red = health?.state === "red" || quiet.length > 0;

  return (
    <Section
      title="Is it still learning?"
      id="health"
      description={`Each way Coderhelm learns, what it learns from, and when it last did, over the last ${days} days whatever the period below.`}
    >
      {error ? (
        <Callout
          variant="warning"
          title="Couldn't check the learning loops"
          live={false}
          actions={
            <button type="button" className={smallSecondaryButton} onClick={() => void load()}>
              Try again
            </button>
          }
        >
          <p className="[overflow-wrap:anywhere]">{error}</p>
        </Callout>
      ) : !health ? (
        <ListSkeleton rows={3} label="Checking the learning loops" />
      ) : (
        <div className="space-y-3" data-testid="learning-health" data-state={red ? "red" : "ok"}>
          {red ? (
            <Callout variant="error" title={quiet.length === 1 ? "1 loop stopped learning" : `${quiet.length} loops stopped learning`} live={false}>
              <p>Each one should have learned from this week&apos;s work and did not. What to check is under each.</p>
            </Callout>
          ) : (
            <p className="text-sm text-zinc-400">Every loop that had something to learn from learned from it.</p>
          )}
          <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
            {[...health.loops]
              // The quiet ones first; the rest keep the gateway's order.
              .sort((a, b) => Number(b.state === "quiet") - Number(a.state === "quiet"))
              .map((l) => (
                <LoopCard key={l.key} l={l} days={days} />
              ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
