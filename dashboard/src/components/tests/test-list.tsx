"use client";

import type { ReactNode } from "react";
import type { TestCase } from "@/lib/api";
import { CAUSE_LABEL, FIX_LABEL, pct, plural, testHref, testName } from "@/lib/tests";
import { timeAgo } from "@/lib/data-sources";
import { List, ListRow, StatusText } from "@/components/list";
import { stateLook } from "./common";

/**
 * Tests as rows of the shared list. `facts` picks the numbers each view cares
 * about, so one row serves every list.
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
    <List label={label}>
      {tests.map((t) => {
        const look = stateLook(t.state);
        return (
          <ListRow
            key={t.id}
            testId="test-row"
            data={{ state: t.state }}
            status={look}
            title={testName(t)}
            titleText={testName(t)}
            href={testHref(t.id)}
            meta={[
              <span key="file" className="wrap-anywhere font-mono">{t.file}</span>,
              t.cause && t.cause.label !== "unknown" ? CAUSE_LABEL[t.cause.label] : null,
              t.fix_status ? <span key="fix" className="text-zinc-300">{FIX_LABEL[t.fix_status]}</span> : null,
              t.owner ? `Owner ${t.owner}` : null,
            ]}
            chips={
              <>
                <StatusText look={look} />
                <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {facts(t).map((f) => (
                    <div key={f.label} className="flex min-w-0 gap-1">
                      <dt className="text-zinc-500">{f.label}</dt>
                      <dd className="tabular-nums text-zinc-200">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            }
            actions={actions ? <span className="flex flex-wrap items-center gap-2">{actions(t)}</span> : undefined}
          />
        );
      })}
    </List>
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

/** The words a test is found by in a list search. */
export function testMatches(t: TestCase, q: string): boolean {
  if (!q) return true;
  const hay = [testName(t), t.file, t.owner ?? ""].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function seconds(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
