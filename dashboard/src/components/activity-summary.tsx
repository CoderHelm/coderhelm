"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { activityApi, type ActivitySummary } from "@/lib/activity";
import { Skeleton } from "./skeleton";
import { focusRing } from "./ui";

type Tone = "plain" | "warning" | "error";

const VALUE_TONE: Record<Tone, string> = {
  plain: "text-zinc-100",
  warning: "text-amber-300",
  error: "text-red-300",
};

function SummaryTile({ href, label, value, note, tone = "plain" }: { href: string; label: string; value: number; note: string; tone?: Tone }) {
  return (
    <Link
      href={href}
      className={`group block rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-600 hover:bg-zinc-900 motion-reduce:transition-none ${focusRing}`}
    >
      <span className="block text-xs text-zinc-500 group-hover:text-zinc-400">{label}</span>
      <span className={`mt-1 block text-2xl font-semibold tabular-nums ${VALUE_TONE[value > 0 ? tone : "plain"]}`}>{value.toLocaleString()}</span>
      <span className="mt-0.5 block text-xs text-zinc-500">
        {note}
        <span aria-hidden="true" className="ml-1 inline-block transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
          →
        </span>
      </span>
    </Link>
  );
}

/**
 * The last week at a glance: reads and asks of the team's skills and agents,
 * lookups in its data sources, and how many went wrong. Each count opens the
 * log filtered to just those.
 */
export function ActivitySummaryStrip({ days = 7 }: { days?: number }) {
  const [summary, setSummary] = useState<ActivitySummary | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    activityApi.summary(days).then(
      (s) => live && setSummary(s),
      () => live && setSummary(null),
    );
    return () => {
      live = false;
    };
  }, [days]);

  // The summary is extra: the logs work without it.
  if (summary === null) return null;
  const skillLog = "/skills/?tab=activity";
  const lookupLog = "/data-sources/activity/";
  return (
    <section aria-labelledby="summary-heading" className="mt-6" data-testid="activity-summary">
      <h2 id="summary-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Last {days} days
      </h2>
      {summary === undefined ? (
        <div role="status" aria-label="Loading the summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-6 w-10" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SummaryTile href={`${skillLog}&action=read&range=7d`} label="Skill reads" value={summary.skills.reads} note="skills, briefs, commands" />
          <SummaryTile href={`${skillLog}&action=ask&range=7d`} label="Agent asks" value={summary.skills.asks} note="questions to team agents" />
          <SummaryTile href={`${skillLog}&action=apply&range=7d`} label="Always applied" value={summary.skills.applies ?? 0} note="team standards given in full" />
          <SummaryTile
            href={`${skillLog}&outcome=problems&range=7d`}
            label="Reads and asks that went wrong"
            value={summary.skills.read_problems + summary.skills.ask_problems}
            note="refused, failed or unanswered"
            tone="warning"
          />
          {summary.lookups && (
            <>
              <SummaryTile href={`${lookupLog}?range=7d`} label="Data lookups" value={summary.lookups.total} note="in connected sources" />
              <SummaryTile href={`${lookupLog}?outcome=failed&range=7d`} label="Failed lookups" value={summary.lookups.failed} note="errors from the source" tone="error" />
              <SummaryTile href={`${lookupLog}?outcome=refused&range=7d`} label="Refused lookups" value={summary.lookups.refused} note="refused before they ran" tone="warning" />
            </>
          )}
        </div>
      )}
    </section>
  );
}
