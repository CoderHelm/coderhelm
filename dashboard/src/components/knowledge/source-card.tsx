"use client";

import { StatusDot } from "@/components/list/status";
import { MoreMenu } from "@/components/list";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { KIND_LABEL, fixLabel, itemWord, sourceHealth, syncCount, syncingLabel, truncatedLine, type KnowledgeLimits, type Source } from "@/lib/knowledge";
import { ProgressBar } from "./add-flow";
import { SourceLogo } from "./logos";

// One connected app of a knowledge base: what it is, how many pages are
// searchable now (counted live while a sync runs), whether it is up to date
// (in plain words, with real numbers), and the one thing to do when it
// isn't. A source read through someone's sign-in says whose. A source that
// covers more than it keeps says so, with a way to raise the limit.

export function SourceCard({
  source,
  canManage,
  onSync,
  onFix,
  onEdit,
  onPause,
  onRemove,
  onNewExport,
  onApprove,
  onRaiseLimit,
  limits,
}: {
  source: Source;
  canManage: boolean;
  /** An archive source: upload a newer export to it. */
  onNewExport?: () => void;
  limits?: KnowledgeLimits | null;
  /** A large first sync waiting for an admin: start it. */
  onApprove?: () => void;
  /** Opens the team's sync limits. */
  onRaiseLimit?: () => void;
  onSync: () => void;
  onFix: () => void;
  onEdit: () => void;
  onPause: (paused: boolean) => void;
  onRemove: () => void;
}) {
  const health = sourceHealth(source);
  const fix = source.status === "error" ? fixLabel(source) : null;
  const syncing = source.status === "syncing";
  const count = syncCount(source);
  const p = source.progress;
  const indeterminate = !count || p?.phase === "waiting" || p?.phase === "removing";
  const label = KIND_LABEL[source.kind];
  return (
    <li
      className={`flex min-w-0 flex-col rounded-2xl border bg-zinc-900/50 p-5 ${source.status === "error" ? "border-orange-500/30" : "border-zinc-800"}`}
      data-items={source.items}
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
          <p className="mt-0.5 truncate text-xs text-zinc-400" data-testid="source-count">
            {label} · {itemWord(source.kind, source.items)}
          </p>
          {source.connection === "sign_in" && source.signin && (
            <p className="mt-1 text-xs text-zinc-400 wrap-anywhere" data-testid="source-signin" title={source.signin.account ? `${label} account: ${source.signin.account}` : undefined}>
              Synced with {source.signin.name}&apos;s {label} sign-in
            </p>
          )}
        </div>
        {canManage && (
          <MoreMenu
            compact
            label={`${source.name} actions`}
            buttonLabel={`More for ${source.name}`}
            items={[
              ...(source.kind === "archive"
                ? [{ label: "Upload a newer export", onSelect: () => onNewExport?.() }]
                : source.kind === "s3"
                  ? []
                  : [{ label: "Choose pages", onSelect: onEdit }]),
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
          <ProgressBar value={count ? count.done / count.total : 0} indeterminate={indeterminate} />
        </div>
      )}

      {source.failed_items > 0 && source.status !== "error" && (
        <p className="mt-2 text-xs text-zinc-400">{itemWord(source.kind, source.failed_items)} couldn&apos;t be read. They&apos;re tried again on the next check.</p>
      )}
      {source.truncated && (
        <div className="mt-2 text-xs text-zinc-300" data-testid="source-truncated" data-reason={source.limit_reason || "source"}>
          <p>{truncatedLine(source, limits)}</p>
          {canManage && onRaiseLimit && (
            <button type="button" className="mt-1 text-xs text-zinc-200 underline underline-offset-4 hover:text-white" onClick={onRaiseLimit} data-testid="source-raise-limit">
              Raise the limit
            </button>
          )}
        </div>
      )}
      {source.kind === "s3" && typeof source.options.bucket === "string" && (
        <p className="mt-2 truncate text-xs text-zinc-400" title={`s3://${source.options.bucket}`}>
          s3://{source.options.bucket}
        </p>
      )}
      {source.kind === "archive" && typeof source.options.file_name === "string" && (
        <p className="mt-2 truncate text-xs text-zinc-400" data-testid="archive-file">
          {source.options.file_name}
        </p>
      )}

      {canManage && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {source.status === "error" && source.error?.action === "budget" ? (
            <Link href="/settings/budget/" className={buttonClass("primary", "sm")} data-testid="source-budget">
              Open the token limit
            </Link>
          ) : source.status === "approval" ? (
            <button type="button" className={buttonClass("primary", "sm")} onClick={onApprove} data-testid="source-approve">
              Start sync
            </button>
          ) : fix ? (
            <button type="button" className={buttonClass("primary", "sm")} onClick={onFix} data-testid="source-fix">
              {fix}
            </button>
          ) : source.paused ? (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onPause(false)} data-testid="source-resume">
              Resume updates
            </button>
          ) : (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={onSync} disabled={syncing} data-testid="source-sync">
              {syncing ? syncingLabel(source) : "Check for changes"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
