"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, errorStatus, type AutoUpdateSettings, type ModelCheck, type SystemPreflight, type SystemVersion, type UpdateEntry } from "@/lib/api";
import { deriveUpdateState, failureText, followEvery, isStateAnswer, nextAfter, STATE_ID, STARTING_HOLD_MS, withPress, type FailedTry, type UpdateState } from "@/lib/update-state";
import { CheckRow } from "@/components/install-checks";
import { DomainSection } from "@/components/domain-section";
import { HybridSection } from "@/components/hybrid-section";
import { UninstallSection } from "@/components/uninstall-section";
import { NativeUpdateCard, UpdateSteps } from "@/components/native-update";
import { ModelsSection, UpdateNeedsAction } from "@/components/models-section";
import { CodeBlock } from "@/components/code-block";
import { Code } from "@/components/settings/code";

/** The same checks from the operator's machine. */
const DOCTOR = "npx -y github:coderhelm/coderhelm-platform doctor";
import { useInstallAdmin } from "@/lib/install";
import { useToast } from "@/components/toast";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Chip } from "@/components/list";
import { Markdown } from "@/components/markdown";
import { Redirect } from "@/components/redirect";
import { Combobox } from "@/components/combobox";
import { Time } from "@/components/list";
import { ResetAllData } from "@/components/reset-data";
import { Select } from "@/components/select";
import { buttonClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { SaveBar, SettingsMore, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";

const DAYS: [string, string][] = [
  ["daily", "Every day"],
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
];

const STATUS: Record<UpdateEntry["status"], { label: string; tone: "success" | "danger" | "waiting" | "neutral" }> = {
  running: { label: "Running", tone: "waiting" },
  preparing: { label: "Preparing", tone: "waiting" },
  review: { label: "Waiting for review", tone: "waiting" },
  succeeded: { label: "Succeeded", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  rolled_back: { label: "Rolled back", tone: "danger" },
  not_started: { label: "Didn't start", tone: "neutral" },
  superseded: { label: "Replaced", tone: "neutral" },
};

/** A status this page doesn't know yet (a newer updater) shows as itself, neutral. */
function statusOf(status: string) {
  return STATUS[status as UpdateEntry["status"]] ?? { label: status.replace(/_/g, " "), tone: "neutral" as const };
}

/** Who started an update, in words: the admin's email, the install guide, the
 * auto-update window, or the AWS CLI. Old rows recorded no one ("unknown"). */
function startedBy(actor: string | undefined): string | null {
  if (!actor || actor === "unknown") return null;
  if (actor === "auto") return "auto-update window";
  return actor;
}

/** Every time zone the browser knows, with the current value kept even if it isn't listed. */
function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  const all = new Set(["UTC", ...zones]);
  if (current) all.add(current);
  return [...all];
}

const DEFAULTS: AutoUpdateSettings = { auto: false, channel: "stable", day: "sun", hour: 3, timezone: "UTC", majors: "ask" };

/** The update channels (docs/self-host/updates.md, Channels). */
const CHANNELS: { value: AutoUpdateSettings["channel"]; label: string; help: string }[] = [
  { value: "stable", label: "Stable", help: "Releases that ran as a beta for a day with no reported problem." },
  { value: "beta", label: "Beta (nightly)", help: "A new build of the latest changes each night, a day before Stable gets them." },
];

/** How often the "What's new" email may go (docs/self-host/updates.md). */
const DIGESTS: { value: NonNullable<AutoUpdateSettings["digest"]>; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "off", label: "Off" },
];

/** The saved settings, with the beta channel's old name ("preview") read as beta. */
function withChannel(s: Partial<AutoUpdateSettings> | undefined): AutoUpdateSettings {
  const out = { ...DEFAULTS, ...(s ?? {}) };
  return (out.channel as string) === "preview" ? { ...out, channel: "beta" } : out;
}

/** Settings, then System: the install's version, its health, updates and their history (self-hosted, install admins). */
export default function SystemPage() {
  const { ready, allowed } = useInstallAdmin();
  if (!ready) return null;
  if (!allowed) {
    // Only a self-hosted install has this page: anyone else goes to Settings.
    return (
      <Page>
        <div data-testid="system-unavailable">
          <Redirect to="/settings/" />
        </div>
      </Page>
    );
  }
  return <System />;
}

function System() {
  const { toast } = useToast();
  const [data, setData] = useState<SystemVersion | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<"" | "update" | "rollback">("");
  const [pre, setPre] = useState<SystemPreflight | null>(null);
  const [preState, setPreState] = useState<"loading" | "ready" | "failed">("loading");
  const loadPreflight = useCallback(() => {
    setPreState("loading");
    api
      .getSystemPreflight()
      .then((p) => {
        setPre(p);
        setPreState("ready");
      })
      .catch(() => setPreState("failed"));
  }, []);
  useEffect(() => {
    loadPreflight();
  }, [loadPreflight]);
  const form = useDirtyForm<AutoUpdateSettings>(DEFAULTS, { disabled: !data });
  // An Update press the version route may not show yet: until it does, the
  // card says Starting and never offers the button again.
  const [press, setPress] = useState<{ version: string | null; at: number } | null>(null);
  // One action at a time, whatever the clicks: a double click sends one request.
  const acting = useRef(false);
  // Only the newest read of the version route is shown: a slow poll that
  // started before a press never replaces what the press led to.
  const reads = useRef(0);

  const load = useCallback(async () => {
    const mine = ++reads.current;
    try {
      const v = await api.getSystemVersion();
      if (mine !== reads.current) return;
      setData(v);
      setError(false);
      // The saved settings, without dropping what someone is changing: the
      // page reads the version route again every few seconds while an update runs.
      if (!dirtyRef.current) form.reset(withChannel(v.settings));
    } catch {
      if (mine !== reads.current) return;
      // A failed poll keeps what is on screen; only a page with nothing yet shows the error.
      setError((had) => had || !dataRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dataRef = useRef<SystemVersion | null>(null);
  dataRef.current = data;
  const dirtyRef = useRef(false);
  dirtyRef.current = form.dirty;

  useEffect(() => {
    load();
  }, [load]);
  // The one update state, derived in one place (lib/update-state.ts), with a
  // press the version route doesn't show yet laid over it.
  const derived: UpdateState | null = data ? deriveUpdateState(data, pre) : null;
  const state: UpdateState | null = derived ? withPress(derived, press) : null;
  useEffect(() => {
    if (!press) return;
    // The updater's answer is on screen (or the hold ran out): the press is done.
    if (state && state.kind !== "starting") {
      setPress(null);
      return;
    }
    const t = window.setTimeout(() => setPress(null), Math.max(0, press.at + STARTING_HOLD_MS - Date.now()));
    return () => window.clearTimeout(t);
  }, [press, state]);
  // While something is happening (the release check, preparing, waiting for
  // an OK that can also be given in the AWS console, applying), follow it:
  // the version route reads CloudFormation each time, so the card moves from
  // preparing to waiting for the OK to applying to done without a reload.
  const every = state ? followEvery(state) : null;
  useEffect(() => {
    if (!every) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, every);
    return () => window.clearInterval(t);
  }, [every, load]);

  const header = (
    <div className="mb-6">
      <PageHeader title="Version and updates" lead="Which version of Coderhelm runs here, new releases and how they install, every update so far, and the health of the install." />
    </div>
  );

  if (error) {
    return (
      <Page>
        {header}
        <Callout variant="error" title="Couldn't load this install's version">
          <p>The server didn&apos;t answer. Nothing changed on the install; try again in a minute.</p>
          <button type="button" onClick={load} className={`mt-2 ${secondaryButton}`}>Try again</button>
        </Callout>
      </Page>
    );
  }
  if (!data || !state) {
    return (
      <Page>
        {header}
        <div className="space-y-6" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Page>
    );
  }

  const v = form.values;
  const set = <K extends keyof AutoUpdateSettings>(k: K, val: AutoUpdateSettings[K]) => form.set(k, val);
  const latest = data.latest;
  const history = data.history ?? [];
  const canRollBack = history.some((h) => h.status === "succeeded" && h.from_version);
  // Install checks that fail and stop an update: marked under Install health
  // (the status says "can't install yet" and points there). Nothing else on
  // the page repeats the update state.
  const blockers = (pre?.blockers ?? []).filter((b) => b.severity === "block");
  const checkKeys = new Set((pre?.checks ?? []).map((c) => c.key));
  const blocking = new Set(blockers.filter((b) => checkKeys.has(b.key)).map((b) => b.key));
  const busyUpdating = ["applying", "preparing", "review", "starting", "checking"].includes(state.kind);
  const failure = state.kind === "failed" ? state.failure : null;
  const offered = !!latest && ["available", "blocked", "updater-down", "needs-action", "checking", "check-stalled", "failed"].includes(state.kind);

  const save = async () => {
    try {
      const r = await api.setAutoUpdate(form.values);
      form.reset(withChannel({ ...DEFAULTS, ...r.settings }));
      toast("Update settings saved");
    } catch (e) {
      // Your changes stay on the page: Save again once it answers.
      toast(failureText("save the update settings", e instanceof Error ? e.message : null, errorStatus(e)), "error");
    }
  };

  const start = async (kind: "update" | "rollback", skipCheck = false) => {
    if (acting.current) return;
    acting.current = true;
    setBusy(kind);
    // Any read already on its way is from before this press.
    reads.current += 1;
    try {
      if (kind === "update") {
        // No version: the updater reads GitHub first and installs the newest
        // release at this moment. Skipping a model check names the release
        // whose check the admin read.
        const r = await api.updateNow(skipCheck ? data.model_check?.version : undefined, skipCheck);
        if (r.ok) {
          // Started, or recorded while the release check runs (it starts by
          // itself once the check passes): either way the card shows it.
          setPress({ version: r.version ?? null, at: Date.now() });
          if (r.state === "checking") {
            setData((d) => (d ? { ...d, model_check: r.model_check ?? d.model_check, update_request: r.request ?? d.update_request } : d));
          }
        } else if (r.model_check || r.waiting || isStateAnswer(r.httpStatus)) {
          // The release check holds it (a model it calls was refused, or the
          // release isn't ready): the card shows which, with the fix.
          if (r.model_check) setData((d) => (d ? { ...d, model_check: r.model_check } : d));
          loadPreflight();
        } else {
          toast(failureText("start the update", r.error, r.httpStatus), "error");
        }
      } else {
        await api.rollbackInstall();
      }
    } catch (e) {
      toast(failureText(kind === "update" ? "start the update" : "start the roll back", e instanceof Error ? e.message : null, errorStatus(e)), "error");
    } finally {
      await load();
      acting.current = false;
      setBusy("");
    }
  };
  const next = nextAfter(state, data);

  return (
    <Page>
      {header}
      <div className="space-y-8">
        <SettingsSection id="version" title="Version">
          <div className="min-w-0 space-y-3 px-4 py-4">
            <UpdateStatus
              state={state}
              data={data}
              busy={busy}
              onUpdate={() => start("update")}
              onChanged={load}
              onModelChecked={(c) => {
                setData({ ...data, model_check: c });
                loadPreflight();
                load();
              }}
              onSkipModel={() => start("update", true)}
              next={next}
            />
            {!busyUpdating && data.current.version && <ReleaseCheck data={data} onChecked={setData} />}
            <SettingsMore summary="Technical details">
              <VersionDetails version={data} autoUpdates={!!data.settings?.auto} failure={failure} />
            </SettingsMore>
          </div>
          {latest && offered && <ReleaseNotes version={latest.version} notes={latest.notes} url={latest.url} />}
        </SettingsSection>

        <SettingsSection id="auto" title="Automatic updates">
          <SettingsRow
            label="Install updates automatically"
            layout="toggle"
            help="Updates install during the hour you pick below. If anything goes wrong, Coderhelm switches back to the previous version and emails the admins."
            control={(ids) => <Switch id={ids.inputId} checked={v.auto} onChange={(c) => set("auto", c)} labelledBy={ids.labelId} describedBy={ids.helpId} />}
          />
          <SettingsRow
            label="Maintenance window"
            help="The only hour an automatic update may start."
            control={(ids) => (
              <div className="flex flex-wrap gap-2">
                <Select id={ids.inputId} aria-label="Day" value={v.day} onChange={(d) => set("day", d)} options={DAYS.map(([k, label]) => ({ value: k, label }))} />
                <Select
                  aria-label="Hour"
                  value={String(v.hour)}
                  onChange={(h) => set("hour", Number(h))}
                  options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }))}
                />
              </div>
            )}
          />
          <SettingsRow
            label="Time zone"
            help="The time zone the maintenance window is in."
            control={(ids) => (
              <Combobox
                id={ids.inputId}
                label="Time zone"
                placeholder="Pick a time zone"
                searchPlaceholder="Find a city or region…"
                emptyText="No time zone matches"
                value={v.timezone}
                onChange={(tz) => set("timezone", tz)}
                groups={[{ options: timeZones(v.timezone).map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") })) }]}
                className="sm:w-64"
              />
            )}
          />
          <SettingsRow
            label="Update channel"
            layout="stacked"
            help="Which releases this install offers and installs. Moving to Stable never goes back to an older version: this install waits for the next stable release."
            control={(ids) => (
              <div
                role="radiogroup"
                aria-labelledby={ids.labelId}
                aria-describedby={ids.helpId}
                data-testid="update-channel"
                className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40"
              >
                {CHANNELS.map((c) => (
                  <label key={c.value} className="flex min-w-0 cursor-pointer gap-3 px-4 py-3" data-testid={`channel-${c.value}`}>
                    <input
                      type="radio"
                      name="update-channel"
                      value={c.value}
                      checked={v.channel === c.value}
                      onChange={() => set("channel", c.value)}
                      className="mt-1 h-4 w-4 shrink-0 accent-sky-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-100">{c.label}</span>
                      <span className="mt-0.5 block max-w-prose text-sm text-zinc-400">{c.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          />
          <SettingsRow
            label="Major releases"
            help="Big updates sometimes need an admin to do something first. Choose Ask me to approve them yourself."
            control={(ids) => (
              <Select
                id={ids.inputId}
                value={v.majors}
                onChange={(m) => set("majors", m)}
                options={[
                  { value: "ask", label: "Ask me" },
                  { value: "auto", label: "Install them too" },
                ]}
              />
            )}
          />
          {/* An updater from before this email doesn't return `digest`: nothing to save, so no control. */}
          {data.settings?.digest !== undefined && (
            <SettingsRow
              label="What's new email"
              help="A short email listing new releases on your channel. Sent only when something new came out. Emails about updates that need you are always sent."
              control={(ids) => (
                <Select
                  id={ids.inputId}
                  data-testid="update-digest"
                  value={v.digest ?? "weekly"}
                  onChange={(d) => set("digest", d)}
                  options={DIGESTS}
                />
              )}
            />
          )}
        </SettingsSection>

        <SettingsSection id="history" title="Update history">
          {history.length === 0 ? (
            <p className="px-4 py-4 text-sm text-zinc-400">No updates yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800" data-testid="update-history">
              {history.map((h) => (
                <li key={h.id ?? `${h.version}-${h.started_at}`} className="flex min-w-0 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-100">
                      {h.mode === "rollback" ? "Roll back to " : ""}{h.version}
                      {h.from_version && <span className="text-zinc-400"> from {h.from_version}</span>}
                    </p>
                    <p className="line-clamp-2 break-words text-xs text-zinc-400" data-testid="history-line">
                      <Time iso={h.started_at} />
                      {startedBy(h.actor) ? ` · ${startedBy(h.actor)}` : ""}
                      {h.reason ? ` · ${h.reason}` : ""}
                      {h.note ? ` · ${h.note}` : ""}
                    </p>
                    {(h.status === "failed" || h.status === "rolled_back") && (
                      <p className="mt-1 text-xs text-zinc-300" data-testid="history-next-step">
                        {h.status === "rolled_back"
                          ? `Back on ${h.from_version ?? "the previous version"}; your data is untouched. Fix what Install health lists, then update to ${h.version} again. Automatic updates skip it until then.`
                          : "Coderhelm may not be fully working. Fix what Install health lists, or roll back below."}{" "}
                        <a href="#health" className={linkButton}>See install health</a>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 self-start sm:self-center" data-testid="history-status">
                    <Chip tone={statusOf(h.status).tone}>{statusOf(h.status).label}</Chip>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4">
            {canRollBack ? (
              <button type="button" className={secondaryButton} disabled={!!busy || busyUpdating} onClick={() => start("rollback")} data-testid="rollback">
                {busy === "rollback" ? "Starting the roll back…" : "Roll back to the previous version"}
              </button>
            ) : null}
            <p className="text-sm text-zinc-400" data-testid="rollback-note">
              {!canRollBack
                ? "Nothing to roll back to yet: once an update finishes here, you can go back to the version before it."
                : busyUpdating
                  ? "You can roll back once the update in progress finishes."
                  : "Goes back to the version before the last update. Your data stays as it is."}
            </p>
          </div>
        </SettingsSection>

        <SettingsSection id="health" title="Install health" description="The checks Coderhelm runs on itself: its address, GitHub, email, Claude and its queues. An update starts only while none fails.">
          <InstallHealth pre={pre} state={preState} blocking={blocking} onRecheck={loadPreflight} />
        </SettingsSection>

        <SettingsSection id="models" title="Models" description="How this install calls Claude: Amazon Bedrock in this AWS account, or each team's Anthropic API key. Change it at any time.">
          <ModelsSection />
        </SettingsSection>

        <SettingsSection id="domain" title="Domain" description="The address people and GitHub use for this install: the AWS address, your own domain, or a coderhelm.com address.">
          <DomainSection />
        </SettingsSection>

        <SettingsSection id="hybrid" title="Hybrid" description="Use Coderhelm's GitHub App, its other apps and a coderhelm.com address, while your code and work stay in this AWS account.">
          <HybridSection />
        </SettingsSection>

        <SettingsSection id="uninstall" title="Uninstall" description="Remove Coderhelm from your AWS account: delete its stack, keeping the data or not.">
          <UninstallSection version={data} />
        </SettingsSection>
      </div>
      <ResetAllData />
      <SaveBar count={form.dirtyKeys.length} onSave={save} onDiscard={form.discard} idleText="Nothing to save" />
    </Page>
  );
}

/** Where release commits live: the commit a release was built from links here. */
const RELEASE_REPO_URL = "https://github.com/coderhelm/coderhelm-platform";

/** Raw AWS text (an ARN, a resource type, a handler error) belongs under Technical details. */
function isRawReason(r: string): boolean {
  return /arn:aws|[A-Z][A-Za-z0-9]+::[A-Z][A-Za-z0-9]+|Resource handler returned|\bstatus code\b|Exception\b|\bRequestId\b/i.test(r) || r.length > 240;
}

function sentence(r: string): string {
  const t = r.trim().replace(/\.$/, "");
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
}

/** An indeterminate bar: an update has no reliable percentage. */
function Working({ label }: { label: string }) {
  return (
    <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={label} aria-busy="true">
      <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-400/70 motion-reduce:animate-none" />
    </div>
  );
}

/** "Sundays at 03:00 UTC": when automatic updates may start, or null when they're off. */
function windowText(s: AutoUpdateSettings | undefined): string | null {
  if (!s?.auto) return null;
  const day = s.day === "daily" ? "every day" : `${DAYS.find(([k]) => k === s.day)?.[1] ?? s.day}s`;
  return `${day} at ${String(s.hour).padStart(2, "0")}:00 ${s.timezone.replace(/_/g, " ")}`;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The one status card: a test id and state, a headline, one line of detail, and the one thing to do. */
function StatusCard({ state, variant, title, children, actions }: { state: string; variant: "neutral" | "info" | "success" | "warning" | "error"; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-testid="update-status" data-state={state}>
      <Callout variant={variant} title={title} actions={actions}>
        {children}
      </Callout>
    </div>
  );
}

/**
 * The one status at the top of Version, about updates only (the install's
 * own health is its own section). It renders exactly the state
 * deriveUpdateState chose, nothing else: one headline, one line of detail,
 * one thing to do.
 */
function UpdateStatus({
  state,
  data,
  busy,
  onUpdate,
  onChanged,
  onModelChecked,
  onSkipModel,
  next,
}: {
  state: UpdateState;
  data: SystemVersion;
  busy: "" | "update" | "rollback";
  onUpdate: () => void;
  onChanged: () => void;
  onModelChecked: (c: ModelCheck | null) => void;
  onSkipModel: () => void;
  /** A release newer than the update in progress: mentioned, never a second button. */
  next: string | null;
}) {
  const current = data.current.version;
  const latest = data.latest;
  const on = current ?? "a development build";
  const auto = windowText(data.settings);
  const beta = withChannel(data.settings).channel === "beta";
  const healthLink = <a href="#health" className={linkButton}>See install health</a>;
  const id = STATE_ID[state.kind];
  const nextLine = next ? <p className="mt-2 text-zinc-400" data-testid="update-next">{next} is out too; it&apos;s next after this one.</p> : null;

  switch (state.kind) {
    case "applying":
      if (state.pending && data.native) {
        return (
          <div data-testid="update-status" data-state={id}>
            <NativeUpdateCard native={{ ...data.native, pending: state.pending }} phase="applying" onChanged={onChanged} startedAt={state.startedAt} startedBy={state.startedBy} appliedBy={state.appliedBy} from={current} next={nextLine} />
          </div>
        );
      }
      return (
        <StatusCard state={id} variant="info" title={<>Updating to {state.version}…</>}>
          <p>
            {state.startedAt ? <>Started <Time iso={state.startedAt} />{state.startedBy ? <> by {state.startedBy}</> : null}. </> : null}
            This takes 10 to 20 minutes. Coderhelm keeps running {on} until it finishes, and this page updates by itself.
          </p>
          <Working label={`Updating to ${state.version}`} />
          {nextLine}
        </StatusCard>
      );

    case "preparing":
    case "review":
      return (
        <div data-testid="update-status" data-state={id}>
          <NativeUpdateCard
            native={{ ...(data.native ?? { stack: "", auto_apply: false }), pending: state.pending }}
            phase={state.kind}
            onChanged={onChanged}
            startedAt={state.kind === "preparing" ? state.startedAt : undefined}
            startedBy={state.kind === "preparing" ? state.startedBy : undefined}
            from={current}
            next={nextLine}
          />
        </div>
      );

    case "starting":
      return (
        <StatusCard state={id} variant="info" title={<>Starting the update to {state.version}…</>}>
          <p data-testid="update-starting">
            The updater has your request. This card moves on by itself in a few seconds; there&apos;s nothing more to press.
          </p>
          <UpdateSteps at="check" />
          <Working label={`Starting the update to ${state.version}`} />
        </StatusCard>
      );

    case "checking": {
      const req = state.request;
      const by = req?.actor && req.actor !== "AWS CLI" ? req.actor : null;
      const waits = req?.waiting_for && req.waiting_for !== "the release check" ? req.waiting_for : null;
      return (
        <StatusCard state={id} variant="info" title={<>Checking {state.version} before it can be applied</>}>
          <p data-testid="update-checking">
            {state.startedAt ? <>Started <Time iso={state.startedAt} />. </> : null}
            Coderhelm checks the release&apos;s signature and checksums, then tries each model it calls. It takes about 5 minutes; this page moves on by itself.
          </p>
          {req ? (
            <p data-testid="update-requested">
              {by ? <>{by} pressed Update</> : <>Update was pressed</>}
              {req.requested_at ? <> <Time iso={req.requested_at} /></> : null}: it starts by itself once the check passes{data.native ? ", then applies or asks for your OK as usual" : ""}. There&apos;s nothing more to press.
              {waits ? <> Waiting because {waits.replace(/; try again.*$/, "")}.</> : null}
            </p>
          ) : (
            <p className="text-zinc-400">Then you can update, or it installs by itself in your maintenance window if automatic updates are on.</p>
          )}
          <UpdateSteps at="check" />
          <Working label={`Checking ${state.version}`} />
          {nextLine}
        </StatusCard>
      );
    }

    case "check-stalled":
      return (
        <div id="readiness" className="scroll-mt-6">
          <StatusCard
            state={id}
            variant="warning"
            title={<>Checking {state.version} didn&apos;t finish</>}
            actions={<CheckAgain onChecked={onModelChecked} />}
          >
            <p data-testid="update-check-stalled">{state.note}</p>
            <p className="text-zinc-400">Nothing was changed: you&apos;re on {on}. The update waits until the release is checked.</p>
          </StatusCard>
        </div>
      );

    case "needs-action":
      return (
        <div data-testid="update-status" data-state={id} id="readiness" className="scroll-mt-6">
          <UpdateNeedsAction check={state.check} onChecked={onModelChecked} onSkip={onSkipModel} />
        </div>
      );

    case "failed": {
      const failure = state.failure;
      const plain = failure.reason && !isRawReason(failure.reason) ? sentence(failure.reason) : null;
      const retry = latest?.version === failure.version;
      const title =
        failure.status === "not_started"
          ? <>The update to {failure.version} couldn&apos;t start</>
          : failure.status === "rolled_back"
            ? <>The update to {failure.version} didn&apos;t finish</>
            : <>The update to {failure.version} stopped partway</>;
      return (
        <StatusCard
          state={id}
          variant="error"
          title={title}
          actions={
            <>
              {retry && (
                <button type="button" className={primaryButton} disabled={!!busy} onClick={onUpdate} data-testid="update-retry">
                  {busy === "update" ? "Starting…" : "Try again"}
                </button>
              )}
              {healthLink}
              {failure.status === "failed" && <a href="#history" className={linkButton}>Roll back</a>}
            </>
          }
        >
          <p data-testid="update-failed-state">
            {failure.status === "failed"
              ? <>Coderhelm may not be fully working: it reports {on}.</>
              : <>Nothing changed: you&apos;re still on {on}, and your data is untouched.</>}
            {failure.startedAt ? <> Tried <Time iso={failure.startedAt} />.</> : null}
          </p>
          <p data-testid="update-failed-reason">
            {plain ?? "AWS stopped it with an error; its own message is under Technical details."}
          </p>
          <p className="text-zinc-400">
            {failure.status === "failed"
              ? "Fix what Install health lists and try again, or roll back under Update history."
              : "If Install health below lists a check that fails, fix it first."}
            {failure.status !== "not_started" ? ` Automatic updates skip ${failure.version} until it works.` : ""}
          </p>
        </StatusCard>
      );
    }

    case "updater-down":
      return (
        <StatusCard state={id} variant="warning" title={<>{state.version} is available, but can&apos;t install from here</>}>
          <p>You&apos;re on {on}. The updater in your AWS account didn&apos;t answer, so update from your machine instead:</p>
          <div className="mt-2"><CodeBlock code={state.blocker.fix.command ?? `${DOCTOR.replace(/ doctor$/, "")} update`} lang="bash" label="Update command" /></div>
        </StatusCard>
      );

    case "blocked":
      return (
        <StatusCard
          state={id}
          variant="warning"
          title={<>{state.version} is available, but can&apos;t install yet</>}
          actions={<a href="#health" className={primaryButton} data-testid="update-see-fix">See what to fix</a>}
        >
          <p data-testid="update-blocked">
            You&apos;re on {on}. Fix the {state.checks === 1 ? "install check" : `${state.checks} install checks`} marked Stops updates below, then update.
          </p>
        </StatusCard>
      );

    case "available": {
      const l = latest!;
      const majorWaits = l.breaking && data.settings?.majors !== "auto";
      return (
        <StatusCard
          state={id}
          variant="info"
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {l.version} is available
              {l.breaking && <Chip tone="waiting">Major release</Chip>}
              {l.prerelease && <Chip tone="neutral">Beta</Chip>}
            </span>
          }
          actions={
            <button type="button" className={primaryButton} disabled={!!busy} onClick={onUpdate} data-testid="update-now">
              {busy === "update" ? "Starting…" : `Update to ${l.version}`}
            </button>
          }
        >
          <p data-testid="update-detail">
            You&apos;re on {on}.{l.published_at ? <> {l.version} came out <Time iso={l.published_at} mode="date" />.</> : null}
            {auto && !majorWaits ? <> It installs by itself {auto}, or update now.</> : null}
          </p>
          {l.breaking && (
            <p data-testid="update-major">
              Its notes ask you to do something before or after updating: read them below first.{auto ? " Major releases wait for you, even with automatic updates on." : ""}
            </p>
          )}
          {l.prerelease && <p>A nightly beta: it reaches Stable after a day with no reported problem. You get these because the channel is Beta (nightly).</p>}
          {state.ended?.reason ? (
            <p data-testid="update-ended">
              The last press of Update{state.ended.requested_at ? <> (<Time iso={state.ended.requested_at} />)</> : null} didn&apos;t apply it: {state.ended.reason.replace(/\.$/, "")}.
            </p>
          ) : null}
        </StatusCard>
      );
    }

    case "behind":
      return (
        <StatusCard state={id} variant="info" title={<>{state.version} is out, but can&apos;t install yet</>}>
          <p>You&apos;re on {current}. GitHub&apos;s release list doesn&apos;t show {state.version} yet, which usually takes a few minutes. Check for updates again shortly.</p>
        </StatusCard>
      );

    case "development":
      return (
        <StatusCard state={id} variant="neutral" title="Development build">
          <p>This install was deployed from source, not a published release, so there is no version to compare with new releases.</p>
        </StatusCard>
      );

    case "unreachable":
      return (
        <StatusCard state={id} variant="warning" title="Couldn't check for updates">
          <p>GitHub didn&apos;t answer, so it isn&apos;t known whether a newer release is out. You&apos;re on {current}.</p>
        </StatusCard>
      );

    case "stale":
      return (
        <StatusCard state={id} variant="warning" title="Not checked for updates lately">
          <p data-testid="update-stale">
            You&apos;re on {current}. The list of releases was last read {state.fetchedAt ? <Time iso={state.fetchedAt} /> : "a while ago"}, so a newer release may be out. Check for updates reads it now.
          </p>
        </StatusCard>
      );

    case "not-checked":
      return (
        <StatusCard state={id} variant="neutral" title="Not checked for updates yet">
          <p>You&apos;re on {current}. Check for updates to see whether a newer release is out.</p>
        </StatusCard>
      );

    case "current": {
      const done = state.done;
      const channel = beta ? " on the Beta (nightly) channel" : "";
      return (
        <StatusCard state={id} variant="success" title={done ? <>Updated to {current}</> : "You're up to date"}>
          <p data-testid="update-detail">
            {done
              ? <>Finished <Time iso={done.finished_at ?? done.started_at} />. You&apos;re up to date{channel}.</>
              : <>Coderhelm {current}{channel}{data.current.released_at ? <>, released <Time iso={data.current.released_at} mode="date" /></> : null}.</>}
            {auto ? <> New releases install by themselves {auto}.</> : null}
          </p>
        </StatusCard>
      );
    }
  }
}

/** Starts the release check over (a check that stalled), then the page reads the state again. */
function CheckAgain({ onChecked }: { onChecked: (c: ModelCheck | null) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={primaryButton}
      disabled={busy}
      data-testid="update-check-again"
      onClick={async () => {
        setBusy(true);
        try {
          onChecked((await api.checkUpdateModels()).model_check);
        } catch (e) {
          toast(failureText("start the check again", e instanceof Error ? e.message : null, errorStatus(e)), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Starting…" : "Check again"}
    </button>
  );
}

/**
 * Under the status: when this install last heard from GitHub's release list,
 * and Check for updates to read it now (the updater reads at most once per
 * 30 seconds).
 */
function ReleaseCheck({ data, onChecked }: { data: SystemVersion; onChecked: (v: SystemVersion) => void }) {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  // "just now" ages into "2 min ago" while the page stays open.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const r = data.releases;
  const at = r?.fetched_at ? new Date(r.fetched_at * 1000).toISOString() : null;
  const check = async () => {
    setChecking(true);
    try {
      onChecked(await api.checkReleases());
    } catch (e) {
      toast(failureText("check for updates", e instanceof Error ? e.message : null, errorStatus(e)), "error");
    } finally {
      setChecking(false);
    }
  };
  const primary = !!r && (!r.fetched_at || !!r.error || !!r.behind || r.stale) && !data.latest;
  return (
    <div data-testid="release-check" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-400">
      <button type="button" className={buttonClass(primary ? "primary" : "secondary", "sm")} onClick={check} disabled={checking}>
        {checking ? "Checking for updates…" : "Check for updates"}
      </button>
      <span data-testid="release-checked" aria-live="polite">
        {checking
          ? null
          : r?.error
            ? at ? <>GitHub didn&apos;t answer the last check. It last answered <Time iso={at} />.</> : "GitHub didn't answer the last check."
            : at ? <>Checked <Time iso={at} /></> : r ? "Not checked yet" : null}
      </span>
    </div>
  );
}

/** Version details: what this version is, how updates arrive, and the facts that tell this install apart (only those known). */
function VersionDetails({ version, autoUpdates, failure }: { version: SystemVersion; autoUpdates: boolean; failure: FailedTry | null }) {
  const raw = failure?.reason && isRawReason(failure.reason) ? failure.reason : null;
  const c = version.current;
  const stack = version.native?.stack ?? null;
  const region = version.install?.region ?? null;
  const facts: [string, ReactNode][] = [];
  if (c.version) facts.push(["Version", <span key="v">{c.version}</span>]);
  if (c.commit) {
    facts.push([
      "Commit",
      <a key="c" href={`${RELEASE_REPO_URL}/commit/${encodeURIComponent(c.commit)}`} target="_blank" rel="noopener noreferrer" className={linkButton}>
        <Code>{c.commit.slice(0, 12)}</Code>
      </a>,
    ]);
  }
  if (c.released_at) facts.push(["Released", <Time key="r" iso={c.released_at} mode="date" />]);
  if (c.config_fingerprint) facts.push(["Config fingerprint", <Code key="f">{c.config_fingerprint}</Code>]);
  if (stack) facts.push(["Stack", <Code key="s">{stack}</Code>]);
  if (region) facts.push(["Region", <Code key="g">{region}</Code>]);
  return (
    <div data-testid="version-details" className="space-y-2">
      <p>
        {c.version
          ? <>This install runs Coderhelm {c.version}, a signed release built from the public Coderhelm source{c.commit ? " at the commit below" : ""}. Every service and this dashboard carry the same version.</>
          : "This install was deployed from a source checkout rather than a published release, so it has no release version."}{" "}
        {version.native ? "A new release shows at the top of this section; Update prepares the change to your stack first, then applies it." : "A new release shows at the top of this section with its notes; Update now installs it."}{" "}
        {autoUpdates ? "Automatic updates are on, so releases also install by themselves during your maintenance window." : "Automatic updates are off: nothing changes until an admin updates."}
      </p>
      {facts.length > 0 && (
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3" data-testid="version-facts">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="min-w-0 text-zinc-200">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {raw && (
        <div data-testid="update-failed-raw">
          <p className="mb-1 text-zinc-300">What AWS said when the update to {failure!.version} stopped:</p>
          <CodeBlock code={raw} wrap maxHeightClass="max-h-48" label="AWS message" />
        </div>
      )}
      {c.config_fingerprint && <p>The config fingerprint is a short hash of this install&apos;s settings: it changes when the configuration does, without showing it.</p>}
    </div>
  );
}

/**
 * A release's notes for this page: only what changed. The install, update
 * and doctor commands and the "cut automatically" line are for the GitHub
 * release page, not for someone pressing Update here.
 */
function releaseChanges(md: string): string {
  return md
    .split("\n")
    .filter((l) => !/^Self-host release \S+, cut automatically/.test(l))
    .filter((l) => !/^Install: `npx /.test(l))
    .filter((l) => !/^\*\*Full list of changes:\*\*/.test(l))
    .filter((l) => !/^#{1,3}\s*What changed\s*$/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first `n` list items (and the headings among them) of a markdown list. */
function firstItems(md: string, n: number): { text: string; total: number } {
  const lines = md.split("\n");
  const total = lines.filter((l) => /^\s*[-*] /.test(l)).length;
  if (total <= n) return { text: md, total };
  const out: string[] = [];
  let seen = 0;
  for (const l of lines) {
    if (/^\s*[-*] /.test(l)) {
      if (seen === n) break;
      seen += 1;
    }
    out.push(l);
  }
  return { text: out.join("\n").trim(), total };
}

const NOTES_SHOWN = 5;

function ReleaseNotes({ version, notes, url }: { version: string; notes: string; url?: string }) {
  const [all, setAll] = useState(false);
  const changes = releaseChanges(notes || "");
  const { text, total } = firstItems(changes, NOTES_SHOWN);
  return (
    <div className="min-w-0 px-4 py-4" data-testid="release-notes">
      <h3 className="mb-2 text-sm font-medium text-zinc-100">What changed in {version}</h3>
      <div className="min-w-0 text-sm text-zinc-300">
        <Markdown>{(all ? changes : text) || "No notes for this release."}</Markdown>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {total > NOTES_SHOWN && (
          <button type="button" className={linkButton} onClick={() => setAll(!all)} aria-expanded={all} data-testid="release-notes-more">
            {all ? "Show fewer" : `Show all ${total} changes`}
          </button>
        )}
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className={linkButton}>Release page</a>}
      </div>
    </div>
  );
}

/**
 * Install health: the checks Coderhelm runs on itself (its address, GitHub,
 * email, Claude, its queues), apart from updates. All passing is one line;
 * a check that fails or warns is listed with its fix. An update only starts
 * while no check fails, and the Version status says so.
 */
function InstallHealth({ pre, state, blocking, onRecheck }: { pre: SystemPreflight | null; state: "loading" | "ready" | "failed"; blocking: Set<string>; onRecheck: () => void }) {
  const checks = pre?.checks ?? [];
  const failing = checks.filter((c) => c.status === "fail");
  const warning = checks.filter((c) => c.status === "warn");
  const passing = checks.filter((c) => c.status === "pass").length;
  const optional = checks.filter((c) => c.status === "skip").length;
  const health = !pre ? state : failing.length ? "failing" : warning.length ? "warning" : "healthy";
  const rerun = (
    <button type="button" className={buttonClass("secondary", "sm")} onClick={onRecheck} disabled={state === "loading"}>
      {state === "loading" ? "Running checks…" : "Re-run checks"}
    </button>
  );
  const dot = failing.length ? "bg-red-400" : warning.length ? "bg-amber-400" : "bg-emerald-400";
  const headline = failing.length
    ? `${plural(failing.length, "check")} ${failing.length === 1 ? "fails" : "fail"}`
    : warning.length
      ? `Nothing fails, ${plural(warning.length, "check")} ${warning.length === 1 ? "needs" : "need"} a look`
      : `All ${plural(passing, "check")} pass`;
  return (
    <div className="min-w-0" data-testid="install-health" data-state={health}>
      {state === "loading" && !pre && <div className="px-4 py-4"><Skeleton className="h-6 w-full" /></div>}
      {state === "failed" && !pre && (
        <div className="px-4 py-4">
          <Callout variant="warning" title="Couldn't run the checks" actions={rerun}>
            <p>Run the same checks from your machine:</p>
            <div className="mt-2"><CodeBlock code={DOCTOR} lang="bash" label="Doctor command" /></div>
          </Callout>
        </div>
      )}
      {pre && (
        <div className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-zinc-100" data-testid="health-summary">
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
              {headline}
            </p>
            <p className="mt-0.5 text-sm text-zinc-400">
              {failing.some((c) => blocking.has(c.key)) ? `Updates won't start until ${failing.length === 1 ? "it passes" : "they pass"}. ` : ""}
              {optional ? `${plural(optional, "optional check")} not set up. ` : ""}
              Checked <Time iso={pre.checked_at} />.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {rerun}
            <Link href="/settings/setup" className={linkButton}>See every check</Link>
          </div>
        </div>
      )}
      {pre && failing.length + warning.length > 0 && (
        <ul className="divide-y divide-zinc-800 border-t border-zinc-800" aria-label="Checks that need a fix or a look">
          {[...failing, ...warning].map((c) => (
            <CheckRow key={c.key} check={c}>
              {blocking.has(c.key) && <p className="mt-2"><Chip tone="danger">Stops updates</Chip></p>}
            </CheckRow>
          ))}
        </ul>
      )}
    </div>
  );
}

