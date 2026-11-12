"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorStatus, type AwsPermissionGroup, type InstallOption, type SystemVersion, type UpdateEntry } from "@/lib/api";
import { failureText } from "@/lib/update-state";
import { Callout } from "./callout";
import { Code } from "./settings/code";
import { ExternalLinkIcon } from "./icons";
import { NativeUpdateCard } from "./native-update";
import { useToast } from "./toast";
import { buttonClass, primaryButton, secondaryButton } from "./ui";

// What the AWS card does by itself on a self-hosted install, for the
// install's own account: a permission a newer release adds arrives with
// "Update now" (the same update as Settings, System), and the optional
// reads (infrastructure vulnerabilities, Amazon Inspector findings, AWS
// Health events) switch on the install's own stack (lambda/updater,
// set_options: only those parameters change, on the running release). The
// change waits for the admin to confirm the permissions it adds, here.

const POLL_MS = 5_000;

/** The optional reads: their stack parameter and a short note on what turning one on means. */
export const OPTIONAL_READS: Record<string, { param: InstallOption; note: string }> = {
  infra: { param: "InfrastructureVulnerabilities", note: "Describe and list calls only: which versions run, to match them against security advisories." },
  inspector: { param: "InspectorFindings", note: "Amazon Inspector is billed by AWS when you run it; Coderhelm only reads its findings." },
  health: { param: "HealthEvents", note: "The AWS Health API needs AWS Business Support or higher." },
};

export interface InstallStatus {
  data: SystemVersion | null;
  /** Not an install admin (or not self-hosted): the card says who can act. */
  denied: boolean;
  reload: () => Promise<void>;
  /** Check every few seconds while `on` (an update or a switch in progress). */
  watch: (on: boolean) => void;
}

/** The install's version, the update in progress and its switches (install admins), kept fresh while something runs. */
export function useInstallStatus(enabled: boolean): InstallStatus {
  const [data, setData] = useState<SystemVersion | null>(null);
  const [denied, setDenied] = useState(false);
  const [watching, setWatching] = useState(false);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setData(await api.getSystemVersion());
      setDenied(false);
    } catch (e) {
      const s = errorStatus(e);
      if (s === 403 || s === 404) setDenied(true);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  const pending = data?.native?.pending;
  const active = watching || !!data?.running || (!!pending && pending.status !== "review");
  useEffect(() => {
    if (!enabled || !active) return;
    const t = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(t);
  }, [enabled, active, reload]);

  return { data, denied, reload, watch: setWatching };
}

/** The version update in progress (not a switch), if any. */
function versionUpdate(data: SystemVersion | null) {
  const p = data?.native?.pending;
  if (p && p.mode !== "options" && ["preparing", "review", "running"].includes(p.status ?? "")) return p;
  if (data?.running && (!p || p.mode !== "options")) return p ?? { status: "running", version: data.latest?.version ?? null };
  return null;
}

/** The header of the "needed now" part on the install's own account. */
export function installHeader(n: number, s: InstallStatus, problemCode?: string): string {
  const what = `${n} permission${n === 1 ? "" : "s"}`;
  const verb = n === 1 ? "arrives" : "arrive";
  if (versionUpdate(s.data)) return `${what} ${verb} with the update installing now`;
  if (problemCode === "install_boundary") return `${what} ${n === 1 ? "is" : "are"} blocked by this install's permission limit`;
  if (s.data && !s.data.update_available) return `${what} missing from this install's read role`;
  return `${what} ${verb} with the next update`;
}

/**
 * What the admin can do about a permission this release reads that the
 * install's own role lacks: update now, follow the update installing now,
 * or, when this version already grants it, why it's still missing and the fix.
 */
export function InstallNeededNow({
  s,
  problem,
  onCheck,
  checking,
}: {
  s: InstallStatus;
  problem: { code: string; message: string; fix: string } | null;
  onCheck: () => void;
  checking: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const data = s.data;
  const running = versionUpdate(data);
  const checkAgain = (
    <button type="button" onClick={onCheck} disabled={checking} className={secondaryButton}>
      {checking ? "Checking…" : "Check again"}
    </button>
  );

  if (s.denied) {
    return <p className="text-sm text-zinc-400" data-testid="install-needed-denied">An install admin adds it from this card with the next version update. Nothing is needed in AWS.</p>;
  }
  if (!data) {
    return <p className="text-sm text-zinc-400">Checking for the update that adds it…</p>;
  }

  if (running) {
    const step = running.status === "review" ? "review" : running.status === "preparing" ? "preparing" : "applying";
    return (
      <div className="flex flex-col gap-3" data-testid="install-needed-running">
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-300">
          <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300 motion-reduce:animate-none" />
          <span>
            Arrives with the update{running.version ? ` to ${running.version}` : ""} installing now. This card checks again when it finishes.
          </span>
        </p>
        {data.native?.pending && step === "review" ? (
          <NativeUpdateCard native={data.native} phase="review" from={data.current.version} onChanged={s.reload} />
        ) : null}
      </div>
    );
  }

  if (data.update_available && data.latest) {
    const latest = data.latest.version;
    const press = async () => {
      setBusy(true);
      setNote(null);
      try {
        // The same press as Settings, System's Update: on an install that applies
        // its own updates it is also the OK for changes inside the permission limit.
        const r = await api.updateNow(undefined, false, !!data.native?.can_apply);
        if (r.ok) {
          s.watch(true);
        } else if (r.model_check || r.waiting) {
          setNote(r.error);
        } else {
          toast(failureText("start the update", r.error, r.httpStatus), "error");
        }
      } catch (e) {
        toast(failureText("start the update", e instanceof Error ? e.message : null, errorStatus(e)), "error");
      } finally {
        await s.reload();
        setBusy(false);
      }
    };
    return (
      <div className="flex flex-col gap-2" data-testid="install-needed-update">
        <p className="text-sm text-zinc-300">
          {latest} adds it to this install&apos;s own read role. Nothing is needed in AWS. The update may change what Coderhelm&apos;s own roles may do, always
          inside this install&apos;s permission limit; anything that would replace data asks you first.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={primaryButton} onClick={press} disabled={busy} data-testid="install-update-now">
            {busy ? "Starting the update…" : "Update now to add it"}
          </button>
          {checkAgain}
        </div>
        {note && <p className="text-sm text-amber-300" role="status">{note}</p>}
      </div>
    );
  }

  // This version already grants it, yet the role lacks it: say exactly why.
  const access = data.native?.access;
  if (problem?.code === "install_boundary") {
    return (
      <div className="flex flex-col gap-2" data-testid="install-needed-boundary">
        <p className="text-sm text-zinc-300">
          {data.current.version ?? "This version"} grants it, but {problem.message.charAt(0).toLowerCase() + problem.message.slice(1)} {problem.fix}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {access?.link ? (
            <a href={access.link} target="_blank" rel="noopener noreferrer" className={`${primaryButton} gap-2`}>
              Open the access update in AWS
              <span aria-hidden="true" className="scale-90"><ExternalLinkIcon /></span>
              <span className="sr-only">(opens the AWS console in a new tab)</span>
            </a>
          ) : access?.apply === "update" ? (
            <a href="/settings/system/#version" className={primaryButton}>Update the access stack (Settings, System)</a>
          ) : null}
          {checkAgain}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="install-needed-current">
      <p className="text-sm text-zinc-300">
        This install already runs {data.current.version ?? "the newest release"}, whose stack grants it, yet the role doesn&apos;t have it. Either the stack&apos;s
        last update didn&apos;t finish, or the role&apos;s policy was changed in AWS outside Coderhelm. The next version update puts the policy back; until then
        an AWS admin can compare the stack <Code>{data.native?.stack ?? "coderhelm-<name>"}</Code> with its template (drift detection in the AWS console).
      </p>
      <div className="flex flex-wrap items-center gap-2">{checkAgain}</div>
    </div>
  );
}

/** "on" | "off" | null (the release has no such switch yet) | undefined (unknown). */
function optionValue(s: InstallStatus, param: InstallOption) {
  const o = s.data?.native?.options;
  return o ? o[param] : undefined;
}

/**
 * The optional reads that are off, collapsed: each with its switch. On the
 * install's own account, Turn on makes the parameter-only change set and
 * shows its review; another account's role turns it on with the role's
 * one-click stack update in AWS.
 */
export function OptionalReads({
  groups,
  account,
  install,
  s,
  canEdit,
  onPressedOutside,
  onDone,
}: {
  groups: AwsPermissionGroup[];
  account: string;
  install: boolean;
  s: InstallStatus | null;
  canEdit: boolean;
  onPressedOutside: () => void;
  onDone: () => void;
}) {
  if (!groups.length) return null;
  const off = groups.filter((g) => g.missing.length > 0);
  return (
    <details className="group rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid={`aws-optional-${account}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3 text-sm marker:hidden">
        <span className="font-medium text-zinc-100">
          {off.length ? `Optional, off: ${off.length} read${off.length === 1 ? "" : "s"}` : "Optional reads: all on"}
          <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-2 inline-block h-3 w-3 text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none">
            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 text-zinc-400 [overflow-wrap:anywhere]">{(off.length ? off : groups).map((g) => g.name).join(", ")}</span>
      </summary>
      <div className="border-t border-zinc-800 px-4 py-3">
        <p className="text-sm text-zinc-400" data-testid="aws-optional-where">
          {install
            ? "This install's own account: Coderhelm switches these on its own stack. You review the read-only permissions first; nothing else changes."
            : `AWS account ${account}: turned on in AWS with the role's one-click stack update, which adds exactly these read-only permissions.`}
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-zinc-800">
          {groups.map((g) => (
            <li key={g.key} className="min-w-0 py-3 first:pt-0 last:pb-0" data-testid={`aws-optional-${g.key}`}>
              <OptionalRow g={g} install={install} s={s} canEdit={canEdit} onPressedOutside={onPressedOutside} onDone={onDone} />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function OptionalRow({
  g,
  install,
  s,
  canEdit,
  onPressedOutside,
  onDone,
}: {
  g: AwsPermissionGroup;
  install: boolean;
  s: InstallStatus | null;
  canEdit: boolean;
  onPressedOutside: () => void;
  onDone: () => void;
}) {
  const meta = OPTIONAL_READS[g.key];
  const blocked = (g.boundary_blocked ?? []).length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">{g.name}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{meta?.note ?? g.why}</p>
        </div>
        {!install && canEdit && g.turn_on_url ? (
          <a
            href={g.turn_on_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onPressedOutside}
            className={`${buttonClass("secondary", "sm")} gap-2`}
            data-testid={`aws-optional-turn-on-${g.key}`}
          >
            Turn on in AWS
            <span aria-hidden="true" className="scale-90"><ExternalLinkIcon /></span>
            <span className="sr-only">(opens the AWS console in a new tab)</span>
          </a>
        ) : null}
      </div>
      {install && meta && s ? <InstallSwitch g={g} param={meta.param} s={s} canEdit={canEdit} blocked={blocked} onDone={onDone} /> : null}
      {!install && blocked ? (
        <p className="text-sm text-amber-300">A permissions boundary on the role blocks these; remove it or add them to it, then check again.</p>
      ) : null}
    </div>
  );
}

/** One switch on the install's own stack: Turn on or off, its review, its progress and how it ended. */
function InstallSwitch({
  g,
  param,
  s,
  canEdit,
  blocked,
  onDone,
}: {
  g: AwsPermissionGroup;
  param: InstallOption;
  s: InstallStatus;
  canEdit: boolean;
  blocked: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const acting = useRef(false);
  const value = optionValue(s, param);
  const pending = s.data?.native?.pending;
  const change = pending?.mode === "options" ? pending.options?.[param] : undefined;
  const live = change && ["preparing", "review", "running"].includes(pending?.status ?? "") ? pending : null;
  const ended: UpdateEntry | undefined = mine ? s.data?.history?.find((h) => h.id === mine && !["preparing", "review", "running"].includes(h.status)) : undefined;

  // The switch ended: check the role again once.
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (ended && told.current !== ended.id) {
      told.current = ended.id ?? null;
      s.watch(false);
      onDone();
    }
  }, [ended, onDone, s]);

  const start = async (to: "on" | "off") => {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError(null);
    try {
      const started = await api.setInstallOptions({ [param]: to });
      setMine(started.id ?? null);
      s.watch(true);
    } catch (e) {
      const st = errorStatus(e);
      if (st === 400 || st === 409) setError(e instanceof Error ? e.message : "It didn't start.");
      else toast(failureText(`turn ${to} ${g.name}`, e instanceof Error ? e.message : null, st), "error");
    } finally {
      await s.reload();
      acting.current = false;
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!live?.id || acting.current) return;
    acting.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!mine) setMine(live.id);
      // The token names exactly the permission changes shown: if they changed since, it is refused and the review shows the new ones.
      await api.applyUpdate(live.id, live.confirm ?? "");
      s.watch(true);
    } catch (e) {
      const st = errorStatus(e);
      if (st === 400 || st === 409) setError(e instanceof Error ? e.message : "It didn't apply.");
      else toast(failureText(`turn on ${g.name}`, e instanceof Error ? e.message : null, st), "error");
    } finally {
      await s.reload();
      acting.current = false;
      setBusy(false);
    }
  };

  if (live && change) {
    const adding = change.to === "on";
    const what = adding ? "Turning on" : "Turning off";
    if (live.status === "review") {
      return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3" data-testid={`install-switch-review-${param}`}>
          <p className="text-sm font-medium text-zinc-100">
            {adding ? "These read-only permissions will be added to" : "These read-only permissions will be removed from"} this install&apos;s own roles:
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {g.actions.map((a) => (
              <Code key={a} className="!text-xs">
                {a}
              </Code>
            ))}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Only {param} changes, on {live.version ?? "the running release"}. {live.preflight?.length ? "" : "The update role may make every change it needs. "}
            If it fails, AWS puts everything back.
          </p>
          {live.permission_changes?.length ? (
            <details className="mt-2 text-xs text-zinc-400">
              <summary className="cursor-pointer text-zinc-300">As CloudFormation lists it</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {live.permission_changes.map((c) => (
                  <li key={c} className="[overflow-wrap:anywhere]">
                    <Code className="!text-xs">{c}</Code>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {canEdit && live.can_apply ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={primaryButton} onClick={confirm} disabled={busy} data-testid={`install-switch-confirm-${param}`}>
                {busy ? "Applying…" : adding ? "Confirm and turn on" : "Confirm and turn off"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-amber-300">{live.hold || "Coderhelm can't apply this one here: an AWS admin executes it in the AWS console."}</p>
          )}
          {error && <p className="mt-2 text-sm text-red-300" role="alert">{error}</p>}
        </div>
      );
    }
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-zinc-300" data-testid={`install-switch-progress-${param}`}>
        <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300 motion-reduce:animate-none" />
        {live.status === "preparing"
          ? `${what}: AWS is preparing the change, about a minute.`
          : `${what}: AWS is applying the change to this install's own roles, a few minutes. Nothing else changes.`}
      </p>
    );
  }

  const result = ended ? (
    ended.status === "succeeded" ? (
      <Callout variant="success" title={`${g.name}: switched ${ended.options?.[param]?.to ?? "on"}`} testId={`install-switch-done-${param}`}>
        <p>The install&apos;s own roles have the change. This card checks the role again.</p>
      </Callout>
    ) : (
      <Callout variant="error" title={`${g.name} wasn't switched`} testId={`install-switch-failed-${param}`}>
        <p>{ended.summary ?? ended.reason}</p>
        {ended.fix && <p>{ended.fix}</p>}
      </Callout>
    )
  ) : null;

  if (value === undefined) {
    return s.denied ? <p className="text-sm text-zinc-400">An install admin switches this from here.</p> : result;
  }
  if (value === null) {
    return (
      <>
        {result}
        <p className="text-sm text-zinc-400" data-testid={`install-switch-later-${param}`}>
          {s.data?.current.version ?? "This version"} doesn&apos;t have this switch yet: it arrives with the next update{s.data?.update_available ? " (Update now, above)" : ""}.
        </p>
      </>
    );
  }
  const on = value === "on";
  return (
    <div className="flex flex-col gap-2">
      {result}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`text-sm ${on ? "text-zinc-200" : "text-zinc-400"}`} data-testid={`install-switch-state-${param}`}>
          {on ? (blocked ? "On, blocked by this install's permission limit" : g.missing.length ? "On, the role doesn't have it yet" : "On") : "Off"}
        </span>
        {canEdit && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={`${g.name}: ${on ? "turn off" : "turn on"}`}
            className={on ? buttonClass("secondary", "sm") : buttonClass("primary", "sm")}
            onClick={() => start(on ? "off" : "on")}
            disabled={busy || !!pending && ["preparing", "running"].includes(pending.status ?? "")}
            data-testid={`install-switch-${param}`}
          >
            {busy ? "Starting…" : on ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
      {on && blocked ? (
        <p className="text-sm text-amber-300" data-testid={`install-switch-blocked-${param}`}>
          The role&apos;s policy has these, but this install&apos;s permission limit doesn&apos;t allow them yet. An AWS admin applies the install&apos;s access update
          once{s.data?.native?.access?.link ? "" : " (Settings, System, Permissions)"}; no version update can widen the limit.
          {s.data?.native?.access?.link ? (
            <>
              {" "}
              <a href={s.data.native.access.link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                Open the access update in AWS
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </div>
  );
}
