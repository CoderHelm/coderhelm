"use client";

// The files a run kept as its outputs: a team skill's reports, tables and
// snapshots, kept with the run instead of a folder on someone's computer.
// Each one downloads; the one a link named (`?output=`) is marked.

import { useEffect, useState } from "react";
import { api, runOutputUrl, type RunOutput } from "@/lib/api";
import { SectionHeading } from "@/components/page";
import { focusRing } from "@/components/ui";

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RunOutputs({ runId, status, focus }: { runId: string; status: string; focus?: string | null }) {
  const [outputs, setOutputs] = useState<RunOutput[]>([]);
  useEffect(() => {
    if (!runId) return;
    api
      .getRunOutputs(runId)
      .then((r) => setOutputs(r.outputs ?? []))
      .catch(() => setOutputs([]));
  }, [runId, status]);
  if (outputs.length === 0) return null;
  return (
    <section id="outputs" aria-labelledby="outputs-heading" className="space-y-3" data-testid="run-outputs">
      <SectionHeading id="outputs-heading" count={outputs.length}>
        Outputs
      </SectionHeading>
      <p className="text-sm text-zinc-400">Files this run made, kept here instead of a folder on someone&apos;s computer. They aren&apos;t in the pull request.</p>
      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/30">
        {outputs.map((o) => (
          <li
            key={o.name}
            className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-sm ${focus === o.name ? "bg-zinc-800/60" : ""}`}
            aria-current={focus === o.name ? "true" : undefined}
            data-testid="run-output"
          >
            <a href={runOutputUrl(runId, o.name)} className={`min-w-0 text-zinc-200 underline underline-offset-4 [overflow-wrap:anywhere] hover:text-zinc-50 ${focusRing}`}>
              {o.name}
            </a>
            <span className="shrink-0 tabular-nums text-xs text-zinc-400">{size(o.bytes)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
