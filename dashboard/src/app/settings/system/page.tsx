"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, type AutoUpdateSettings, type SystemPreflight, type SystemVersion, type UpdateBlocker, type UpdateEntry } from "@/lib/api";
import { FixBlock } from "@/components/install-checks";
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

/** Settings, then System: the install's version, update readiness, updates and their history (self-hosted, install admins). */
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
      form.reset({ ...DEFAULTS, ...(v.settings ?? {}) });
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
      <PageHeader title="Version and updates" lead="Which version of Coderhelm runs here, how it is updated, and every update so far." />
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
  // The update itself (running, or the last try that failed) is the status
  // at the top, never also a blocker of itself.
  const shownBlockers = (pre?.blockers ?? []).filter((b) => b.key !== "running" && b.key !== "failed_before");
  const failure = failedTry(data, pre);
  const blocked = shownBlockers.some((b) => b.severity === "block");

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
        const r = await api.updateNow(latest?.version, skipCheck);
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
        {latest && data.model_check?.version === latest.version && (
          <UpdateNeedsAction
            check={data.model_check}
            onChecked={(c) => {
              setData({ ...data, model_check: c });
              loadPreflight();
            }}
            onSkip={() => start("update", true)}
          />
        )}
        <SettingsSection id="version" title="Version">
          <div className="min-w-0 space-y-3 px-4 py-4">
            <UpdateStatus data={data} failure={failure} blocked={blocked} busy={busy} onUpdate={() => start("update")} onChanged={load} />
            <SettingsMore summary="Technical details">
              <VersionDetails version={data} autoUpdates={!!data.settings?.auto} failure={failure} />
            </SettingsMore>
          </div>
          {latest && !pending && <ReleaseNotes version={latest.version} notes={latest.notes} url={latest.url} />}
          <div id="readiness" className="scroll-mt-6">
            <Readiness pre={pre && { ...pre, blockers: shownBlockers }} state={preState} onRecheck={loadPreflight} />
          </div>
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
            label="Channel"
            help="Preview: get new versions earlier, before they are fully tested."
            control={(ids) => (
              <Select
                id={ids.inputId}
                value={v.channel}
                onChange={(c) => set("channel", c)}
                options={[
                  { value: "stable", label: "Stable" },
                  { value: "preview", label: "Preview" },
                ]}
              />
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
                          ? `Back on ${h.from_version ?? "the previous version"}; your data is untouched. Fix what Setup lists, then update to ${h.version} again. Automatic updates skip it until then.`
                          : "The install may be unhealthy. Check Setup for what fails and how to fix it, or roll back below."}{" "}
                        <Link href="/settings/setup" className={linkButton}>Open Setup</Link>
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

/**
 * The one status at the top of Version: up to date, an update to install,
 * an update on its way, or the last one that didn't work, each with the one
 * thing to do.
 */
function UpdateStatus({
  data,
  failure,
  blocked,
  busy,
  onUpdate,
  onChanged,
}: {
  data: SystemVersion;
  failure: FailedTry | null;
  blocked: boolean;
  busy: "" | "update" | "rollback";
  onUpdate: () => void;
  onChanged: () => void;
}) {
  const current = data.current.version;
  const latest = data.latest;
  const pending = data.native?.pending ?? null;
  const on = current ?? "a development build";

  if (pending) {
    const t = runningTry(data);
    return (
      <div data-testid="update-status" data-state={pending.status === "review" ? "review" : "updating"}>
        <NativeUpdateCard native={data.native!} onChanged={onChanged} startedAt={t?.started_at} from={current} />
      </div>
    );
  }

  if (data.running) {
    const t = runningTry(data);
    const to = t?.version ?? latest?.version ?? "the new version";
    return (
      <div data-testid="update-status" data-state="updating">
        <Callout variant="info" title={<>Updating to {to}…</>}>
          <p>
            {t?.started_at ? <>Started <Time iso={t.started_at} />. </> : null}
            This takes 10 to 20 minutes. Coderhelm stays available on {on} while it runs, and this page follows it.
          </p>
          <Working label={`Updating to ${to}`} />
        </Callout>
      </div>
    );
  }

  if (failure) {
    const rolledBack = failure.status !== "failed";
    const plain = failure.reason && !isRawReason(failure.reason) ? sentence(failure.reason) : null;
    const retry = latest?.version === failure.version;
    return (
      <div data-testid="update-status" data-state="failed">
        <Callout
          variant="error"
          title={<>The update to {failure.version} didn&apos;t work</>}
          actions={
            <>
              {retry && (
                <button type="button" className={primaryButton} disabled={!!busy || blocked} onClick={onUpdate} data-testid="update-retry">
                  {busy === "update" ? "Starting…" : "Try again"}
                </button>
              )}
              <Link href="/settings/setup" className={secondaryButton}>Open Setup</Link>
              {latest?.url && retry && <a href={latest.url} target="_blank" rel="noopener noreferrer" className={linkButton}>Release page</a>}
            </>
          }
        >
          <p data-testid="update-failed-state">
            {rolledBack
              ? <>Nothing changed: you&apos;re still on {on}, and your data is untouched.</>
              : <>It stopped partway, so this install may not be healthy. It reports {on}.</>}
            {failure.startedAt ? <> Tried <Time iso={failure.startedAt} />.</> : null}
          </p>
          {plain && <p data-testid="update-failed-reason">{plain}</p>}
          {!plain && <p data-testid="update-failed-reason">It stopped on an error from AWS. AWS&apos;s own message is under Technical details below.</p>}
          <p className="text-zinc-300">
            {rolledBack
              ? "Fix what Setup lists as failing, then try again."
              : "Check Setup for what fails and how to fix it, or roll back under Update history."}
            {failure.status !== "not_started" ? ` Automatic updates skip ${failure.version} until it works.` : ""}
            {blocked ? " Something below blocks a new try; fix it first." : ""}
          </p>
        </Callout>
      </div>
    );
  }

  if (latest) {
    return (
      <div data-testid="update-status" data-state="available" className="flex min-w-0 flex-col gap-3 rounded-lg border border-blue-500/25 bg-blue-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-zinc-50">
            You&apos;re on {on} · {latest.version} is available
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            {latest.published_at && <span>Released <Time iso={latest.published_at} mode="date" /></span>}
            {latest.breaking && <Chip tone="danger">Major: read the notes</Chip>}
            {latest.prerelease && <Chip tone="neutral">Preview</Chip>}
          </p>
          {blocked && <p id="update-blocked" className="mt-1 text-sm text-red-300">Fix what blocks the update below first.</p>}
        </div>
        <button
          type="button"
          className={`${primaryButton} shrink-0 self-start sm:self-center`}
          disabled={!!busy || blocked}
          onClick={onUpdate}
          aria-describedby={blocked ? "update-blocked" : undefined}
        >
          {busy === "update" ? "Starting…" : data.native ? `Update to ${latest.version}` : `Update now to ${latest.version}`}
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div data-testid="update-status" data-state="development">
        <Callout variant="neutral" title="This install runs a development build">
          <p>It was deployed from a source checkout, not a published release, so there is no version to compare with new releases.</p>
        </Callout>
      </div>
    );
  }

  return (
    <div data-testid="update-status" data-state="current">
      <Callout variant="success" title={<>You&apos;re up to date ({current})</>}>
        {data.current.released_at ? <p>Released <Time iso={data.current.released_at} mode="date" />.</p> : null}
      </Callout>
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

/** The preflight: one line when nothing stops an update; each blocker with its fix, up front, when something does. */
function Readiness({ pre, state, onRecheck }: { pre: SystemPreflight | null; state: "loading" | "ready" | "failed"; onRecheck: () => void }) {
  const failing = pre?.checks.filter((c) => c.status === "fail").length ?? 0;
  const warning = pre?.checks.filter((c) => c.status === "warn").length ?? 0;
  const fine = (pre?.checks.length ?? 0) - failing - warning;
  const blockers: UpdateBlocker[] = pre?.blockers ?? [];
  const recheck = (
    <button type="button" className={buttonClass("ghost", "sm")} onClick={onRecheck} disabled={state === "loading"}>
      {state === "loading" ? "Checking…" : "Check again"}
    </button>
  );
  const counts = pre && (
    <span data-testid="doctor-summary">
      {`${fine} check${fine === 1 ? "" : "s"} fine`}
      {warning ? `, ${warning} warning${warning === 1 ? "" : "s"}` : ""}
      {failing ? `, ${failing} failing` : ""}
    </span>
  );
  return (
    <div className="min-w-0 px-4 py-3" data-testid="update-readiness" data-state={blockers.length ? "attention" : pre ? "ready" : state}>
      {state === "loading" && !pre && <Skeleton className="h-6 w-full" />}
      {state === "failed" && !pre && (
        <Callout variant="error" title="Couldn't check update readiness">
          <p>Run the same checks from your machine:</p>
          <div className="mt-2"><CodeBlock code={DOCTOR} lang="bash" label="Doctor command" /></div>
        </Callout>
      )}
      {pre && blockers.length === 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
            Ready to update
          </span>
          <span aria-hidden="true">·</span>
          {counts}
          <Link href="/settings/setup" className={linkButton}>See every check</Link>
          {recheck}
        </div>
      )}
      {pre && blockers.length > 0 && (
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-zinc-100">
            {blockers.some((b) => b.severity === "block") ? "What stops an update" : "Read before updating"}
          </h3>
          <ul className="mt-2 space-y-3" aria-label="What would stop or pause an update">
            {blockers.map((b) => (
              <li key={b.key} data-severity={b.severity} className={`min-w-0 rounded-lg border p-3 ${b.severity === "block" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-100">
                  <Chip tone={b.severity === "block" ? "danger" : "waiting"}>{b.severity === "block" ? "Blocks the update" : "Read first"}</Chip>
                </p>
                <p className="mt-1 break-words text-sm text-zinc-200">{b.detail}</p>
                <FixBlock fix={b.fix} />
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            Install checks: {counts}.
            <Link href="/settings/setup" className={linkButton}>See every check</Link>
            {recheck}
          </p>
        </div>
      )}
    </div>
  );
}
