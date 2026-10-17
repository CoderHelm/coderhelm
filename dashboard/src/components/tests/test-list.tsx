"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { TestCase } from "@/lib/api";
import { CAUSE_LABEL, FIX_LABEL, pct, plural, testHref, testName } from "@/lib/tests";
import { timeAgo } from "@/lib/data-sources";
import { StatePill } from "./common";
import { focusRing } from "@/components/ui";

/**
 * Tests as rows that fold into stacked cards on a phone. `facts` picks the
 * numbers each view cares about, so one row serves every list.
 */
export function TestList({
  tests,
  facts,
  actions,
  label,
}: {
  tests: TestCase[];
  facts: (t: TestCase) => { label: string; value: ReactNode }[];
  actions?: (t: TestCase) => ReactNode;
  label: string;
}) {
  return (
    <ul aria-label={label} className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
      {tests.map((t) => (
        <li key={t.id} className="px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-72">
              <Link href={testHref(t.id)} className={`break-words text-sm font-medium text-zinc-100 hover:underline underline-offset-4 rounded ${focusRing}`}>
                {testName(t)}
              </Link>
              <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">{t.file}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                <StatePill state={t.state} />
                {t.cause && t.cause.label !== "unknown" && <span>{CAUSE_LABEL[t.cause.label]}</span>}
                {t.fix_status && <span className="text-zinc-300">{FIX_LABEL[t.fix_status]}</span>}
                {t.owner && <span>Owner {t.owner}</span>}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs sm:flex sm:flex-wrap sm:justify-end">
              {facts(t).map((f) => (
                <div key={f.label} className="min-w-0 sm:text-right">
                  <dt className="text-zinc-500">{f.label}</dt>
                  <dd className="tabular-nums text-zinc-200">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions(t)}</div>}
        </li>
      ))}
    </ul>
  );
}

export const impactFacts = (t: TestCase) => [
  { label: "PRs blocked (7 days)", value: t.prs_blocked_7d },
  { label: "CI time lost", value: `${Math.round(t.minutes_lost_7d)} min` },
  { label: "Flaky", value: pct(t.flake_rate_30d) },
  { label: "Fails", value: pct(t.fail_rate_30d) },
];

export const slowFacts = (t: TestCase) => [
  { label: "Typical (p50)", value: seconds(t.p50_ms) },
  { label: "Slow runs (p95)", value: seconds(t.p95_ms) },
  { label: "Runs (30 days)", value: t.runs_30d },
];

export const quarantineFacts = (t: TestCase) => [
  { label: "Quarantined", value: t.quarantined_since ? timeAgo(t.quarantined_since) : "—" },
  { label: "Flaky", value: pct(t.flake_rate_30d) },
  { label: "Flips (14 days)", value: plural(t.flips_14d, "flip") },
];

function seconds(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
