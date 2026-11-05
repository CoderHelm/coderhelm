"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, type AutoUpdateSettings, type SystemPreflight, type SystemVersion, type UpdateBlocker, type UpdateEntry } from "@/lib/api";
import { CheckRow } from "@/components/install-checks";
import { DomainSection } from "@/components/domain-section";
import { HybridSection } from "@/components/hybrid-section";
import { UninstallSection } from "@/components/uninstall-section";
import { NativeUpdateCard } from "@/components/native-update";
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

  const load = useCallback(async () => {
    try {
      const v = await api.getSystemVersion();
      setData(v);
      setError(false);
      form.reset(withChannel(v.settings));
    } catch {
      setError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // While an update prepares or runs, follow it: the card and the history
  // move along without a reload (the updater checks the stack every 5 minutes).
  const following = !!data && (!!data.running || ["preparing", "running"].includes(data.native?.pending?.status ?? ""));
  useEffect(() => {
    if (!following) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [following, load]);

  const header = (
    <div className="mb-6">
      <PageHeader title="Version and updates" lead="Which version of Coderhelm runs here, new releases, the health of the install, and every update so far." />
    </div>
  );

  if (error) {
    return (
      <Page>
        {header}
        <Callout variant="error" title="Could not load this install's version">
          <button type="button" onClick={load} className={`mt-2 ${secondaryButton}`}>Try again</button>
        </Callout>
      </Page>
    );
  }
  if (!data) {
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
  // A prepared or applying update is shown once, in its own card, with the
  // one thing to do; it is never also listed as something blocking itself.
  const pending = data.native?.pending ?? null;
  const failure = failedTry(data, pre);
  // What stops an update now: install checks that fail (listed under Install
  // health), or an updater that didn't answer. The update itself (running,
  // or its last try) and the model check have their own status, and a major
  // release's notes are said in the status, so none of those repeat here.
  const blockers = (pre?.blockers ?? []).filter((b) => b.severity === "block");
  const checkKeys = new Set((pre?.checks ?? []).map((c) => c.key));
  const blocking = new Set(blockers.filter((b) => checkKeys.has(b.key)).map((b) => b.key));
  const hold: UpdateHold = { checks: blocking.size, updater: blockers.find((b) => b.key === "updater") ?? null };
  const modelBlock = !!latest && data.model_check?.version === latest.version && !data.model_check.ok;

  const save = async () => {
    try {
      const r = await api.setAutoUpdate(form.values);
      form.reset({ ...DEFAULTS, ...r.settings });
      toast("Update settings saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "error");
    }
  };

  const start = async (kind: "update" | "rollback", skipCheck = false) => {
    setBusy(kind);
    try {
      if (kind === "update") {
        // No version: the updater reads GitHub first and installs the newest
        // release at this moment. Skipping a model check names the release
        // whose check the admin read.
        const r = await api.updateNow(skipCheck ? data.model_check?.version : undefined, skipCheck);
        if (!r.ok) {
          // A model the release calls was refused: show which, with its fix.
          if (r.model_check) setData({ ...data, model_check: r.model_check });
          toast(r.error, "error");
          loadPreflight();
          return;
        }
        toast(data.native ? `Preparing ${r.version}, then it applies. This takes 10 to 20 minutes.` : `Updating to ${r.version}. This takes 10 to 20 minutes.`);
      } else {
        const e = await api.rollbackInstall();
        toast(`Rolling back to ${e.version}.`);
      }
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start", "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <Page>
      {header}
      <div className="space-y-8">
        <SettingsSection id="version" title="Version">
          <div className="min-w-0 space-y-3 px-4 py-4">
            <UpdateStatus
              data={data}
              failure={failure}
              hold={hold}
              modelBlock={modelBlock}
              busy={busy}
              onUpdate={() => start("update")}
              onChanged={load}
              onModelChecked={(c) => {
                setData({ ...data, model_check: c });
                loadPreflight();
              }}
              onSkipModel={() => start("update", true)}
            />
            {failure && modelBlock && (
              <div id="readiness" className="scroll-mt-6">
                <UpdateNeedsAction check={data.model_check} onChecked={(c) => { setData({ ...data, model_check: c }); loadPreflight(); }} onSkip={() => start("update", true)} />
              </div>
            )}
            {!data.running && !pending && data.current.version && <ReleaseCheck data={data} onChecked={setData} />}
            <SettingsMore summary="Technical details">
              <VersionDetails version={data} autoUpdates={!!data.settings?.auto} failure={failure} />
            </SettingsMore>
          </div>
          {latest && !pending && <ReleaseNotes version={latest.version} notes={latest.notes} url={latest.url} />}
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
          <div className="px-4 py-4">
            <button type="button" className={secondaryButton} disabled={!canRollBack || !!busy || data.running} onClick={() => start("rollback")}>
              {busy === "rollback" ? "Starting…" : "Roll back to the previous version"}
            </button>
          </div>
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

/** The last try at an update that didn't land, while this install is still not on it. */
interface FailedTry {
  version: string;
  status: "failed" | "rolled_back" | "not_started";
  /** The updater's reason: shown as is only when it reads as a sentence. */
  reason: string | null;
  from: string | null;
  startedAt: string | null;
}

/**
 * The newest update in the history, when it didn't succeed and this install
 * isn't on that version (a later success, or a roll back an admin chose,
 * ends it). Older updaters only say so in the readiness blocker.
 */
function failedTry(data: SystemVersion, pre: SystemPreflight | null): FailedTry | null {
  if (data.running || data.native?.pending) return null;
  const last = (data.history ?? []).find((h) => h.mode !== "rollback");
  const newest = (data.history ?? [])[0];
  if (last && newest === last && ["failed", "rolled_back", "not_started"].includes(last.status) && last.version !== data.current.version) {
    return {
      version: last.version,
      status: last.status as FailedTry["status"],
      reason: last.reason ?? null,
      from: last.from_version ?? data.current.version,
      startedAt: last.started_at ?? null,
    };
  }
  const b = pre?.blockers.find((x) => x.key === "failed_before");
  if (b && data.latest) {
    const m = b.detail.match(/didn't succeed: (.*?)\.?$/);
    return { version: data.latest.version, status: "rolled_back", reason: m?.[1] ?? null, from: data.current.version, startedAt: null };
  }
  return null;
}

/** Raw AWS text (an ARN, a resource type, a handler error) belongs under Technical details. */
function isRawReason(r: string): boolean {
  return /arn:aws|[A-Z][A-Za-z0-9]+::[A-Z][A-Za-z0-9]+|Resource handler returned|\bstatus code\b|Exception\b|\bRequestId\b/i.test(r) || r.length > 240;
}

function sentence(r: string): string {
  const t = r.trim().replace(/\.$/, "");
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
}

/** The update in progress: its version and when it started, from the history. */
function runningTry(data: SystemVersion): UpdateEntry | null {
  const h = data.history ?? [];
  const id = data.native?.pending?.id;
  return (id ? h.find((e) => e.id === id) : undefined) ?? h.find((e) => e.status === "running" || e.status === "preparing") ?? null;
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

/** Why an update can't start now, from the preflight: failing install checks, or an updater that didn't answer. */
interface UpdateHold {
  /** Install checks that fail and stop an update (shown under Install health). */
  checks: number;
  /** The updater in the AWS account didn't answer. */
  updater: UpdateBlocker | null;
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

/** The newest update succeeded in the last day and is what runs: "Updated to v0.8.32". */
function recentSuccess(data: SystemVersion): UpdateEntry | null {
  const newest = (data.history ?? [])[0];
  if (!newest || newest.mode === "rollback" || newest.status !== "succeeded" || newest.version !== data.current.version) return null;
  const at = newest.finished_at ?? newest.started_at;
  if (!at || Date.now() - new Date(at).getTime() > 24 * 3600_000) return null;
  return newest;
}

/**
 * The one status at the top of Version, about updates only (the install's
 * own health is its own section): up to date, a release to install, one on
 * its way, or the last one that didn't work, each with the one thing to do.
 */
function UpdateStatus({
  data,
  failure,
  hold,
  modelBlock,
  busy,
  onUpdate,
  onChanged,
  onModelChecked,
  onSkipModel,
}: {
  data: SystemVersion;
  failure: FailedTry | null;
  hold: UpdateHold;
  /** The release's model check holds it (or is still running). */
  modelBlock: boolean;
  busy: "" | "update" | "rollback";
  onUpdate: () => void;
  onChanged: () => void;
  onModelChecked: (c: SystemVersion["model_check"]) => void;
  onSkipModel: () => void;
}) {
  const current = data.current.version;
  const latest = data.latest;
  const pending = data.native?.pending ?? null;
  const on = current ?? "a development build";
  const auto = windowText(data.settings);
  const beta = withChannel(data.settings).channel === "beta";
  const healthLink = <a href="#health" className={linkButton}>See install health</a>;

  if (pending) {
    const t = runningTry(data);
    return (
      <div data-testid="update-status" data-state={pending.status === "review" ? "review" : pending.status === "preparing" ? "preparing" : "updating"}>
        <NativeUpdateCard native={data.native!} onChanged={onChanged} startedAt={t?.started_at} from={current} />
      </div>
    );
  }

  if (data.running) {
    const t = runningTry(data);
    const to = t?.version ?? latest?.version ?? "the new version";
    return (
      <StatusCard state="updating" variant="info" title={<>Updating to {to}…</>}>
        <p>
          {t?.started_at ? <>Started <Time iso={t.started_at} />. </> : null}
          This takes 10 to 20 minutes. Coderhelm keeps running {on} until it finishes, and this page updates by itself.
        </p>
        <Working label={`Updating to ${to}`} />
      </StatusCard>
    );
  }

  if (failure) {
    const plain = failure.reason && !isRawReason(failure.reason) ? sentence(failure.reason) : null;
    const retry = latest?.version === failure.version;
    const held = modelBlock || hold.checks > 0 || !!hold.updater;
    const title =
      failure.status === "not_started"
        ? <>The update to {failure.version} couldn&apos;t start</>
        : failure.status === "rolled_back"
          ? <>The update to {failure.version} didn&apos;t finish</>
          : <>The update to {failure.version} stopped partway</>;
    return (
      <StatusCard
        state="failed"
        variant="error"
        title={title}
        actions={
          <>
            {retry && (
              <button type="button" className={primaryButton} disabled={!!busy || held} onClick={onUpdate} data-testid="update-retry">
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
          {held
            ? "Fix what Install health lists, then try again."
            : failure.status === "failed"
              ? "Fix what Install health lists and try again, or roll back under Update history."
              : "If Install health below lists a check that fails, fix it first."}
          {failure.status !== "not_started" ? ` Automatic updates skip ${failure.version} until it works.` : ""}
        </p>
      </StatusCard>
    );
  }

  if (latest && modelBlock && data.model_check) {
    return (
      <div data-testid="update-status" data-state={data.model_check.pending ? "checking-release" : "needs-action"} id="readiness" className="scroll-mt-6">
        <UpdateNeedsAction check={data.model_check} onChecked={onModelChecked} onSkip={onSkipModel} />
      </div>
    );
  }

  if (latest && hold.updater) {
    return (
      <StatusCard state="updater-down" variant="warning" title={<>{latest.version} is available, but can&apos;t install from here</>}>
        <p>You&apos;re on {on}. The updater in your AWS account didn&apos;t answer, so update from your machine instead:</p>
        <div className="mt-2"><CodeBlock code={hold.updater.fix.command ?? `${DOCTOR.replace(/ doctor$/, "")} update`} lang="bash" label="Update command" /></div>
      </StatusCard>
    );
  }

  if (latest && hold.checks > 0) {
    return (
      <StatusCard
        state="blocked"
        variant="warning"
        title={<>{latest.version} is available, but can&apos;t install yet</>}
        actions={<a href="#health" className={primaryButton} data-testid="update-see-fix">See what to fix</a>}
      >
        <p data-testid="update-blocked">
          You&apos;re on {on}. Fix the {hold.checks === 1 ? "install check" : `${hold.checks} install checks`} marked Stops updates below, then update.
        </p>
      </StatusCard>
    );
  }

  if (latest) {
    const majorWaits = latest.breaking && data.settings?.majors !== "auto";
    return (
      <StatusCard
        state="available"
        variant="info"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {latest.version} is available
            {latest.breaking && <Chip tone="waiting">Major release</Chip>}
            {latest.prerelease && <Chip tone="neutral">Beta</Chip>}
          </span>
        }
        actions={
          <button type="button" className={primaryButton} disabled={!!busy} onClick={onUpdate} data-testid="update-now">
            {busy === "update" ? "Starting…" : `Update to ${latest.version}`}
          </button>
        }
      >
        <p data-testid="update-detail">
          You&apos;re on {on}.{latest.published_at ? <> {latest.version} came out <Time iso={latest.published_at} mode="date" />.</> : null}
          {auto && !majorWaits ? <> It installs by itself {auto}, or update now.</> : null}
        </p>
        {latest.breaking && (
          <p data-testid="update-major">
            Its notes ask you to do something before or after updating: read them below first.{auto ? " Major releases wait for you, even with automatic updates on." : ""}
          </p>
        )}
        {latest.prerelease && <p>A nightly beta: it reaches Stable after a day with no reported problem. You get these because the channel is Beta (nightly).</p>}
      </StatusCard>
    );
  }

  const behind = data.releases?.behind;
  if (behind && current) {
    return (
      <StatusCard state="behind" variant="info" title={<>{behind.version} is out, but can&apos;t install yet</>}>
        <p>You&apos;re on {current}. GitHub&apos;s release list doesn&apos;t show {behind.version} yet, which usually takes a few minutes. Check for updates again shortly.</p>
      </StatusCard>
    );
  }

  if (!current) {
    return (
      <StatusCard state="development" variant="neutral" title="Development build">
        <p>This install was deployed from source, not a published release, so there is no version to compare with new releases.</p>
      </StatusCard>
    );
  }

  if (data.releases?.error) {
    return (
      <StatusCard state="unreachable" variant="warning" title="Couldn't check for updates">
        <p>GitHub didn&apos;t answer, so it isn&apos;t known whether a newer release is out. You&apos;re on {current}.</p>
      </StatusCard>
    );
  }

  if (data.releases && !data.releases.fetched_at) {
    return (
      <StatusCard state="not-checked" variant="neutral" title="Not checked for updates yet">
        <p>You&apos;re on {current}. Check for updates to see whether a newer release is out.</p>
      </StatusCard>
    );
  }

  const done = recentSuccess(data);
  const channel = beta ? " on the Beta (nightly) channel" : "";
  return (
    <StatusCard state="current" variant="success" title={done ? <>Updated to {current}</> : "You're up to date"}>
      <p data-testid="update-detail">
        {done
          ? <>Finished <Time iso={done.finished_at ?? done.started_at} />. You&apos;re up to date{channel}.</>
          : <>Coderhelm {current}{channel}{data.current.released_at ? <>, released <Time iso={data.current.released_at} mode="date" /></> : null}.</>}
        {auto ? <> New releases install by themselves {auto}.</> : null}
      </p>
    </StatusCard>
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
      toast(e instanceof Error ? e.message : "Could not check for updates", "error");
    } finally {
      setChecking(false);
    }
  };
  const primary = !!r && (!r.fetched_at || !!r.error || !!r.behind) && !data.latest;
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

