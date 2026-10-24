"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  API_BASE_URL,
  type AlertBudget,
  type AlertEvent,
  type AlertNotifySettings,
  type AlertRoute,
  type AlertRule,
  type AwsConnection,
  type Repo,
  type TopicAlarm,
} from "@/lib/api";
import { hasRole } from "@/lib/roles";
import { timeAgo } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { RepoCombobox } from "@/components/repo-combobox";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Segmented } from "@/components/segmented";
import { CodeBlock } from "@/components/code-block";
import { Skeleton } from "@/components/skeleton";
import { Field } from "@/components/field";
import { Page, PageHeader, Section } from "@/components/page";
import { Switch as OnOffSwitch } from "@/components/teams-webhook";
import { Code, SaveBar, SettingsDisclosure, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";
import { DetailBlock, List, ListRow, ListSkeleton } from "@/components/list";
import {
  ChannelPicker,
  channelsPayload,
  channelsSummary,
  draftDirty,
  draftFrom,
  draftValid,
  NO_WEBHOOKS,
  type ChannelsDraft,
} from "@/components/chat-channels";
import { buttonClass, focusRing, inputClass, linkButton, monoInputClass, primaryButton, secondaryButton } from "@/components/ui";

export default function AlertsPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <AlertsPage />
    </RoleGuard>
  );
}

const EMPTY_ROUTE: AlertRoute = { topic_arn: "", rules: [], enabled: true, notify_mode: "team", post_recoveries: false };
const EMPTY_RULE: AlertRule = { alarms: [], terms: [], repo: "", instructions: "" };

const NOTIFY_LABEL: Record<string, string> = {
  team: "Team channel",
  custom: "Own channel",
  off: "No messages",
};

// ── Matching, as the gateway does it ─────────────────────────────────

/** The alarm name of a CloudWatch alarm event ("ALARM: name" → "name"). */
function alarmName(ev: Pick<AlertEvent, "kind" | "title">): string | null {
  if (ev.kind !== "cloudwatch_alarm" || !ev.title) return null;
  const i = ev.title.indexOf(": ");
  return i >= 0 ? ev.title.slice(i + 2) : null;
}

/**
 * The first rule that takes an alert, as the gateway's `pick_rule` decides.
 * The dashboard sees only an alert's title, so text terms are checked against
 * the title here; the gateway also checks the alert's full text.
 */
function pickRule(rules: AlertRule[], ev: Pick<AlertEvent, "kind" | "title">): number {
  const name = alarmName(ev);
  const title = (ev.title ?? "").toLowerCase();
  return rules.findIndex((r) => {
    const terms = r.terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
    const byAlarm = !!name && r.alarms.includes(name);
    const byTerms = terms.length > 0 && terms.some((t) => title.includes(t));
    return (r.alarms.length === 0 && terms.length === 0) || byAlarm || byTerms;
  });
}

/** The rule that takes an alarm, by name, for the topic's alarm list. */
function ruleForAlarm(rules: AlertRule[], name: string): number {
  return pickRule(rules, { kind: "cloudwatch_alarm", title: `ALARM: ${name}` });
}

const RECOVERY_OUTCOMES = new Set(["recovered", "no_open_alert"]);

function isRecovery(ev: AlertEvent): boolean {
  return RECOVERY_OUTCOMES.has(ev.outcome) || ev.kind === "recovery" || (ev.outcome === "not_alarm" && /^OK: /.test(ev.title ?? ""));
}

/** The alert a recovery resolves: the latest earlier alert with its ticket. Events are newest first. */
function pairRecoveries(events: AlertEvent[]): Map<string, AlertEvent> {
  const pairs = new Map<string, AlertEvent>();
  events.forEach((ev, i) => {
    if (!isRecovery(ev)) return;
    const ticket = ev.recovers_ticket ?? (ev.kind === "cloudwatch_alarm" ? ev.ticket_id : null);
    if (!ticket) return;
    const alert = events.slice(i + 1).find((x) => x.ticket_id === ticket && !isRecovery(x));
    if (alert) pairs.set(ev.id, alert);
  });
  return pairs;
}

/** What happened to an alert, as one of a few plain chips. */
const OUTCOME_CHIP: Record<string, { label: string; tone: "success" | "warning" | "error" | "neutral" | "info" }> = {
  run_started: { label: "Opened a PR run", tone: "success" },
  notified: { label: "Notified", tone: "info" },
  no_match: { label: "Notified", tone: "info" },
  recovered: { label: "Recovered", tone: "success" },
  no_open_alert: { label: "Recovered, not posted", tone: "neutral" },
  not_alarm: { label: "Not an alarm", tone: "neutral" },
  duplicate: { label: "Repeat", tone: "neutral" },
  in_flight: { label: "Already handled", tone: "neutral" },
  route_paused: { label: "Route paused", tone: "warning" },
  budget: { label: "Over token limit", tone: "warning" },
  alert_budget: { label: "Daily budget reached", tone: "warning" },
  daily_cap: { label: "Daily cap reached", tone: "warning" },
  misconfigured: { label: "Route misconfigured", tone: "error" },
  error: { label: "Error", tone: "error" },
};

function OutcomeChip({ outcome }: { outcome: string }) {
  const chip = OUTCOME_CHIP[outcome] ?? { label: outcome.replace(/[_-]+/g, " "), tone: "neutral" as const };
  if (chip.tone === "info") {
    return (
      <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-sky-300">
        {chip.label}
      </span>
    );
  }
  return <StatusPill tone={chip.tone}>{chip.label}</StatusPill>;
}

/** `arn:aws:sns:<region>:<account>:<name>` → account, when well formed. */
function topicAccount(arn: string): string | null {
  const p = arn.trim().split(":");
  if (p.length !== 6 || p[0] !== "arn" || !p[1].startsWith("aws") || p[2] !== "sns") return null;
  if (!/^\d{12}$/.test(p[4]) || !p[3] || !p[5]) return null;
  return p[4];
}

const topicName = (arn?: string | null) => (arn ?? "").split(":").pop() || "unknown topic";

function alarmsError(error?: string): string {
  if (error === "permission")
    return "Coderhelm can't read this account's alarms yet. Update the Coderhelm stack in AWS to the latest template (it adds read only cloudwatch:DescribeAlarms).";
  if (error === "not_connected") return "Connect the topic's AWS account under Settings, AWS to list its alarms.";
  return error ? "Couldn't list the topic's alarms right now." : "";
}

/** The topic's alarms, loaded once per topic. */
function useTopicAlarms(topicArn: string, enabled: boolean) {
  const [alarms, setAlarms] = useState<TopicAlarm[] | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || !topicArn) return;
    let live = true;
    api
      .listTopicAlarms(topicArn)
      .then((r) => {
        if (!live) return;
        setAlarms(r.error ? null : r.alarms);
        setMessages(r.messages ?? []);
        setError(alarmsError(r.error));
      })
      .catch(() => live && setError(alarmsError("unavailable")));
    return () => {
      live = false;
    };
  }, [topicArn, enabled]);
  return { alarms, messages, error };
}

// ── Page ─────────────────────────────────────────────────────────────

type Load = { state: "loading" } | { state: "error" } | { state: "ready" };

function AlertsPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [routes, setRoutes] = useState<AlertRoute[]>([]);
  const [endpointPath, setEndpointPath] = useState("/webhooks/alerts/sns");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [connections, setConnections] = useState<AwsConnection[]>([]);
  const [events, setEvents] = useState<AlertEvent[] | null>(null);
  const [eventsNext, setEventsNext] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState<{ route: AlertRoute; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    try {
      const r = await api.listAlertRoutes();
      setRoutes(r.routes);
      setEndpointPath(r.endpoint_path);
      setLoad({ state: "ready" });
    } catch {
      setLoad((prev) => (prev.state === "ready" ? prev : { state: "error" }));
    }
  }, []);

  const loadEvents = useCallback(async (after?: string) => {
    setEventsError(false);
    try {
      const r = await api.listAlerts(after);
      setEvents((prev) => (after ? [...(prev ?? []), ...r.alerts] : r.alerts));
      setEventsNext(r.next ?? null);
    } catch {
      setEventsError(true);
      setEvents((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    api.me().then((me) => setCanEdit(hasRole(me.role, "admin"))).catch(() => setCanEdit(false));
    loadRoutes();
    loadEvents();
    api.listRepos().then((r) => setRepos(r.repos.filter((x) => x.enabled))).catch(() => {});
    api.listAwsConnections().then((r) => setConnections(r.connections)).catch(() => {});
  }, [loadRoutes, loadEvents]);

  const endpoint = `${API_BASE_URL}${endpointPath}`;
  const connectedAccounts = useMemo(() => new Set(connections.map((c) => c.connection_id)), [connections]);
  const pairs = useMemo(() => pairRecoveries(events ?? []), [events]);

  const remove = async (route: AlertRoute) => {
    const ok = await confirm({
      title: `Remove the route for ${topicName(route.topic_arn)}?`,
      message: "Alerts on this topic stop opening pull requests and posting to chat. Unsubscribe the endpoint from the topic in AWS as well.",
      confirmLabel: "Remove route",
      destructive: true,
    });
    if (!ok) return;
    setBusy(route.topic_arn);
    try {
      await api.deleteAlertRoute(route.topic_arn);
      toast("Route removed");
      await loadRoutes();
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "Could not remove the route", "error");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (route: AlertRoute) => {
    setBusy(route.topic_arn);
    try {
      await api.saveAlertRoute({ ...route, enabled: !route.enabled });
      toast(route.enabled ? "Route paused. Its alerts are recorded but nothing runs or posts." : "Route turned back on");
      await loadRoutes();
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "Could not change the route", "error");
    } finally {
      setBusy(null);
    }
  };

  if (editing) {
    return (
      <Page>
        <RouteEditor
          initial={editing.route}
          isNew={editing.isNew}
          repos={repos}
          connectedAccounts={connectedAccounts}
          events={events ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadRoutes();
          }}
        />
      </Page>
    );
  }

  const addRoute = () => setEditing({ route: { ...EMPTY_ROUTE }, isNew: true });

  return (
    <Page>
      <PageHeader
        title="Alert routes"
        lead="Turn monitoring alerts into pull requests or chat messages. Each SNS topic gets a route; its rules pick the alerts that open a pull request. Every other alert just posts to chat."
        actions={
          <>
            <Link href="/alerts" className={secondaryButton}>
              All received alerts
            </Link>
            {canEdit && (
              <button type="button" onClick={addRoute} className={primaryButton}>
                Add route
              </button>
            )}
          </>
        }
      />

      {!canEdit && load.state === "ready" && (
        <div className="mt-6">
          <Callout variant="info" live={false}>
            <p>You can see the routes, their rules and the alerts they received. Only an admin or the owner can change them.</p>
          </Callout>
        </div>
      )}

      <div className="mt-8 space-y-8">
        <section aria-labelledby="routes-heading" className="min-w-0">
          <h2 id="routes-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Routes</h2>
          <div className="mt-3">
            {load.state === "loading" && <ListSkeleton rows={2} label="Loading the routes" />}
            {load.state === "error" && (
              <Callout variant="error" title="Could not load the alert routes">
                <p>Nothing was changed.</p>
                <p>
                  <button type="button" onClick={() => { setLoad({ state: "loading" }); loadRoutes(); }} className={linkButton}>
                    Try again
                  </button>
                </p>
              </Callout>
            )}
            {load.state === "ready" && routes.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center">
                <p className="font-semibold text-zinc-100">No alert routes yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">
                  A route connects an SNS topic to Coderhelm. Open &ldquo;How to connect a topic&rdquo; below, then add the route.
                </p>
                {canEdit && (
                  <button type="button" onClick={addRoute} className={`${primaryButton} mt-4`}>
                    Add your first route
                  </button>
                )}
              </div>
            )}
            {load.state === "ready" && routes.length > 0 && (
              <List label="Alert routes">
                {routes.map((r) => {
                  const account = topicAccount(r.topic_arn);
                  return (
                    <RouteRow
                      key={r.topic_arn}
                      route={r}
                      account={account}
                      connected={account ? connectedAccounts.has(account) : false}
                      lastEvent={(events ?? []).find((e) => e.topic_arn === r.topic_arn)}
                      canEdit={canEdit}
                      busy={busy === r.topic_arn}
                      onEdit={() => setEditing({ route: { ...r }, isNew: false })}
                      onToggle={() => toggle(r)}
                      onRemove={() => remove(r)}
                    />
                  );
                })}
              </List>
            )}
          </div>
          <div className="mt-3">
            <SetupSteps endpoint={endpoint} defaultOpen={load.state === "ready" && routes.length === 0} />
          </div>
        </section>

        {canEdit && <AlertSettings />}
      </div>

      <Section
        id="recent"
        title="Recent alerts"
        description="The latest alerts on every route and what Coderhelm did with each. A recovery shows the alert it resolves."
        actions={
          <Link href="/alerts" className={linkButton}>
            Open the full log
          </Link>
        }
      >
        <EventsTimeline
          events={events}
          pairs={pairs}
          routes={routes}
          error={eventsError}
          next={eventsNext}
          onRetry={() => loadEvents()}
          onMore={() => (eventsNext ? loadEvents(eventsNext) : undefined)}
        />
      </Section>
    </Page>
  );
}

// ── A route ──────────────────────────────────────────────────────────

function RouteRow({
  route: r,
  account,
  connected,
  lastEvent,
  canEdit,
  busy,
  onEdit,
  onToggle,
  onRemove,
}: {
  route: AlertRoute;
  account: string | null;
  connected: boolean;
  lastEvent?: AlertEvent;
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const mode = r.notify_mode ?? "team";
  const name = topicName(r.topic_arn);
  const titleId = useId();
  const chat = mode === "custom" && channelsSummary(r.webhooks) ? `Own channel (${channelsSummary(r.webhooks)})` : (NOTIFY_LABEL[mode] ?? NOTIFY_LABEL.team);
  const tone = !connected ? "waiting" : r.enabled ? "success" : "muted";
  return (
    <ListRow
      testId={`route-${name}`}
      status={{ tone }}
      title={<span id={titleId}>{name}</span>}
      titleText={r.topic_arn}
      meta={[
        `Chat: ${chat}`,
        mode !== "off" && (r.post_recoveries ? "Posts recoveries" : "Recoveries not posted"),
        r.rules.length === 0 ? "No rules: chat only" : `${r.rules.length} rule${r.rules.length === 1 ? "" : "s"}`,
      ]}
      summary={
        !connected
          ? `The topic's AWS account (${account ?? "unknown"}) is not connected, so its alerts are ignored.`
          : lastEvent
            ? `Last alert ${timeAgo(lastEvent.received_at ?? "")}: ${lastEvent.title || "Untitled alert"}`
            : "No alerts received recently."
      }
      summaryTone={!connected ? "waiting" : undefined}
      chips={
        <>
          <span className="text-xs text-zinc-400">{!connected ? "Account not connected" : r.enabled ? "On" : "Paused"}</span>
          {canEdit && (
            <Switch checked={r.enabled} onChange={onToggle} disabled={busy} labelledBy={titleId} />
          )}
        </>
      }
      actions={
        canEdit ? (
          <>
            <button type="button" onClick={onEdit} className={buttonClass("secondary", "sm")}>
              Edit rules
            </button>
            <button type="button" onClick={onRemove} disabled={busy} className={buttonClass("ghost", "sm")} aria-label={`Remove the route for ${name}`}>
              Remove
            </button>
          </>
        ) : undefined
      }
      details={
        <>
          <DetailBlock title="Topic">
            <Code>{r.topic_arn}</Code>
          </DetailBlock>
          <DetailBlock title="Rules, first match wins">
            <ol aria-label="Rules, first match wins" className="flex flex-col gap-1.5">
              {r.rules.map((rule, i) => (
                <li key={rule.id ?? i} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="w-5 shrink-0 text-zinc-500">{i + 1}.</span>
                  <span className="min-w-0 text-zinc-300">{ruleWhen(rule)}</span>
                  <span aria-hidden="true" className="text-zinc-600">→</span>
                  <span className="sr-only">opens a pull request in</span>
                  <span className="min-w-0 break-all text-emerald-300">{rule.repo}</span>
                </li>
              ))}
              <li className="flex flex-wrap items-baseline gap-x-2 text-zinc-500">
                <span className="w-5 shrink-0" />
                <span>{r.rules.length ? "Everything else" : "Every alert"}</span>
                <span aria-hidden="true" className="text-zinc-600">→</span>
                <span className="text-sky-300">{mode === "off" ? "recorded only" : "chat only"}</span>
              </li>
            </ol>
          </DetailBlock>
          {lastEvent && (
            <DetailBlock title="Last alert">
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/alerts/detail?id=${encodeURIComponent(lastEvent.id)}`} className={`${linkButton} min-w-0 !text-xs`}>
                  {lastEvent.title || "Untitled alert"}
                </Link>
                <OutcomeChip outcome={lastEvent.outcome} />
              </span>
            </DetailBlock>
          )}
          {!connected && (
            <p className="text-amber-300">
              <Link href="/settings/integrations/aws/" className={`${linkButton} !text-xs`}>Connect the AWS account</Link>
            </p>
          )}
          {connected && <RouteAlarms route={r} />}
        </>
      }
      detailsLabel="Rules"
      detailsFor={`rules of ${name}`}
    />
  );
}

function ruleWhen(rule: AlertRule): string {
  if (rule.alarms.length > 0) return rule.alarms.length === 1 ? rule.alarms[0] : `${rule.alarms[0]} and ${rule.alarms.length - 1} more`;
  const terms = rule.terms.filter((t) => t.trim());
  if (terms.length > 0) return `Text contains “${terms.join("” or “")}”`;
  return "Every alert";
}

const STATE_DOT: Record<string, string> = { ALARM: "bg-red-400", OK: "bg-emerald-400", INSUFFICIENT_DATA: "bg-zinc-500" };
const STATE_WORD: Record<string, string> = { ALARM: "In alarm", OK: "OK", INSUFFICIENT_DATA: "No data" };

function RouteAlarms({ route }: { route: AlertRoute }) {
  const [open, setOpen] = useState(false);
  const { alarms, error } = useTopicAlarms(route.topic_arn, open);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${linkButton} !text-xs`}>
        {open ? "Hide the alarms on this topic" : "Show the alarms on this topic"}
      </button>
      {open && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-zinc-800">
          {error ? (
            <p className="p-3 text-sm text-amber-300">{error}</p>
          ) : alarms === null ? (
            <p role="status" className="p-3 text-sm text-zinc-500">Loading the alarms…</p>
          ) : alarms.length === 0 ? (
            <p className="p-3 text-sm text-zinc-500">No alarms publish to this topic.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {alarms.map((a) => {
                const i = ruleForAlarm(route.rules, a.name);
                return (
                  <li key={a.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[a.state ?? ""] ?? "bg-zinc-600"}`} />
                    <span className="w-16 shrink-0 text-zinc-500">{STATE_WORD[a.state ?? ""] ?? a.state ?? "Unknown"}</span>
                    <span className="min-w-0 flex-1 break-all text-zinc-300" title={a.description ?? ""}>
                      {a.name}
                    </span>
                    {i >= 0 ? (
                      <span className="shrink-0 text-emerald-300">Rule {i + 1}: PR in {route.rules[i].repo.split("/").pop()}</span>
                    ) : (
                      <span className="shrink-0 text-sky-300">chat only</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Connecting a topic ───────────────────────────────────────────────

function SetupSteps({ endpoint, defaultOpen }: { endpoint: string; defaultOpen: boolean }) {
  return (
    <SettingsDisclosure summary="How to connect a topic" defaultOpen={defaultOpen}>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-zinc-400">
        <li>
          Connect the topic&apos;s AWS account under <Link href="/settings/integrations/aws/" className={linkButton}>AWS</Link>.
        </li>
        <li>Add a route: the topic ARN, and rules for the alerts that should open a pull request.</li>
        <li>
          Subscribe this HTTPS endpoint to the topic. Coderhelm confirms the subscription by itself.
          <CodeBlock code={endpoint} title="HTTPS endpoint" className="mt-1.5" testId="alerts-endpoint" />
        </li>
      </ol>
      <div className="space-y-2 text-sm text-zinc-400">
        <p className="font-medium text-zinc-300">Which alerts work</p>
        <p>
          CloudWatch alarm notifications (only the ALARM state opens a pull request), AWS Chatbot custom notifications, EventBridge events
          and plain messages. A plain message with a <Code>Recovers: &lt;alert title&gt;</Code> line is the recovery of that alert.
        </p>
        <p>Repeats of the same alert fold into one run, and each route starts at most 20 runs a day.</p>
      </div>
    </SettingsDisclosure>
  );
}

// ── Team channel and budget ──────────────────────────────────────────

/** "500k", "1.5M", "250,000" → tokens; null when not a number. */
function parseTokens(v: string): number | null {
  const m = v.trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([km])?$/i);
  if (!m) return null;
  const mult = { k: 1_000, m: 1_000_000 }[(m[2] ?? "").toLowerCase() as "k" | "m"] ?? 1;
  return Math.round(Number(m[1]) * mult);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(n);
}

type AlertForm = { enabled: boolean; budget: string };

/** A budget typed as "2M" and saved as 2000000 are the same; text that isn't a number is a change. */
const sameAlertField = (a: unknown, b: unknown, key: keyof AlertForm) => {
  if (key !== "budget") return a === b;
  const x = parseTokens(String(a ?? ""));
  const y = parseTokens(String(b ?? ""));
  return x !== null && x === y;
};

/**
 * The team channel (Teams, Slack or both) and the daily token budget for
 * alert runs: two settings rows saved by one bar. Each still saves through
 * its own request, as before.
 */
function AlertSettings() {
  const { toast } = useToast();
  const [notify, setNotify] = useState<AlertNotifySettings | null>(null);
  const [notifyError, setNotifyError] = useState(false);
  const [budget, setBudget] = useState<AlertBudget | null>(null);
  const [budgetError, setBudgetError] = useState(false);
  const [draft, setDraft] = useState<ChannelsDraft>(draftFrom(NO_WEBHOOKS));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const form = useDirtyForm<AlertForm>({ enabled: false, budget: "" }, { same: sameAlertField, disabled: !notify && !budget });
  const { reset } = form;

  /** Re-reads the saved channels (they come back as hints, never as addresses). */
  const reloadChannels = useCallback(() => {
    api
      .getAlertNotify()
      .then((s) => {
        setNotify(s);
        setDraft(draftFrom(s.webhooks));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    Promise.allSettled([api.getAlertNotify(), api.getAlertBudget()]).then(([n, b]) => {
      if (!live) return;
      const next: AlertForm = { enabled: false, budget: "" };
      if (n.status === "fulfilled") {
        setNotify(n.value);
        setDraft(draftFrom(n.value.webhooks));
        next.enabled = n.value.enabled;
      } else setNotifyError(true);
      if (b.status === "fulfilled") {
        setBudget(b.value);
        next.budget = fmtTokens(b.value.daily_tokens);
      } else setBudgetError(true);
      reset(next);
    });
    return () => {
      live = false;
    };
  }, [reset]);

  const channelsDirty = !!notify && draftDirty(draft, notify.webhooks);
  const notifyDirty = !!notify && (form.isDirty("enabled") || channelsDirty);
  const budgetDirty = !!budget && form.isDirty("budget");
  const count = (notify && form.isDirty("enabled") ? 1 : 0) + (channelsDirty ? 1 : 0) + (budgetDirty ? 1 : 0);
  const n = parseTokens(form.values.budget);
  const budgetValid = n !== null && n <= 100_000_000;
  const channelsValid = draftValid(draft, notify?.webhooks, form.values.enabled);

  const save = async () => {
    if (budgetDirty && !budgetValid) {
      setProblem("Enter a daily budget such as 500k or 2M, up to 100M.");
      return;
    }
    if (notifyDirty && !channelsValid) {
      setProblem("Check the webhook addresses. A channel that is ticked needs a working address.");
      return;
    }
    setSaving(true);
    setProblem(null);
    const failed: string[] = [];
    if (notifyDirty && notify) {
      try {
        await api.saveAlertNotify({ enabled: form.values.enabled, ...channelsPayload(draft, notify.webhooks) });
      } catch {
        failed.push("the team channel (check the webhook address)");
      }
    }
    if (budgetDirty && n !== null) {
      try {
        await api.saveAlertBudget(n);
        setBudget((b) => (b ? { ...b, daily_tokens: n } : b));
      } catch {
        failed.push("the budget");
      }
    }
    const edited = form.values;
    const next: AlertForm = {
      enabled: notifyDirty && !failed.some((f) => f.startsWith("the team")) ? edited.enabled : form.saved.enabled,
      budget: budgetDirty && !failed.includes("the budget") && n !== null ? fmtTokens(n) : form.saved.budget,
    };
    reset(next);
    if (failed.length) {
      form.update(edited);
      setProblem(`Could not save ${failed.join(" or ")}. Try again.`);
      toast("Could not save every change", "error");
    } else {
      toast("Alert settings saved");
    }
    if (notifyDirty && !failed.some((f) => f.startsWith("the team"))) reloadChannels();
    setSaving(false);
  };

  const discard = () => {
    form.discard();
    if (notify) setDraft(draftFrom(notify.webhooks));
    setProblem(null);
  };

  const used = budget ? Math.min(100, (budget.used_24h_tokens / Math.max(budget.daily_tokens, 1)) * 100) : 0;

  return (
    <>
      <SettingsSection id="alert-settings" title="Team channel and budget">
        <SettingsRow
          label="Post alerts to the team channel"
          layout="toggle"
          testId="team-channel-row"
          unsaved={notifyDirty}
          help="Routes set to the team channel post here: a red message when an alarm fires, a follow up with the pull request link, and green recoveries on routes that post them."
          control={(ids) => (
            <Switch
              id={ids.inputId}
              checked={form.values.enabled}
              onChange={(on) => form.set("enabled", on)}
              labelledBy={ids.labelId}
              describedBy={ids.helpId}
              disabled={!notify}
            />
          )}
        >
          {notifyError ? (
            <Callout variant="error"><p>Could not load the team channel. Reload the page to try again.</p></Callout>
          ) : (
            <ChannelPicker
              idPrefix="team"
              draft={draft}
              saved={notify?.webhooks}
              onChange={setDraft}
              disabled={!notify}
              destination={{ destination: "alerts" }}
            />
          )}
        </SettingsRow>
        <SettingsRow
          label="Daily token budget for alert runs"
          controlClassName="sm:w-40"
          unsaved={budgetDirty}
          help={`Alert runs stop for the day once they use this many tokens; alerts keep posting to chat. Each rule also starts at most ${budget?.max_runs_per_rule_per_day ?? 5} runs a day. 0 turns alert runs off.`}
          control={(ids) =>
            budgetError ? (
              <p className="text-sm text-red-400">Could not load the budget.</p>
            ) : (
              <div>
                <input
                  id={ids.inputId}
                  value={form.values.budget}
                  onChange={(e) => form.set("budget", e.target.value)}
                  placeholder="500k"
                  inputMode="decimal"
                  disabled={!budget}
                  aria-invalid={form.values.budget.trim() && !budgetValid ? true : undefined}
                  aria-describedby={[ids.helpId, budget ? "alert-budget-use" : ""].filter(Boolean).join(" ")}
                  className={inputClass}
                />
                {form.values.budget.trim() && !budgetValid && (
                  <p role="alert" className="mt-1.5 text-xs text-red-400">Enter a number such as 500k or 2M, up to 100M.</p>
                )}
              </div>
            )
          }
        >
          {budget && (
            <div id="alert-budget-use">
              <div
                role="meter"
                aria-label="Alert tokens used in the last 24 hours"
                aria-valuemin={0}
                aria-valuemax={budget.daily_tokens}
                aria-valuenow={Math.min(budget.used_24h_tokens, budget.daily_tokens)}
                className="h-1.5 max-w-sm overflow-hidden rounded-full bg-zinc-800"
              >
                <div className={`h-full ${used >= 100 ? "bg-red-400" : used >= 75 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${used}%` }} />
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {fmtTokens(budget.used_24h_tokens)} of {fmtTokens(budget.daily_tokens)} used in the last 24 hours
                {budget.open_runs > 0 && `, ${budget.open_runs} run${budget.open_runs > 1 ? "s" : ""} in progress (each counts as ${fmtTokens(budget.open_run_reserve_tokens)})`}
              </p>
            </div>
          )}
        </SettingsRow>
      </SettingsSection>
      <SaveBar count={count} onSave={save} onDiscard={discard} saving={saving} problem={problem} />
    </>
  );
}

// ── Recent alerts ────────────────────────────────────────────────────

type EventFilter = "all" | "runs" | "recoveries" | "problems";
const PROBLEM_OUTCOMES = new Set(["route_paused", "budget", "alert_budget", "daily_cap", "misconfigured", "error"]);

function EventsTimeline({
  events,
  pairs,
  routes,
  error,
  next,
  onRetry,
  onMore,
}: {
  events: AlertEvent[] | null;
  pairs: Map<string, AlertEvent>;
  routes: AlertRoute[];
  error: boolean;
  next: string | null;
  onRetry: () => void;
  onMore: () => Promise<void> | void;
}) {
  const [filter, setFilter] = useState<EventFilter>("all");
  const [topic, setTopic] = useState("all");
  const [loadingMore, setLoadingMore] = useState(false);

  // Alerts later resolved by a recovery, so the alert row can say so too.
  const resolvedBy = useMemo(() => {
    const m = new Map<string, AlertEvent>();
    for (const [recoveryId, alert] of pairs) {
      const rec = events?.find((e) => e.id === recoveryId);
      if (rec && !m.has(alert.id)) m.set(alert.id, rec);
    }
    return m;
  }, [pairs, events]);

  if (events === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  const shown = events.filter(
    (e) =>
      (topic === "all" || e.topic_arn === topic) &&
      (filter === "all" ||
        (filter === "runs" && e.outcome === "run_started") ||
        (filter === "recoveries" && isRecovery(e)) ||
        (filter === "problems" && PROBLEM_OUTCOMES.has(e.outcome))),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full"><Segmented
          label="Show"
          options={[
            { value: "all", label: "All" },
            { value: "runs", label: "PRs" },
            { value: "recoveries", label: "Recoveries" },
            { value: "problems", label: "Problems" },
          ]}
          value={filter}
          onChange={setFilter}
        /></div>
        {routes.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Route
            <select value={topic} onChange={(e) => setTopic(e.target.value)} className={`${inputClass} w-auto py-1.5`}>
              <option value="all">Every route</option>
              {routes.map((r) => (
                <option key={r.topic_arn} value={r.topic_arn}>{topicName(r.topic_arn)}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <Callout variant="error" title="Could not load the recent alerts">
          <p><button type="button" onClick={onRetry} className={linkButton}>Try again</button></p>
        </Callout>
      )}

      {!error && events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
          No alerts received yet. They appear here as soon as a subscribed topic sends one.
        </div>
      ) : shown.length === 0 && !error ? (
        <p className="text-sm text-zinc-500">No alerts match. Choose All to see every alert.</p>
      ) : (
        <ol aria-label="Recent alerts" className="overflow-hidden rounded-lg border border-zinc-800 divide-y divide-zinc-800">
          {shown.map((e) => {
            const resolves = pairs.get(e.id);
            const recovery = resolvedBy.get(e.id);
            return (
              <li key={e.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                <time dateTime={e.received_at ?? undefined} className="shrink-0 text-xs text-zinc-500 sm:w-28 sm:pt-0.5" title={e.received_at ?? ""}>
                  {e.received_at ? timeAgo(e.received_at) : "Unknown time"}
                </time>
                <div className="min-w-0 flex-1">
                  <Link href={`/alerts/detail?id=${encodeURIComponent(e.id)}`} className={`${linkButton} text-zinc-100`}>
                    {e.title || "Untitled alert"}
                  </Link>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {topicName(e.topic_arn)}
                    {e.repo ? <> · {e.repo}</> : null}
                  </p>
                  {resolves && (
                    <p className="mt-1 text-xs text-emerald-300">
                      Resolves{" "}
                      <Link href={`/alerts/detail?id=${encodeURIComponent(resolves.id)}`} className={`${linkButton} text-xs text-emerald-200`}>
                        {resolves.title || "the alert"}
                      </Link>
                      {resolves.received_at && e.received_at && ` after ${duration(resolves.received_at, e.received_at)}`}
                    </p>
                  )}
                  {recovery && (
                    <p className="mt-1 text-xs text-zinc-400">
                      Recovered{recovery.received_at && e.received_at ? ` ${duration(e.received_at, recovery.received_at)} later` : ""}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  <OutcomeChip outcome={e.outcome} />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {next && (
        <div>
          <button
            type="button"
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              await onMore();
              setLoadingMore(false);
            }}
            className={secondaryButton}
          >
            {loadingMore ? "Loading…" : "Show older alerts"}
          </button>
        </div>
      )}
    </div>
  );
}

function duration(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "a while";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${Math.round(h / 24)} days`;
}

// ── The rule builder ─────────────────────────────────────────────────

function AlarmPicker({ id, alarms, selected, onChange }: { id: string; alarms: TopicAlarm[]; selected: string[]; onChange: (names: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = alarms.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()));
  // Chosen alarms that no longer exist stay listed so they can be removed.
  const missing = selected.filter((n) => !alarms.some((a) => a.name === n));
  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950">
      <label htmlFor={`${id}-search`} className="sr-only">Search alarms</label>
      <input
        id={`${id}-search`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${alarms.length} alarms`}
        className="w-full rounded-t-lg border-b border-zinc-800 bg-transparent px-3 py-2 text-sm text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-100"
      />
      <ul className="max-h-56 overflow-y-auto py-1">
        {[...missing.map((name) => ({ name, state: "missing" }) as TopicAlarm), ...shown].map((a) => (
          <li key={a.name}>
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900">
              <input type="checkbox" checked={selected.includes(a.name)} onChange={() => toggle(a.name)} className="h-4 w-4 shrink-0 accent-emerald-500" />
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[a.state ?? ""] ?? "bg-zinc-600"}`} />
              <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
              {a.state === "missing" ? (
                <span className="shrink-0 text-xs text-amber-300">not on this topic</span>
              ) : (
                <span className="shrink-0 text-xs text-zinc-500">{STATE_WORD[a.state ?? ""] ?? ""}</span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

const split = (v: string) => v.split(",").map((t) => t.trim()).filter(Boolean);

function RuleEditor({
  rule,
  index,
  count,
  repos,
  alarms,
  messages,
  alarmsLoadError,
  matches,
  onChange,
  onRemove,
  onMove,
}: {
  rule: AlertRule;
  index: number;
  count: number;
  repos: Repo[];
  alarms: TopicAlarm[] | null;
  messages: string[];
  alarmsLoadError: string;
  matches: number;
  onChange: (r: AlertRule) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [terms, setTerms] = useState(rule.terms.join(", "));
  const [names, setNames] = useState(rule.alarms.join(", "));
  const [by, setBy] = useState<"alarms" | "text">(rule.alarms.length === 0 && rule.terms.length > 0 ? "text" : "alarms");
  const id = `rule-${index}`;

  // A rule matches one way: switching clears the other, so a hidden field
  // never widens what the rule takes.
  const switchTo = (mode: "alarms" | "text") => {
    setBy(mode);
    if (mode === "alarms") {
      setTerms("");
      onChange({ ...rule, terms: [] });
    } else {
      setNames("");
      onChange({ ...rule, alarms: [] });
    }
  };

  const missingMatch = by === "alarms" ? rule.alarms.length === 0 : rule.terms.length === 0;

  return (
    <fieldset className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <legend className="sr-only">Rule {index + 1}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-zinc-100">Rule {index + 1}</span>
        <span className="text-xs text-zinc-500">
          {matches > 0 ? `Takes ${matches} of the recent alerts` : "Takes none of the recent alerts"}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={`${secondaryButton} !px-2.5`} aria-label={`Move rule ${index + 1} up`}>
          ↑
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className={`${secondaryButton} !px-2.5`} aria-label={`Move rule ${index + 1} down`}>
          ↓
        </button>
        <button type="button" onClick={onRemove} className={`${linkButton} text-red-400`}>
          Remove rule
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-100">When an alert</span>
          <div className="max-w-full"><Segmented
            label={`Rule ${index + 1} matches by`}
            options={[
              { value: "alarms", label: "is one of these alarms" },
              { value: "text", label: "contains this text" },
            ]}
            value={by}
            onChange={switchTo}
          /></div>
          {by === "alarms" ? (
            alarms ? (
              <AlarmPicker id={id} alarms={alarms} selected={rule.alarms} onChange={(a) => onChange({ ...rule, alarms: a })} />
            ) : (
              <Field id={`${id}-alarms`} label="Alarm names" helper={alarmsLoadError || "Separate names with commas."}>
                {(props) => (
                  <input
                    {...props}
                    value={names}
                    onChange={(e) => {
                      setNames(e.target.value);
                      onChange({ ...rule, alarms: split(e.target.value) });
                    }}
                    placeholder="prod-api-5xx, prod-db-cpu"
                    className={inputClass}
                  />
                )}
              </Field>
            )
          ) : (
            <>
              <Field
                id={`${id}-terms`}
                label="Phrases"
                helper="Any one of them is enough. Matches the alert's title or text, ignoring case. Separate phrases with commas."
              >
                {(props) => (
                  <input
                    {...props}
                    value={terms}
                    onChange={(e) => {
                      setTerms(e.target.value);
                      onChange({ ...rule, terms: split(e.target.value) });
                    }}
                    placeholder="crawler TLS fingerprint"
                    className={inputClass}
                  />
                )}
              </Field>
              {messages.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-400">Seen on this topic. Press one to add or remove it:</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {messages.map((m) => {
                      const on = rule.terms.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            const next = on ? rule.terms.filter((t) => t !== m) : [...rule.terms, m];
                            setTerms(next.join(", "));
                            onChange({ ...rule, terms: next });
                          }}
                          className={`rounded-md border px-2 py-0.5 text-xs ${focusRing} ${
                            on ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100"
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          {missingMatch && (
            <p className="text-sm text-amber-300">{by === "alarms" ? "Pick at least one alarm." : "Add at least one phrase."}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-repo`} className="text-sm font-semibold text-zinc-100">
            Open a pull request in
          </label>
          <RepoCombobox id={`${id}-repo`} label="Repository for this rule" repos={repos} selected={rule.repo} onSelect={(name) => onChange({ ...rule, repo: name })} />
          {!rule.repo && <p className="text-sm text-amber-300">Choose a repository.</p>}
        </div>

        <Field
          id={`${id}-instructions`}
          label="How to fix these alerts"
          helper="Alert text is treated as data, never as instructions, so put every rule for the fix here."
        >
          {(props) => (
            <textarea
              {...props}
              value={rule.instructions}
              onChange={(e) => onChange({ ...rule, instructions: e.target.value })}
              rows={4}
              maxLength={8000}
              placeholder="When memory passes 80%, resize the node in envs/prod/main.tf one size up. Quote the alarm's numbers in the pull request."
              className={inputClass}
            />
          )}
        </Field>
      </div>
    </fieldset>
  );
}

function RouteEditor({
  initial,
  isNew,
  repos,
  connectedAccounts,
  events,
  onClose,
  onSaved,
}: {
  initial: AlertRoute;
  isNew: boolean;
  repos: Repo[];
  connectedAccounts: Set<string>;
  events: AlertEvent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [route, setRoute] = useState<AlertRoute>(initial);
  const [channels, setChannels] = useState<ChannelsDraft>(draftFrom(initial.webhooks));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Stable keys for rules, so moving one keeps its typed text with it.
  const keys = useRef<string[]>(initial.rules.map((r, i) => r.id ?? `k${i}`));
  const nextKey = useRef(initial.rules.length);
  useEffect(() => {
    document.getElementById("alert-route-heading")?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  const topic = route.topic_arn.trim();
  const account = topicAccount(topic);
  const arnError = topic && !account ? "Not an SNS topic ARN. It looks like arn:aws:sns:<region>:<account>:<name>." : "";
  const accountError = account && !connectedAccounts.has(account) ? `Connect AWS account ${account} under Settings, AWS first.` : "";
  const mode = route.notify_mode ?? "team";
  const customUrlError = mode === "custom" && !draftValid(channels, initial.webhooks, true);
  const { alarms, messages, error: alarmsLoadError } = useTopicAlarms(topic, !!account && !accountError);
  const notifyOnly = route.rules.length === 0;
  const silent = notifyOnly && mode === "off";
  const rulesOk = route.rules.every((r) => !!r.repo && (r.alarms.length > 0 || r.terms.length > 0));
  const canSave = !!account && !accountError && !customUrlError && rulesOk && !silent && !saving;

  const setRules = (rules: AlertRule[]) => setRoute((r) => ({ ...r, rules }));
  const setRule = (i: number, rule: AlertRule) => setRules(route.rules.map((x, k) => (k === i ? rule : x)));
  const removeRule = (i: number) => {
    keys.current = keys.current.filter((_, k) => k !== i);
    setRules(route.rules.filter((_, k) => k !== i));
  };
  const addRule = () => {
    keys.current = [...keys.current, `k${nextKey.current++}`];
    setRules([...route.rules, { ...EMPTY_RULE }]);
  };
  const moveRule = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= route.rules.length) return;
    const rules = [...route.rules];
    [rules[i], rules[j]] = [rules[j], rules[i]];
    const k = [...keys.current];
    [k[i], k[j]] = [k[j], k[i]];
    keys.current = k;
    setRules(rules);
  };

  // The live preview: which rule takes each recent alert on this topic.
  const topicEvents = useMemo(() => events.filter((e) => e.topic_arn === topic).slice(0, 25), [events, topic]);
  const preview = topicEvents.map((e) => ({ event: e, rule: isRecovery(e) || e.outcome === "not_alarm" ? -2 : pickRule(route.rules, e) }));
  const perRule = route.rules.map((_, i) => preview.filter((p) => p.rule === i).length);

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await api.saveAlertRoute({
        topic_arn: topic,
        rules: route.rules,
        enabled: route.enabled,
        notify_mode: mode,
        ...(mode === "custom" ? channelsPayload(channels, initial.webhooks) : {}),
        post_recoveries: !!route.post_recoveries,
      });
      toast("Route saved");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setSaveError(
        msg.includes("409")
          ? "Another team already routes this topic."
          : msg.includes("403")
            ? "The topic's AWS account isn't connected to this team."
            : msg || "The route could not be saved. Nothing was changed.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        detail
        crumb={isNew ? "New route" : topicName(topic)}
        title={isNew ? "Add an alert route" : `Edit the route for ${topicName(topic)}`}
        titleId="alert-route-heading"
        lead="Rules are checked in order and the first one that takes an alert opens a pull request. Alerts no rule takes only post to chat, at no token cost."
        actions={
          <button type="button" onClick={onClose} className={secondaryButton}>
            Back to alert routes
          </button>
        }
      />

      <form
        className="mt-6 grid items-start gap-6 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save();
        }}
      >
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Field id="topic-arn" label="SNS topic ARN" error={arnError || accountError || undefined} helper={!isNew ? "A route's topic can't change. Remove the route and add a new one instead." : undefined}>
            {(props) => (
              <input
                {...props}
                value={route.topic_arn}
                disabled={!isNew}
                onChange={(e) => setRoute({ ...route, topic_arn: e.target.value })}
                placeholder="arn:aws:sns:us-east-1:123456789012:alarms"
                spellCheck={false}
                className={`${monoInputClass} disabled:opacity-60`}
              />
            )}
          </Field>

          <section aria-labelledby="rules-heading" className="flex flex-col gap-3">
            <h2 id="rules-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Rules, first match wins</h2>
            {route.rules.map((rule, i) => (
              <RuleEditor
                key={keys.current[i]}
                rule={rule}
                index={i}
                count={route.rules.length}
                repos={repos}
                alarms={alarms}
                messages={messages}
                alarmsLoadError={alarmsLoadError}
                matches={perRule[i] ?? 0}
                onChange={(r) => setRule(i, r)}
                onRemove={() => removeRule(i)}
                onMove={(dir) => moveRule(i, dir)}
              />
            ))}
            <button
              type="button"
              onClick={addRule}
              className={`w-full rounded-lg border border-dashed border-zinc-700 px-3 py-3 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 ${focusRing}`}
            >
              Add a rule
            </button>
            <p className="text-sm text-zinc-500">
              {route.rules.length ? "Everything else" : "Every alert"} <span aria-hidden="true">→</span> {mode === "off" ? "recorded only" : "chat only"}
            </p>
          </section>

          <section aria-labelledby="teams-route-heading" className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <h2 id="teams-route-heading" className="font-semibold text-zinc-100">Chat messages</h2>
            <div className="max-w-full"><Segmented
              label="Where this route posts"
              options={(["team", "custom", "off"] as const)
                .filter((m) => !notifyOnly || m !== "off")
                .map((m) => ({ value: m, label: NOTIFY_LABEL[m] }))}
              value={mode}
              onChange={(m) => setRoute({ ...route, notify_mode: m })}
            /></div>
            {mode === "custom" ? (
              <ChannelPicker
                idPrefix="route"
                draft={channels}
                saved={initial.webhooks}
                onChange={setChannels}
                destination={{ destination: "route", topic_arn: topic }}
              />
            ) : (
              <p className="text-sm text-zinc-400">
                {mode === "team" ? "Uses the team channel set on the Alert routes page." : "This route's alerts won't post to chat."}
                {notifyOnly && " A route without rules must post somewhere."}
              </p>
            )}
            {mode !== "off" && (
              <label className="flex items-start gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                  checked={!!route.post_recoveries}
                  onChange={(e) => setRoute({ ...route, post_recoveries: e.target.checked })}
                />
                <span>
                  Post recoveries
                  <span className="block text-zinc-500">
                    One green card, linking the alert, when an alert whose card was posted recovers. Later recoveries stay quiet until the alert
                    fires again. Recoveries always show on the alert&apos;s page.
                  </span>
                </span>
              </label>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-4">
            <OnOffSwitch checked={route.enabled} onChange={(enabled) => setRoute({ ...route, enabled })} label="Route is on" onLabel="On" offLabel="Paused" />
          </div>

          {saveError && (
            <Callout variant="error" title="The route was not saved">
              <p>{saveError}</p>
            </Callout>
          )}
          {silent && <p className="text-sm text-amber-300">A route with no rules and no chat messages would do nothing. Add a rule or choose a channel.</p>}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!canSave} className={primaryButton}>
              {saving ? "Saving…" : isNew ? "Add route" : "Save route"}
            </button>
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </div>

        <aside aria-labelledby="preview-heading" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm lg:sticky lg:top-4">
          <h2 id="preview-heading" className="font-semibold text-zinc-100">Live preview</h2>
          <p className="mt-1 text-zinc-400">Recent alerts on this topic and what these rules would do with each. It updates as you edit.</p>
          {!account ? (
            <p className="mt-3 text-zinc-500">Enter the topic ARN to see its recent alerts.</p>
          ) : preview.length === 0 ? (
            <p className="mt-3 text-zinc-500">No recent alerts on this topic yet.</p>
          ) : (
            <ul aria-live="polite" className="mt-3 flex flex-col divide-y divide-zinc-800">
              {preview.map(({ event: e, rule }) => (
                <li key={e.id} className="flex flex-col gap-1 py-2">
                  <span className="text-zinc-200">{e.title || "Untitled alert"}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-zinc-500">{e.received_at ? timeAgo(e.received_at) : ""}</span>
                    {rule === -2 ? (
                      <span className="text-zinc-400">Recovery or state change: no run</span>
                    ) : rule >= 0 ? (
                      <span className="text-emerald-300">
                        Rule {rule + 1}: PR in {route.rules[rule].repo || "a repository"}
                      </span>
                    ) : (
                      <span className="text-sky-300">{mode === "off" ? "Recorded only" : "Chat only"}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            The preview checks phrases against each alert&apos;s title. When an alert arrives, its full text is checked too.
          </p>
        </aside>
      </form>
    </div>
  );
}
