"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type DecisionRate, type DecisionsAnalytics } from "@/lib/api";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { Section } from "@/components/page";
import { Table } from "@/components/charts";

const OUTCOME: Record<string, string> = {
  answered_default: "Answered with the default",
  answered_other: "Answered otherwise",
  dismissed_review: "Review dismissed",
  merged_flagged_unchanged: "Merged with the flagged lines unchanged",
  fixed: "Fixed",
  cancelled_run: "Run cancelled",
  retried: "Retried as it was",
  overrode: "Went ahead over it",
};

const pct = (r: DecisionRate) => (r.with_outcome ? `${Math.round(r.rate * 100)}%` : "—");

function basis(r: DecisionRate, what: string) {
  if (!r.total) return `No ${what} in this period`;
  if (!r.with_outcome) return `${r.total} ${what}, none acted on yet`;
  return `${r.wrong} of ${r.with_outcome} with an outcome (${r.total} ${what} in all)`;
}

function where(e: DecisionRate["examples"][number]) {
  if (e.run_id) return <Link href={`/runs/detail?id=${e.run_id}`} className="text-zinc-100 underline-offset-2 hover:underline">Open run</Link>;
  if (e.repo && e.pr_number) return `${e.repo} #${e.pr_number}`;
  return "—";
}

/** The stop judge's wrong calls: questions answered with the default, stops retried as they were, reviews dismissed or merged unchanged. */
export function DecisionsSection({ days }: { days: number }) {
  const window = (days === 7 || days === 90 ? days : 30) as 7 | 30 | 90;
  const [data, setData] = useState<DecisionsAnalytics | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .getDecisions(window)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [window]);

  const download = async () => {
    setExporting(true);
    try {
      const out = await api.exportDecisions(window);
      const blob = new Blob([JSON.stringify(out.cases, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `replay-cases-${window}d.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (failed || !data) return null;
  const s = data.summary;
  const stops = s.unnecessary_stops;
  const blocks = s.nuisance_blocks;
  const examples = [...stops.examples, ...blocks.examples]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);
  return (
    <Section
      title="Stops and blocks"
      id="decisions"
      description="Every question, stop, extra fix round and request for changes goes through one judge. These are the ones people's next step showed weren't needed."
    >
      <StatGrid>
        <StatTile testId="tile-unnecessary-stops" label="Unnecessary stops" value={pct(stops)} note={basis(stops, "stops")} />
        <StatTile testId="tile-nuisance-blocks" label="Nuisance blocks" value={pct(blocks)} note={basis(blocks, "blocks")} />
        <StatTile testId="tile-proceeded" label="Went ahead instead" value={String(s.proceeded)} note={`Of ${s.decisions} decisions the judge made`} />
      </StatGrid>
      <div className="mt-4">
        <Table
          label="Recent unnecessary stops and nuisance blocks"
          head={["What", "Step", "Then", "Where"]}
          rows={examples.map((e) => [e.detail, e.step.replace(/_/g, " "), OUTCOME[e.outcome] ?? e.outcome, where(e)])}
          empty="None confirmed in this period."
        />
      </div>
      {stops.wrong + blocks.wrong > 0 && (
        <p className="mt-3 text-sm text-zinc-400">
          <button type="button" onClick={download} disabled={exporting} className="text-zinc-100 underline underline-offset-2 hover:text-white disabled:opacity-60" data-testid="export-decisions">
            {exporting ? "Exporting…" : "Export them as replay cases"}
          </button>{" "}
          to add to the replay suite (remove names before committing them).
        </p>
      )}
    </Section>
  );
}
