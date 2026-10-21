"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type AwsLogGroup, type DataSource, type DataSourceActivityEvent } from "@/lib/api";
import {
  DEFAULT_HIDDEN_FIELDS, errorMessage, formatDuration, readSetupHint, clearSetupHint,
  runningChecks, actorLabel, checksFor, countLabel, hiddenNoun, isWarehouse, kindLabel, whereLabel,
  timeAgo, toCheckItems, engineLabel, groupSources, needsAttention,
} from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Callout } from "@/components/callout";
import { CheckList, type CheckItem } from "@/components/check-list";
import { Field, SecretInput } from "@/components/field";
import { HiddenFieldsEditor } from "@/components/hidden-fields-editor";
import { HiddenSuggestions } from "@/components/hidden-suggestions";
import { StatusPill } from "@/components/status-pill";
import { StepDot } from "@/components/stepper";
import {
  ChevronRightIcon, CloudIcon, CodeIcon, DatabaseIcon, LogsIcon, ScanIcon, ShieldCheckIcon, WarningIcon, WrenchIcon, XIcon,
} from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { Page, PageHeader, Section } from "@/components/page";
import { LogGroupPicker } from "@/components/log-group-picker";
import { ActivityFeed } from "@/components/data-source-activity";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";

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
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  // `?source=<id>` opens that source's row, so a link can point at one source.
  const [linked, setLinked] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

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
    // The per-source numbers are extra: rows work without them.
    weekStats().then(setStats, () => setStats(null));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setLinked(new URLSearchParams(window.location.search).get("source"));
  }, []);

  const replaceSource = (next: DataSource) =>
    setSources((prev) => (prev ? prev.map((s) => (s.id === next.id ? next : s)) : prev));
  const removeSource = (id: string) => {
    clearSetupHint(id);
    setSources((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
  };

  const list = sources ?? [];
  const anyOn = list.some((s) => s.enabled && s.status === "ready");
  const pending = list.some((s) => !s.setup_complete);
  const attention = list.filter(needsAttention).length;
  const onCount = list.filter((s) => s.setup_complete && s.enabled).length;
  const pausedCount = list.filter((s) => s.setup_complete && !s.enabled).length;
  // Search and the attention filter only earn their space once the list is long.
  const showTools = list.length >= 5;

  const q = query.trim().toLowerCase();
  const shown = list.filter(
    (s) =>
      (!attentionOnly || needsAttention(s)) &&
      (!q || [s.name, whereLabel(s), engineLabel(s), kindLabel(s)].some((t) => t.toLowerCase().includes(q))),
  );
  const groups = groupSources(shown);

  const closeAdd = () => {
    setAddOpen(false);
    addButton.current?.focus();
  };

  return (
    <Page>
      <PageHeader
        title="Data sources"
        lead="Let Coderhelm check facts against your real systems. Connect a source and it can look things up while it plans, writes code and reviews, like whether a field really exists or a setting is live."
        actions={
          <>
            {anyOn && <StatusPill tone="success">Fact-checking is on</StatusPill>}
            <Link href="/data-sources/activity" className={secondaryButton}>Every lookup</Link>
            {list.length > 0 && (
              <button
                ref={addButton}
                type="button"
                aria-expanded={addOpen}
                aria-controls="add-source"
                onClick={() => setAddOpen((v) => !v)}
                className={primaryButton}
              >
                Add a data source
              </button>
            )}
          </>
        }
      />

      {addOpen && list.length > 0 && (
        <div
          id="add-source"
          role="region"
          aria-labelledby="add-source-heading"
          onKeyDown={(e) => { if (e.key === "Escape") closeAdd(); }}
          className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900 p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="add-source-heading" className="font-semibold text-zinc-100">What do you want to connect?</h2>
              <p className="mt-0.5 text-sm text-zinc-400">Each one takes a few minutes and ends with a check that Coderhelm can only read.</p>
            </div>
            <button
              type="button"
              onClick={closeAdd}
              aria-label="Close"
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
            >
              <XIcon />
            </button>
          </div>
          <div className="mt-4"><KindPicker compact /></div>
        </div>
      )}

      <div className="mt-6 flex gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm">
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
        <div className="mt-8 flex flex-col gap-2" aria-busy="true">
          <p role="status" className="sr-only">Loading your data sources…</p>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {list.length > 0 && (
        <Section
          id="connected"
          title={`Connected (${list.length})`}
          description={
            <span data-testid="source-summary">
              {[
                onCount > 0 && `${onCount} on`,
                pausedCount > 0 && `${pausedCount} paused`,
                attention > 0 && `${attention} ${attention === 1 ? "needs" : "need"} attention`,
              ].filter(Boolean).join(" · ")}
            </span>
          }
        >
          {showTools && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <label htmlFor="source-search" className="sr-only">Find a source</label>
              <input
                id="source-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a source by name or address"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} min-w-0 flex-1 basis-56 sm:max-w-sm`}
              />
              {attention > 0 && (
                <button
                  type="button"
                  aria-pressed={attentionOnly}
                  onClick={() => setAttentionOnly((v) => !v)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${
                    attentionOnly
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                      : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  } ${focusRing}`}
                >
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" />
                  Needs attention ({attention})
                </button>
              )}
              {(q || attentionOnly) && (
                <p role="status" className="text-sm text-zinc-500">
                  Showing {shown.length} of {list.length}
                </p>
              )}
            </div>
          )}

          {groups.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-400">
              No source matches.{" "}
              <button type="button" className={linkButton} onClick={() => { setQuery(""); setAttentionOnly(false); }}>
                Show every source
              </button>
            </p>
          )}

          <div className="flex flex-col gap-7">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`group-${g.id}`}>
                <h3 id={`group-${g.id}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                  {g.title}
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">{g.list.length}</span>
                </h3>
                <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
                  {g.list.map((s) => (
                    <li key={s.id}>
                      <SourceRow
                        source={s}
                        stats={stats}
                        defaultOpen={linked === s.id}
                        onChange={replaceSource}
                        onRemoved={removeSource}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Section>
      )}

      {sources !== null && list.length === 0 && !loadError && (
        <Section id="add" title="Add a source">
          <div className="rounded-lg border border-dashed border-zinc-700 p-5 sm:p-6">
            <p className="font-semibold text-zinc-100">No data sources yet</p>
            <p className="mt-1 max-w-prose text-sm text-zinc-400">
              Connect the systems your code reads from. Each one takes a few minutes and ends with a check that Coderhelm can only read.
            </p>
            <div className="mt-5"><KindPicker /></div>
          </div>
        </Section>
      )}
      {sources !== null && list.length === 0 && loadError && (
        <Section id="add" title="Add a source"><KindPicker /></Section>
      )}

      {sources !== null && (list.length === 0 || pending) && <ProgressList sources={list} events={events} />}

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

function SourceIcon({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100 ${small ? "h-8 w-8" : "h-10 w-10"}`}
    >
      {children}
    </span>
  );
}

/** Every kind of source that can be added, in the same order the list groups them. */
const KINDS: { href: string; icon: ReactNode; title: string; time: string; text: string }[] = [
  { href: `${CONNECT}?step=address`, icon: <CodeIcon />, title: "A GraphQL API", time: "About 2 minutes",
    text: "The web address your apps already talk to. Coderhelm asks it questions." },
  { href: "/data-sources/connect/reader?kind=rest", icon: <CloudIcon />, title: "A REST API", time: "About 2 minutes",
    text: "A booking, payments or vendor API, read with GET requests under the paths you allow." },
  { href: `${CONNECT_AWS}?for=database`, icon: <DatabaseIcon />, title: "A database in your AWS account", time: "About 5 minutes",
    text: "Read only access to a PostgreSQL database or a Redshift warehouse, to check the records a ticket names." },
  { href: "/data-sources/connect/reader?kind=search", icon: <ScanIcon />, title: "An OpenSearch cluster", time: "About 2 minutes",
    text: "The search indexes your app reads, searched read only. Only the indexes you list." },
  { href: `${CONNECT_AWS}?for=logs`, icon: <LogsIcon />, title: "Logs in your AWS account", time: "About 3 minutes",
    text: "Coderhelm searches your logs for the errors behind a bug report. Only the log groups you choose." },
  { href: "/data-sources/tools", icon: <WrenchIcon />, title: "Your own tools", time: "About 5 minutes",
    text: "Named lookups your engineers already trust, like “find order by number”. Approved by another admin." },
];

/** The kinds to pick from: a list of links, one per kind. */
function KindPicker({ compact = false }: { compact?: boolean }) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {KINDS.map((k) => (
        <li key={k.href} className="min-w-0">
          <Link
            href={k.href}
            className={`flex h-full gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3.5 text-left hover:border-zinc-600 hover:bg-zinc-900 transition-colors motion-reduce:transition-none ${focusRing}`}
          >
            <SourceIcon small>{k.icon}</SourceIcon>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-zinc-100">{k.title}</span>
              <span className="text-sm text-zinc-400">{k.text}</span>
              {!compact && <span className="mt-1 text-xs text-zinc-500">{k.time}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const KIND_ICON: Record<DataSource["kind"], ReactNode> = {
  api: <CodeIcon />,
  logs: <LogsIcon />,
  database: <DatabaseIcon />,
  rest: <CloudIcon />,
  search: <ScanIcon />,
};

/** Split a typed list ("a, b" or one per line) into its entries. */
const entries = (s: string) =>
  s
    .split(/[,\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** "password, secret, token and 8 more". */
function hiddenSummary(names: string[]): string {
  if (names.length === 0) return "Nothing hidden";
  const head = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${head} and ${names.length - 3} more` : head;
}

/** Whether the last check passed: a colored dot and the word, so color is never the only signal. */
function HealthDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-medium ${ok ? "text-emerald-400" : "text-red-400"}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
      {ok ? "Ready" : "Needs attention"}
    </span>
  );
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

type Panel = "test" | "key" | "hidden" | "groups" | "settings" | "guide" | null;

function SourceRow({
  source,
  stats,
  defaultOpen = false,
  onChange,
  onRemoved,
}: {
  source: DataSource;
  /** Null while loading or when the activity log can't be read. */
  stats: Record<string, SourceStats> | null;
  /** Open on arrival, for a link to this one source. */
  defaultOpen?: boolean;
  onChange: (s: DataSource) => void;
  onRemoved: (id: string) => void;
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [panel, setPanel] = useState<Panel>(null);
  const [open_, setOpen] = useState(defaultOpen);
  const rowRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!defaultOpen) return;
    setOpen(true);
    rowRef.current?.scrollIntoView({ block: "start" });
  }, [defaultOpen]);
  const [busy, setBusy] = useState<"" | "toggle" | "test" | "key" | "hidden" | "groups" | "remove" | "settings" | "guide">("");
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
  const isReader = source.kind === "rest" || source.kind === "search";
  // Read with a key the team pasted (rather than a role in its AWS account).
  const keyed = isApi || isReader;
  const [guide, setGuide] = useState(source.instructions ?? "");
  const [url, setUrl] = useState(source.url);
  const [headerName, setHeaderName] = useState(source.header_name ?? "");
  const [paths, setPaths] = useState((source.paths ?? []).join(", "));
  const [user, setUser] = useState(source.user ?? "");
  const [indexes, setIndexes] = useState((source.indexes ?? []).join(", "));
  const [settingsError, setSettingsError] = useState("");

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

  const saveGuide = async () => {
    setBusy("guide");
    setError(null);
    try {
      const res = await api.updateDataSource(source.id, { instructions: guide });
      onChange(res.source);
      toast("Guide saved");
      setPanel(null);
    } catch (e) {
      setError({
        title: "We couldn't save the guide",
        body: `${errorMessage(e, "The request failed.")} The earlier guide is still in use. Press Save again.`,
      });
    } finally {
      setBusy("");
    }
  };

  const saveSettings = async () => {
    setBusy("settings");
    setSettingsError("");
    try {
      const res = await api.updateDataSource(
        source.id,
        source.kind === "rest"
          ? { url, header_name: headerName, paths: entries(paths) }
          : { url, user, indexes: entries(indexes) },
      );
      onChange(res.source);
      toast("Saved. The new settings passed their check.");
      setPanel(null);
    } catch (e) {
      setSettingsError(`${errorMessage(e, "The request failed.")} Nothing was changed.`);
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${source.name}?`,
      message: keyed
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

  const detailsId = `source-${source.id}-details`;
  const failures = week?.failures ?? 0;
  const actionError = error && (
    <div className={open_ ? "mt-4" : "px-4 pb-4"}>
      <Callout variant="error" title={error.title}><p>{error.body}</p></Callout>
    </div>
  );

  return (
    <article ref={rowRef} aria-label={source.name} className={open_ ? "bg-zinc-900" : ""}>
      <div className={`flex items-start gap-x-3 gap-y-2 px-3 py-2.5 sm:items-center sm:px-4 ${unfinished ? "flex-wrap" : ""}`}>
        <button
          type="button"
          aria-expanded={open_}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
          className={`-mx-1 flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 py-1 text-left hover:bg-zinc-800/40 ${
            unfinished ? "basis-72" : "basis-0"
          } ${focusRing}`}
        >
          <span aria-hidden="true" className={`shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none ${open_ ? "rotate-90" : ""}`}>
            <ChevronRightIcon />
          </span>
          {/* The group heading already says the kind; on a phone the room goes to the name. */}
          <span className="hidden sm:flex"><SourceIcon small>{KIND_ICON[source.kind]}</SourceIcon></span>
          <span className="flex min-w-0 flex-1 basis-40 flex-col">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-nowrap">
              <span className={`min-w-0 font-medium text-zinc-100 ${open_ ? "break-words" : "[overflow-wrap:anywhere] sm:truncate"}`}>{source.name}</span>
              <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-px text-[11px] font-medium text-zinc-400">{engineLabel(source)}</span>
            </span>
            <span
              title={open_ ? undefined : whereLabel(source)}
              className={`mt-0.5 font-mono text-xs text-zinc-500 ${open_ ? "break-all" : "truncate"}`}
            >
              {whereLabel(source)}
            </span>
          </span>
          <span className="flex basis-full flex-wrap items-center gap-x-4 gap-y-1 pl-7 text-xs sm:basis-auto sm:pl-0 sm:justify-end">
            {unfinished ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-amber-400">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" />
                Paused — finish setup
              </span>
            ) : (
              <HealthDot ok={source.status === "ready"} />
            )}
            {failures > 0 && (
              <span className="whitespace-nowrap text-amber-300">
                {failures}{week!.more ? "+" : ""} failed this week
              </span>
            )}
            <span className="whitespace-nowrap text-zinc-400">
              <span className="text-zinc-500">Last lookup </span>
              <span>{stats === null ? "unknown" : week?.last ? timeAgo(week.last) : "none this week"}</span>
            </span>
          </span>
        </button>

        {unfinished ? (
          <div className="flex items-center pl-7 sm:pl-0">
            <Link
              href={`${CONNECT}?step=${hint?.stage ?? "choose"}&id=${encodeURIComponent(source.id)}`}
              className={`${primaryButton} !min-h-8 !px-3 !py-1.5`}
            >
              Continue setup
            </Link>
          </div>
        ) : (
          <div className="mt-1.5 flex shrink-0 items-center gap-2 sm:mt-0">
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
            <span aria-hidden="true" className="hidden w-14 text-sm text-zinc-300 sm:inline">
              {busy === "toggle" ? "Saving…" : source.enabled ? "On" : "Paused"}
            </span>
          </div>
        )}
      </div>

      {source.status === "error" && (
        <div className="mx-3 mb-3 flex gap-2.5 rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-sm sm:mx-4">
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-red-400"><WarningIcon /></span>
          <div className="min-w-0">
            <p className="font-medium text-zinc-100">Coderhelm is not using this source until the problem is fixed.</p>
            <p className="text-zinc-400">{source.status_message || "The last check failed."} Press Test again to see which check fails and what to do.</p>
          </div>
        </div>
      )}

      {!open_ && actionError}

      <div id={detailsId} hidden={!open_} className="border-t border-zinc-800 px-4 py-4 sm:pl-[4.25rem]">
        {open_ && (
          <>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <SourceFact label={keyed ? "Key" : "Shares"}>
                {keyed ? (source.key_hint ? `Key ending ${source.key_hint}` : "Key saved") : count || "Read-only role"}
              </SourceFact>
              {source.kind === "rest" && <SourceFact label="Paths agents may read">{(source.paths ?? []).join(", ")}</SourceFact>}
              {source.kind === "search" && (
                <SourceFact label="Indexes">{source.indexes?.length ? source.indexes.join(", ") : "Every index the user sees"}</SourceFact>
              )}
              <SourceFact label="Failed or refused, last 7 days">
                {stats === null ? (
                  "Unknown"
                ) : failures > 0 ? (
                  <Link href={`/data-sources/activity?source=${encodeURIComponent(source.id)}&outcome=problems&range=7d`} className={`${linkButton} text-amber-300`}>
                    {failures}{week!.more ? "+" : ""} {failures === 1 ? "lookup" : "lookups"}
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

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={`Manage ${source.name}`}>
              <button type="button" onClick={test} disabled={busy === "test"} className={secondaryButton}>
                {busy === "test" ? "Testing…" : "Test again"}
              </button>
              {keyed && (
                <button type="button" aria-expanded={panel === "key"} onClick={() => open("key")} className={secondaryButton}>
                  Replace key
                </button>
              )}
              {isReader && (
                <button
                  type="button"
                  aria-expanded={panel === "settings"}
                  onClick={() => {
                    setUrl(source.url);
                    setHeaderName(source.header_name ?? "");
                    setPaths((source.paths ?? []).join(", "));
                    setUser(source.user ?? "");
                    setIndexes((source.indexes ?? []).join(", "));
                    setSettingsError("");
                    open("settings");
                  }}
                  className={secondaryButton}
                >
                  {source.kind === "rest" ? "Address and paths" : "Address and indexes"}
                </button>
              )}
              <button
                type="button"
                aria-expanded={panel === "guide"}
                onClick={() => { setGuide(source.instructions ?? ""); open("guide"); }}
                className={secondaryButton}
              >
                Guide for agents
              </button>
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
                className={`inline-flex items-center justify-center min-h-9 px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 sm:ml-auto ${focusRing}`}
              >
                {busy === "remove" ? "Removing…" : "Remove"}
              </button>
            </div>

            {actionError}
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

            {panel === "guide" && (
              <form
                className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4"
                onSubmit={(e) => { e.preventDefault(); if (busy !== "guide") saveGuide(); }}
              >
                <Field
                  id={`guide-${source.id}`}
                  label="Guide for agents"
                  helper="What agents should know when they use this source: what the system is, what its fields mean, where else its data lives. Given to them with it."
                >
                  {(props) => (
                    <textarea
                      {...props}
                      rows={6}
                      maxLength={4000}
                      value={guide}
                      onChange={(e) => setGuide(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                      placeholder="quantity on a product is sessions per week on weekly packs, but the session count on season packs."
                    />
                  )}
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={guide === (source.instructions ?? "") || busy === "guide"} className={primaryButton}>
                    {busy === "guide" ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setPanel(null)} className={secondaryButton}>Close</button>
                </div>
              </form>
            )}

            {panel === "settings" && isReader && (
              <form
                className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4"
                onSubmit={(e) => { e.preventDefault(); if (busy !== "settings") saveSettings(); }}
              >
                <Field id={`url-${source.id}`} label={source.kind === "rest" ? "API address" : "Cluster address"}>
                  {(props) => <input {...props} value={url} onChange={(e) => setUrl(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />}
                </Field>
                {source.kind === "rest" ? (
                  <>
                    <Field id={`header-${source.id}`} label="Key header" helper="The header the API expects the key in, like X-Api-Key or Authorization.">
                      {(props) => <input {...props} value={headerName} onChange={(e) => setHeaderName(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />}
                    </Field>
                    <Field id={`paths-${source.id}`} label="Paths agents may read" helper="Path prefixes, like /v1/orders. Agents can GET these and anything under them, nothing else.">
                      {(props) => <input {...props} value={paths} onChange={(e) => setPaths(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100" />}
                    </Field>
                  </>
                ) : (
                  <>
                    <Field id={`user-${source.id}`} label="User" helper="A user with read-only access. Coderhelm sees what it can see.">
                      {(props) => <input {...props} value={user} onChange={(e) => setUser(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />}
                    </Field>
                    <Field id={`indexes-${source.id}`} label="Indexes" helper="Index names or patterns agents may read, like orders or logs-*. Leave empty for every index the user sees.">
                      {(props) => <input {...props} value={indexes} onChange={(e) => setIndexes(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100" />}
                    </Field>
                  </>
                )}
                {settingsError && <p role="alert" className="text-sm text-red-400">{settingsError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={busy === "settings"} className={primaryButton}>
                    {busy === "settings" ? "Checking…" : "Check and save"}
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
                {source.kind === "database" && (
                  <HiddenSuggestions
                    source={source}
                    onChange={(next) => {
                      onChange(next);
                      setHidden(next.hidden_fields);
                    }}
                  />
                )}
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
          </>
        )}
      </div>
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

