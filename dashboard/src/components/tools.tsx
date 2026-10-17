"use client";

import { StatusPill } from "./status-pill";
import { Callout } from "./callout";
import { focusRing } from "./ui";
import { diffLines, type Tool, type ToolRunResult } from "@/lib/tools";

/** On/off switch, matching the data-source switch. */
export function ToolSwitch({ on, label, busy, onToggle }: { on: boolean; label: string; busy?: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={busy}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-zinc-700"} ${focusRing}`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${on ? "translate-x-5" : ""}`}
        />
      </button>
      <span className="w-14 text-sm text-zinc-300">{busy ? "Saving…" : on ? "On" : "Off"}</span>
    </div>
  );
}

/** Where a tool stands, in one pill. */
export function ToolStatus({ tool }: { tool: Tool }) {
  if (!tool.approved) return <StatusPill tone="warning">Waiting for approval</StatusPill>;
  if (tool.awaiting_approval) return <StatusPill tone="warning">New version waiting</StatusPill>;
  if (!tool.enabled) return <StatusPill>Approved, off</StatusPill>;
  return <StatusPill tone="success">Approved, on</StatusPill>;
}

/** What a run sent and got back. */
export function RunResult({ run, label = "Result" }: { run: ToolRunResult; label?: string }) {
  if (!run.ok) {
    return (
      <Callout variant={run.refused ? "warning" : "error"} title={run.refused ? "Refused, nothing was sent" : "The run didn't work"}>
        <p>{run.message}</p>
        {run.fix && <p className="mt-1 text-zinc-400">{run.fix}</p>}
      </Callout>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="text-xs text-zinc-500">
          {[run.note, typeof run.ms === "number" ? `${run.ms} ms` : "", run.hidden_count ? `${run.hidden_count} values hidden` : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs text-zinc-200">{run.result}</pre>
      {run.sent && (
        <details className="border-t border-zinc-800 px-4 py-2.5">
          <summary className="cursor-pointer text-xs text-zinc-400">What was sent (values travel separately)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-zinc-400">{run.sent}</pre>
        </details>
      )}
    </div>
  );
}

/** A line diff between two versions' text. */
export function VersionDiff({ before, after, label }: { before: string; after: string; label: string }) {
  const lines = diffLines(before, after);
  return (
    <div role="region" aria-label={label} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <pre className="overflow-auto px-0 py-2 font-mono text-xs">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-words px-4 ${
              l.kind === "added" ? "bg-emerald-500/10 text-emerald-300" : l.kind === "removed" ? "bg-red-500/10 text-red-300" : "text-zinc-400"
            }`}
          >
            <span aria-hidden="true" className="select-none pr-2 text-zinc-600">
              {l.kind === "added" ? "+" : l.kind === "removed" ? "−" : " "}
            </span>
            <span className="sr-only">{l.kind === "added" ? "added: " : l.kind === "removed" ? "removed: " : ""}</span>
            {l.text}
          </div>
        ))}
      </pre>
    </div>
  );
}
