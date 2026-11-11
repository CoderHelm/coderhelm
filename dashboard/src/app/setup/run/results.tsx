"use client";

// What a run did. `AuditUndo` closes every finished run: where it's recorded
// and "Undo this run", confirmed in the page. `AutoResults` is the end of a
// "Do it for me" run, and is its review: per repo what was turned on, what
// someone chose that the repo argues against (worth a look), what was kept
// and why, and what waits as a preview; each change with its evidence and
// its own Undo, each kept setting with Use recommended, each preview with
// Switch on. Team-wide settings are shown once, apart from the repos.

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Callout } from "@/components/callout";
import { Chip, StatusDot, formatDate } from "@/components/list";
import { CheckIcon, ChevronRightIcon, WarningIcon } from "@/components/icons";
import { buttonClass, focusRing, linkButton } from "@/components/ui";
import { usePluginsFlag } from "@/hooks/use-plugins-flag";
import { autoOutcome, outcomeWords, plural, setByWords, shortRepo, valueWords, type AutoOutcome, type PlanItem, type RepoResult, type RunRepo, type SetupRun } from "@/lib/setup";
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

type UseRec = (items: { repo: string; setting_id: string }[], key: string) => void;

export function AutoResults({
  run,
  onUndo,
  onUndoItem,
  onSwitchOn,
  onUseRecommended,
  onRetry,
  busy,
  pending,
  problem,
}: {
  run: SetupRun;
  onUndo: () => void;
  onUndoItem: (repo: string, settingId: string) => void;
  onSwitchOn: (repo: string, settingId: string) => void;
  onUseRecommended: UseRec;
  onRetry: (repos: string[]) => void;
  busy: boolean;
  /** The one setting (or group) being changed: "repo\u0000id", or a group key. */
  pending: string | null;
  problem: string | null;
}) {
  const undone = run.state === "undone";
  const results = run.results ?? [];
  const byRepo = new Map(results.map((r) => [r.repo, r]));
  const failed = results.filter((r) => r.state === "failed");
  // Team-wide settings are one value for every repository: shown once, in their own section, never inside one repo's result.
  const teamIds = new Set([...(run.team?.items.map((i) => i.setting_id) ?? []), ...run.repos.flatMap((r) => r.items.filter((i) => i.scope === "team").map((i) => i.setting_id))]);
  const repoOnly = (o: AutoOutcome): AutoOutcome => ({
    worth: o.worth.filter((i) => !teamIds.has(i.setting_id)),
    changed: o.changed.filter((i) => !teamIds.has(i.setting_id)),
    previews: o.previews.filter((i) => !teamIds.has(i.setting_id)),
    kept: o.kept.filter((i) => !teamIds.has(i.setting_id)),
    undone: o.undone.filter((i) => !teamIds.has(i.setting_id)),
  });
  const full = run.repos.map((r) => ({ repo: r, outcome: autoOutcome(r, run.choice), result: byRepo.get(r.repo) }));
  const outcomes = full.map((o) => ({ ...o, outcome: repoOnly(o.outcome) }));
  const team = teamOutcome(run, full);
  const sum = (f: (o: AutoOutcome) => number) => outcomes.reduce((n, o) => n + f(o.outcome), 0);
  const changed = sum((o) => o.changed.length) + team.changed.length;
  const worth = sum((o) => o.worth.length) + team.worth.length;
  const previews = sum((o) => o.previews.length) + team.previews.length;
  const kept = sum((o) => o.kept.length) + team.kept.length;
  const done = outcomes.filter((o) => o.result?.state !== "failed").length;
  const head = [changed ? `Turned on ${changed}` : "Changed nothing"];
  if (worth) head.push(`${worth} worth a look`);
  if (previews) head.push(`${plural(previews, "preview")} to switch on`);

  return (
    <div className="min-w-0 space-y-5" data-testid="auto-results">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 aria-live="polite" className="text-base font-semibold text-zinc-50" data-testid="auto-headline">
            {undone ? "This run was undone" : failed.length ? `Set up ${done} of ${plural(run.repos.length, "repo")}` : `Set up ${plural(run.repos.length, "repo")}`}
          </h2>
          {!undone && (
            <p className="mt-0.5 text-sm text-zinc-300" data-testid="auto-totals">
              {head.join(", ")}.
            </p>
          )}
          {!undone && kept > 0 && (
            <p className="mt-0.5 text-sm text-zinc-400" data-testid="auto-kept-line">
              Kept {plural(kept, "setting")} someone chose; use recommended instead from Kept below.
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

      {!undone && team.any && <TeamCard run={run} team={team} onUndoItem={onUndoItem} onUseRecommended={onUseRecommended} pending={pending} />}

      <ul className="space-y-3">
        {outcomes.map(({ repo, outcome, result }) => (
          <RepoCard key={repo.repo} repo={repo} outcome={outcome} result={result} undone={undone} onUndoItem={onUndoItem} onSwitchOn={onSwitchOn} onUseRecommended={onUseRecommended} pending={pending} />
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

interface TeamOutcome {
  any: boolean;
  worth: { repo: string; item: PlanItem }[];
  changed: { repo: string; item: PlanItem }[];
  previews: { repo: string; item: PlanItem }[];
  kept: { repo: string; item: PlanItem }[];
  same: { repo: string; item: PlanItem }[];
}

/** Each team-wide setting once: from the repo whose record holds its change, else the first repo that lists it. */
function teamOutcome(run: SetupRun, full: { repo: RunRepo; outcome: AutoOutcome }[]): TeamOutcome {
  const out: TeamOutcome = { any: false, worth: [], changed: [], previews: [], kept: [], same: [] };
  const seen = new Set<string>();
  const ids = new Set([...(run.team?.items.map((i) => i.setting_id) ?? []), ...run.repos.flatMap((r) => r.items.filter((i) => i.scope === "team").map((i) => i.setting_id))]);
  for (const key of ["changed", "worth", "previews", "kept"] as const) {
    for (const { repo, outcome } of full) {
      for (const item of outcome[key]) {
        if (!ids.has(item.setting_id) || seen.has(item.setting_id)) continue;
        seen.add(item.setting_id);
        out[key].push({ repo: repo.repo, item: { ...item, scope: "team" } });
      }
    }
  }
  for (const id of ids) {
    if (seen.has(id)) continue;
    const r = run.repos.find((x) => x.items.some((i) => i.setting_id === id));
    const item = r?.items.find((i) => i.setting_id === id);
    if (r && item) out.same.push({ repo: r.repo, item: { ...item, scope: "team" } });
  }
  out.any = out.changed.length + out.worth.length + out.previews.length + out.kept.length > 0;
  return out;
}

function TeamCard({ run, team, onUndoItem, onUseRecommended, pending }: { run: SetupRun; team: TeamOutcome; onUndoItem: (repo: string, id: string) => void; onUseRecommended: UseRec; pending: string | null }) {
  const n = run.team?.repoCount ?? 0;
  const keptItems = [...team.worth, ...team.kept];
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid="team-section" aria-labelledby="team-section-title">
      <div className="px-4 py-3">
        <h3 id="team-section-title" className="text-sm font-semibold text-zinc-100">
          Team-wide settings
        </h3>
        <p className="mt-0.5 text-sm text-zinc-400">
          One value for every repository{n ? ` (all ${plural(n, "repository", "repositories")})` : ""}. A change here changes it for every repository, and has its own Undo.
        </p>
      </div>
      <div className="divide-y divide-zinc-800 border-t border-zinc-800">
        {team.changed.length > 0 && (
          <Group title="Turned on for every repository" count={team.changed.length} tone="success" testId="team-changed">
            {team.changed.map(({ repo, item }) => (
              <ChangeRow key={item.setting_id} repo={repo} item={item} onUndoItem={onUndoItem} pending={pending === `${repo}\u0000${item.setting_id}`} team />
            ))}
          </Group>
        )}
        {keptItems.length > 0 && (
          <Group
            title="Kept, someone chose these"
            count={keptItems.length}
            tone="neutral"
            open={team.worth.length > 0}
            testId="team-kept"
            action={<UseAll items={keptItems} onUseRecommended={onUseRecommended} pending={pending} groupKey="team-kept" />}
          >
            {keptItems.map(({ repo, item }) => (
              <KeptRow key={item.setting_id} repo={repo} item={item} onUseRecommended={onUseRecommended} pending={pending === `${repo}\u0000${item.setting_id}`} team />
            ))}
          </Group>
        )}
      </div>
    </section>
  );
}

function UseAll({ items, onUseRecommended, pending, groupKey }: { items: { repo: string; item: PlanItem }[]; onUseRecommended: UseRec; pending: string | null; groupKey: string }) {
  const usable = items.filter(({ item }) => !item.needs);
  if (usable.length < 2) return null;
  return (
    <button
      type="button"
      onClick={() => onUseRecommended(usable.map(({ repo, item }) => ({ repo, setting_id: item.setting_id })), groupKey)}
      disabled={pending === groupKey}
      className={buttonClass("secondary", "sm")}
      data-testid="use-recommended-all"
    >
      {pending === groupKey ? "Changing…" : `Use recommended for all ${usable.length}`}
    </button>
  );
}

function RepoCard({
  repo: runRepo,
  outcome,
  result,
  undone,
  onUndoItem,
  onSwitchOn,
  onUseRecommended,
  pending,
}: {
  repo: RunRepo;
  outcome: AutoOutcome;
  result?: RepoResult;
  undone: boolean;
  onUndoItem: (repo: string, settingId: string) => void;
  onSwitchOn: (repo: string, settingId: string) => void;
  onUseRecommended: UseRec;
  pending: string | null;
}) {
  const repo = runRepo.repo;
  const failed = result?.state === "failed" || (!result && !!runRepo.error);
  const someFailed = result?.failed ?? [];
  const evidenceOf = (it: PlanItem) => runRepo.changes.find((c) => c.setting_id === it.setting_id && c.evidence.length)?.evidence ?? it.evidence;
  const keptKey = `kept\u0000${repo}`;
  const worthKey = `worth\u0000${repo}`;
  const pairs = (list: PlanItem[]) => list.map((item) => ({ repo, item }));
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
            {failed ? (result?.error ?? runRepo.error ?? "It couldn't be set up.") : undone ? "Put back the way it was." : outcomeWords(outcome)}
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
      </div>
      {!failed && !undone && (
        <div className="divide-y divide-zinc-800 border-t border-zinc-800">
          {outcome.worth.length > 0 && (
            <Group
              title="Worth a look"
              count={outcome.worth.length}
              tone="waiting"
              open
              testId="group-worth"
              action={<UseAll items={pairs(outcome.worth)} onUseRecommended={onUseRecommended} pending={pending} groupKey={worthKey} />}
            >
              {outcome.worth.map((it) => (
                <KeptRow key={it.setting_id} repo={repo} item={it} onUseRecommended={onUseRecommended} pending={pending === `${repo}\u0000${it.setting_id}`} worth />
              ))}
            </Group>
          )}
          {outcome.previews.length > 0 && (
            <Group title="Previews to switch on" count={outcome.previews.length} tone="waiting" open testId="group-previews">
              {outcome.previews.map((it) => (
                <PreviewRow key={it.setting_id} repo={repo} item={{ ...it, evidence: evidenceOf(it) }} onSwitchOn={onSwitchOn} pending={pending === `${repo}\u0000${it.setting_id}`} />
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
            <Group
              title="Kept, someone chose these"
              count={outcome.kept.length}
              tone="neutral"
              testId="group-kept"
              action={<UseAll items={pairs(outcome.kept)} onUseRecommended={onUseRecommended} pending={pending} groupKey={keptKey} />}
            >
              {outcome.kept.map((it) => (
                <KeptRow key={it.setting_id} repo={repo} item={it} onUseRecommended={onUseRecommended} pending={pending === `${repo}\u0000${it.setting_id}`} />
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

function Group({
  title,
  count,
  tone,
  open: startOpen = false,
  testId,
  action,
  children,
}: {
  title: string;
  count: number;
  tone: "success" | "waiting" | "neutral" | "muted";
  open?: boolean;
  testId: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  return (
    <div data-testid={testId}>
      <div className="flex min-w-0 items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-zinc-900 ${focusRing} focus-visible:outline-offset-[-2px]`}
        >
          <span aria-hidden="true" className={`shrink-0 text-zinc-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
            <ChevronRightIcon />
          </span>
          <span className="min-w-0 flex-1 font-medium text-zinc-200">{title}</span>
          <Chip tone={tone}>{String(count)}</Chip>
        </button>
        {action && open && <div className="shrink-0 pr-3">{action}</div>}
      </div>
      <ul id={id} hidden={!open} className="divide-y divide-zinc-800/70 border-t border-zinc-800/70 bg-zinc-950/30">
        {children}
      </ul>
    </div>
  );
}

function ChangeRow({ repo, item, onUndoItem, pending, team = false }: { repo: string; item: PlanItem; onUndoItem: (repo: string, id: string) => void; pending: boolean; team?: boolean }) {
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3" data-testid="changed-item" data-id={item.setting_id}>
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-100">{item.title}</span>
          <SourceTag source={item.source} />
          <ScopeTag team={team} />
        </div>
        <p className="mt-0.5 text-sm text-zinc-400 [overflow-wrap:anywhere]">
          Was <span className="text-zinc-300">{brief(item.current.value, item.current.set)}</span>, now <span className="text-zinc-100">{brief(item.recommended, true)}</span>
        </p>
        <EvidenceList evidence={item.evidence} className="mt-1" />
      </div>
      <button type="button" onClick={() => onUndoItem(repo, item.setting_id)} disabled={pending} className={buttonClass("ghost", "sm")} aria-label={team ? `Undo ${item.title} for every repository` : `Undo ${item.title} on ${shortRepo(repo)}`} data-testid="undo-item">
        {pending ? "Undoing…" : "Undo"}
      </button>
    </li>
  );
}

function PreviewRow({ repo, item, onSwitchOn, pending }: { repo: string; item: PlanItem; onSwitchOn: (repo: string, id: string) => void; pending: boolean }) {
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3" data-testid="preview-item" data-id={item.setting_id}>
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-100">{item.title}</span>
          <Chip tone="waiting">Preview</Chip>
        </div>
        <p className="mt-0.5 text-sm text-zinc-400">{item.risk === "acts" && /^auto_merge\./.test(item.setting_id) ? "Off until you switch it on. Here is what it would have done." : "It reports what it would do and changes nothing until you switch it on."}</p>
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
      <button type="button" onClick={() => onSwitchOn(repo, item.setting_id)} disabled={pending} className={buttonClass("primary", "sm")} aria-label={`Switch on ${item.title} on ${shortRepo(repo)}`} data-testid="switch-on">
        {pending ? "Switching on…" : "Switch on"}
      </button>
    </li>
  );
}

function ScopeTag({ team }: { team: boolean }) {
  return (
    <span
      data-testid="scope-tag"
      data-scope={team ? "team" : "repo"}
      title={team ? "One value for every repository: changing it changes every repository." : "This repository's own value."}
      className="inline-flex shrink-0 items-center rounded border border-zinc-700 px-1.5 py-px text-xs leading-4 text-zinc-400"
    >
      {team ? "Team-wide" : "This repository"}
    </span>
  );
}

function KeptRow({ repo, item, onUseRecommended, pending, worth = false, team = false }: { repo: string; item: PlanItem; onUseRecommended: UseRec; pending: boolean; worth?: boolean; team?: boolean }) {
  const date = (iso: string) => formatDate(iso);
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3" data-testid={worth ? "worth-item" : "kept-item"} data-id={item.setting_id}>
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-100">{item.title}</span>
          {item.custom && <Chip tone="info">Custom</Chip>}
          <ScopeTag team={team || item.scope === "team"} />
        </div>
        <p className="mt-0.5 text-sm text-zinc-400 [overflow-wrap:anywhere]">
          {worth ? "You chose " : "Yours: "}
          <span className="text-zinc-200">{brief(item.current.value, item.current.set)}</span>
          {worth ? ", but this repo says otherwise. " : ". "}
          Recommended: <span className="text-zinc-200">{brief(item.recommended, true)}</span>.
        </p>
        <p className="mt-0.5 text-xs text-zinc-400" data-testid="kept-why">
          {setByWords(item.setBy, date)}.{team || item.scope === "team" ? " It is one value for every repository." : ""}
        </p>
        {worth && item.evidence.length > 0 && (
          <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2">
            <EvidenceList evidence={item.evidence} className="!text-zinc-200" />
          </div>
        )}
      </div>
      {item.needs ? (
        <span className="text-xs text-zinc-400">needs {item.needs}</span>
      ) : (
        <button
          type="button"
          onClick={() => onUseRecommended([{ repo, setting_id: item.setting_id }], `${repo}\u0000${item.setting_id}`)}
          disabled={pending}
          className={buttonClass(worth ? "primary" : "secondary", "sm")}
          aria-label={`Use recommended for ${item.title}${team || item.scope === "team" ? " on every repository" : ` on ${shortRepo(repo)}`}`}
          data-testid="use-recommended"
        >
          {pending ? "Changing…" : "Use recommended"}
        </button>
      )}
    </li>
  );
}

function brief(v: unknown, set: boolean): string {
  const w = valueWords(v, set);
  if (typeof v === "string" && (v.includes("\n") || v.length > 80)) return `${v.split("\n").filter(Boolean).length} lines of text`;
  return w.length > 80 ? `${w.slice(0, 77)}…` : w;
}
