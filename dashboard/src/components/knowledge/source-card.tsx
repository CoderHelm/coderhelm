"use client";

import { StatusDot } from "@/components/list/status";
import { MoreMenu } from "@/components/list";
import { buttonClass } from "@/components/ui";
import { KIND_LABEL, fixLabel, itemWord, sourceHealth, type Source } from "@/lib/knowledge";
import { ProgressBar } from "./add-flow";
import { SourceLogo } from "./logos";

// One connected app of a knowledge base: what it is, how many pages it
// brought in, whether it is up to date (in plain words), and the one thing
// to do when it isn't.

export function SourceCard({
  source,
  canManage,
  onSync,
  onFix,
  onEdit,
  onPause,
  onRemove,
}: {
  source: Source;
  canManage: boolean;
  onSync: () => void;
  onFix: () => void;
  onEdit: () => void;
  onPause: (paused: boolean) => void;
  onRemove: () => void;
}) {
  const health = sourceHealth(source);
  const fix = source.status === "error" ? fixLabel(source) : null;
  const p = source.progress;
  const syncing = source.status === "syncing";
  const label = KIND_LABEL[source.kind];
  return (
    <li
      className={`flex min-w-0 flex-col rounded-2xl border bg-zinc-900/50 p-5 ${source.status === "error" ? "border-orange-500/30" : "border-zinc-800"}`}
      data-testid="source-card"
      data-status={source.status}
      data-kind={source.kind}
    >
      <div className="flex min-w-0 items-start gap-3">
        <SourceLogo kind={source.kind} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-100" title={source.name}>
            {source.name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {label} · {itemWord(source.kind, source.items)}
          </p>
        </div>
        {canManage && (
          <MoreMenu
            compact
            label={`${source.name} actions`}
            buttonLabel={`More for ${source.name}`}
            items={[
              { label: "Choose pages", onSelect: onEdit },
              source.paused
                ? { label: "Resume updates", onSelect: () => onPause(false) }
                : { label: "Pause updates", onSelect: () => onPause(true), note: `Stops bringing in changes from ${label}` },
              { label: "Remove", onSelect: onRemove, danger: true },
            ]}
          />
        )}
      </div>

      <p className="mt-4 flex min-w-0 items-start gap-2 text-sm" data-testid="source-health" aria-live="polite">
        <StatusDot
          tone={health.tone === "attention" ? "attention" : health.tone === "success" ? "success" : health.tone === "muted" ? "muted" : "live"}
          live={health.tone === "live"}
          className="mt-1.5"
        />
        <span className={`min-w-0 [overflow-wrap:break-word] ${health.tone === "attention" ? "text-orange-200" : "text-zinc-300"}`}>{health.words}</span>
      </p>

      {syncing && (
        <div className="mt-3">
          <ProgressBar value={p && p.total ? p.done / p.total : 0} indeterminate={!p || !p.total || p.phase !== "fetching"} />
        </div>
      )}

      {source.failed_items > 0 && source.status !== "error" && (
        <p className="mt-2 text-xs text-zinc-500">{itemWord(source.kind, source.failed_items)} couldn&apos;t be read. They&apos;re tried again on the next check.</p>
      )}
      {source.truncated && <p className="mt-2 text-xs text-zinc-500">Only the first 1,000 are kept. Choose fewer pages to keep everything.</p>}

      {canManage && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {fix ? (
            <button type="button" className={buttonClass("primary", "sm")} onClick={onFix} data-testid="source-fix">
              {fix}
            </button>
          ) : source.paused ? (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onPause(false)} data-testid="source-resume">
              Resume updates
            </button>
          ) : (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={onSync} disabled={syncing} data-testid="source-sync">
              {syncing ? "Checking…" : "Check for changes"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
