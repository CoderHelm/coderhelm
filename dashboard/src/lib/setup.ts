// Setup: pick repos, let Coderhelm read each one and recommend a value for
// every setting it manages, review those next to the current values, then
// apply them in one run that can be retried and undone. The gateway keeps
// the rules (coderhelm-platform, /api/setup/*); this file is the dashboard's
// half of that contract, plus the decision logic the Review step shows.

import type { Tone } from "@/components/list/status";
import { request } from "./api";

// ── Types ───────────────────────────────────────────────────────────────

export type RepoState = "not_set_up" | "set_up" | "custom" | "update_available" | "failed" | "analyzing";
export type RunState = "analyzing" | "ready" | "applying" | "done" | "failed" | "undone";
export type Choice = "keep_mine" | "use_recommended" | "decide" | "smart";
export type Decision = "use" | "keep" | "edit";
export type Source = "detected" | "inferred" | "default";
/** "auto": Coderhelm applies the recommendations itself; "guided": you review each one first. */
export type RunMode = "auto" | "guided";

/** The capability that runs Setup and changes its team settings (admins). Each change also needs its setting's own capability. */
export const SETUP_ADMIN = "setup";

export interface SetupRepo {
  repo: string;
  state: RepoState;
  features_on: number;
  features_total: number;
  last_run_at: string | null;
  new_count: number;
  custom_count: number;
  error?: string;
  /** On, previews, off and not used here: what "5 of 12" is made of. */
  counts?: FeatureCounts;
  /** The same in one line, with why: "5 on, 1 preview, 4 off: Auto-merge (no required checks), …". */
  summary?: string;
}

export interface FeatureCounts {
  on: number;
  previews: number;
  off: number;
  not_used: number;
  /** The features that fit this repo (on + previews + off). */
  total: number;
}

export type FeatureState = "on" | "preview" | "off" | "not_used";

export interface FeatureSetting {
  setting_id: string;
  title: string;
  value_text: string;
  recommended_text?: string;
  matches: boolean | null;
  custom: boolean;
  scope: "repo" | "team";
}

/** One feature of one repo, as the expanded Setup row lists it. */
export interface RepoFeature {
  feature: string;
  title: string;
  state: FeatureState;
  /** Part of the "N on" count. */
  counted: boolean;
  value_text: string;
  matches: boolean | null;
  mark: "recommended" | "yours" | "preview" | null;
  why: string;
  short: string;
  evidence: Evidence[];
  settings_href: string;
  switch_on: { run_id: string; setting_id: string } | null;
  needs: string | null;
  settings: FeatureSetting[];
}

export interface RepoView {
  repo: string;
  counts: FeatureCounts;
  summary: string;
  run_id: string | null;
  run_at: string | null;
  team_repo_count: number;
  features: RepoFeature[];
}

export interface NewRecommendation {
  setting_id: string;
  title: string;
  feature: string;
  since: string;
}

export interface RunSummary {
  run_id: string;
  state: RunState;
  created_at: string;
  by?: string;
  /** How many repos the run covered. */
  repo_count?: number;
  repos?: string[];
  changed?: number;
}

export interface SetupHome {
  repos: SetupRepo[];
  new_recommendations: NewRecommendation[];
  auto_setup_new_repos: boolean;
  last_run?: RunSummary | null;
}

export interface Evidence {
  text: string;
  file?: string;
  line?: number;
  url?: string;
}

export type Value = unknown;

export interface PlanItem {
  setting_id: string;
  current: { value: Value; set: boolean };
  recommended: Value;
  source: Source;
  evidence: Evidence[];
  /** The current value differs from what the last Setup run applied: someone changed it by hand. */
  custom: boolean;
  decision?: Decision | null;
  /** The edited value, with decision "edit". */
  value?: Value;
  /** A unified diff of current against recommended, for text settings. */
  diff?: string | null;
  // From the feature registry; read when the server sends them, guessed from the id when not.
  title: string;
  feature: string;
  help?: string;
  risk: "safe" | "acts";
  /** The role this setting needs that the person lacks ("admin"). */
  needs?: string | null;
  /** Applied as a preview: it reports what it would do, and acts once switched on. */
  preview: boolean;
  /** Put back by an undo of this one setting. */
  undone: boolean;
  /** New in a release the team hasn't reviewed. */
  isNew: boolean;
  /** The value's shape, from the registry: "bool", "number", "text", "list"… */
  kind?: string;
  /** One value for this repository, or one for every repository of the team. */
  scope: "repo" | "team";
  /** A choice someone made that the repo's own files argue against: kept, and listed first. */
  worthALook: boolean;
  /** Who saved the current value and where, when the server knows. */
  setBy?: SetBy;
}

export interface SetBy {
  by?: string;
  at?: string;
  /** "Tests", "Security policy", "Reviewer settings"… */
  page: string;
}

/** One change a run made, kept for review afterwards and single-setting undo. */
export interface RunChange {
  setting_id: string;
  before: Value;
  after: Value;
  evidence: Evidence[];
  undone: boolean;
}

export interface RunRepo {
  repo: string;
  state: string;
  /** 0 to 1 while analyzing, when the server knows. */
  progress?: number | null;
  /** What the analysis has found so far, in the order it found it. */
  found: string[];
  items: PlanItem[];
  error?: string;
  /** Something to know that didn't stop the run (the AI read was skipped). */
  warning?: string;
  /** What a run that applied itself did here, in words. */
  summaryText?: string;
  /** The settings behind each count of that sentence, when the server lists them. */
  lists?: { changed: string[]; kept: string[]; previews: string[]; worth: string[] };
  changes: RunChange[];
}

/** A team-wide setting of a run: one value for every repository, shown once. */
export interface TeamItem {
  setting_id: string;
  title: string;
  feature: string;
  current: { value: Value; set: boolean };
  recommended: Value;
  source: Source;
  evidence: Evidence[];
  /** The repo whose record holds the change (what undo names). */
  changedIn: string | null;
  change: RunChange | null;
}

export interface RepoResult {
  repo: string;
  state: "done" | "failed" | "skipped";
  changed: number;
  error?: string;
  prs: { number: number; url: string }[];
  /** Settings that couldn't be changed on a repo that otherwise went through. */
  failed: { setting_id: string; error: string }[];
}

export interface SetupRun {
  run_id: string;
  state: RunState;
  mode: RunMode;
  created_at: string;
  by?: string;
  repos: RunRepo[];
  choice: Choice;
  results?: RepoResult[];
  tokens_used: number;
  estimate_tokens?: number;
  /** What undo could not put back, because it changed after the run. */
  undo_skipped?: { repo: string; setting_id: string; title?: string; reason?: string }[];
  /** The team-wide settings, once, and how many repositories they cover. */
  team?: { repoCount: number; items: TeamItem[] };
}

export type RepoPick = string[] | "all" | "not_set_up";

// ── Reply checks ────────────────────────────────────────────────────────
// A reply missing the parts a page reads (an older server, a proxy's error
// page) is an error the page can show, never a crash.

export const SHAPE_ERROR = "Coderhelm's server answered in a form this page can't read. Update the install, then reload.";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (): never => {
  throw new Error(SHAPE_ERROR);
};
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const REPO_STATES: RepoState[] = ["not_set_up", "set_up", "custom", "update_available", "failed", "analyzing"];
const RUN_STATES: RunState[] = ["analyzing", "ready", "applying", "done", "failed", "undone"];
const CHOICES: Choice[] = ["keep_mine", "use_recommended", "decide", "smart"];

function checkRepo(r: unknown): SetupRepo {
  if (!isObj(r) || typeof r.repo !== "string") fail();
  const o = r as Record<string, unknown>;
  return {
    repo: o.repo as string,
    state: REPO_STATES.includes(o.state as RepoState) ? (o.state as RepoState) : "not_set_up",
    features_on: num(o.features_on),
    features_total: num(o.features_total),
    last_run_at: typeof o.last_run_at === "string" ? o.last_run_at : null,
    new_count: num(o.new_count),
    custom_count: num(o.custom_count),
    error: typeof o.error === "string" && o.error ? o.error : undefined,
    counts: checkCounts(o.counts),
    summary: typeof o.summary === "string" && o.summary ? o.summary : undefined,
  };
}

function checkCounts(c: unknown): FeatureCounts | undefined {
  if (!isObj(c) || typeof c.on !== "number") return undefined;
  return { on: num(c.on), previews: num(c.previews), off: num(c.off), not_used: num(c.not_used), total: num(c.total) };
}

const FEATURE_STATES: FeatureState[] = ["on", "preview", "off", "not_used"];
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A path inside the dashboard only: never a link off it. */
const localHref = (v: unknown, d: string) => (typeof v === "string" && /^\/(?!\/)/.test(v) ? v : d);

export function checkRepoView(r: unknown): RepoView {
  if (!isObj(r) || typeof r.repo !== "string" || !Array.isArray(r.features)) fail();
  const o = r as Record<string, unknown>;
  const features: RepoFeature[] = (o.features as unknown[]).filter(isObj).map((f) => {
    const feature = str(f.feature);
    const sw = isObj(f.switch_on) && typeof f.switch_on.run_id === "string" && typeof f.switch_on.setting_id === "string" ? { run_id: f.switch_on.run_id, setting_id: f.switch_on.setting_id } : null;
    return {
      feature,
      title: str(f.title) || featureLabel(feature),
      state: FEATURE_STATES.includes(f.state as FeatureState) ? (f.state as FeatureState) : "off",
      counted: f.counted !== false,
      value_text: str(f.value_text),
      matches: typeof f.matches === "boolean" ? f.matches : null,
      mark: f.mark === "recommended" || f.mark === "yours" || f.mark === "preview" ? f.mark : null,
      why: str(f.why),
      short: str(f.short),
      evidence: Array.isArray(f.evidence) ? (f.evidence.map(checkEvidence).filter(Boolean) as Evidence[]) : [],
      settings_href: localHref(f.settings_href, FEATURE_HREF[feature] ?? "/settings"),
      switch_on: sw,
      needs: typeof f.needs === "string" && f.needs ? f.needs : null,
      settings: Array.isArray(f.settings)
        ? f.settings.filter(isObj).map((s) => ({
            setting_id: str(s.setting_id),
            title: str(s.title) || titleOf(str(s.setting_id)),
            value_text: str(s.value_text),
            recommended_text: typeof s.recommended_text === "string" ? s.recommended_text : undefined,
            matches: typeof s.matches === "boolean" ? s.matches : null,
            custom: s.custom === true,
            scope: s.scope === "team" ? ("team" as const) : ("repo" as const),
          }))
        : [],
    };
  });
  const counts = checkCounts(o.counts) ?? countFeatures(features);
  return {
    repo: o.repo as string,
    counts,
    summary: str(o.summary),
    run_id: typeof o.run_id === "string" ? o.run_id : null,
    run_at: typeof o.run_at === "string" ? o.run_at : null,
    team_repo_count: num(o.team_repo_count),
    features,
  };
}

export function countFeatures(features: Pick<RepoFeature, "counted" | "state">[]): FeatureCounts {
  const c: FeatureCounts = { on: 0, previews: 0, off: 0, not_used: 0, total: 0 };
  for (const f of features.filter((x) => x.counted)) {
    if (f.state === "on") c.on++;
    else if (f.state === "preview") c.previews++;
    else if (f.state === "off") c.off++;
    else c.not_used++;
  }
  c.total = c.on + c.previews + c.off;
  return c;
}

/** "5 on · 2 previews · 4 off", for the repo row. */
export function countsWords(c: FeatureCounts): string {
  const parts = [`${c.on} on`];
  if (c.previews) parts.push(plural(c.previews, "preview"));
  if (c.off) parts.push(`${c.off} off`);
  return parts.join(" · ");
}

function checkSummary(r: unknown): RunSummary {
  if (!isObj(r) || typeof r.run_id !== "string") fail();
  const o = r as Record<string, unknown>;
  const repos = Array.isArray(o.repos) ? o.repos.map((x) => (isObj(x) ? str(x.repo) : str(x))).filter(Boolean) : undefined;
  return {
    run_id: o.run_id as string,
    state: RUN_STATES.includes(o.state as RunState) ? (o.state as RunState) : "done",
    created_at: str(o.created_at),
    by: typeof o.by === "string" ? o.by : undefined,
    repos,
    repo_count: typeof o.repo_count === "number" ? o.repo_count : typeof o.repos === "number" ? (o.repos as number) : repos?.length,
    changed: typeof o.changed === "number" ? o.changed : undefined,
  };
}

export function checkHome(r: unknown): SetupHome {
  if (!isObj(r) || !Array.isArray(r.repos) || !Array.isArray(r.new_recommendations)) fail();
  const o = r as Record<string, unknown>;
  return {
    repos: (o.repos as unknown[]).map(checkRepo),
    new_recommendations: (o.new_recommendations as unknown[])
      .filter(isObj)
      .map((n) => ({ setting_id: str(n.setting_id), title: str(n.title, str(n.setting_id)), feature: str(n.feature), since: str(n.since) }))
      .filter((n) => n.setting_id),
    auto_setup_new_repos: o.auto_setup_new_repos === true,
    last_run: o.last_run ? checkSummary(o.last_run) : null,
  };
}

const SOURCES: Source[] = ["detected", "inferred", "default"];

function checkEvidence(e: unknown): Evidence | null {
  if (typeof e === "string") return { text: e };
  if (!isObj(e) || typeof e.text !== "string") return null;
  return {
    text: e.text,
    file: typeof e.file === "string" && e.file ? e.file : undefined,
    line: typeof e.line === "number" ? e.line : undefined,
    url: typeof e.url === "string" && /^https?:\/\//.test(e.url) ? e.url : undefined,
  };
}

function checkItem(i: unknown): PlanItem {
  if (!isObj(i) || typeof i.setting_id !== "string") fail();
  const o = i as Record<string, unknown>;
  const id = o.setting_id as string;
  const cur = isObj(o.current) ? o.current : { value: o.current, set: o.current !== undefined && o.current !== null };
  const feature = str(o.feature) || featureOf(id);
  return {
    setting_id: id,
    current: { value: cur.value ?? null, set: cur.set === true },
    recommended: o.recommended ?? null,
    source: SOURCES.includes(o.source as Source) ? (o.source as Source) : "default",
    evidence: Array.isArray(o.evidence) ? (o.evidence.map(checkEvidence).filter(Boolean) as Evidence[]) : [],
    custom: o.custom === true,
    decision: o.decision === "use" || o.decision === "keep" || o.decision === "edit" ? o.decision : null,
    value: o.value,
    diff: typeof o.diff === "string" && o.diff ? o.diff : null,
    title: str(o.title) || titleOf(id),
    feature,
    help: typeof o.help === "string" && o.help ? o.help : undefined,
    risk: o.risk === "acts" ? "acts" : "safe",
    needs: typeof o.needs === "string" && o.needs ? o.needs : null,
    preview: o.preview === true,
    undone: o.undone === true,
    isNew: o.is_new === true,
    kind: typeof o.kind === "string" ? o.kind : isObj(o.kind) && typeof o.kind.type === "string" ? o.kind.type : undefined,
    scope: o.scope === "team" ? "team" : "repo",
    worthALook: o.worth_a_look === true,
    setBy: checkSetBy(isObj(o.current) ? o.current.set_by : undefined),
  };
}

function checkSetBy(v: unknown): SetBy | undefined {
  if (!isObj(v) || typeof v.page !== "string") return undefined;
  return { page: v.page, by: typeof v.by === "string" && v.by ? v.by : undefined, at: typeof v.at === "string" && v.at ? v.at : undefined };
}

function checkRunRepo(r: unknown): RunRepo {
  if (!isObj(r) || typeof r.repo !== "string") fail();
  const o = r as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items.map(checkItem) : [];
  const p = o.progress;
  let progress: number | null = null;
  let found: string[] = [];
  if (typeof p === "number" && Number.isFinite(p)) progress = p > 1 ? Math.min(1, p / 100) : Math.max(0, p);
  if (isObj(p)) {
    if (typeof p.done === "number" && typeof p.total === "number" && p.total > 0) progress = Math.min(1, p.done / p.total);
    if (Array.isArray(p.found)) found = p.found.filter((x): x is string => typeof x === "string" && !!x);
  }
  if (Array.isArray(o.found)) found = o.found.filter((x): x is string => typeof x === "string" && !!x);
  // No list of findings from the server: what the detectors found, from the items' evidence.
  if (!found.length) {
    const seen = new Set<string>();
    for (const it of items) {
      if (it.source !== "detected") continue;
      for (const e of it.evidence) if (!seen.has(e.text)) seen.add(e.text);
    }
    found = [...seen];
  }
  const summary = isObj(o.summary) ? o.summary : null;
  const changes: RunChange[] = Array.isArray(o.changes)
    ? o.changes.filter(isObj).filter((c) => typeof c.setting_id === "string").map((c) => ({
        setting_id: c.setting_id as string,
        before: isObj(c.before) && "value" in c.before ? c.before.value : c.before,
        after: c.after,
        evidence: Array.isArray(c.evidence) ? (c.evidence.map(checkEvidence).filter(Boolean) as Evidence[]) : [],
        undone: c.undone === true,
      }))
    : [];
  // A change undone on its own shows as undone on its setting too.
  for (const c of changes) {
    const it = items.find((i) => i.setting_id === c.setting_id);
    if (it && c.undone) it.undone = true;
  }
  return {
    repo: o.repo as string,
    state: str(o.state, "analyzing"),
    progress,
    found,
    items,
    error: typeof o.error === "string" && o.error ? o.error : undefined,
    warning: typeof o.warning === "string" && o.warning ? o.warning : undefined,
    summaryText: summary && typeof summary.text === "string" && summary.text ? summary.text : undefined,
    lists:
      summary && Array.isArray(summary.changed_ids)
        ? { changed: ids(summary.changed_ids), kept: ids(summary.kept_ids), previews: ids(summary.preview_ids), worth: ids(summary.worth_ids) }
        : undefined,
    changes,
  };
}

function checkResult(r: unknown): RepoResult {
  if (!isObj(r) || typeof r.repo !== "string") fail();
  const o = r as Record<string, unknown>;
  return {
    repo: o.repo as string,
    state: o.state === "failed" ? "failed" : o.state === "skipped" ? "skipped" : "done",
    changed: num(o.changed),
    error: typeof o.error === "string" && o.error ? o.error : undefined,
    prs: Array.isArray(o.prs)
      ? o.prs.filter((p): p is { number: number; url: string } => isObj(p) && typeof p.number === "number" && typeof p.url === "string" && /^https?:\/\//.test(p.url))
      : [],
    failed: Array.isArray(o.failed) ? o.failed.filter(isObj).map((x) => ({ setting_id: str(x.setting_id), error: str(x.error, "It couldn't be changed.") })).filter((x) => x.setting_id) : [],
  };
}

export function checkRun(r: unknown): SetupRun {
  if (!isObj(r) || typeof r.run_id !== "string" || !Array.isArray(r.repos) || !RUN_STATES.includes(r.state as RunState)) fail();
  const o = r as Record<string, unknown>;
  return {
    run_id: o.run_id as string,
    state: o.state as RunState,
    mode: o.mode === "auto" ? "auto" : "guided",
    created_at: str(o.created_at),
    by: typeof o.by === "string" ? o.by : undefined,
    repos: (o.repos as unknown[]).map(checkRunRepo),
    choice: CHOICES.includes(o.choice as Choice) ? (o.choice as Choice) : "keep_mine",
    results: Array.isArray(o.results) ? o.results.map(checkResult) : undefined,
    tokens_used: num(o.tokens_used),
    estimate_tokens: typeof o.estimate_tokens === "number" ? o.estimate_tokens : undefined,
    undo_skipped: skippedOf(o),
    team: checkTeam(o.team),
  };
}

function checkChange(c: Record<string, unknown>): RunChange {
  return {
    setting_id: str(c.setting_id),
    before: isObj(c.before) && "value" in c.before ? c.before.value : c.before,
    after: c.after,
    evidence: Array.isArray(c.evidence) ? (c.evidence.map(checkEvidence).filter(Boolean) as Evidence[]) : [],
    undone: c.undone === true,
  };
}

function checkTeam(t: unknown): SetupRun["team"] {
  if (!isObj(t) || !Array.isArray(t.items)) return undefined;
  const items: TeamItem[] = t.items.filter(isObj).filter((i) => typeof i.setting_id === "string").map((i) => {
    const cur = isObj(i.current) ? i.current : {};
    return {
      setting_id: i.setting_id as string,
      title: str(i.title) || titleOf(i.setting_id as string),
      feature: str(i.feature) || featureOf(i.setting_id as string),
      current: { value: cur.value ?? null, set: cur.set === true },
      recommended: i.recommended ?? null,
      source: SOURCES.includes(i.source as Source) ? (i.source as Source) : "default",
      evidence: Array.isArray(i.evidence) ? (i.evidence.map(checkEvidence).filter(Boolean) as Evidence[]) : [],
      changedIn: typeof i.changed_in === "string" ? i.changed_in : null,
      change: isObj(i.change) ? checkChange(i.change) : null,
    };
  });
  return { repoCount: num(t.repo_count), items };
}

/** What the last undo left alone: `undo.skipped` (or an older `undo_skipped`). */
function skippedOf(o: Record<string, unknown>): SetupRun["undo_skipped"] {
  const list = isObj(o.undo) && Array.isArray(o.undo.skipped) ? o.undo.skipped : Array.isArray(o.undo_skipped) ? o.undo_skipped : null;
  if (!list) return undefined;
  return list.filter(isObj).map((s) => ({ repo: str(s.repo), setting_id: str(s.setting_id), title: typeof s.title === "string" ? s.title : undefined, reason: typeof s.reason === "string" ? s.reason : undefined }));
}

export function checkRuns(r: unknown): RunSummary[] {
  const list = Array.isArray(r) ? r : isObj(r) && Array.isArray(r.runs) ? r.runs : fail();
  return (list as unknown[]).map(checkSummary);
}

export function checkStarted(r: unknown): { run_id: string; estimate_tokens: number | null } {
  if (!isObj(r) || typeof r.run_id !== "string") fail();
  const o = r as Record<string, unknown>;
  return { run_id: o.run_id as string, estimate_tokens: typeof o.estimate_tokens === "number" ? o.estimate_tokens : null };
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface DecisionBody {
  choice?: Choice;
  items?: { repo: string; setting_id: string; decision: Decision; value?: Value }[];
}

export const setupApi = {
  home: () => request<unknown>("/api/setup").then(checkHome),
  start: (repos: RepoPick, opts: { onlyNew?: boolean; mode?: RunMode; choice?: Choice } = {}) =>
    request<unknown>(
      "/api/setup/runs",
      json("POST", {
        repos,
        ...(opts.onlyNew ? { only_new: true } : {}),
        ...(opts.mode === "auto" ? { mode: "auto", overwrite: opts.choice === "use_recommended" || opts.choice === "keep_mine" ? opts.choice : "smart" } : {}),
      }),
    ).then(checkStarted),
  run: (id: string) => request<unknown>(`/api/setup/runs/${encodeURIComponent(id)}`).then(checkRun),
  runs: () => request<unknown>("/api/setup/runs").then(checkRuns),
  decide: (id: string, body: DecisionBody) => request<unknown>(`/api/setup/runs/${encodeURIComponent(id)}/decisions`, json("PUT", body)),
  apply: (id: string, repos?: string[]) => request<unknown>(`/api/setup/runs/${encodeURIComponent(id)}/apply`, json("POST", repos ? { repos } : {})),
  undo: (id: string) => request<unknown>(`/api/setup/runs/${encodeURIComponent(id)}/undo`, json("POST", {})),
  /** Turn a preview into the real setting; recorded as a change, so its own Undo puts it back. */
  switchOn: (id: string, repo: string, settingId: string) =>
    request<unknown>(`/api/setup/runs/${encodeURIComponent(id)}/switch-on`, json("POST", { repo, setting_id: settingId })).then((r) => {
      const o = isObj(r) ? r : {};
      const sw = isObj(o.switched_on) && typeof o.switched_on.setting_id === "string" ? (o.switched_on.setting_id as string) : null;
      return { run: isObj(o) && typeof o.run_id === "string" ? checkRun(o) : null, switched: sw };
    }),
  /** Kept settings take their recommendation now: one, or a whole group. Each is its own change, undone on its own. */
  useRecommended: (id: string, items: { repo: string; setting_id: string }[]) =>
    request<unknown>(`/api/setup/runs/${encodeURIComponent(id)}/use-recommended`, json("POST", { items })).then((r) => {
      const o = isObj(r) ? r : {};
      const skipped = Array.isArray(o.skipped) ? o.skipped.filter(isObj).map((s) => ({ setting_id: str(s.setting_id), reason: str(s.reason) })) : [];
      return { run: typeof o.run_id === "string" ? checkRun(o) : null, skipped };
    }),
  /** One repo's features, each with its state and why (the expanded Setup row). */
  repo: (repo: string) => {
    const [owner, name] = repo.split("/");
    return request<unknown>(`/api/setup/repos/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(name ?? "")}`).then(checkRepoView);
  },
  /** Dismiss new recommendations for the whole team. */
  seen: (ids: string[]) =>
    request<unknown>("/api/setup/seen", json("POST", { setting_ids: ids })).then((r) =>
      isObj(r) && Array.isArray(r.new_recommendations) ? (r.new_recommendations.filter((x) => typeof x === "string") as string[]) : null,
    ),
  /** What a run would cost, before it is created. */
  estimate: (repos: RepoPick, onlyNew = false) =>
    request<unknown>("/api/setup/estimate", json("POST", onlyNew ? { repos, only_new: true } : { repos })).then((r) => {
      if (!isObj(r) || typeof r.estimate_tokens !== "number") fail();
      const o = r as Record<string, unknown>;
      return { repos: num(o.repos), estimate_tokens: o.estimate_tokens as number, over_budget: o.over_budget === true, reason: typeof o.reason === "string" && o.reason ? o.reason : null };
    }),
  /** Undo one setting of the run: the same undo, narrowed to it. */
  undoItem: (id: string, repo: string, settingId: string) =>
    request<unknown>(`/api/setup/runs/${encodeURIComponent(id)}/undo`, json("POST", { items: [{ repo, setting_id: settingId }] })),

  saveSettings: (s: { auto_setup_new_repos: boolean }) => request<unknown>("/api/setup/settings", json("PUT", s)),
};

// ── Words and looks ─────────────────────────────────────────────────────

export const REPO_STATE_LOOK: Record<RepoState, { label: string; tone: Tone; hover: string }> = {
  not_set_up: { label: "Not set up", tone: "waiting", hover: "Setup has never run on this repo." },
  set_up: { label: "Set up", tone: "success", hover: "Every setting matches what Setup last applied." },
  custom: { label: "Custom", tone: "info", hover: "Someone changed a setting by hand after Setup applied it. Setup leaves those alone." },
  update_available: { label: "Update available", tone: "merged", hover: "A Coderhelm release added recommendations this repo hasn't reviewed." },
  failed: { label: "Failed", tone: "danger", hover: "The last Setup run couldn't change some settings on this repo." },
  analyzing: { label: "Analyzing", tone: "live", hover: "Coderhelm is reading this repo now." },
};

export const RUN_STATE_LOOK: Record<RunState, { label: string; tone: Tone }> = {
  analyzing: { label: "Analyzing", tone: "live" },
  ready: { label: "Ready to review", tone: "waiting" },
  applying: { label: "Applying", tone: "live" },
  done: { label: "Applied", tone: "success" },
  failed: { label: "Some failed", tone: "danger" },
  undone: { label: "Undone", tone: "muted" },
};

export const SOURCE_LOOK: Record<Source, { label: string; hover: string; className: string }> = {
  detected: {
    label: "Detected",
    hover: "Read straight from the repo: a file, a workflow or a GitHub setting.",
    className: "border-emerald-500/30 text-emerald-300",
  },
  inferred: {
    label: "Inferred",
    hover: "A judgment from the repo's files and its recent pull requests. Check it before you use it.",
    className: "border-sky-500/30 text-sky-300",
  },
  default: {
    label: "Default",
    hover: "Nothing in the repo says otherwise, so this is Coderhelm's own default.",
    className: "border-zinc-700 text-zinc-400",
  },
};

export const FEATURES: { id: string; label: string }[] = [
  { id: "reviewer", label: "Reviewer" },
  { id: "tests", label: "Tests" },
  { id: "ci_labels", label: "CI labels" },
  { id: "auto_merge", label: "Auto-merge" },
  { id: "tags", label: "Tags and health check" },
  { id: "release_notes", label: "Release notes" },
  { id: "reminders", label: "Review reminders" },
  { id: "stale_prs", label: "Stale pull requests" },
  { id: "security", label: "Security fixes" },
  { id: "instructions", label: "Instructions" },
  { id: "agent_file", label: "Agent file" },
  { id: "git_conventions", label: "Branches and commits" },
  { id: "alerts", label: "Alerts" },
  { id: "code_graph", label: "Code graph" },
];

export function featureLabel(id: string): string {
  return FEATURES.find((f) => f.id === id)?.label ?? sentence(id);
}

/** Where a feature's settings live in the dashboard, for "Open settings". */
export const FEATURE_HREF: Record<string, string> = {
  reviewer: "/reviewer/config?section=reviews",
  tests: "/reviewer/config?section=tests",
  ci_labels: "/reviewer/config?section=labels",
  auto_merge: "/reviewer/config?section=merge",
  tags: "/reviewer/config?section=after-merge",
  release_notes: "/reviewer/config?section=release-notes",
  reminders: "/reviewer/config?section=reminders",
  stale_prs: "/reviewer/stale?view=settings",
  security: "/security/policy",
  instructions: "/settings/instructions",
  agent_file: "/settings/instructions",
  git_conventions: "/settings/workflow",
  alerts: "/settings/alerts",
  code_graph: "/graph",
};

function sentence(s: string): string {
  const w = s.replace(/[_.]+/g, " ").trim();
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : s;
}

/** `reviewer.enabled` is a reviewer setting. */
export function featureOf(id: string): string {
  const head = id.split(".")[0] ?? "";
  return head || "other";
}

/** `stale_prs.days_to_stale` reads "Days to stale" when the server sends no title. */
export function titleOf(id: string): string {
  const parts = id.split(".");
  return sentence(parts.slice(1).join(" ") || parts[0] || id);
}

/** The repo's short name: `acme/web` is `web`. */
export function shortRepo(full: string): string {
  const i = full.lastIndexOf("/");
  return i >= 0 ? full.slice(i + 1) : full;
}

/** "9+" past nine. */
export function badgeText(n: number): string {
  return n > 9 ? "9+" : String(n);
}

/** The Setup menu item's count: new recommendations plus repos not set up yet. */
export function badgeCount(home: Pick<SetupHome, "repos" | "new_recommendations">): number {
  return home.new_recommendations.length + home.repos.filter((r) => r.state === "not_set_up").length;
}

/** One recommendation of one release, as a list key. */
export function dismissKey(n: Pick<NewRecommendation, "setting_id" | "since">): string {
  return `${n.setting_id}@${n.since}`;
}

export const SETUP_CHANGED = "coderhelm:setup-changed";

// ── Values ──────────────────────────────────────────────────────────────

export function sameValue(a: Value, b: Value): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === "")) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameValue(a[k], b[k]));
  }
  return false;
}

/** A setting whose value is prose (instructions, review focus): shown as a diff. */
export function isText(item: Pick<PlanItem, "diff" | "current" | "recommended"> & { kind?: string }): boolean {
  if (item.diff) return true;
  if (item.kind && /text|markdown|prose/i.test(item.kind)) return true;
  const long = (v: Value) => typeof v === "string" && (v.includes("\n") || v.length > 90);
  return long(item.current.value) || long(item.recommended);
}

/** A value said in words: On, Off, "Not set", a list, a number. */
export function valueWords(v: Value, set = true): string {
  if (!set && (v === null || v === undefined || v === "")) return "Not set";
  if (v === true) return "On";
  if (v === false) return "Off";
  if (v === null || v === undefined || v === "") return "Empty";
  if (Array.isArray(v)) return v.length ? v.map((x) => valueWords(x)).join(", ") : "None";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "string") return v;
  if (isObj(v)) {
    const parts = Object.entries(v).map(([k, x]) => `${sentence(k)} ${valueWords(x)}`);
    return parts.join(", ");
  }
  return String(v);
}

// ── Decisions ───────────────────────────────────────────────────────────

/**
 * Settings that close or merge on their own and are never turned on by a
 * choice at the top, "Use recommended everywhere" included: only an explicit
 * Use or Edit on the setting, or Switch on after a run (registry `preview_only`).
 */
export const PREVIEW_ONLY = new Set(["auto_merge.enabled"]);
export const isPreviewOnly = (item: Pick<PlanItem, "setting_id">) => PREVIEW_ONLY.has(item.setting_id);

export interface Override {
  decision: Decision;
  value?: Value;
}

export const itemKey = (repo: string, settingId: string) => `${repo}\u0000${settingId}`;

/**
 * What applying does to one setting, given the choice at the top and any
 * per-setting override: use the recommendation, keep the current value, or
 * use an edited value.
 *  - Keep my settings: a setting someone already set stays; one never set takes the recommendation.
 *  - Use recommended everywhere: every setting takes the recommendation.
 *  - Decide one by one: the same start as Keep my settings, then each one as you pick.
 */
export function effectiveDecision(item: PlanItem, choice: Choice, override?: Override): Override {
  if (item.needs) return { decision: "keep" };
  if (override) return override;
  if (isPreviewOnly(item)) return { decision: "keep" };
  if (choice === "use_recommended") return { decision: "use" };
  return { decision: item.current.set ? "keep" : "use" };
  // "smart" is never picked in Review: it is the default of a run that applies itself, decided on the server.
}

/** The value the setting has after applying. */
export function valueAfter(item: PlanItem, d: Override): Value {
  if (d.decision === "keep") return item.current.value;
  if (d.decision === "edit") return d.value;
  return item.recommended;
}

/** Applying would change this setting. */
export function changes(item: PlanItem, d: Override): boolean {
  return !sameValue(valueAfter(item, d), item.current.value);
}

/** Applying would replace a value someone chose. */
export function overwrites(item: PlanItem, d: Override): boolean {
  return item.current.set && changes(item, d);
}

export interface ApplySummary {
  changes: number;
  repos: number;
  overwrites: { repo: string; item: PlanItem; after: Value }[];
  decisions: NonNullable<DecisionBody["items"]>;
}

export function summarize(run: Pick<SetupRun, "repos">, choice: Choice, overrides: Record<string, Override>): ApplySummary {
  let count = 0;
  const repos = new Set<string>();
  const over: ApplySummary["overwrites"] = [];
  const decisions: ApplySummary["decisions"] = [];
  for (const r of run.repos) {
    for (const item of r.items) {
      const d = effectiveDecision(item, choice, overrides[itemKey(r.repo, item.setting_id)]);
      decisions.push(d.decision === "edit" ? { repo: r.repo, setting_id: item.setting_id, decision: "edit", value: d.value } : { repo: r.repo, setting_id: item.setting_id, decision: d.decision });
      if (!changes(item, d)) continue;
      count++;
      repos.add(r.repo);
      if (overwrites(item, d)) over.push({ repo: r.repo, item, after: valueAfter(item, d) });
    }
  }
  return { changes: count, repos: repos.size, overwrites: over, decisions };
}

/** Overrides the server already holds (a run reopened after leaving the page). */
export function overridesFrom(run: SetupRun): Record<string, Override> {
  const out: Record<string, Override> = {};
  for (const r of run.repos) {
    for (const item of r.items) {
      if (!item.decision) continue;
      const base = effectiveDecision(item, run.choice);
      const d: Override = item.decision === "edit" ? { decision: "edit", value: item.value } : { decision: item.decision };
      if (d.decision !== base.decision || d.decision === "edit") out[itemKey(r.repo, item.setting_id)] = d;
    }
  }
  return out;
}

/** "1.2M", "84k": the token estimate in a sentence. */
export function tokensWords(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// ── Results of a run that applied itself ───────────────────────────────

export interface AutoOutcome {
  /** Choices someone made that the repo's own files argue against: kept, listed first. */
  worth: PlanItem[];
  /** Turned on or changed to the recommendation. */
  changed: PlanItem[];
  /** Applied as a preview, waiting to be switched on. */
  previews: PlanItem[];
  /** A value someone set, left as it was. */
  kept: PlanItem[];
  /** Put back one by one after the run. */
  undone: PlanItem[];
}

/**
 * What a run that applied itself did on one repo. A setting that acts starts
 * as a preview: its feature's `dry_run` is on, and switching it on is turning
 * that off on the setting's page. When the server lists the changes it made,
 * they are what "turned on" shows.
 */
export function autoOutcome(repo: RunRepo, choice: Choice): AutoOutcome {
  const out: AutoOutcome = { worth: [], changed: [], previews: [], kept: [], undone: [] };
  // The server's lists, when it sends them: the same settings its sentence counts.
  if (repo.lists) {
    const pick = (list: string[]) => list.map((id) => repo.items.find((i) => i.setting_id === id)).filter((x): x is PlanItem => !!x);
    out.worth = pick(repo.lists.worth);
    out.changed = pick(repo.lists.changed);
    out.previews = pick(repo.lists.previews);
    out.kept = pick(repo.lists.kept);
    out.undone = repo.items.filter((i) => i.undone && !isPreviewOnly(i) && !/\.dry_run$/.test(i.setting_id));
    out.changed = out.changed.filter((i) => !i.undone);
    return out;
  }
  const after = (item: PlanItem): Value => {
    const c = repo.changes.find((x) => x.setting_id === item.setting_id);
    if (c) return c.undone ? c.before : c.after;
    const d: Override = item.decision ? (item.decision === "edit" ? { decision: "edit", value: item.value } : { decision: item.decision }) : effectiveDecision(item, choice);
    return valueAfter(item, d);
  };
  const dryRun = new Set(repo.items.filter((i) => /\.dry_run$/.test(i.setting_id) && after(i) === true).map((i) => i.feature));
  for (const item of repo.items) {
    const isDryRun = /\.dry_run$/.test(item.setting_id);
    if (isDryRun) continue; // part of its feature's preview, never listed on its own
    // Undoing a Switch on of a preview-only setting puts it back with the previews.
    if (item.undone && !isPreviewOnly(item)) {
      out.undone.push(item);
      continue;
    }
    const value = after(item);
    const changed = repo.changes.length ? repo.changes.some((c) => c.setting_id === item.setting_id && !c.undone) : !sameValue(value, item.current.value);
    const waiting = isPreviewOnly(item) && !changed && item.recommended === true && item.current.value !== true;
    if (item.preview || waiting || (item.risk === "acts" && dryRun.has(item.feature) && value === true)) out.previews.push(item);
    else if (changed) out.changed.push(item);
    else if (item.current.set && !sameValue(item.current.value, item.recommended)) out.kept.push(item);
  }
  return out;
}

/** "Turned on 9 settings, kept 3 of yours, 2 are previews you can switch on". */
export function outcomeWords(o: AutoOutcome): string {
  const parts: string[] = [];
  parts.push(o.changed.length ? `Turned on ${o.changed.length}` : "Changed nothing");
  if (o.worth.length) parts.push(`${o.worth.length} worth a look`);
  if (o.previews.length) parts.push(`${plural(o.previews.length, "preview")} to switch on`);
  if (o.kept.length) parts.push(`kept ${plural(o.kept.length, "setting")} someone chose`);
  if (o.undone.length) parts.push(`${o.undone.length} undone`);
  return parts.join(", ");
}

/** "Set on the Tests page by dana on Nov 3", or what is known of it. */
export function setByWords(s: SetBy | undefined, date: (iso: string) => string): string {
  if (!s) return "Set before Setup tracked who";
  const page = `on the ${s.page} page`;
  if (s.by && s.at) return `Set ${page} by ${s.by} on ${date(s.at)}`;
  if (s.by) return `Set ${page} by ${s.by}`;
  if (s.at) return `Set ${page} on ${date(s.at)}`;
  return `Set ${page}, before Setup tracked who`;
}

/** "This repository" or "Team-wide (all 12 repositories)". */
export function scopeWords(scope: "repo" | "team", repoCount: number): string {
  if (scope === "repo") return "This repository";
  return repoCount > 0 ? `Team-wide (all ${plural(repoCount, "repository", "repositories")})` : "Team-wide (every repository)";
}
