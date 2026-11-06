import { expect, test } from "@playwright/test";
import { deriveUpdateState, failureText, followEvery, nextAfter, withPress, type UpdateState } from "../src/lib/update-state";
import type { SystemPreflight, SystemVersion } from "../src/lib/api";

// The one function that maps the version route (and the preflight) to the
// one state the Version card shows. No browser: these feed it payloads,
// including the contradictory ones seen on a live install, and check that
// exactly one coherent state comes out.

const NOW = Date.parse("2026-11-04T04:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const BASE: SystemVersion = {
  self_hosted: true,
  current: { version: "v0.8.32", commit: null, released_at: null, config_fingerprint: null },
  latest: { version: "v0.8.39", notes: "", breaking: false },
  update_available: true,
  releases: { fetched_at: Math.floor(NOW / 1000) - 60, stale: false, reason: null, error: null, behind: null },
  running: false,
  history: [],
  native: { stack: "coderhelm-example", can_apply: true, auto_apply: true, pending: null },
};
const PERMS = { can_apply: true, confirm: "c".repeat(64), data_changes: [], permission_changes: ["Api.NewRole (AWS::IAM::Role Add: an IAM change)"], admin_changes: [] };
const STALE_CHECK = { version: "v0.8.39", checked_at: ago(120), started_at: ago(120), ok: false, pending: true, results: [], note: "checking the release's signature before reading the models it calls" };
const PRE: SystemPreflight = {
  checked_at: ago(0), ready: false, current: "v0.8.32", latest: "v0.8.39", checks: [],
  blockers: [{ key: "model_check_pending", severity: "block", detail: "Checking v0.8.39's signature before reading the models it calls.", fix: { text: "Wait a few minutes, then check again." } }],
};

const derive = (v: Partial<SystemVersion>, pre: SystemPreflight | null = null): UpdateState => deriveUpdateState({ ...BASE, ...v }, pre, NOW);

test.describe("deriveUpdateState: one coherent state", () => {
  test("observed: an older update waiting for its OK, a newer one prepared, and a stale Checking", () => {
    const s = derive({
      native: { ...BASE.native!, pending: { version: "v0.8.37", status: "review", id: "UPDATE#a", ...PERMS } },
      history: [
        { id: "UPDATE#b", version: "v0.8.39", from_version: "v0.8.32", actor: "owner@example.org", mode: "update", status: "review", started_at: ago(10) },
        { id: "UPDATE#a", version: "v0.8.37", from_version: "v0.8.32", actor: "owner@example.org", mode: "update", status: "review", started_at: ago(60) },
      ],
      model_check: STALE_CHECK,
    }, PRE);
    // The newest prepared update wins; the older one is never offered, and the
    // stale "Checking" for a version already prepared is not shown.
    expect(s.kind).toBe("preparing");
    expect(s.kind === "preparing" && s.version).toBe("v0.8.39");
  });

  test("the same install once the updater reconciled it: ready to apply v0.8.39, with the permission list", () => {
    const s = derive({
      native: { ...BASE.native!, pending: { version: "v0.8.39", status: "review", id: "UPDATE#b", execution: "AVAILABLE", ...PERMS } },
      history: [
        { id: "UPDATE#b", version: "v0.8.39", actor: "owner@example.org", status: "review", started_at: ago(10) },
        { id: "UPDATE#a", version: "v0.8.37", actor: "owner@example.org", status: "superseded", started_at: ago(60) },
      ],
      model_check: { ...STALE_CHECK, pending: false, ok: true, checked_at: ago(10) },
    });
    expect(s).toMatchObject({ kind: "review", version: "v0.8.39", need: "confirm" });
  });

  test("observed: executed in the AWS console while the entry still said review", () => {
    const s = derive({ native: { ...BASE.native!, pending: { version: "v0.8.39", status: "review", id: "UPDATE#b", execution: "EXECUTE_IN_PROGRESS", ...PERMS } } });
    expect(s.kind).toBe("applying");
  });

  test("applied in the console, reported by the updater", () => {
    const s = derive({ running: true, native: { ...BASE.native!, pending: { version: "v0.8.39", status: "running", id: "UPDATE#b", applied_by: "someone in the AWS console", executed_at: ago(5) } } });
    expect(s).toMatchObject({ kind: "applying", appliedBy: "someone in the AWS console" });
  });

  test("a model check pending for longer than its bound is stalled, not Checking", () => {
    expect(derive({ model_check: STALE_CHECK }).kind).toBe("check-stalled");
    expect(derive({ model_check: { ...STALE_CHECK, started_at: ago(3), checked_at: ago(3) } }).kind).toBe("checking");
    expect(derive({ model_check: { ...STALE_CHECK, pending: false, stalled: true, note: "The release check couldn't verify v0.8.39: bad signature." } })).toMatchObject({
      kind: "check-stalled", note: "The release check couldn't verify v0.8.39: bad signature.",
    });
  });

  test("a superseded row is neither a failure nor the newest update", () => {
    const s = derive({ latest: null, update_available: false, current: { ...BASE.current, version: "v0.8.39" }, history: [
      { id: "UPDATE#c", version: "v0.8.39", actor: "owner@example.org", status: "succeeded", started_at: ago(30), finished_at: ago(10) },
      { id: "UPDATE#a", version: "v0.8.37", actor: "owner@example.org", status: "superseded", started_at: ago(60) },
    ] });
    expect(s).toMatchObject({ kind: "current" });
    expect(s.kind === "current" && s.done?.version).toBe("v0.8.39");
  });

  test("the page follows only while something is happening", () => {
    expect(followEvery(derive({ native: { ...BASE.native!, pending: { version: "v0.8.39", status: "preparing", id: "UPDATE#b" } } }))).toBe(10_000);
    expect(followEvery(derive({ native: { ...BASE.native!, pending: { version: "v0.8.39", status: "review", id: "UPDATE#b", ...PERMS } } }))).toBe(30_000);
    expect(followEvery(derive({}))).toBeNull();
  });
});

test.describe("an Update press: one state, never a second button", () => {
  const waiting = { version: "v0.8.39", actor: "owner@example.org", requested_at: ago(2), status: "waiting" as const, waiting_for: "the release check" };
  const pending = { ...STALE_CHECK, checked_at: ago(2), started_at: ago(2) };

  test("a press waiting for the check is Checking, with who pressed", () => {
    const s = derive({ model_check: pending, update_request: waiting });
    expect(s.kind).toBe("checking");
    if (s.kind === "checking") expect(s.request?.actor).toBe("owner@example.org");
  });

  test("a newer release listed while the pressed one is checked: still Checking the pressed one, the newer one next", () => {
    const data = { ...BASE, latest: { version: "v0.8.40", notes: "", breaking: false }, model_check: pending, update_request: waiting };
    const s = deriveUpdateState(data, null, NOW);
    expect(s.kind === "checking" && s.version).toBe("v0.8.39");
    expect(nextAfter(s, data)).toBe("v0.8.40");
  });

  test("the check passed but the updater hasn't started it yet: still Checking, not an Update button", () => {
    expect(derive({ model_check: { version: "v0.8.39", checked_at: ago(0), ok: true, results: [] }, update_request: waiting }).kind).toBe("checking");
  });

  test("a press that ended: the offer, with the reason", () => {
    const s = derive({ update_request: { ...waiting, status: "ended", reason: "a model was refused", ended_at: ago(1) } });
    expect(s.kind).toBe("available");
    if (s.kind === "available") expect(s.ended?.reason).toBe("a model was refused");
  });

  test("just pressed and the version route still reads as before: Starting, until it moves or the hold runs out", () => {
    const before = derive({});
    expect(before.kind).toBe("available");
    const press = { version: "v0.8.39", at: NOW };
    expect(withPress(before, press, NOW).kind).toBe("starting");
    expect(followEvery(withPress(before, press, NOW))).toBe(3_000);
    expect(withPress(before, press, NOW + 120_000).kind).toBe("available");
    const preparing = derive({ native: { ...BASE.native!, pending: { version: "v0.8.39", status: "preparing", id: "UPDATE#b" } } });
    expect(withPress(preparing, press, NOW).kind).toBe("preparing");
  });

  test("no newer release mentioned for the version in progress itself, or when nothing runs", () => {
    const data = { ...BASE, native: { ...BASE.native!, pending: { version: "v0.8.39", status: "preparing", id: "UPDATE#b" } } };
    expect(nextAfter(deriveUpdateState(data, null, NOW), data)).toBeNull();
    expect(nextAfter(derive({}), BASE)).toBeNull();
  });

  test("an old release list is not up to date", () => {
    expect(derive({ latest: null, update_available: false, releases: { fetched_at: Math.floor(NOW / 1000) - 4 * 86400, stale: true, reason: null, error: null, behind: null } }).kind).toBe("stale");
  });

  test("error toasts say what went wrong and what to do", () => {
    expect(failureText("start the update", "", 502)).toBe("Couldn't start the update: the server didn't answer (error 502). Nothing changed; try again in a minute.");
    expect(failureText("start the update", "Forbidden", 403)).toContain("only install admins");
    expect(failureText("start the roll back", "an update is already running.", 400)).toBe("Couldn't start the roll back: an update is already running.");
  });
});
