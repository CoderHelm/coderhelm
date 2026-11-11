"use client";

// One Setup run. Guided: four named steps, pick the repos, let Coderhelm
// read them, review what it recommends, apply. "Do it for me": pick, then
// Coderhelm reads and applies on its own, and the results are the review.
// The address holds the run (?id=), so a person can leave while it works and
// come back to the same place.

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RoleGuard } from "@/components/role-guard";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Page, PageHeader } from "@/components/page";
import { Stepper } from "@/components/stepper";
import { Problem } from "@/components/problem";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Chip, StatusDot, formatDate } from "@/components/list";
import { CheckIcon, SearchIcon, XIcon } from "@/components/icons";
import { buttonClass, focusRing, inputClass, linkButton } from "@/components/ui";
import {
  SETUP_ADMIN,
  SETUP_CHANGED,
  itemKey,
  overridesFrom,
  plural,
  setupApi,
  shortRepo,
  summarize,
  tokensWords,
  type Choice,
  type Override,
  type RepoPick,
  type RunMode,
  type RunRepo,
  type SetupHome,
  type SetupRun,
} from "@/lib/setup";
import { RepoStatePill } from "../parts";
import { ReviewStep } from "./review";
import { AuditUndo, AutoResults, UndoneNote } from "./results";
import { ModeRadios } from "../chooser";
import { Switch } from "@/components/settings";

const STEPS = [
  { id: "repos", label: "Repos" },
  { id: "analyze", label: "Analyze" },
  { id: "review", label: "Review" },
  { id: "apply", label: "Apply" },
];
const AUTO_STEPS = [
  { id: "repos", label: "Repos" },
  { id: "analyze", label: "Read and apply" },
  { id: "results", label: "Results" },
];

export default function SetupRunGuarded() {
  return (
    <RoleGuard need={SETUP_ADMIN}>
      <Suspense
        fallback={
          <Page>
            <Skeleton className="h-40 w-full" />
          </Page>
        }
      >
        <SetupRunPage />
      </Suspense>
    </RoleGuard>
  );
}

function stepOf(run: SetupRun | null): string {
  if (!run) return "repos";
  if (run.mode === "auto") return run.state === "analyzing" || run.state === "ready" || run.state === "applying" ? "analyze" : "results";
  if (run.state === "analyzing") return "analyze";
  if (run.state === "ready") return "review";
  return "apply";
}

const ESTIMATE_STORE = "coderhelm.setup.estimate.";

function SetupRunPage() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const repoParam = params.get("repo");
  const [run, setRun] = useState<SetupRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<Choice>("keep_mine");
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seeded = useRef<string | null>(null);

  // Load the run, then keep reading it while Coderhelm works on it. The last
  // answer stays on screen between reads, so nothing jumps.
  const live = run?.state === "analyzing" || run?.state === "applying" || (run?.mode === "auto" && run?.state === "ready");
  useEffect(() => {
    if (!id) {
      setRun(null);
      return;
    }
    let alive = true;
    setError(null);
    setupApi.run(id).then(
      (r) => {
        if (!alive) return;
        setRun(r);
        if (seeded.current !== r.run_id) {
          seeded.current = r.run_id;
          setChoice(r.choice);
          setOverrides(overridesFrom(r));
        }
      },
      (e) => alive && setError(e instanceof Error ? e.message : "The request failed."),
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  useEffect(() => {
    if (!id || !live) return;
    let alive = true;
    const t = window.setInterval(() => {
      setupApi.run(id).then(
        (r) => alive && setRun(r),
        () => {},
      );
    }, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [id, live]);

  const step = stepOf(run);
  const estimate = useMemo(() => {
    if (run?.estimate_tokens) return run.estimate_tokens;
    try {
      const v = id ? window.sessionStorage.getItem(ESTIMATE_STORE + id) : null;
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  }, [run?.estimate_tokens, id]);

  const start = async (repos: RepoPick, opts: { onlyNew: boolean; mode: RunMode; choice: Choice }) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await setupApi.start(repos, opts);
      try {
        if (r.estimate_tokens !== null) window.sessionStorage.setItem(ESTIMATE_STORE + r.run_id, String(r.estimate_tokens));
      } catch {
        // Private windows: the estimate shows only if the server repeats it.
      }
      window.dispatchEvent(new Event(SETUP_CHANGED));
      router.replace(`/setup/run?id=${encodeURIComponent(r.run_id)}`);
    } catch (e) {
      // Over a monthly token limit: the server says so with the estimate.
      if (e instanceof ApiError && e.status === 429) {
        const est = typeof e.body?.estimate_tokens === "number" ? (e.body.estimate_tokens as number) : null;
        setProblem(
          `${est ? `This run needs about ${tokensWords(est)} tokens, which` : "This run"} doesn't fit in what is left of your team's monthly token limit. Pick fewer repos, or raise the limit in Settings, then Token limit.`,
        );
      } else setProblem(e instanceof Error ? e.message : "The run couldn't start. Try again.");
    }
    setBusy(false);
  };

  // Decisions are saved as they're made, so leaving and coming back keeps them.
  const save = useRef<number | null>(null);
  const pickChoice = (c: Choice) => {
    setChoice(c);
    setOverrides({});
    if (id) setupApi.decide(id, { choice: c, items: [] }).catch(() => {});
  };
  const pickOverride = (repo: string, settingId: string, o: Override | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (o) next[itemKey(repo, settingId)] = o;
      else delete next[itemKey(repo, settingId)];
      return next;
    });
  };
  useEffect(() => {
    if (!id || !run || run.state !== "ready") return;
    if (save.current) window.clearTimeout(save.current);
    save.current = window.setTimeout(() => {
      const items = Object.entries(overrides).map(([k, o]) => {
        const [repo, setting_id] = k.split("\u0000");
        return o.decision === "edit" ? { repo, setting_id, decision: o.decision, value: o.value } : { repo, setting_id, decision: o.decision };
      });
      if (items.length) setupApi.decide(id, { choice, items }).catch(() => {});
    }, 700);
    return () => {
      if (save.current) window.clearTimeout(save.current);
    };
  }, [overrides, choice, id, run]);

  const apply = async () => {
    if (!run || !id) return;
    setBusy(true);
    setProblem(null);
    try {
      // What was reviewed is exactly what applies: every setting's decision, said out loud.
      const { decisions } = summarize(run, choice, overrides);
      await setupApi.decide(id, { choice, items: decisions });
      await setupApi.apply(id);
      setRun({ ...run, state: "applying" });
      setAttempt((n) => n + 1);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setProblem(e instanceof Error ? `Nothing was applied. ${e.message}` : "Nothing was applied. Try again.");
    }
    setBusy(false);
  };

  const retry = async (repos: string[]) => {
    if (!run || !id) return;
    setBusy(true);
    setProblem(null);
    try {
      await setupApi.apply(id, repos);
      setRun({ ...run, state: "applying" });
      setAttempt((n) => n + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The retry couldn't start.");
    }
    setBusy(false);
  };

  const undo = async () => {
    if (!run || !id) return;
    setBusy(true);
    setProblem(null);
    try {
      await setupApi.undo(id);
      window.dispatchEvent(new Event(SETUP_CHANGED));
      setAttempt((n) => n + 1);
    } catch (e) {
      setProblem(e instanceof Error ? `Nothing was undone. ${e.message}` : "Nothing was undone. Try again.");
    }
    setBusy(false);
  };

  // Undo one setting of a finished run; the rest of the run stays applied.
  const [pending, setPending] = useState<string | null>(null);
  const undoItem = async (repo: string, settingId: string) => {
    if (!id) return;
    setPending(itemKey(repo, settingId));
    setProblem(null);
    try {
      const reply = await setupApi.undoItem(id, repo, settingId);
      const skipped = (reply as { undo?: { skipped?: { reason?: string }[] } } | null)?.undo?.skipped ?? [];
      if (skipped.length) setProblem(`It was left as it is: ${skipped[0].reason ?? "it changed again after the run."}`);
      window.dispatchEvent(new Event(SETUP_CHANGED));
      setRun(await setupApi.run(id));
    } catch (e) {
      setProblem(e instanceof Error ? `It wasn't undone. ${e.message}` : "It wasn't undone. Try again.");
    }
    setPending(null);
  };

  // Switch a preview on in place; the toast's Undo puts it back as a preview.
  const { toast } = useToast();
  const switchOn = async (repo: string, settingId: string) => {
    if (!id) return;
    setPending(itemKey(repo, settingId));
    setProblem(null);
    try {
      const r = await setupApi.switchOn(id, repo, settingId);
      const title = run?.repos.find((x) => x.repo === repo)?.items.find((i) => i.setting_id === settingId)?.title ?? "It";
      setRun(r.run ?? (await setupApi.run(id)));
      window.dispatchEvent(new Event(SETUP_CHANGED));
      const undoId = r.switched;
      toast(
        undoId ? `${title} is on for ${shortRepo(repo)}` : `${title} was already on for ${shortRepo(repo)}`,
        "success",
        undoId ? { action: { label: "Undo", onClick: () => void undoItem(repo, undoId) } } : undefined,
      );
    } catch (e) {
      setProblem(e instanceof Error ? `It wasn't switched on. ${e.message}` : "It wasn't switched on. Try again.");
    }
    setPending(null);
  };

  // Kept settings take the recommendation: one, or a whole group. Each is its own change with its own Undo.
  const useRecommended = async (items: { repo: string; setting_id: string }[], key: string) => {
    if (!id || !items.length) return;
    setPending(key);
    setProblem(null);
    try {
      const r = await setupApi.useRecommended(id, items);
      setRun(r.run ?? (await setupApi.run(id)));
      window.dispatchEvent(new Event(SETUP_CHANGED));
      const done = items.length - r.skipped.length;
      if (r.skipped.length) setProblem(`${plural(r.skipped.length, "setting was", "settings were")} left as ${r.skipped.length === 1 ? "it was" : "they were"}: ${r.skipped[0].reason}`);
      if (done > 0) toast(done === 1 ? "Set to the recommendation. Undo it from Turned on." : `${done} settings set to the recommendation. Undo any one from Turned on.`, "success");
    } catch (e) {
      setProblem(e instanceof Error ? `Nothing was changed. ${e.message}` : "Nothing was changed. Try again.");
    }
    setPending(null);
  };

  const hrefFor = useCallback((repo: string) => `/setup/run?id=${encodeURIComponent(id ?? "")}&repo=${encodeURIComponent(repo)}`, [id]);

  const title = run ? `Setup run, ${formatDate(run.created_at)}` : "Set up repos";
  const lead = {
    repos:
      params.get("mode") === "guided"
        ? "Pick the repos. Coderhelm reads each one and recommends a value for every setting, with the reason for each."
        : "Pick the repos and how. Coderhelm reads each one and recommends a value for every setting, with the reason for each.",
    analyze: "Coderhelm is reading each repo. You can leave this page; the run keeps going.",
    review: "Check what Coderhelm recommends next to what you have now. Nothing changes until you apply.",
    apply: run?.state === "undone" ? "This run was undone. Every setting it changed is back the way it was." : "What changed on each repo.",
    results: "What Coderhelm turned on, what is worth a look, what someone chose that it kept, and what waits for you to switch on. Undo any one of them, or the whole run.",
  }[step];
  const auto = run ? run.mode === "auto" : params.get("mode") !== "guided";

  return (
    <Page testId="setup-run">
      <PageHeader title={title} lead={lead} detail={!!run} crumb={run ? formatDate(run.created_at) || "Run" : "New run"} />
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0 lg:pt-1">
          <div className="lg:sticky lg:top-6">
            <Stepper steps={auto ? AUTO_STEPS : STEPS} current={step} label="Setup steps" wideFrom="lg" />
          </div>
        </aside>
        <div className="min-w-0">
          {error ? (
            <Problem
              title="We couldn't load this run"
              onRetry={() => setAttempt((n) => n + 1)}
              action={
                <Link href="/setup" className={linkButton}>
                  Back to Setup
                </Link>
              }
              testId="run-error"
            >
              {error}
            </Problem>
          ) : !id ? (
            <ReposStep onStart={start} busy={busy} problem={problem} />
          ) : !run ? (
            <StepSkeleton />
          ) : step === "analyze" ? (
            <AnalyzeStep run={run} estimate={estimate} />
          ) : step === "results" ? (
            <AutoResults
              run={run}
              onUndo={undo}
              onUndoItem={undoItem}
              onSwitchOn={switchOn}
              onUseRecommended={useRecommended}
              onRetry={retry}
              busy={busy}
              pending={pending}
              problem={problem}
            />
          ) : step === "review" ? (
            <ReviewStep
              run={run}
              repo={repoParam}
              hrefFor={hrefFor}
              choice={choice}
              overrides={overrides}
              onChoice={pickChoice}
              onOverride={pickOverride}
              onApply={apply}
              applying={busy}
              problem={problem}
            />
          ) : (
            <ApplyStep run={run} onRetry={retry} onUndo={undo} busy={busy} problem={problem} />
          )}
        </div>
      </div>
    </Page>
  );
}

function StepSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <p role="status" className="sr-only">
        Loading the run…
      </p>
      <Skeleton className="h-5 w-56" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          <Skeleton className="mt-3 h-3 w-64 max-w-full" />
        </div>
      ))}
    </div>
  );
}

// ── Repos ────────────────────────────────────────────────────────────────

type PickMode = "not_set_up" | "all" | "pick";

function ReposStep({ onStart, busy, problem }: { onStart: (repos: RepoPick, opts: { onlyNew: boolean; mode: RunMode; choice: Choice }) => void; busy: boolean; problem: string | null }) {
  const params = useSearchParams();
  const [home, setHome] = useState<SetupHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const preset = params.get("repos");
  const [pick, setPick] = useState<PickMode>("not_set_up");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [onlyNew, setOnlyNew] = useState(params.get("only_new") === "1");
  const [mode, setRunMode] = useState<RunMode>(params.get("mode") === "guided" ? "guided" : "auto");
  const [keepMine, setKeepMine] = useState(true);
  const [estimate, setEstimate] = useState<{ repos: number; estimate_tokens: number; over_budget: boolean; reason: string | null } | null>(null);
  const [estimateFailed, setEstimateFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setError(null);
    setupApi.home().then(
      (h) => {
        if (!live) return;
        setHome(h);
        const notSetUp = h.repos.filter((r) => r.state === "not_set_up").length;
        if (preset === "all") setPick("all");
        else if (preset === "not_set_up") setPick(notSetUp ? "not_set_up" : "all");
        else if (preset) {
          const names = preset.split(",").filter((n) => h.repos.some((r) => r.repo === n));
          setPick("pick");
          setPicked(new Set(names));
        } else setPick(notSetUp ? "not_set_up" : "all");
      },
      (e) => live && setError(e instanceof Error ? e.message : "The request failed."),
    );
    return () => {
      live = false;
    };
  }, [attempt, preset]);

  // The cost before anything starts, asked again when the pick changes.
  const pickKey = pick === "pick" ? [...picked].sort().join(",") : pick;
  useEffect(() => {
    if (!home || !pickKey) {
      setEstimate(null);
      return;
    }
    let live = true;
    setEstimate(null);
    setEstimateFailed(false);
    const t = window.setTimeout(() => {
      setupApi.estimate(pick === "pick" ? [...picked] : pick, onlyNew).then(
        (e) => live && setEstimate(e),
        () => live && setEstimateFailed(true),
      );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickKey, onlyNew, !!home]);

  if (error) {
    return (
      <Problem title="We couldn't load your repos" onRetry={() => setAttempt((n) => n + 1)} testId="repos-error">
        {error}
      </Problem>
    );
  }
  if (!home) return <StepSkeleton />;

  const repos = home.repos;
  const notSetUp = repos.filter((r) => r.state === "not_set_up");
  const chosen = pick === "all" ? repos.map((r) => r.repo) : pick === "not_set_up" ? notSetUp.map((r) => r.repo) : [...picked];
  const q = query.trim().toLowerCase();
  const visible = q ? repos.filter((r) => r.repo.toLowerCase().includes(q)) : repos;
  const allVisible = visible.length > 0 && visible.every((r) => picked.has(r.repo));
  const toggle = (name: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  const go = () => onStart(pick === "pick" ? chosen : pick, { onlyNew, mode, choice: keepMine ? "smart" : "use_recommended" });

  const modes: { value: PickMode; title: string; body: string; disabled?: boolean }[] = [
    { value: "not_set_up", title: "Repos not set up", body: notSetUp.length ? plural(notSetUp.length, "repo") : "Every repo is set up", disabled: notSetUp.length === 0 },
    { value: "all", title: "All repos", body: plural(repos.length, "repo") },
    { value: "pick", title: "Pick repos", body: pick === "pick" ? `${picked.size} picked` : "Choose by name" },
  ];

  return (
    <div className="min-w-0 space-y-6" data-testid="repos-step">
      <ModeRadios value={mode} onChange={setRunMode} />

      <fieldset className="min-w-0">
        <legend className="text-sm font-semibold text-zinc-100">Which repos</legend>
        <div className="mt-3 grid min-w-0 gap-2 lg:grid-cols-3">
          {modes.map((m) => {
            const on = m.value === pick;
            return (
              <label
                key={m.value}
                className={`flex min-w-0 gap-3 rounded-lg border px-3.5 py-3 transition-colors motion-reduce:transition-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-100 ${
                  m.disabled ? "cursor-not-allowed border-zinc-800 opacity-60" : on ? "cursor-pointer border-zinc-300 bg-zinc-900" : "cursor-pointer border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                }`}
                data-testid={`pick-${m.value}`}
              >
                <input type="radio" name="repo-mode" value={m.value} checked={on} disabled={m.disabled} onChange={() => setPick(m.value)} className="sr-only" />
                <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-zinc-100" : "border-zinc-600"}`}>
                  {on && <span className="h-2 w-2 rounded-full bg-zinc-100" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-100">{m.title}</span>
                  <span className="block text-sm text-zinc-400">{m.body}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {pick === "pick" && (
        <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="repo-picker">
          <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-3 py-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                <SearchIcon />
              </span>
              <input
                type="search"
                aria-label="Filter repos by name"
                placeholder="Filter by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>
            <button
              type="button"
              className={`${linkButton} !text-sm`}
              onClick={() =>
                setPicked((s) => {
                  const n = new Set(s);
                  for (const r of visible) allVisible ? n.delete(r.repo) : n.add(r.repo);
                  return n;
                })
              }
            >
              {allVisible ? "Clear these" : q ? `Pick these ${visible.length}` : "Pick all"}
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-zinc-800/70 overflow-y-auto">
            {visible.map((r) => (
              <li key={r.repo}>
                <label className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-900 has-[:focus-visible]:bg-zinc-900`}>
                  <input type="checkbox" checked={picked.has(r.repo)} onChange={() => toggle(r.repo)} className={`h-4 w-4 shrink-0 accent-zinc-100 ${focusRing}`} />
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-100" title={r.repo}>
                    {r.repo}
                  </span>
                  <RepoStatePill state={r.state} />
                </label>
              </li>
            ))}
            {visible.length === 0 && <li className="px-3 py-4 text-sm text-zinc-400">No repo matches &ldquo;{query}&rdquo;.</li>}
          </ul>
        </div>
      )}

      {home.new_recommendations.length > 0 && (
        <label className="flex max-w-prose cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className={`mt-0.5 h-4 w-4 shrink-0 accent-zinc-100 ${focusRing}`} data-testid="only-new" />
          <span>
            <span className="font-medium text-zinc-100">Only what&apos;s new</span>
            <span className="block text-zinc-400">
              Review just the {plural(home.new_recommendations.length, "recommendation")} added since you last set up, and leave the rest as it is.
            </span>
          </span>
        </label>
      )}

      {mode === "auto" && (
        <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid="keep-mine">
          <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p id="keep-mine-label" className="text-sm font-medium text-zinc-100">
                {keepMine ? "Keep what someone chose" : "Replace mine with recommended"}
              </p>
              <p id="keep-mine-help" className="mt-0.5 text-sm text-zinc-400">
                {keepMine
                  ? "A value someone chose for a repo stays, and if the repo argues against it, it's listed first as worth a look. Defaults, values Coderhelm set before, and repos missing from a team list take the recommendation."
                  : "Every setting takes the recommendation, including values someone chose. Undo puts them back."}
              </p>
            </div>
            <Switch checked={keepMine} onChange={setKeepMine} labelledBy="keep-mine-label" describedBy="keep-mine-help" testId="keep-mine-toggle" />
          </div>
          {!keepMine && (
            <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-200" role="status" data-testid="replace-warning">
              Values your team chose on purpose will be replaced without a review. Choose &ldquo;Review each setting&rdquo; to see each one first.
            </div>
          )}
        </div>
      )}

      <div className={`rounded-lg border px-4 py-3 ${estimate?.over_budget ? "border-amber-500/30 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/40"}`} data-testid="cost-note">
        <p className="flex min-h-7 flex-wrap items-baseline gap-x-2 text-sm text-zinc-200" aria-live="polite" data-testid="estimate">
          <span className="font-medium text-zinc-50">What it costs.</span>
          {chosen.length === 0 ? (
            <span className="text-zinc-400">Pick a repo to see the estimate.</span>
          ) : estimate ? (
            <span>
              About <span className="font-semibold tabular-nums text-zinc-50">{tokensWords(estimate.estimate_tokens)} tokens</span> for {plural(estimate.repos || chosen.length, "repo")}, from your team&apos;s monthly budget.
            </span>
          ) : estimateFailed ? (
            <span className="text-zinc-400">The estimate isn&apos;t available right now; it shows once the run starts.</span>
          ) : (
            <span className="text-zinc-400">Working it out…</span>
          )}
        </p>
        {estimate?.over_budget && (
          <p className="mt-1 text-sm text-amber-200" data-testid="over-budget">
            {estimate.reason ?? "That's more than is left of your team's monthly token limit."} Pick fewer repos, or raise the limit in Settings, then Token limit.
          </p>
        )}
        <p className="mt-1 text-sm text-zinc-400">
          Coderhelm reads each repo&apos;s files, workflows and last 50 merged pull requests, once.
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          {mode === "auto"
            ? "Settings that close or merge pull requests start as previews, and every change can be undone, one at a time or all at once."
            : "Reading changes nothing. You review every recommendation before anything is applied."}
        </p>
      </div>

      {problem && (
        <Callout variant="error" title="The run didn't start" testId="start-problem">
          <p>{problem}</p>
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
        <Link href="/setup" className={buttonClass("ghost")}>
          Cancel
        </Link>
        <button type="button" onClick={go} disabled={busy || chosen.length === 0 || !!estimate?.over_budget} className={buttonClass("primary")} data-testid="analyze">
          {busy ? "Starting…" : !chosen.length ? "Pick a repo" : mode === "auto" ? `Set up ${plural(chosen.length, "repo")} for me` : `Analyze ${plural(chosen.length, "repo")}`}
        </button>
      </div>
    </div>
  );
}

// ── Analyze ──────────────────────────────────────────────────────────────

const READING_STATES = new Set(["analyzing", "reading", "running", "in_progress"]);

function repoStage(r: RunRepo): "queued" | "reading" | "done" | "failed" {
  if (r.error || r.state === "failed") return "failed";
  if (r.state === "ready" || r.state === "done" || r.state === "analyzed") return "done";
  if (r.state === "queued" || r.state === "pending") return "queued";
  return READING_STATES.has(r.state) ? "reading" : "reading";
}

function AnalyzeStep({ run, estimate }: { run: SetupRun; estimate: number | null }) {
  const stages = run.repos.map(repoStage);
  const finished = stages.filter((p) => p === "done" || p === "failed").length;
  return (
    <div className="min-w-0 space-y-4" data-testid="analyze-step">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            {run.mode === "auto" && run.state !== "analyzing" ? `Turning on the recommended settings on ${plural(run.repos.length, "repo")}` : `Reading ${plural(run.repos.length, "repo")}`}
          </h2>
          <p aria-live="polite" className="mt-0.5 text-sm text-zinc-400" data-testid="analyze-progress">
            {finished} of {run.repos.length} done
          </p>
        </div>
        <dl className="flex gap-6 text-sm" data-testid="tokens">
          {estimate !== null && (
            <div>
              <dt className="text-xs text-zinc-400">Estimate</dt>
              <dd className="tabular-nums text-zinc-100">{tokensWords(estimate)} tokens</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-zinc-400">Used so far</dt>
            <dd className="tabular-nums text-zinc-100">{tokensWords(run.tokens_used)} tokens</dd>
          </div>
        </dl>
      </div>
      <ul className="space-y-3">
        {run.repos.map((r, i) => (
          <AnalyzeRepo key={r.repo} r={r} stage={stages[i]} />
        ))}
      </ul>
      <p className="text-sm text-zinc-400">
        You can leave this page. The run keeps going, and{" "}
        <Link href="/setup" className={`${linkButton} !text-sm`}>
          Setup
        </Link>{" "}
        shows it when you come back.
      </p>
    </div>
  );
}

function AnalyzeRepo({ r, stage }: { r: RunRepo; stage: ReturnType<typeof repoStage> }) {
  const pct = stage === "done" || stage === "failed" ? 100 : stage === "queued" ? 0 : Math.round((r.progress ?? 0) * 100);
  const known = stage !== "reading" || r.progress !== null;
  return (
    <li className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3" data-testid="analyze-repo" data-repo={r.repo} data-stage={stage}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
          {stage === "done" ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
              <span className="scale-[0.65]">
                <CheckIcon />
              </span>
            </span>
          ) : stage === "failed" ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-red-300">
              <span className="scale-[0.6]">
                <XIcon />
              </span>
            </span>
          ) : (
            <StatusDot tone={stage === "queued" ? "queued" : "live"} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100" title={r.repo}>
          {r.repo}
        </span>
        <span className="shrink-0 text-xs text-zinc-400">
          {stage === "done" ? plural(r.items.length, "setting") : stage === "failed" ? "Couldn't read it" : stage === "queued" ? "Waiting" : "Reading"}
        </span>
      </div>
      {/* A fixed-height bar whose fill only grows, so the card never changes height while it reads. */}
      <div
        className="ml-8 mt-2.5 h-1 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-label={`Reading ${shortRepo(r.repo)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? pct : undefined}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${stage === "failed" ? "bg-red-400/60" : stage === "done" ? "bg-emerald-400/70" : "bg-sky-400/70"} ${!known ? "w-1/3 animate-pulse" : ""}`}
          style={known ? { width: `${Math.max(stage === "reading" ? 6 : 0, pct)}%` } : undefined}
        />
      </div>
      {r.warning && <p className="ml-8 mt-2 text-sm text-amber-300" data-testid="repo-warning">{r.warning}</p>}
      {r.error ? (
        <p className="ml-8 mt-2 text-sm text-red-300 [overflow-wrap:anywhere]">{r.error}</p>
      ) : r.found.length > 0 ? (
        <>
        <p className="ml-8 mt-2 text-xs text-zinc-400">{stage === "done" ? "Found" : "Found so far"}</p>
        <ul className="ml-8 mt-1 space-y-0.5 text-sm text-zinc-300" aria-label={`Found in ${shortRepo(r.repo)}`} data-testid="found">
          {r.found.map((f) => (
            <li key={f} className="flex min-w-0 animate-feed-in items-start gap-2 [overflow-wrap:anywhere]">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
              <span className="min-w-0">{lower(f)}</span>
            </li>
          ))}
        </ul>
        </>
      ) : (
        <p className="ml-8 mt-2 text-sm text-zinc-400">{stage === "queued" ? "Starts when a reader is free." : "Looking at the files and workflows…"}</p>
      )}
    </li>
  );
}

/** A finding under "Found so far": a sentence that already starts "Found" isn't doubled. */
function lower(s: string): string {
  const t = s.replace(/^found\s+/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Apply ────────────────────────────────────────────────────────────────

function ApplyStep({ run, onRetry, onUndo, busy, problem }: { run: SetupRun; onRetry: (repos: string[]) => void; onUndo: () => void; busy: boolean; problem: string | null }) {
  const applying = run.state === "applying";
  const undone = run.state === "undone";
  const results = run.results ?? [];
  const byRepo = new Map(results.map((r) => [r.repo, r]));
  const failed = results.filter((r) => r.state === "failed");
  const changed = results.reduce((n, r) => n + r.changed, 0);
  const done = results.filter((r) => r.state === "done").length;

  const repos = run.repos.map((r) => r.repo);
  const headline = applying
    ? `Applying to ${plural(repos.length, "repo")}…`
    : undone
      ? "This run was undone"
      : failed.length
        ? `${done} of ${plural(results.length || repos.length, "repo")} done, ${failed.length} failed`
        : `Done: ${plural(changed, "setting")} changed on ${plural(done, "repo")}`;

  return (
    <div className="min-w-0 space-y-4" data-testid="apply-step">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 aria-live="polite" className="text-sm font-semibold text-zinc-100" data-testid="apply-headline">
          {headline}
        </h2>
        {failed.length > 0 && !applying && !undone && (
          <button type="button" onClick={() => onRetry(failed.map((f) => f.repo))} disabled={busy} className={buttonClass("primary", "sm")} data-testid="retry-failed">
            {busy ? "Retrying…" : `Retry ${failed.length === 1 ? "the failed repo" : `the ${failed.length} failed`}`}
          </button>
        )}
      </div>

      {undone && <UndoneNote run={run} />}

      <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40" aria-label="Results by repo">
        {repos.map((name) => {
          const res = byRepo.get(name);
          const state = res?.state ?? (applying ? "applying" : "skipped");
          return (
            <li key={name} className="min-w-0 px-4 py-3" data-testid="apply-repo" data-repo={name} data-state={state}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-zinc-100" title={name}>
                  {name}
                </span>
                <ResultPill state={state} />
                {state === "failed" && !applying && !undone && failed.length > 1 && (
                  <button type="button" onClick={() => onRetry([name])} disabled={busy} className={buttonClass("secondary", "sm")} aria-label={`Retry ${name}`}>
                    Retry
                  </button>
                )}
              </div>
              <div className="mt-1 min-w-0 text-sm text-zinc-400">
                {state === "applying" ? (
                  "Saving each setting through the same checks its settings page uses…"
                ) : state === "failed" ? (
                  <span className="text-red-300 [overflow-wrap:anywhere]">{res?.error ?? "It couldn't be applied."}</span>
                ) : state === "skipped" ? (
                  res?.error ?? "Nothing to change here."
                ) : (
                  <>{plural(res?.changed ?? 0, "setting")} changed{undone ? ", then put back" : ""}</>
                )}
              </div>
            </li>
          );
        })}
      </ul>


      {problem && (
        <Callout variant="error" title="That didn't work" testId="apply-step-problem">
          <p>{problem}</p>
        </Callout>
      )}

      {!applying && !undone && results.length > 0 && <AuditUndo run={run} changed={changed} onUndo={onUndo} busy={busy} />}

      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/setup" className={buttonClass("secondary")}>
          Back to Setup
        </Link>
      </div>
    </div>
  );
}

function ResultPill({ state }: { state: string }) {
  if (state === "applying")
    return (
      <Chip tone="live">
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="live" /> Applying
        </span>
      </Chip>
    );
  if (state === "failed") return <Chip tone="danger">Failed</Chip>;
  if (state === "skipped") return <Chip tone="muted">Skipped</Chip>;
  return <Chip tone="success">Done</Chip>;
}

