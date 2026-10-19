"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type AwsLogGroup, type DataSource, type DataSourceActivityEvent } from "@/lib/api";
import {
  DEFAULT_HIDDEN_FIELDS, errorMessage, formatDuration, readSetupHint, clearSetupHint,
  runningChecks, actorLabel, checksFor, countLabel, hiddenNoun, isWarehouse, kindLabel, whereLabel,
  timeAgo, toCheckItems,
} from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Callout } from "@/components/callout";
import { CheckList, type CheckItem } from "@/components/check-list";
import { Field, SecretInput } from "@/components/field";
import { HiddenFieldsEditor } from "@/components/hidden-fields-editor";
import { StatusPill } from "@/components/status-pill";
import { StepDot } from "@/components/stepper";
import { CodeIcon, DatabaseIcon, LogsIcon, ShieldCheckIcon, WrenchIcon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { Page, PageHeader, Section } from "@/components/page";
import { LogGroupPicker } from "@/components/log-group-picker";
import { ActivityFeed } from "@/components/data-source-activity";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";

export default function DataSourcesPageGuarded() {
  return <RoleGuard minRole="admin"><DataSourcesPage /></RoleGuard>;
}

const CONNECT = "/data-sources/connect";
const CONNECT_AWS = "/data-sources/connect/aws";

interface SourceStats {
  /** The newest lookup in the last 7 days, if any. */
  last?: string;
  lookups: number;
  failures: number;
  /** More happened than one page shows; the counts are at least these. */
  more: boolean;
}

const WEEK_MS = 7 * 86_400_000;

/** Lookups and failures per source over the last 7 days, from the activity log. */
async function weekStats(): Promise<Record<string, SourceStats>> {
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const [all, problems] = await Promise.all([
    api.listDataSourceActivity(200, undefined, { since }),
    api.listDataSourceActivity(200, undefined, { since, outcome: "problems" }),
  ]);
  const out: Record<string, SourceStats> = {};
  const get = (id: string) => (out[id] ??= { lookups: 0, failures: 0, more: false });
  for (const ev of all.events) {
    const s = get(ev.source_id);
    s.lookups += 1;
    if (!s.last || ev.at > s.last) s.last = ev.at;
    if (all.next) s.more = true;
  }
  for (const ev of problems.events) {
    const s = get(ev.source_id);
    s.failures += 1;
    if (problems.next) s.more = true;
  }
  return out;
}

function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [events, setEvents] = useState<DataSourceActivityEvent[]>([]);
  const [stats, setStats] = useState<Record<string, SourceStats> | null>(null);
  const [loadError, setLoadError] = useState("");
  const [storeOpen, setStoreOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await api.listDataSources();
      setSources(res.sources);
    } catch (e) {
      setLoadError(errorMessage(e, "The request failed."));
      setSources((prev) => prev ?? []);
    }
    try {
      // For the setup progress list; the activity feed loads its own.
      const res = await api.listDataSourceActivity(50);
      setEvents(res.events);
    } catch {
      // The feed shows the error; progress just stays where it was.
    }
    // The per-source numbers are extra: cards work without them.
    weekStats().then(setStats, () => setStats(null));
  }, []);

  useEffect(() => { load(); }, [load]);

  const replaceSource = (next: DataSource) =>
    setSources((prev) => (prev ? prev.map((s) => (s.id === next.id ? next : s)) : prev));
  const removeSource = (id: string) => {
    clearSetupHint(id);
    setSources((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
  };

  const list = sources ?? [];
  const anyOn = list.some((s) => s.enabled && s.status === "ready");
  const pending = list.some((s) => !s.setup_complete);

  return (
    <Page>
      <PageHeader
        title="Data sources"
        lead="Let Coderhelm check facts against your real systems. Connect a source and it can look things up while it plans, writes code and reviews, like whether a field really exists or a setting is live."
        actions={
          <>
            <Link href="/data-sources/activity" className={secondaryButton}>Every lookup</Link>
            {anyOn && <StatusPill tone="success">Fact-checking is on</StatusPill>}
          </>
        }
      />

      <div className="mt-6 flex gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
        <span aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-400"><ShieldCheckIcon /></span>
        <div className="min-w-0">
          <p className="font-semibold text-zinc-100">Read only, always</p>
          <p className="mt-0.5 text-zinc-400">
            Coderhelm can only read. Before a source is turned on it checks that writes are impossible, every lookup that would change data
            is refused, the fields you name stay hidden, and every lookup is logged.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="mt-6">
          <Callout variant="error" title="We couldn't load your data sources">
            <p>{loadError} Nothing was changed.</p>
            <p><button type="button" onClick={load} className={linkButton}>Try again</button></p>
          </Callout>
        </div>
      )}

      {sources === null && !loadError && (
        <div className="mt-8 flex flex-col gap-3" aria-busy="true">
          <p role="status" className="sr-only">Loading your data sources…</p>
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      )}

      {list.length > 0 && (
        <Section id="connected" title={`Connected (${list.length})`}>
          <div className="flex flex-col gap-3">
            {list.map((s) => (
              <SourceCard key={s.id} source={s} stats={stats} onChange={replaceSource} onRemoved={removeSource} />
            ))}
          </div>
        </Section>
      )}

      {sources !== null && (list.length === 0 || pending) && <ProgressList sources={list} events={events} />}

      <Section id="add" title={list.length ? "Add another source" : "Add a source"} description="Each one takes a few minutes and ends with a check that Coderhelm can only read.">
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <ConnectCard href={`${CONNECT}?step=address`} icon={<CodeIcon />} title="An API" time="About 2 minutes">
            The web address your apps already talk to. Coderhelm asks it questions.
          </ConnectCard>
          <ConnectCard href={`${CONNECT_AWS}?for=logs`} icon={<LogsIcon />} title="Logs in your AWS account" time="About 3 minutes">
            Coderhelm searches your logs for the errors behind a bug report. Only the log groups you choose.
          </ConnectCard>
          <ConnectCard href={`${CONNECT_AWS}?for=database`} icon={<DatabaseIcon />} title="A database in your AWS account" time="About 5 minutes">
            Read only access to a PostgreSQL database or a Redshift warehouse, so Coderhelm can check the records a ticket names.
          </ConnectCard>
          <ConnectCard href="/data-sources/tools" icon={<WrenchIcon />} title="Your own tools" time="About 5 minutes">
            Named lookups your engineers already trust, like &quot;find order by number&quot;. Written once, approved by another admin.
          </ConnectCard>
        </div>
      </Section>

      <p className="mt-6 text-sm text-zinc-400" data-testid="integrations-pointer">
        New Relic, Confluence, CloudWatch metrics, Airflow and MCP servers are set up in{" "}
        <Link href="/settings/integrations" className={linkButton}>
          Settings → Integrations
        </Link>
        .
      </p>

      <p className="mt-6">
        <button
          type="button"
          aria-expanded={storeOpen}
          aria-controls="what-we-store"
          onClick={() => setStoreOpen((v) => !v)}
          className={linkButton}
        >
          What we store and how to turn this off
        </button>
      </p>
      {storeOpen && (
        <div id="what-we-store" className="mt-3 grid gap-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-300 md:grid-cols-2">
          <div>
            <h2 className="font-semibold text-zinc-100">What we store</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>For an API: its address, and the key, encrypted. The key is never shown again, not even to you.</li>
              <li>For logs and databases: the name of the read-only role in your AWS account, and which log groups or database it may read. No passwords: the database password stays in your account.</li>
              <li>A log of every lookup: when it ran, who asked, what was asked and whether it worked.</li>
            </ul>
            <p className="mt-2">The activity log keeps the text of each lookup (not what came back) for 180 days.</p>
            <p className="mt-2">We do not store your data. What a lookup returns is used for that review and not kept.</p>
          </div>
          <div>
            <h2 className="font-semibold text-zinc-100">How to turn it off</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Pause a source with its switch. Nothing is looked up while it is paused.</li>
              <li>Remove the source. For an API we delete the saved key.</li>
              <li>Revoke the key at your API, or delete the CoderhelmReadOnly role in your AWS account. Either cuts access immediately, without coming here.</li>
            </ul>
          </div>
        </div>
      )}

      <ActivityFeed sources={list} fullPageLink />
    </Page>
  );
}

function SourceIcon({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100">
      {children}
    </span>
  );
}

function ConnectCard({
  href,
  icon,
  title,
  time,
  children,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  time: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-40 flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-left hover:border-zinc-600 transition-colors motion-reduce:transition-none ${focusRing}`}
    >
      <SourceIcon>{icon}</SourceIcon>
      <span className="font-semibold text-zinc-100">{title}</span>
      <span className="flex-1 text-sm text-zinc-400">{children}</span>
      <span className="text-xs text-zinc-500">{time}</span>
    </Link>
  );
}

const KIND_ICON: Record<DataSource["kind"], ReactNode> = {
  api: <CodeIcon />,
  logs: <LogsIcon />,
  database: <DatabaseIcon />,
};

/** "password, secret, token and 8 more". */
function hiddenSummary(names: string[]): string {
  if (names.length === 0) return "Nothing hidden";
  const head = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${head} and ${names.length - 3} more` : head;
}

function SourceFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-zinc-200">{children}</dd>
    </div>
  );
}


// ── One connected source ──────────────────────────────────────────

type Panel = "test" | "key" | "hidden" | "groups" | null;

function SourceCard({
  source,
  stats,
  onChange,
  onRemoved,
}: {
  source: DataSource;
  /** Null while loading or when the activity log can't be read. */
  stats: Record<string, SourceStats> | null;
  onChange: (s: DataSource) => void;
  onRemoved: (id: string) => void;
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<"" | "toggle" | "test" | "key" | "hidden" | "groups" | "remove">("");
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [checks, setChecks] = useState<CheckItem[] | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [newKey, setNewKey] = useState("");
  const [keyChecks, setKeyChecks] = useState<CheckItem[] | null>(null);
  const [keyError, setKeyError] = useState("");
  const [hidden, setHidden] = useState<string[]>(source.hidden_fields);
  const [groups, setGroups] = useState<string[]>(source.aws?.log_groups ?? []);
  const [available, setAvailable] = useState<AwsLogGroup[] | null>(null);
  const [groupsError, setGroupsError] = useState("");
  const expected = checksFor(source.kind, isWarehouse(source));
  const noun = hiddenNoun(source.kind);
  const isApi = source.kind === "api";

  const unfinished = !source.setup_complete;
  const hint = useMemo(() => (unfinished ? readSetupHint(source.id) : null), [unfinished, source.id]);
  const open = (next: Panel) => {
    setError(null);
    setPanel((cur) => (cur === next ? null : next));
  };

  const toggle = async () => {
    setBusy("toggle");
    setError(null);
    try {
      const res = await api.updateDataSource(source.id, { enabled: !source.enabled });
      onChange(res.source);
      toast(res.source.enabled ? `${source.name} is on` : `${source.name} is paused. Nothing is looked up until you turn it back on.`);
    } catch (e) {
      setError({
        title: source.enabled ? "We couldn't pause this source" : "We couldn't turn this source on",
        body: `${errorMessage(e, "The request failed.")} It is still ${source.enabled ? "on" : "paused"}. Try the switch again.`,
      });
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setPanel("test");
    setError(null);
    setTestOk(null);
    setChecks(runningChecks(expected));
    setBusy("test");
    try {
      const res = await api.testDataSource(source.id);
      setChecks(toCheckItems(res.checks, expected));
      setTestOk(res.ok);
      if (res.source) onChange(res.source);
    } catch (e) {
      setChecks(null);
      setError({
        title: "The test couldn't run",
        body: `${errorMessage(e, "The request failed.")} The source was not changed. Press Test again in a moment.`,
      });
    } finally {
      setBusy("");
    }
  };

  const saveKey = async () => {
    setBusy("key");
    setKeyError("");
    setKeyChecks(runningChecks());
    try {
      const res = await api.replaceDataSourceKey(source.id, newKey.trim());
      setKeyChecks(res.checks ? toCheckItems(res.checks) : null);
      if (res.ok) {
        onChange(res.source);
        setNewKey("");
        toast("Key replaced");
      } else {
        setKeyError(res.error);
      }
    } catch (e) {
      setKeyChecks(null);
      setKeyError(`${errorMessage(e, "The request failed.")} The old key is still in use. Try again.`);
    } finally {
      setBusy("");
    }
  };

  const saveHidden = async () => {
    setBusy("hidden");
    setError(null);
    try {
      const res = await api.updateDataSource(source.id, { hidden_fields: hidden });
      onChange(res.source);
      toast("Saved what Coderhelm can't see");
      setPanel(null);
    } catch (e) {
      setError({
        title: `We couldn't save the hidden ${noun.many}`,
        body: `${errorMessage(e, "The request failed.")} The earlier list is still in use. Press Save again.`,
      });
    } finally {
      setBusy("");
    }
  };

  const openGroups = async () => {
    setGroups(source.aws?.log_groups ?? []);
    open("groups");
    if (available || !source.aws) return;
    setGroupsError("");
    try {
      const res = await api.connectAws({ role_arn: source.aws.role_arn, region: source.aws.region });
      setAvailable(res.log_groups ?? []);
      if (!res.ok) setGroupsError(res.checks.find((c) => !c.ok)?.detail ?? "We couldn't list your log groups.");
    } catch (e) {
      setAvailable([]);
      setGroupsError(errorMessage(e, "The request failed."));
    }
  };

  const saveGroups = async () => {
    setBusy("groups");
    setError(null);
    try {
      const res = await api.updateDataSource(source.id, { log_groups: groups });
      onChange(res.source);
      toast("Saved which log groups Coderhelm may search");
      setPanel(null);
    } catch (e) {
      setError({
        title: "We couldn't save the log groups",
        body: `${errorMessage(e, "The request failed.")} The earlier list is still in use. Press Save again.`,
      });
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${source.name}?`,
      message: isApi
        ? "Coderhelm stops using it right away and we delete the saved key. This can't be undone."
        : "Coderhelm stops using it right away. The read-only role stays in your AWS account until you delete it there.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy("remove");
    setError(null);
    try {
      await api.deleteDataSource(source.id);
      toast(`${source.name} removed`);
      onRemoved(source.id);
    } catch (e) {
      setError({
        title: "We couldn't remove this source",
        body: `${errorMessage(e, "The request failed.")} It is still connected. Press Remove again.`,
      });
      setBusy("");
    }
  };

  const hiddenDirty = hidden.join("\n") !== source.hidden_fields.join("\n");
  const groupsDirty = groups.join("\n") !== (source.aws?.log_groups ?? []).join("\n");
  const count = countLabel(source);
  const week = stats?.[source.id];
  const keyId = `key-${source.id}`;

  return (
    <article aria-label={source.name} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <SourceIcon>{KIND_ICON[source.kind]}</SourceIcon>
        <div className="min-w-0 flex-1 basis-56">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold text-zinc-100">
            <span className="break-words min-w-0">{source.name}</span>
            <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs font-medium text-zinc-400">{kindLabel(source)}</span>
            {source.status === "ready"
              ? <StatusPill tone="success">Ready</StatusPill>
              : <StatusPill tone="error">Needs attention</StatusPill>}
          </h3>
          <p className="mt-1 break-all font-mono text-xs text-zinc-400">{whereLabel(source)}</p>
        </div>
        {unfinished ? (
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone="warning">Paused — finish setup</StatusPill>
            <Link href={`${CONNECT}?step=${hint?.stage ?? "choose"}&id=${encodeURIComponent(source.id)}`} className={primaryButton}>
              Continue setup
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={source.enabled}
              aria-label={`Let Coderhelm use ${source.name}`}
              disabled={busy === "toggle"}
              onClick={toggle}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:opacity-50 ${
                source.enabled ? "bg-emerald-500" : "bg-zinc-700"
              } ${focusRing}`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${
                  source.enabled ? "translate-x-5" : ""
                }`}
              />
            </button>
            <span className="w-14 text-sm text-zinc-300">{busy === "toggle" ? "Saving…" : source.enabled ? "On" : "Paused"}</span>
          </div>
        )}
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <SourceFact label={isApi ? "Key" : "Shares"}>
          {isApi ? (source.key_hint ? `Key ending ${source.key_hint}` : "Key saved") : count || "Read-only role"}
        </SourceFact>
        <SourceFact label="Last lookup">
          {stats === null ? "Unknown" : week?.last ? timeAgo(week.last) : "None in the last 7 days"}
        </SourceFact>
        <SourceFact label="Failed or refused, last 7 days">
          {stats === null ? (
            "Unknown"
          ) : (week?.failures ?? 0) > 0 ? (
            <Link href={`/data-sources/activity?source=${encodeURIComponent(source.id)}&outcome=problems&range=7d`} className={`${linkButton} text-amber-300`}>
              {week!.failures}{week!.more ? "+" : ""} {week!.failures === 1 ? "lookup" : "lookups"}
            </Link>
          ) : (
            "None"
          )}
        </SourceFact>
        <SourceFact label="Last checked">{timeAgo(source.last_checked_at)}</SourceFact>
        <SourceFact label={`Hidden ${noun.many}`}>
          <span title={source.hidden_fields.join(", ")}>{hiddenSummary(source.hidden_fields)}</span>
        </SourceFact>
        <SourceFact label="Used for">{source.repos.length === 0 ? "Every repository" : source.repos.length === 1 ? source.repos[0] : `${source.repos.length} repositories`}</SourceFact>
        {isApi && <SourceFact label="Writes">{source.has_mutations ? "The API allows them; Coderhelm refuses every one" : "The API offers none"}</SourceFact>}
      </dl>

      {source.status === "error" && (
        <div className="mt-4">
          <Callout variant="error" title="This source needs attention" live={false}>
            <p className="font-semibold text-zinc-100">Coderhelm is not using this source until the problem is fixed.</p>
            <p>{source.status_message || "The last check failed."} Press Test again to see which check fails and what to do.</p>
          </Callout>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
        <button type="button" onClick={test} disabled={busy === "test"} className={secondaryButton}>
          {busy === "test" ? "Testing…" : "Test again"}
        </button>
        {isApi && (
          <button type="button" aria-expanded={panel === "key"} onClick={() => open("key")} className={secondaryButton}>
            Replace key
          </button>
        )}
        {source.kind === "logs" && (
          <button type="button" aria-expanded={panel === "groups"} onClick={openGroups} className={secondaryButton}>
            Log groups
          </button>
        )}
        <button
          type="button"
          aria-expanded={panel === "hidden"}
          onClick={() => { setHidden(source.hidden_fields); open("hidden"); }}
          className={secondaryButton}
        >
          What Coderhelm can&apos;t see
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy === "remove"}
          className={`inline-flex items-center justify-center min-h-9 px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 ${focusRing}`}
        >
          {busy === "remove" ? "Removing…" : "Remove"}
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <Callout variant="error" title={error.title}><p>{error.body}</p></Callout>
        </div>
      )}

      {panel === "test" && checks && (
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4">
          <CheckList items={checks} label={`Checks for ${source.name}`} />
          {testOk === true && <Callout variant="success"><p>All checks passed. Coderhelm can read from this source and cannot change it.</p></Callout>}
          {testOk === false && (
            <Callout variant="error" title={`${checks.find((c) => c.state === "failed")?.label ?? "A check"} failed`}>
              <p>{checks.find((c) => c.state === "failed")?.fix ?? "See the failed check above for what to do."}</p>
            </Callout>
          )}
        </div>
      )}

      {panel === "key" && (
        <form
          className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4"
          onSubmit={(e) => { e.preventDefault(); if (newKey.trim() && busy !== "key") saveKey(); }}
        >
          <Field
            id={keyId}
            label="New key"
            helper="We check the new key before it replaces the old one. If a check fails, the old key stays in use."
            error={keyError || undefined}
          >
            {(props) => (
              <SecretInput {...props} value={newKey} onChange={(e) => { setNewKey(e.target.value); setKeyError(""); }} placeholder="Paste the new key here" />
            )}
          </Field>
          {keyChecks && <CheckList items={keyChecks} label="Checks for the new key" />}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!newKey.trim() || busy === "key"} className={primaryButton}>
              {busy === "key" ? "Checking…" : "Check and replace"}
            </button>
            <button type="button" onClick={() => setPanel(null)} className={secondaryButton}>Close</button>
          </div>
        </form>
      )}

      {panel === "hidden" && (
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4">
          <p className="text-sm text-zinc-400">
            {noun.many[0].toUpperCase() + noun.many.slice(1)} with these names are hidden from Coderhelm wherever they appear.
          </p>
          <HiddenFieldsEditor value={hidden} onChange={setHidden} idPrefix={`hub-${source.id}`} noun={noun.one as "field" | "column"} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveHidden} disabled={!hiddenDirty || busy === "hidden"} className={primaryButton}>
              {busy === "hidden" ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setHidden(DEFAULT_HIDDEN_FIELDS)} className={secondaryButton}>
              Use the suggested list
            </button>
            <button type="button" onClick={() => setPanel(null)} className={secondaryButton}>Close</button>
          </div>
        </div>
      )}
      {panel === "groups" && (
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4">
          <p className="text-sm text-zinc-400">Coderhelm can search only the log groups chosen here.</p>
          {groupsError && <Callout variant="warning" title="We couldn't list every log group"><p>{groupsError} You can still remove groups below.</p></Callout>}
          {available === null ? (
            <p role="status" className="text-sm text-zinc-500">Loading your log groups…</p>
          ) : (
            <LogGroupPicker groups={available} value={groups} onChange={setGroups} />
          )}
          {groups.length === 0 && <p role="alert" className="text-sm text-red-400">Keep at least one log group, or remove the source.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveGroups} disabled={!groupsDirty || groups.length === 0 || busy === "groups"} className={primaryButton}>
              {busy === "groups" ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setPanel(null)} className={secondaryButton}>Close</button>
          </div>
        </div>
      )}
    </article>
  );
}

// ── Progress ──────────────────────────────────────────────────────

function ProgressList({ sources, events }: { sources: DataSource[]; events: DataSourceActivityEvent[] }) {
  const any = sources.length > 0;
  const pending = sources.find((s) => !s.setup_complete);
  const hint = useMemo(() => (pending ? readSetupHint(pending.id) : null), [pending]);
  const pendingTried = pending
    ? hint?.stage === "review" || events.some((e) => e.source_id === pending.id)
    : false;
  const pendingChosen = pending ? pendingTried || hint?.stage === "try" : false;

  const done = [
    any,
    any && (pending ? pendingChosen : true),
    any && (pending ? pendingTried : true),
    any && !pending,
  ];
  const now = done.indexOf(false);
  const q = pending ? `&id=${encodeURIComponent(pending.id)}` : "";
  const anyOn = sources.some((s) => s.enabled);

  const rows: { title: string; text: string; action?: ReactNode }[] = [
    { title: "Connect a source", text: any ? "Add more any time." : "Pick a source above to start." },
    {
      title: "Choose what Coderhelm may use",
      text: "You decide which repositories use it and which fields stay hidden.",
      action: pending && (
        <Link href={`${CONNECT}?step=choose${q}`} className={now === 1 ? primaryButton : secondaryButton}>
          {pendingChosen ? "Change" : "Choose"}
        </Link>
      ),
    },
    {
      title: "Try it",
      text: "Run a lookup and see exactly what Coderhelm would see.",
      action: pending && pendingChosen && (
        <Link href={`${CONNECT}?step=try${q}`} className={now === 2 ? primaryButton : secondaryButton}>Try it</Link>
      ),
    },
    {
      title: "Turn it on",
      text: !any || pending
        ? "One last check, then Coderhelm uses it."
        : anyOn
          ? "On. Pause any source with its switch."
          : "Every source is paused. Turn one back on with its switch.",
      action: pending && pendingTried && (
        <Link href={`${CONNECT}?step=review${q}`} className={primaryButton}>Check and turn on</Link>
      ),
    },
  ];

  return (
    <section aria-labelledby="progress-heading" className="mt-10">
      <h2 id="progress-heading" className="sr-only">Setup progress</h2>
      <ol className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {rows.map((row, i) => (
          <li
            key={row.title}
            aria-current={i === now ? "step" : undefined}
            className="flex flex-wrap items-center gap-3 px-5 py-3.5"
          >
            <StepDot state={done[i] ? "done" : i === now ? "current" : "upcoming"} number={i + 1} />
            <div className="min-w-44 flex-1">
              <p className="text-sm font-semibold text-zinc-100">
                {row.title}
                <span className="sr-only">{done[i] ? " (done)" : i === now ? " (next)" : ""}</span>
              </p>
              <p className="text-sm text-zinc-400">{row.text}</p>
            </div>
            {row.action}
          </li>
        ))}
      </ol>
    </section>
  );
}

