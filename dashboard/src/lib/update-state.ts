import type { ModelCheck, NativeChangeSet, SystemPreflight, SystemVersion, UpdateBlocker, UpdateEntry, UpdateRequest } from "./api";

/**
 * The one update state Settings, System shows, derived in one place from the
 * version route (and the preflight, for install checks that stop an update).
 * Every screen of the Version card comes from exactly one of these; nothing
 * else on the page says anything about the update.
 *
 * Priority, top first: what is happening now (applying, preparing, waiting
 * for an OK), then the release check of the newest release (checking, a
 * refused model, a check that stalled), then the last try that didn't land,
 * then what stops the next one (the updater, install checks), then the
 * offer itself, then the quiet states. The updater keeps one pending update
 * at a time; payloads from older updaters that break that are resolved here
 * the same way (the newest prepared update wins, CloudFormation's execution
 * status beats the stored status).
 */
export type UpdateState =
  | { kind: "development" }
  | { kind: "applying"; version: string; startedAt: string | null; startedBy: string | null; appliedBy: string | null; pending: NativeChangeSet | null }
  | { kind: "preparing"; version: string; startedAt: string | null; startedBy: string | null; pending: NativeChangeSet }
  | { kind: "review"; version: string; pending: NativeChangeSet; need: "confirm" | "apply" | "aws-admin" }
  | { kind: "starting"; version: string; at: number }
  | { kind: "checking"; version: string; startedAt: string | null; request: UpdateRequest | null }
  | { kind: "check-stalled"; version: string; note: string; check: ModelCheck }
  | { kind: "needs-action"; version: string; check: ModelCheck }
  | { kind: "failed"; failure: FailedTry }
  | { kind: "updater-down"; version: string; blocker: UpdateBlocker }
  | { kind: "blocked"; version: string; checks: number }
  | { kind: "available"; version: string; ended: UpdateRequest | null }
  | { kind: "behind"; version: string }
  | { kind: "unreachable" }
  | { kind: "stale"; fetchedAt: string | null }
  | { kind: "not-checked" }
  | { kind: "current"; done: UpdateEntry | null };

/** The last try at an update that didn't land, while this install is still not on it. */
export interface FailedTry {
  version: string;
  status: "failed" | "rolled_back" | "not_started";
  /** The updater's reason: shown as is only when it reads as a sentence. */
  reason: string | null;
  from: string | null;
  startedAt: string | null;
}

/** A release check older than this without an answer is shown as stalled, never as "Checking" forever. */
export const CHECK_LIMIT_MS = 30 * 60_000;

/** CloudFormation is running (or ran) the change set: it can't be reviewed or applied any more. */
const EXECUTED = ["EXECUTE_IN_PROGRESS", "EXECUTE_COMPLETE", "EXECUTE_FAILED"];
/** A prepared update that hasn't run. */
const OPEN = ["preparing", "review"];

function parse(v: string | null | undefined): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether release `a` is at least `b` (unknown versions compare as not newer). */
function atLeast(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return true;
}

/** Who started an update, in words, or null when no one was recorded. */
export function startedBy(actor: string | null | undefined): string | null {
  if (!actor || actor === "unknown") return null;
  if (actor === "auto") return "the auto-update window";
  return actor;
}

/**
 * The newest update in the history, when it didn't succeed and this install
 * isn't on that version (a later success, or a roll back an admin chose,
 * ends it). Older updaters only say so in the preflight blocker.
 */
export function failedTry(data: SystemVersion, pre: SystemPreflight | null): FailedTry | null {
  const last = (data.history ?? []).find((h) => h.mode !== "rollback" && h.status !== "superseded");
  const newest = (data.history ?? []).find((h) => h.status !== "superseded");
  if (last && newest === last && ["failed", "rolled_back", "not_started"].includes(last.status) && last.version !== data.current.version) {
    return { version: last.version, status: last.status as FailedTry["status"], reason: last.reason ?? null, from: last.from_version ?? data.current.version, startedAt: last.started_at ?? null };
  }
  const b = pre?.blockers.find((x) => x.key === "failed_before");
  if (b && data.latest) {
    const m = b.detail.match(/didn't succeed: (.*?)\.?$/);
    return { version: data.latest.version, status: "rolled_back", reason: m?.[1] ?? null, from: data.current.version, startedAt: null };
  }
  return null;
}

/** The update in progress, from the native pending update and the history: one, never two. */
function inProgress(data: SystemVersion): { pending: NativeChangeSet | null; entry: UpdateEntry | null } {
  const history = data.history ?? [];
  const p = data.native?.pending ?? null;
  const row = p?.id ? history.find((h) => h.id === p.id) ?? null : null;
  // An older updater could leave an older prepared update as "pending" while
  // a newer one was prepared: the newest prepared update is the one an admin
  // pressed last, and the older one was superseded by it.
  const newer = history.find(
    (h) => OPEN.includes(h.status) && h.id !== p?.id && atLeast(h.version, p?.version ?? null) && h.version !== p?.version
      && (!row || history.indexOf(h) < history.indexOf(row)),
  );
  if (p && newer && OPEN.includes(p.status ?? "")) {
    return { pending: { version: newer.version, status: "preparing", id: newer.id }, entry: newer };
  }
  if (p) return { pending: p, entry: row };
  const running = history.find((h) => h.status === "running" || h.status === "preparing") ?? null;
  return { pending: null, entry: data.running ? running : null };
}

/** The one state of the Version card. `now` is injectable for tests. */
export function deriveUpdateState(data: SystemVersion, pre: SystemPreflight | null, now: number = Date.now()): UpdateState {
  const current = data.current.version;
  const latest = data.latest;
  const { pending, entry } = inProgress(data);

  if (pending) {
    const version = pending.version ?? entry?.version ?? latest?.version ?? "the new version";
    const startedAt = pending.started_at ?? entry?.started_at ?? null;
    const by = startedBy(pending.actor ?? entry?.actor);
    // CloudFormation's execution status beats the stored status: a change set
    // executed (here, or in the AWS console) is never offered for review again.
    const executed = EXECUTED.includes(pending.execution ?? "") || (pending.status === "review" && !!pending.executed_at);
    if (pending.status === "running" || executed) {
      return { kind: "applying", version, startedAt: pending.executed_at ?? startedAt, startedBy: by, appliedBy: pending.applied_by ?? null, pending };
    }
    if (pending.status === "review") {
      const canApply = !!pending.can_apply && !!pending.id;
      const toConfirm = !!pending.confirm && ((pending.data_changes?.length ?? 0) > 0 || (pending.permission_changes?.length ?? 0) > 0);
      return { kind: "review", version, pending, need: !canApply ? "aws-admin" : toConfirm ? "confirm" : "apply" };
    }
    return { kind: "preparing", version, startedAt, startedBy: by, pending };
  }

  if (data.running) {
    return { kind: "applying", version: entry?.version ?? latest?.version ?? "the new version", startedAt: entry?.started_at ?? null, startedBy: startedBy(entry?.actor), appliedBy: null, pending: null };
  }

  if (!current) return { kind: "development" };

  // An admin pressed Update while the release check ran: the update starts by
  // itself once it passes, so the card says Checking (never a second Update
  // button), for the version they pressed, whatever newer release is listed.
  const req = data.update_request ?? null;
  const asked = req?.status === "waiting" && !atLeast(current, req.version) ? req : null;
  if (asked) {
    const c = data.model_check?.version === asked.version ? data.model_check : null;
    const started = c?.pending ? (c.progress?.started_at ?? c.started_at ?? c.checked_at ?? null) : null;
    const old = !!started && now - new Date(started).getTime() > CHECK_LIMIT_MS;
    if (!c || c.pending ? !old : c.ok) return { kind: "checking", version: asked.version, startedAt: started ?? asked.requested_at ?? null, request: asked };
  }

  const mc = latest && data.model_check?.version === latest.version ? data.model_check : null;
  if (latest && mc && !mc.ok) {
    const started = mc.progress?.started_at ?? mc.started_at ?? mc.checked_at ?? null;
    const old = !!started && now - new Date(started).getTime() > CHECK_LIMIT_MS;
    if (mc.pending && !old) return { kind: "checking", version: latest.version, startedAt: started, request: null };
    if (mc.pending || mc.stalled) {
      const note = mc.stalled && mc.note ? mc.note : `Checking ${latest.version} didn't finish within 30 minutes.`;
      return { kind: "check-stalled", version: latest.version, note, check: mc };
    }
    if (mc.results.some((r) => r.status === "fail")) return { kind: "needs-action", version: latest.version, check: mc };
  }

  const failure = failedTry(data, pre);
  if (failure) return { kind: "failed", failure };

  const blockers = (pre?.blockers ?? []).filter((b) => b.severity === "block");
  const checkKeys = new Set((pre?.checks ?? []).map((c) => c.key));
  const updater = blockers.find((b) => b.key === "updater");
  if (latest && updater) return { kind: "updater-down", version: latest.version, blocker: updater };
  const checks = new Set(blockers.filter((b) => checkKeys.has(b.key)).map((b) => b.key)).size;
  if (latest && checks > 0) return { kind: "blocked", version: latest.version, checks };
  if (latest) {
    // A press that ended (its check failed since, or AWS refused to start it): why, once.
    const ended = req && req.status === "ended" && req.version === latest.version ? req : null;
    return { kind: "available", version: latest.version, ended };
  }

  if (data.releases?.behind) return { kind: "behind", version: data.releases.behind.version };
  if (data.releases?.error) return { kind: "unreachable" };
  if (data.releases && !data.releases.fetched_at) return { kind: "not-checked" };
  // An old copy of the release list can't say "up to date".
  if (data.releases?.stale) return { kind: "stale", fetchedAt: new Date(data.releases.fetched_at! * 1000).toISOString() };
  return { kind: "current", done: recentSuccess(data, now) };
}

/** The newest update succeeded in the last day and is what runs: "Updated to v0.8.39". */
function recentSuccess(data: SystemVersion, now: number): UpdateEntry | null {
  const newest = (data.history ?? []).find((h) => h.status !== "superseded");
  if (!newest || newest.mode === "rollback" || newest.status !== "succeeded" || newest.version !== data.current.version) return null;
  const at = newest.finished_at ?? newest.started_at;
  if (!at || now - new Date(at).getTime() > 24 * 3600_000) return null;
  return newest;
}

/** The test id state of each kind (what the end-to-end tests read). */
export const STATE_ID: Record<UpdateState["kind"], string> = {
  development: "development",
  applying: "updating",
  preparing: "preparing",
  review: "review",
  starting: "starting",
  checking: "checking-release",
  "check-stalled": "check-stalled",
  "needs-action": "needs-action",
  failed: "failed",
  "updater-down": "updater-down",
  blocked: "blocked",
  available: "available",
  behind: "behind",
  unreachable: "unreachable",
  stale: "stale",
  "not-checked": "not-checked",
  current: "current",
};

/** How often the page reads the version route again in this state (ms), or null: it moves on by itself. */
export function followEvery(s: UpdateState): number | null {
  switch (s.kind) {
    case "starting":
      // Just pressed: read again soon, so the card moves on as soon as the updater does.
      return 3_000;
    case "preparing":
    case "checking":
      return 10_000;
    case "applying":
      return 15_000;
    case "review":
      // Someone can execute it in the AWS console: the page follows.
      return 30_000;
    default:
      return null;
  }
}

/** The version an update in progress (checking, preparing, waiting, applying) is for, or null. */
export function inProgressVersion(s: UpdateState): string | null {
  switch (s.kind) {
    case "starting":
    case "checking":
    case "preparing":
    case "review":
    case "applying":
      return s.version;
    default:
      return null;
  }
}

/**
 * A release newer than the update in progress: mentioned quietly ("it's
 * next after this one"), never offered as a second Update button while one
 * runs. Offered once the current one ends.
 */
export function nextAfter(s: UpdateState, data: SystemVersion): string | null {
  const v = inProgressVersion(s);
  const latest = data.latest?.version ?? null;
  if (!v || !latest || latest === v || !atLeast(latest, v)) return null;
  return latest;
}

/** How long a press shows "Starting" while the version route still reads as before it (a cache, a slow read). */
export const STARTING_HOLD_MS = 90_000;

/**
 * The state with a press just made laid over it: until the updater's answer
 * shows the update (checking, preparing, applying, or a reason it ended), a
 * version read from before the press must not bring the Update button back.
 */
export function withPress(s: UpdateState, press: { version: string | null; at: number } | null, now: number = Date.now()): UpdateState {
  if (!press || now - press.at > STARTING_HOLD_MS) return s;
  if (s.kind !== "available" && s.kind !== "failed") return s;
  if (s.kind === "failed" && s.failure.startedAt && new Date(s.failure.startedAt).getTime() >= press.at - 5_000) return s;
  if (s.kind === "available" && s.ended?.ended_at && new Date(s.ended.ended_at).getTime() >= press.at - 5_000) return s;
  const version = press.version ?? (s.kind === "available" ? s.version : s.failure.version);
  return { kind: "starting", version, at: press.at };
}

/**
 * The error toast for an update action that really failed: what went wrong
 * and what to do, in plain words. Only for real failures (the server didn't
 * answer, a refused permission, a refusal with its reason): a state such as
 * "the release is being checked" is shown in the card instead.
 */
export function failureText(what: string, message: string | null | undefined, status: number | undefined): string {
  if (status === undefined || status === 0 || status >= 500) {
    return `Couldn't ${what}: the server didn't answer${status ? ` (error ${status})` : ""}. Nothing changed; try again in a minute.`;
  }
  if (status === 401) return `Couldn't ${what}: you're signed out. Sign in again, then try once more.`;
  if (status === 403) return `Couldn't ${what}: only install admins can do this. Ask one of them, or sign in as one.`;
  const why = (message ?? "").trim().replace(/\.$/, "");
  return why ? `Couldn't ${what}: ${why}.` : `Couldn't ${what} (error ${status}). Reload the page to see where things stand.`;
}

/** A 4xx that is the install's state (it moved on since the page loaded), not a failure. */
export function isStateAnswer(status: number | undefined): boolean {
  return status === 409;
}
