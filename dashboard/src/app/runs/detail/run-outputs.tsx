"use client";

// The files a run kept as its outputs: a team skill's reports, tables and
// snapshots, kept with the run instead of a folder on someone's computer.
// Each one downloads; the one a link named (`?output=`) is marked. An HTML
// report can be read in place: it is shown in a sandboxed frame with no
// scripts and its own origin, so the team's page never runs as the
// dashboard's.

import { useEffect, useState } from "react";
import { api, runOutputUrl, type RunOutput } from "@/lib/api";
import { SectionHeading } from "@/components/page";
import { focusRing, smallSecondaryButton } from "@/components/ui";

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isHtml = (name: string) => /\.html?$/i.test(name);

/** One HTML output, read in a sandboxed frame. */
function HtmlView({ runId, name }: { runId: string; name: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(runOutputUrl(runId, name), { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(setHtml)
      .catch(() => setFailed(true));
  }, [runId, name]);
  if (failed) return <p className="px-4 py-2 text-sm text-red-400">The report couldn&apos;t be read. Download it instead.</p>;
  if (html === null) return <p className="px-4 py-2 text-sm text-zinc-400">Loading the report</p>;
  return (
    <iframe
      title={`Report ${name}`}
      sandbox=""
      srcDoc={html}
      className="h-[70vh] w-full rounded-b-lg border-t border-zinc-800 bg-white"
      data-testid="run-output-view"
    />
  );
}

export function RunOutputs({ runId, status, focus }: { runId: string; status: string; focus?: string | null }) {
  const [outputs, setOutputs] = useState<RunOutput[]>([]);
  const [open, setOpen] = useState<string | null>(focus && isHtml(focus) ? focus : null);
  useEffect(() => {
    if (!runId) return;
    api
      .getRunOutputs(runId)
      .then((r) => setOutputs(r.outputs ?? []))
      .catch(() => setOutputs([]));
  }, [runId, status]);
  useEffect(() => {
    if (focus && isHtml(focus)) setOpen(focus);
  }, [focus]);
  if (outputs.length === 0) return null;
  return (
    <section id="outputs" aria-labelledby="outputs-heading" className="space-y-3" data-testid="run-outputs">
      <SectionHeading id="outputs-heading" count={outputs.length}>
        Outputs
      </SectionHeading>
      <p className="text-sm text-zinc-400">Files this run made, kept here instead of a folder on someone&apos;s computer. They aren&apos;t in the pull request.</p>
      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/30">
        {outputs.map((o) => (
          <li key={o.name} data-testid="run-output" className={focus === o.name ? "bg-zinc-800/60" : ""} aria-current={focus === o.name ? "true" : undefined}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <a href={runOutputUrl(runId, o.name)} className={`min-w-0 text-zinc-200 underline underline-offset-4 [overflow-wrap:anywhere] hover:text-zinc-50 ${focusRing}`}>
                {o.name}
              </a>
              <span className="flex shrink-0 items-center gap-3">
                {isHtml(o.name) && (
                  <button type="button" className={smallSecondaryButton} aria-expanded={open === o.name} onClick={() => setOpen(open === o.name ? null : o.name)}>
                    {open === o.name ? "Hide" : "View"}
                  </button>
                )}
                <span className="tabular-nums text-xs text-zinc-400">{size(o.bytes)}</span>
              </span>
            </div>
            {open === o.name && <HtmlView runId={runId} name={o.name} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
