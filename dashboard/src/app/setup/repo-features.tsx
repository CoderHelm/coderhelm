"use client";

// A repo's features, under its row on the Setup page: each one on, a
// preview, off or not used here, its settings in words, whether they match
// what Setup recommends, and why, so "5 of 12" answers "why only 5?". Read
// on first open (GET /api/setup/repos/:owner/:name), never before.

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Chip, Time, type Tone } from "@/components/list";
import { ChevronRightIcon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { buttonClass, focusRing, linkButton } from "@/components/ui";
import { useToast } from "@/components/toast";
import { SETUP_CHANGED, countsWords, plural, scopeWords, setupApi, shortRepo, type FeatureCounts, type FeatureState, type RepoFeature, type RepoView } from "@/lib/setup";
import { EvidenceList } from "./parts";

const STATE_LOOK: Record<FeatureState, { label: string; tone: Tone }> = {
  on: { label: "On", tone: "success" },
  preview: { label: "Preview", tone: "waiting" },
  off: { label: "Off", tone: "muted" },
  not_used: { label: "Not used here", tone: "neutral" },
};

const GROUPS: { state: FeatureState; title: string; hint: string }[] = [
  { state: "preview", title: "Previews", hint: "On, but only reporting what they would do, or recommended and waiting for you." },
  { state: "on", title: "On", hint: "" },
  { state: "off", title: "Off", hint: "" },
  { state: "not_used", title: "Not used here", hint: "Nothing in this repo for them to work on, so they don't count against the total." },
];

/** "5 on · 2 previews · 4 off", and "of the 11 that fit this repo" when some don't. */
export function CountsLine({ counts, compact = false }: { counts: FeatureCounts; compact?: boolean }) {
  return (
    <>
      <span className={`tabular-nums ${compact ? "" : "whitespace-nowrap"}`}>{countsWords(counts)}</span>
      {counts.not_used > 0 && !compact && <span className="text-zinc-400"> of the {counts.total} that fit</span>}
    </>
  );
}

export function RepoFeatures({ repo, admin, id }: { repo: string; admin: boolean; id: string }) {
  const [view, setView] = useState<RepoView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let live = true;
    setError(null);
    setupApi.repo(repo).then(
      (v) => live && setView(v),
      (e) => live && setError(e instanceof Error ? e.message : "The request failed."),
    );
    return () => {
      live = false;
    };
  }, [repo, attempt]);

  const switchOn = useCallback(
    async (f: RepoFeature) => {
      if (!f.switch_on) return;
      setPending(f.feature);
      try {
        await setupApi.switchOn(f.switch_on.run_id, repo, f.switch_on.setting_id);
        toast(`${f.title} is on for ${shortRepo(repo)}. Undo it from the run's page.`, "success");
        window.dispatchEvent(new Event(SETUP_CHANGED));
        setView(await setupApi.repo(repo));
      } catch (e) {
        toast(e instanceof Error ? `It wasn't switched on. ${e.message}` : "It wasn't switched on. Try again.", "error");
      }
      setPending(null);
    },
    [repo, toast],
  );

  return (
    <div id={id} className="min-w-0 border-t border-zinc-800 bg-zinc-950/40 px-4 py-4" data-testid="repo-features" data-repo={repo} aria-busy={!view && !error}>
      {error ? (
        <div className="flex flex-wrap items-center gap-3 text-sm" role="alert">
          <span className="text-red-300">The features couldn&apos;t be loaded. {error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonClass("secondary", "sm")}>
            Try again
          </button>
        </div>
      ) : !view ? (
        <div className="space-y-3">
          <p role="status" className="sr-only">
            Loading the features of {repo}…
          </p>
          <Skeleton className="h-4 w-64" />
          <div aria-hidden="true" className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="ml-auto h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <FeatureList view={view} admin={admin} pending={pending} onSwitchOn={switchOn} />
      )}
    </div>
  );
}

function FeatureList({ view, admin, pending, onSwitchOn }: { view: RepoView; admin: boolean; pending: string | null; onSwitchOn: (f: RepoFeature) => void }) {
  const c = view.counts;
  const always = view.features.filter((f) => !f.counted);
  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-100" data-testid="features-header">
          {c.on} on{c.previews ? `, ${plural(c.previews, "preview")}` : ""}
          {c.off ? `, ${c.off} off` : ""}
          <span className="font-normal text-zinc-400">
            {c.not_used ? ` of the ${c.total} that fit this repo; ${c.not_used} not used here` : ` of ${c.total}`}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-zinc-400">
          {view.run_at ? (
            <>
              Reasons from the Setup run of <Time iso={view.run_at} mode="date" />.{" "}
              {view.run_id && (
                <Link href={`/setup/run?id=${encodeURIComponent(view.run_id)}`} className={`${linkButton} !text-xs`}>
                  Open the run
                </Link>
              )}
            </>
          ) : (
            "Setup hasn't read this repo yet, so these reasons come from Coderhelm's own defaults."
          )}
        </p>
      </div>
      {GROUPS.map((g) => {
        const list = view.features.filter((f) => f.counted && f.state === g.state);
        if (!list.length) return null;
        return (
          <section key={g.state} aria-label={`${g.title}: ${list.length}`} className="min-w-0" data-testid="feature-group" data-state={g.state}>
            <h4 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {g.title} <span className="font-normal tabular-nums">{list.length}</span>
            </h4>
            {g.hint && <p className="mt-0.5 text-xs text-zinc-400">{g.hint}</p>}
            <ul className="mt-2 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
              {list.map((f) => (
                <FeatureRow key={f.feature} f={f} admin={admin} pending={pending === f.feature} onSwitchOn={onSwitchOn} teamCount={view.team_repo_count} />
              ))}
            </ul>
          </section>
        );
      })}
      {always.length > 0 && (
        <section aria-label="Always on" className="min-w-0" data-testid="feature-group" data-state="always">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Always in use</h4>
          <p className="mt-0.5 text-xs text-zinc-400">Not counted: they have no switch.</p>
          <ul className="mt-2 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
            {always.map((f) => (
              <FeatureRow key={f.feature} f={f} admin={admin} pending={false} onSwitchOn={onSwitchOn} teamCount={view.team_repo_count} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FeatureRow({ f, admin, pending, onSwitchOn, teamCount }: { f: RepoFeature; admin: boolean; pending: boolean; onSwitchOn: (f: RepoFeature) => void; teamCount: number }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const look = STATE_LOOK[f.state];
  const allTeam = f.settings.length > 0 && f.settings.every((s) => s.scope === "team");
  const hasDetail = f.settings.length > 1 || f.evidence.length > 0;
  return (
    <li className="min-w-0 px-4 py-3" data-testid="feature-row" data-feature={f.feature} data-state={f.state}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-100">{f.title}</span>
            <span data-testid="feature-state" data-state={f.state} className="inline-flex">
              <Chip tone={look.tone}>{f.feature === "agent_file" ? "On, refreshes by itself" : look.label}</Chip>
            </span>
            {f.mark === "recommended" && f.state !== "not_used" && (
              <span data-testid="feature-mark" data-mark="recommended" className="inline-flex">
                <Chip tone="neutral" title="Every setting here is what Setup recommends for this repo.">Recommended</Chip>
              </span>
            )}
            {f.mark === "yours" && (
              <span data-testid="feature-mark" data-mark="yours" className="inline-flex">
                <Chip tone="info" title="Someone chose differently from what Setup recommends. Setup leaves it alone unless you choose otherwise.">Yours</Chip>
              </span>
            )}
            {allTeam && <span className="text-xs text-zinc-400">{scopeWords("team", teamCount)}</span>}
          </div>
          {f.value_text && f.state !== "off" && f.state !== "not_used" && <p className="mt-0.5 text-sm text-zinc-300 [overflow-wrap:anywhere]" data-testid="feature-value">{f.value_text}</p>}
          <p className="mt-0.5 max-w-prose text-sm text-zinc-400 [overflow-wrap:anywhere]" data-testid="feature-why">
            {f.why}
          </p>
          {f.needs && !f.why.includes(f.needs) && <p className="mt-0.5 text-xs text-amber-300">needs {f.needs}</p>}
          {hasDetail && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              onClick={() => setOpen((o) => !o)}
              className={`mt-1 inline-flex items-center gap-1 rounded text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}
              data-testid="feature-detail-toggle"
            >
              <span aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
                <ChevronRightIcon />
              </span>
              {f.settings.length > 1 ? `${plural(f.settings.length, "setting")}${f.evidence.length ? " and the evidence" : ""}` : "The evidence"}
            </button>
          )}
          <div id={detailId} hidden={!open} className="mt-2 min-w-0 space-y-2 border-l-2 border-zinc-800 pl-3">
            {f.settings.length > 1 && (
              <dl className="min-w-0 space-y-1 text-sm" data-testid="feature-settings">
                {f.settings.map((s) => (
                  <div key={s.setting_id} className="flex min-w-0 flex-wrap gap-x-2">
                    <dt className="text-zinc-400">{s.title}</dt>
                    <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">
                      {s.value_text}
                      {s.recommended_text !== undefined && <span className="text-zinc-400"> · recommended: {s.recommended_text}</span>}
                      {s.custom && <span className="text-zinc-400"> · changed by hand</span>}
                      {s.scope === "team" && !allTeam && <span className="text-zinc-400"> · team-wide</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <EvidenceList evidence={f.evidence} />
          </div>
        </div>
        <div className={`flex shrink-0 flex-wrap items-center gap-2 ${admin && f.switch_on ? "" : "-ml-3 sm:ml-0"}`}>
          {admin && f.switch_on && (
            <button
              type="button"
              onClick={() => onSwitchOn(f)}
              disabled={pending}
              className={buttonClass("primary", "sm")}
              aria-label={`Switch on ${f.title}`}
              data-testid="feature-switch-on"
            >
              {pending ? "Switching on…" : "Switch on"}
            </button>
          )}
          <Link href={f.settings_href} className={buttonClass("ghost", "sm")} aria-label={`${f.title} settings`} data-testid="feature-settings-link">
            Settings
          </Link>
        </div>
      </div>
    </li>
  );
}
