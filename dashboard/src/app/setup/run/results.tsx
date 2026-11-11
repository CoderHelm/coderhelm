"use client";

// What a run did. `AuditUndo` closes every finished run: where it's recorded
// and "Undo this run", confirmed in the page. `AutoResults` is the end of a
// "Do it for me" run, and is its review: per repo what was turned on, what
// of yours was kept and what waits as a preview, each change with its
// evidence and its own Undo, each preview with Switch on.

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Callout } from "@/components/callout";
import { Chip, StatusDot, formatDate } from "@/components/list";
import { CheckIcon, ChevronRightIcon, ExternalLinkIcon, WarningIcon } from "@/components/icons";
import { buttonClass, focusRing, linkButton } from "@/components/ui";
import { usePluginsFlag } from "@/hooks/use-plugins-flag";
import { FEATURE_HREF, autoOutcome, outcomeWords, plural, shortRepo, valueWords, type PlanItem, type RepoResult, type RunRepo, type SetupRun } from "@/lib/setup";
import { EvidenceList, SourceTag } from "../parts";

export function AuditUndo({ run, changed, onUndo, busy }: { run: SetupRun; changed: number; onUndo: () => void; busy: boolean }) {
  const pluginsOn = usePluginsFlag() === "on";
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (confirm) ref.current?.focus();
  }, [confirm]);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="audit-undo">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 basis-64 text-sm text-zinc-300">
          <span aria-hidden="true" className="mr-1.5 inline-block scale-75 align-[-3px] text-emerald-400">
            <CheckIcon />
          </span>
          <span className="text-zinc-100">Saved to the audit log</span> as &ldquo;Setup run {formatDate(run.created_at)}
          {run.by ? ` by ${run.by}` : ""}&rdquo;.{" "}
          {pluginsOn && (
            <Link href="/audit" className={`${linkButton} !text-sm`}>
              Open the audit log
            </Link>
          )}
        </p>
        {!confirm && (
          <button type="button" onClick={() => setConfirm(true)} className={buttonClass("secondary", "sm")} data-testid="undo">
            Undo this run
          </button>
        )}
      </div>
      {confirm && (
        <div className="border-t border-zinc-800 px-4 py-3" data-testid="undo-confirm">
          <h3 ref={ref} tabIndex={-1} className="text-sm font-semibold text-zinc-50 focus:outline-none">
            Undo this run?
          </h3>
          <p className="mt-0.5 max-w-prose text-sm text-zinc-400">
            Every setting it changed goes back to its value from before{changed ? ` (${plural(changed, "setting")})` : ""}. A setting someone has changed since stays as it
            is, and is listed here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirm(false)} className={buttonClass("secondary", "sm")}>
              Keep the changes
            </button>
            <button type="button" onClick={onUndo} disabled={busy} className={buttonClass("danger", "sm")} data-testid="undo-confirm-button">
              {busy ? "Undoing…" : "Undo the run"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function UndoneNote({ run }: { run: SetupRun }) {
  return (
    <Callout variant="success" title="Every setting this run changed is back the way it was" testId="undone">
      {run.undo_skipped && run.undo_skipped.length > 0 ? (
        <>
          <p>
            {plural(run.undo_skipped.length, "setting was", "settings were")} changed again after the run, so undo left {run.undo_skipped.length === 1 ? "it" : "them"} alone:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="undo-skipped">
            {run.undo_skipped.map((s) => (
              <li key={`${s.repo}:${s.setting_id}`}>
                {s.title ?? s.setting_id} on {shortRepo(s.repo)}
                {s.reason ? `: ${s.reason}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Nothing was left out.</p>
      )}
    </Callout>
  );
}

export function AutoResults({
  run,
  onUndo,
  onUndoItem,
  onRetry,
  busy,
  pending,
  problem,
}: {
  run: SetupRun;
  onUndo: () => void;
  onUndoItem: (repo: string, settingId: string) => void;
  onRetry: (repos: string[]) => void;
  busy: boolean;
  /** The one setting being undone or switched on: "repo\u0000id". */
  pending: string | null;
  problem: string | null;
}) {
  const undone = run.state === "undone";
  const results = run.results ?? [];
  const byRepo = new Map(results.map((r) => [r.repo, r]));
  const failed = results.filter((r) => r.state === "failed");
  const outcomes = run.repos.map((r) => ({ repo: r, outcome: autoOutcome(r, run.choice), result: byRepo.get(r.repo) }));
  const changed = outcomes.reduce((n, o) => n + o.outcome.changed.length, 0);
  const previews = outcomes.reduce((n, o) => n + o.outcome.previews.length, 0);
  const kept = outcomes.reduce((n, o) => n + o.outcome.kept.length, 0);
  const done = outcomes.filter((o) => o.result?.state !== "failed").length;

  return (
    <div className="min-w-0 space-y-5" data-testid="auto-results">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 aria-live="polite" className="text-base font-semibold text-zinc-50" data-testid="auto-headline">
            {undone ? "This run was undone" : failed.length ? `Set up ${done} of ${plural(run.repos.length, "repo")}` : `Set up ${plural(run.repos.length, "repo")}`}
          </h2>
          {!undone && (
            <p className="mt-0.5 text-sm text-zinc-400" data-testid="auto-totals">
              {plural(changed, "setting")} turned on · {kept} of yours kept · {plural(previews, "preview")} to switch on when you&apos;re ready
            </p>
          )}
        </div>
        {failed.length > 0 && !undone && (
          <button type="button" onClick={() => onRetry(failed.map((f) => f.repo))} disabled={busy} className={buttonClass("primary", "sm")} data-testid="retry-failed">
            Retry {failed.length === 1 ? "the failed repo" : `the ${failed.length} failed`}
          </button>
        )}
      </div>

      {undone && <UndoneNote run={run} />}

      <ul className="space-y-3">
        {outcomes.map(({ repo, outcome, result }) => (
          <RepoCard key={repo.repo} repo={repo} outcome={outcome} result={result} undone={undone} onUndoItem={onUndoItem} pending={pending} />
        ))}
      </ul>

      {problem && (
        <Callout variant="error" title="That didn't work" testId="apply-step-problem">
          <p>{problem}</p>
        </Callout>
      )}

      {!undone && <AuditUndo run={run} changed={changed} onUndo={onUndo} busy={busy} />}

      <div className="flex flex-wrap gap-2 pt-1">
        <Link href="/setup" className={buttonClass("secondary")}>
          Back to Setup
        </Link>
      </div>
    </div>
  );
}

function RepoCard({
  repo: runRepo,
  outcome,
  result,
  undone,
  onUndoItem,
  pending,
}: {
  repo: RunRepo;
  outcome: ReturnType<typeof autoOutcome>;
  result?: RepoResult;
  undone: boolean;
  onUndoItem: (repo: string, settingId: string) => void;
  pending: string | null;
}) {
  const repo = runRepo.repo;
  const failed = result?.state === "failed" || (!result && !!runRepo.error);
  const someFailed = result?.failed ?? [];
  const evidenceOf = (it: PlanItem) => runRepo.changes.find((c) => c.setting_id === it.setting_id && c.evidence.length)?.evidence ?? it.evidence;
  return (
    <li className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid="auto-repo" data-repo={repo}>
      <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
        <span className="mt-1.5">
          <StatusDot tone={failed ? "danger" : undone ? "muted" : "success"} />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate text-sm font-semibold text-zinc-100" title={repo}>
            {repo}
          </p>
          <p className={`mt-0.5 text-sm ${failed ? "text-red-300" : "text-zinc-300"}`} data-testid="auto-summary">
            {failed
              ? result?.error ?? runRepo.error ?? "It couldn't be set up."
              : undone
                ? "Put back the way it was."
                : outcome.undone.length || !runRepo.summaryText
                  ? outcomeWords(outcome)
                  : runRepo.summaryText}
          </p>
          {runRepo.warning && <p className="mt-1 text-sm text-amber-300" data-testid="repo-warning">{runRepo.warning}</p>}
          {!failed && someFailed.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm text-red-300" data-testid="setting-failures">
              {someFailed.map((f) => (
                <li key={f.setting_id} className="[overflow-wrap:anywhere]">
                  {runRepo.items.find((i) => i.setting_id === f.setting_id)?.title ?? f.setting_id} wasn&apos;t changed: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
        {result && result.prs.length > 0 && !undone && (
          <ul className="flex flex-wrap gap-x-3">
            {result.prs.map((p) => (
              <li key={p.url}>
                <a href={p.url} target="_blank" rel="noreferrer" className={`${linkButton} gap-1 !text-sm`} data-testid="draft-pr">
                  Draft PR #{p.number}
                  <span aria-hidden="true" className="inline-flex">
                    <ExternalLinkIcon />
                  </span>
                  <span className="sr-only"> (opens GitHub)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!failed && !undone && (
        <div className="divide-y divide-zinc-800 border-t border-zinc-800">
          {outcome.previews.length > 0 && (
            <Group title="Previews to switch on" count={outcome.previews.length} tone="waiting" open testId="group-previews">
              {outcome.previews.map((it) => (
                <PreviewRow key={it.setting_id} repo={repo} item={it} />
              ))}
            </Group>
          )}
          {outcome.changed.length > 0 && (
            <Group title="Turned on" count={outcome.changed.length} tone="success" testId="group-changed">
              {outcome.changed.map((it) => (
                <ChangeRow key={it.setting_id} repo={repo} item={{ ...it, evidence: evidenceOf(it) }} onUndoItem={onUndoItem} pending={pending === `${repo}\u0000${it.setting_id}`} />
              ))}
            </Group>
          )}
          {outcome.kept.length > 0 && (
            <Group title="Kept yours" count={outcome.kept.length} tone="neutral" testId="group-kept">
              {outcome.kept.map((it) => (
                <KeptRow key={it.setting_id} item={it} />
              ))}
            </Group>
          )}
          {outcome.undone.length > 0 && (
            <Group title="Undone" count={outcome.undone.length} tone="muted" testId="group-undone">
              {outcome.undone.map((it) => (
                <li key={it.setting_id} className="px-4 py-2.5 text-sm text-zinc-400" data-testid="undone-item" data-id={it.setting_id}>
                  <span className="text-zinc-200">{it.title}</span> is back to <span className="text-zinc-200">{valueWords(it.current.value, it.current.set)}</span>
                </li>
              ))}
            </Group>
          )}
        </div>
      )}
    </li>
  );
}

function Group({ title, count, tone, open: startOpen = false, testId, children }: { title: string; count: number; tone: "success" | "waiting" | "neutral" | "muted"; open?: boolean; testId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  return (
    <div data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-11 w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-zinc-900 ${focusRing} focus-visible:outline-offset-[-2px]`}
      >
        <span aria-hidden="true" className={`shrink-0 text-zinc-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
          <ChevronRightIcon />
        </span>
        <span className="flex-1 font-medium text-zinc-200">{title}</span>
        <Chip tone={tone}>{String(count)}</Chip>
      </button>
      <ul id={id} hidden={!open} className="divide-y divide-zinc-800/70 border-t border-zinc-800/70 bg-zinc-950/30">
        {children}
      </ul>
    </div>
  );
}

function ChangeRow({ repo, item, onUndoItem, pending }: { repo: string; item: PlanItem; onUndoItem: (repo: string, id: string) => void; pending: boolean }) {
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3" data-testid="changed-item" data-id={item.setting_id}>
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-100">{item.title}</span>
          <SourceTag source={item.source} />
        </div>
        <p className="mt-0.5 text-sm text-zinc-400 [overflow-wrap:anywhere]">
          Was <span className="text-zinc-300">{brief(item.current.value, item.current.set)}</span>, now <span className="text-zinc-100">{brief(item.recommended, true)}</span>
        </p>
        <EvidenceList evidence={item.evidence} className="mt-1" />
      </div>
      <button type="button" onClick={() => onUndoItem(repo, item.setting_id)} disabled={pending} className={buttonClass("ghost", "sm")} aria-label={`Undo ${item.title} on ${shortRepo(repo)}`} data-testid="undo-item">
        {pending ? "Undoing…" : "Undo"}
      </button>
    </li>
  );
}

/** Where a preview is switched on: its setting's page, on this repo. */
function switchOnHref(repo: string, item: PlanItem): string {
  const base = FEATURE_HREF[item.feature] ?? "/setup";
  if (!base.startsWith("/reviewer/config")) return base;
  return `${base}${base.includes("?") ? "&" : "?"}repo=${encodeURIComponent(repo)}`;
}

function PreviewRow({ repo, item }: { repo: string; item: PlanItem }) {
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3" data-testid="preview-item" data-id={item.setting_id}>
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-100">{item.title}</span>
          <Chip tone="waiting">Preview</Chip>
        </div>
        <p className="mt-0.5 text-sm text-zinc-400">It reports what it would do and changes nothing until you switch it on, by turning off its dry run on its settings page.</p>
        {item.evidence.length > 0 && (
          <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-200">
              <span aria-hidden="true" className="scale-75">
                <WarningIcon />
              </span>
              {item.risk === "acts" ? "What it would have done" : "Why it's recommended"}
            </p>
            <EvidenceList evidence={item.evidence} className="mt-0.5 !text-zinc-200" />
          </div>
        )}
      </div>
      <Link href={switchOnHref(repo, item)} className={buttonClass("primary", "sm")} aria-label={`Switch on ${item.title} on ${shortRepo(repo)}`} data-testid="switch-on">
        Switch on
      </Link>
    </li>
  );
}

function KeptRow({ item }: { item: PlanItem }) {
  return (
    <li className="min-w-0 px-4 py-3" data-testid="kept-item" data-id={item.setting_id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-100">{item.title}</span>
        {item.custom && <Chip tone="info">Custom</Chip>}
      </div>
      <p className="mt-0.5 text-sm text-zinc-400 [overflow-wrap:anywhere]">
        Yours: <span className="text-zinc-200">{brief(item.current.value, item.current.set)}</span>. Recommended: {brief(item.recommended, true)}.
      </p>
    </li>
  );
}

function brief(v: unknown, set: boolean): string {
  const w = valueWords(v, set);
  if (typeof v === "string" && (v.includes("\n") || v.length > 80)) return `${v.split("\n").filter(Boolean).length} lines of text`;
  return w.length > 80 ? `${w.slice(0, 77)}…` : w;
}
