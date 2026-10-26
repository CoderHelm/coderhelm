"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  manualTrigger,
  pluginsApi,
  PluginError,
  runHref,
  trackText,
  TRIGGER_LABEL,
  RUN_STATUS,
  type InstalledPlugin,
  type PluginRun,
  type PluginVersion,
  type TrackKind,
} from "@/lib/plugins";
import { formatTokens } from "@/lib/usage";
import { useCan } from "@/hooks/use-can";
import { PluginsGate, Refusal, RiskChip, RunStatusChip } from "@/components/plugins";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { Chip, List, ListEmpty, ListError, ListRow, ListSkeleton } from "@/components/list";
import { Field, SecretInput } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { Code } from "@/components/settings/code";
import { Switch } from "@/components/teams-webhook";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { dangerButton, inputClass, monoInputClass, primaryButton, secondaryButton } from "@/components/ui";

export default function PluginPageGated() {
  return (
    <PluginsGate title="Plugin">
      <Suspense fallback={<Page><ListSkeleton rows={4} label="Loading the plugin" /></Page>}>
        <PluginPage />
      </Suspense>
    </PluginsGate>
  );
}

function errorOf(e: unknown): { code: string; message: string } {
  if (e instanceof PluginError) return { code: e.code, message: e.message };
  return { code: "", message: e instanceof Error ? e.message : "The request failed." };
}

function PluginPage() {
  const id = useSearchParams().get("id") ?? "";
  const { can } = useCan();
  // Installing, updates, settings, limits and approvers: `plugins.install`; starting runs: `plugins.run`.
  const isAdmin = can("plugins.install");
  const isMember = can("plugins.run");
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [plugin, setPlugin] = useState<InstalledPlugin | null>(null);
  const [versions, setVersions] = useState<PluginVersion[]>([]);
  const [runs, setRuns] = useState<PluginRun[]>([]);
  const [error, setError] = useState("");
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, r] = await Promise.all([pluginsApi.get(id), pluginsApi.runs(id).catch(() => ({ runs: [] as PluginRun[] }))]);
      setPlugin(p.plugin);
      setVersions(p.versions);
      setRuns(r.runs);
      setError("");
    } catch (e) {
      setError(errorOf(e).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<{ plugin?: InstalledPlugin } | unknown>, done: string) => {
    setBusy(key);
    setRefusal(null);
    try {
      const r = (await fn()) as { plugin?: InstalledPlugin } | undefined;
      if (r && typeof r === "object" && "plugin" in r && r.plugin) setPlugin(r.plugin);
      toast(done);
      await load();
      return true;
    } catch (e) {
      const r = errorOf(e);
      setRefusal(r);
      toast(r.message, "error");
      return false;
    } finally {
      setBusy("");
    }
  };

  if (!id) return <Page><ListEmpty title="No plugin picked">Open a plugin from the Plugins page.</ListEmpty></Page>;
  if (error && !plugin) {
    return (
      <Page>
        <PageHeader detail title="Plugin" />
        <div className="mt-6">
          <ListError title="We couldn't load this plugin" onRetry={load}>
            {error}
          </ListError>
        </div>
      </Page>
    );
  }
  if (!plugin) return <Page><ListSkeleton rows={4} label="Loading the plugin" /></Page>;

  const p = plugin;
  const pend = p.pending;
  const manual = manualTrigger(p);
  const statusChip =
    p.status === "pending_install" ? <Chip tone="waiting">Waiting for a second admin</Chip> : p.status === "disabled" ? <Chip tone="muted">Off</Chip> : <Chip tone="success">On</Chip>;

  const uninstall = async () => {
    const ok = await confirm({
      title: `Uninstall ${p.name}?`,
      message: "Its schedules stop and its settings are deleted. Drafts it wrote stay in the review history.",
      confirmLabel: "Uninstall",
      destructive: true,
    });
    if (!ok) return;
    if (await act("uninstall", () => pluginsApi.uninstall(p.id), `${p.name} uninstalled`)) router.push("/plugins");
  };

  return (
    <Page>
      <PageHeader
        detail
        title={p.name}
        eyebrow={`Plugin · version ${p.version}`}
        status={statusChip}
        lead={p.description}
        more={isAdmin ? [{ label: "Uninstall", onSelect: () => void uninstall(), danger: true }] : undefined}
      />

      {refusal && (
        <div className="mt-6">
          <Refusal code={refusal.code} message={refusal.message} />
        </div>
      )}

      {pend && (
        <Section id="pending" title={pend.kind === "install" ? "Install waiting for approval" : "Update waiting for approval"}>
          <div className={`${cardClass} border-amber-500/30`} data-testid="pending-card">
            <p className="text-sm text-zinc-300">
              {pend.kind === "install" ? (
                <>
                  {pend.requested_by} asked to install version {pend.version}.
                </>
              ) : (
                <>
                  Version {pend.version} adds or widens what this plugin may do, so it waits here. The team keeps running version {p.version} until an admin
                  approves.
                </>
              )}
            </p>
            {pend.widened.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-200" data-testid="widened">
                {pend.widened.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {(pend.diff.added.length > 0 || pend.diff.removed.length > 0 || pend.diff.changed.length > 0) && (
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3" data-testid="pending-diff">
                <DiffList title="Added" tone="text-emerald-300" items={pend.diff.added} sign="+" />
                <DiffList title="Removed" tone="text-red-300" items={pend.diff.removed} sign="−" />
                <DiffList title="Changed" tone="text-zinc-300" items={pend.diff.changed} sign="~" />
              </div>
            )}
            <p className="mt-2 text-xs text-zinc-400">
              From commit {pend.sha.slice(0, 12)}, asked by {pend.requested_by}.
            </p>
            {p.can_approve_pending === false && p.why_not && (
              <div className="mt-3">
                <Refusal code={p.why_not} title="You can't approve this one" />
              </div>
            )}
            {isAdmin && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy === "approve" || p.can_approve_pending === false}
                  onClick={() => act("approve", () => pluginsApi.approve(p.id, pend.hash), pend.kind === "install" ? "Installed" : `Now on version ${pend.version}`)}
                >
                  {pend.kind === "install" ? "Approve install" : "Approve update"}
                </button>
                <button type="button" className={secondaryButton} disabled={busy === "decline"} onClick={() => act("decline", () => pluginsApi.decline(p.id, pend.hash), "Declined")}>
                  Decline
                </button>
              </div>
            )}
          </div>
        </Section>
      )}

      {manual && p.status === "active" && isMember && <BriefForm plugin={p} onStarted={load} />}

      <Section id="can-do" title="What it can do">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={cardClass}>
            <h3 className="text-sm font-semibold text-zinc-100">Tools</h3>
            {p.tools.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">None. It only writes drafts.</p>
            ) : (
              <ul className="mt-2 space-y-2" data-testid="plugin-tools">
                {p.tools.map((t) => (
                  <li key={t.name} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <Code>{t.name}</Code>
                    <RiskChip risk={t.risk} />
                    {t.ref && <span className="text-xs text-zinc-400">through {t.ref}</span>}
                    {t.allow && t.allow.length > 0 && <span className="text-xs text-zinc-400">only {t.allow.join(", ")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={cardClass}>
            <h3 className="text-sm font-semibold text-zinc-100">Starts on</h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300" data-testid="plugin-triggers">
              {p.triggers.map((t, i) => (
                <li key={i}>
                  {TRIGGER_LABEL[t.on] ?? t.on}
                  {t.cron && <span className="text-zinc-500"> ({t.cron})</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className={cardClass}>
            <h3 className="text-sm font-semibold text-zinc-100">Makes</h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300" data-testid="plugin-outputs">
              {p.outputs.map((o, i) => (
                <li key={i}>
                  {o.type === "draft" ? `Drafts: ${(o.kinds ?? []).join(", ") || "any kind"}` : `Publishes through ${o.via ?? "a tool"} after ${o.approval?.min ?? 1} approval${(o.approval?.min ?? 1) === 1 ? "" : "s"}`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {(p.skills.length > 0 || p.agents.length > 0) && (
        <Section id="skills" title="Skills and agents" description="Written instructions that come with the plugin. They apply only to this plugin's runs.">
          <List label="Skills and agents">
            {[...p.agents.map((a) => ({ ...a, kind: "Agent" })), ...p.skills.map((s) => ({ ...s, kind: "Skill" }))].map((it) => (
              <ListRow key={it.path} title={it.name} meta={[it.kind, it.path]} summary={it.description} />
            ))}
          </List>
        </Section>
      )}

      <Section id="versions" title="Versions" actions={isAdmin && p.previous ? (
        <button
          type="button"
          className={secondaryButton}
          disabled={busy === "rollback"}
          onClick={() => act("rollback", () => pluginsApi.rollback(p.id), `Back on version ${p.previous?.version}`)}
        >
          Roll back to {p.previous.version}
        </button>
      ) : undefined}>
        <List label="Versions">
          {versions.map((v) => (
            <ListRow
              key={v.hash}
              testId="plugin-version"
              status={{ tone: v.hash === p.hash ? "success" : "muted" }}
              title={`Version ${v.version}`}
              meta={[`commit ${v.sha.slice(0, 12)}`, v.approved_by.length ? `approved by ${v.approved_by.join(", ")}` : null]}
              chips={v.hash === p.hash ? <Chip tone="success">Running</Chip> : p.previous?.hash === v.hash ? <Chip>Previous</Chip> : undefined}
              time={v.created_at}
            />
          ))}
        </List>
      </Section>

      {isAdmin && <UpdateOptions plugin={p} busy={busy} act={act} />}
      {isAdmin && p.settings.length > 0 && <SettingsForm plugin={p} act={act} />}
      {isAdmin && <ApproversForm plugin={p} act={act} />}
      <LimitForm plugin={p} canEdit={isAdmin} act={act} />

      {isAdmin && (
        <Section id="switch" title="Turn on or off">
          <Switch
            checked={p.status === "active"}
            disabled={p.status === "pending_install" || busy === "enabled"}
            label={`Let ${p.name} run`}
            onChange={(on) => act("enabled", () => pluginsApi.setEnabled(p.id, on), on ? `${p.name} is on` : `${p.name} is off`)}
          />
          <p className="mt-4">
            <button type="button" className={dangerButton} onClick={uninstall}>
              Uninstall {p.name}
            </button>
          </p>
        </Section>
      )}

      <Section id="runs" title="Recent runs">
        {runs.length === 0 ? (
          <ListEmpty title="No runs yet">{manual ? "Write a brief above to start one." : "Runs start on the plugin's triggers."}</ListEmpty>
        ) : (
          <List label="Recent runs">
            {runs.map((r) => (
              <ListRow
                key={r.run_id}
                testId="plugin-run"
                status={{ tone: RUN_STATUS[r.status]?.tone ?? "neutral" }}
                title={typeof r.inputs.brief === "string" && r.inputs.brief ? r.inputs.brief : `${TRIGGER_LABEL[r.trigger] ?? r.trigger}`}
                href={runHref(r.run_id)}
                meta={[r.requested_by, `${r.artifacts.length} draft${r.artifacts.length === 1 ? "" : "s"}`, r.tokens ? `${formatTokens(r.tokens)} tokens` : null]}
                chips={<RunStatusChip status={r.status} />}
                time={r.created_at}
              />
            ))}
          </List>
        )}
      </Section>
    </Page>
  );
}

function DiffList({ title, items, tone, sign }: { title: string; items: string[]; tone: string; sign: string }) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</p>
      <ul className={`mt-1 space-y-0.5 ${tone}`}>
        {items.map((i) => (
          <li key={i} className="min-w-0">
            <span aria-hidden="true">{sign} </span>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

type Act = (key: string, fn: () => Promise<unknown>, done: string) => Promise<boolean>;

function BriefForm({ plugin, onStarted }: { plugin: InstalledPlugin; onStarted: () => Promise<void> }) {
  const trig = manualTrigger(plugin)!;
  const form = trig.form && Object.keys(trig.form).length ? trig.form : { brief: "text" as const };
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [repo, setRepo] = useState("");
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const submit = async () => {
    setSending(true);
    setRefusal(null);
    try {
      const r = await pluginsApi.startRun(plugin.id, values, repo.trim());
      toast("Run started");
      await onStarted();
      router.push(runHref(r.run.run_id));
    } catch (e) {
      setRefusal(errorOf(e));
    } finally {
      setSending(false);
    }
  };
  const textOk = Object.entries(form).every(([k, kind]) => kind !== "text" || String(values[k] ?? "").trim());

  return (
    <Section id="brief" title="Write a brief" description="Say what you need. The plugin writes drafts for review; nothing goes out from here.">
      <form
        data-testid="brief-form"
        className={`${cardClass} flex flex-col gap-4`}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {Object.entries(form).map(([key, kind]) =>
          kind === "list" ? (
            <fieldset key={key}>
              <legend className="mb-1.5 text-sm font-semibold capitalize text-zinc-100">{key}</legend>
              <div className="flex flex-wrap gap-3">
                {(trig.channels ?? []).map((c) => {
                  const picked = Array.isArray(values[key]) && (values[key] as string[]).includes(c);
                  return (
                    <label key={c} className="inline-flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={(e) =>
                          setValues((v) => {
                            const cur = Array.isArray(v[key]) ? (v[key] as string[]) : [];
                            return { ...v, [key]: e.target.checked ? [...cur, c] : cur.filter((x) => x !== c) };
                          })
                        }
                      />
                      {c}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <Field key={key} id={`brief-${key}`} label={key === "brief" ? "Brief" : key}>
              {(props) => (
                <textarea
                  {...props}
                  rows={4}
                  className={inputClass}
                  value={String(values[key] ?? "")}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  placeholder="What should it write, for whom, and what must it mention?"
                />
              )}
            </Field>
          ),
        )}
        <Field id="brief-repo" label="Repository (optional)" helper="Only when the work is about one repository's changes.">
          {(props) => <input {...props} className={monoInputClass} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name" autoComplete="off" />}
        </Field>
        {refusal && <Refusal code={refusal.code} message={refusal.message} title="The run didn't start" />}
        <div>
          <button type="submit" className={primaryButton} disabled={sending || !textOk}>
            {sending ? "Starting…" : "Start the run"}
          </button>
        </div>
      </form>
    </Section>
  );
}

function UpdateOptions({ plugin, busy, act }: { plugin: InstalledPlugin; busy: string; act: Act }) {
  const [kind, setKind] = useState<TrackKind>(plugin.track.kind);
  const [value, setValue] = useState(plugin.track.value);
  useEffect(() => {
    setKind(plugin.track.kind);
    setValue(plugin.track.value);
  }, [plugin.track.kind, plugin.track.value]);
  const pinned = plugin.track.kind === "sha";
  const dirty = kind !== plugin.track.kind || value !== plugin.track.value;
  return (
    <Section
      id="updates"
      title="Updates"
      description="Wording changes apply on their own and are logged. A version that adds or widens tools, triggers, connections or outputs waits for an admin."
    >
      <div className={`${cardClass} flex flex-col gap-4`} data-testid="update-options">
        <Switch
          checked={plugin.auto_update && !pinned}
          disabled={pinned || busy === "auto"}
          label="Take new versions on their own"
          onLabel="Updates on"
          offLabel="Updates off"
          onChange={(on) => act("auto", () => pluginsApi.setOptions(plugin.id, { auto_update: on }), on ? "Updates on" : "Updates off")}
        />
        {pinned && (
          <p className="text-sm text-amber-300" data-testid="pinned-note">
            Pinned to commit {plugin.track.value.slice(0, 12)}: no updates until you follow a branch or tag again.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-zinc-100">Follow</p>
            <Segmented
              label="Follow a branch, a tag or one commit"
              value={kind}
              options={[
                { value: "branch", label: "Branch" },
                { value: "tag", label: "Tag" },
                { value: "sha", label: "Pin to a commit" },
              ]}
              onChange={(v) => {
                setKind(v);
                setValue(v === plugin.track.kind ? plugin.track.value : v === "sha" ? plugin.sha : "");
              }}
            />
          </div>
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <Field id="track-value" label={kind === "sha" ? "Commit" : kind === "tag" ? "Tag" : "Branch"}>
              {(props) => <input {...props} className={monoInputClass} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />}
            </Field>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButton}
            disabled={!dirty || !value.trim() || busy === "track"}
            onClick={() => act("track", () => pluginsApi.setOptions(plugin.id, { track: { kind, value: value.trim() } }), kind === "sha" ? "Pinned" : `Following ${trackText({ kind, value })}`)}
          >
            Save
          </button>
          <button type="button" className={secondaryButton} disabled={pinned || busy === "sync"} onClick={() => act("sync", () => pluginsApi.sync(plugin.id), "Checked for a new version")}>
            Check now
          </button>
        </div>
      </div>
    </Section>
  );
}

function SettingsForm({ plugin, act }: { plugin: InstalledPlugin; act: Act }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(plugin.settings.filter((s) => !s.sensitive).map((s) => [s.key, s.value ?? ""])),
  );
  const changed = Object.entries(values).filter(([k, v]) => {
    const s = plugin.settings.find((x) => x.key === k);
    return s?.sensitive ? v.trim() !== "" : (s?.value ?? "") !== v;
  });
  return (
    <Section id="settings" title="Settings" description="Values live with your team, never in the plugin. Secrets are never shown again once saved.">
      <form
        className={`${cardClass} flex flex-col gap-4`}
        data-testid="plugin-settings"
        onSubmit={(e) => {
          e.preventDefault();
          act("settings", () => pluginsApi.saveValues(plugin.id, Object.fromEntries(changed)), "Settings saved");
        }}
      >
        {plugin.settings.map((s) => (
          <Field
            key={s.key}
            id={`setting-${s.key}`}
            // A setting's key is one long identifier: it may wrap anywhere.
            label={<span className="wrap-anywhere">{s.key}</span>}
            helper={
              s.type === "connection"
                ? `A connection${s.provider ? ` (${s.provider})` : ""}${s.scopes?.length ? ` with ${s.scopes.join(", ")}` : ""}. Connect it on Connections, then name it here.`
                : s.sensitive
                  ? s.set
                    ? "Set. Enter a new value to replace it."
                    : "Not set yet."
                  : undefined
            }
          >
            {(props) =>
              s.sensitive ? (
                <SecretInput {...props} className={inputClass} value={values[s.key] ?? ""} placeholder={s.set ? "Saved" : ""} onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))} autoComplete="off" />
              ) : (
                <input {...props} className={inputClass} value={values[s.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))} autoComplete="off" />
              )
            }
          </Field>
        ))}
        <div>
          <button type="submit" className={primaryButton} disabled={changed.length === 0}>
            Save settings
          </button>
        </div>
      </form>
    </Section>
  );
}

function ApproversForm({ plugin, act }: { plugin: InstalledPlugin; act: Act }) {
  const [members, setMembers] = useState(plugin.approvers.members.join("\n"));
  const [min, setMin] = useState(String(plugin.approvers.min || 1));
  const list = members
    .split(/[\s,]+/)
    .map((m) => m.trim())
    .filter(Boolean);
  return (
    <Section id="approvers" title="Who approves what goes out" description="These people approve drafts before anything is published, sent or posted. The person who asked for a draft never approves it. With nobody listed, admins approve.">
      <form
        className={`${cardClass} flex flex-col gap-4`}
        data-testid="approvers-form"
        onSubmit={(e) => {
          e.preventDefault();
          act("approvers", () => pluginsApi.setApprovers(plugin.id, list, Math.max(1, Number(min) || 1)), "Approvers saved");
        }}
      >
        <Field id="approvers-members" label="Approvers" helper="One email per line.">
          {(props) => <textarea {...props} rows={3} className={monoInputClass} value={members} onChange={(e) => setMembers(e.target.value)} />}
        </Field>
        <Field id="approvers-min" label="Approvals needed">
          {(props) => <input {...props} type="number" min={1} max={5} className={`${inputClass} max-w-[8rem]`} value={min} onChange={(e) => setMin(e.target.value)} />}
        </Field>
        <div>
          <button type="submit" className={primaryButton}>
            Save approvers
          </button>
        </div>
      </form>
    </Section>
  );
}

function LimitForm({ plugin, canEdit, act }: { plugin: InstalledPlugin; canEdit: boolean; act: Act }) {
  const [limit, setLimit] = useState(String(plugin.monthly_tokens || ""));
  const pct = plugin.monthly_tokens ? Math.min(100, Math.round((plugin.used_tokens / plugin.monthly_tokens) * 100)) : 0;
  return (
    <Section id="limit" title="Monthly token limit" description="Counts toward your team's limits too. When either is reached, the plugin stops starting runs until next month.">
      <div className={`${cardClass} flex flex-col gap-3`} data-testid="limit-card">
        <p className="text-sm text-zinc-300">
          {formatTokens(plugin.used_tokens)} used this month
          {plugin.monthly_tokens ? ` of ${formatTokens(plugin.monthly_tokens)}` : ", no limit of its own"}
        </p>
        {plugin.monthly_tokens > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800" role="meter" aria-label="Tokens used this month" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className={`h-full ${pct >= 100 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {canEdit && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              act("limit", () => pluginsApi.setLimit(plugin.id, Math.max(0, Number(limit) || 0)), Number(limit) ? "Limit saved" : "Limit cleared");
            }}
          >
            <div className="min-w-0">
              <Field id="plugin-limit" label="Tokens a month" helper="Empty or 0 means no limit of its own.">
                {(props) => <input {...props} type="number" min={0} className={`${inputClass} max-w-[14rem]`} value={limit} onChange={(e) => setLimit(e.target.value)} />}
              </Field>
            </div>
            <button type="submit" className={secondaryButton}>
              Save limit
            </button>
          </form>
        )}
      </div>
    </Section>
  );
}

