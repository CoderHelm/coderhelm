"use client";

import { CodeBlock, jsonOrText } from "./code-block";
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
      <CodeBlock {...jsonOrText(run.result ?? "")} label={label} wrap maxHeightClass="max-h-80" className="!rounded-none !border-0" />
      {run.sent && (
        <details className="border-t border-zinc-800 px-4 py-2.5">
          <summary className="cursor-pointer text-xs text-zinc-400">What was sent (values travel separately)</summary>
          <CodeBlock {...jsonOrText(run.sent)} label="What was sent" wrap className="mt-2" />
        </details>
      )}
    </div>
  );
}

/** A line diff between two versions' text. */
export function VersionDiff({ before, after, label }: { before: string; after: string; label: string }) {
  const lines = diffLines(before, after);
  return (
    <CodeBlock
      code={lines.map((l) => `${l.kind === "added" ? "+" : l.kind === "removed" ? "-" : " "}${l.text}`).join("\n")}
      diff
      wrap
      label={label}
    />
  );
}
