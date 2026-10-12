"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  API_BASE_URL,
  type AlertBudget,
  type AlertNotifySettings,
  type AlertRoute,
  type AlertRule,
  type AwsConnection,
  type Repo,
  type TopicAlarm,
} from "@/lib/api";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { useConfirm } from "@/components/confirm-dialog";

export default function AlertsPageGuarded() {
  return (
    <RoleGuard minRole="admin">
      <AlertsPage />
    </RoleGuard>
  );
}

const EMPTY: AlertRoute = {
  topic_arn: "",
  rules: [],
  enabled: true,
  notify_mode: "team",
  teams_webhook_url: "",
  post_recoveries: false,
};

/** Teams webhook hosts the API accepts (Workflows and legacy incoming webhooks). */
function validTeamsUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      !u.username &&
      [".powerplatform.com", ".logic.azure.com", ".webhook.office.com"].some(
        (s) => host.endsWith(s),
      )
    );
  } catch {
    return false;
  }
}

const EMPTY_RULE: AlertRule = {
  alarms: [],
  terms: [],
  repo: "",
  instructions: "",
};

const STATE_DOT: Record<string, string> = {
  ALARM: "bg-red-400",
  OK: "bg-emerald-400",
  INSUFFICIENT_DATA: "bg-zinc-500",
};

/** The first rule that takes an alarm by name, as the backend picks it. */
function ruleForAlarm(rules: AlertRule[], name: string): AlertRule | undefined {
  return rules.find(
    (r) =>
      r.alarms.includes(name) ||
      (r.alarms.length === 0 && r.terms.every((t) => !t.trim())) ||
      r.terms.some(
        (t) => t.trim() && name.toLowerCase().includes(t.trim().toLowerCase()),
      ),
  );
}

function alarmsError(error?: string): string {
  if (error === "permission")
    return "CoderHelm can't read this account's alarms yet. Update the CoderHelm stack in AWS to the latest template (it adds read-only cloudwatch:DescribeAlarms).";
  if (error === "not_connected")
    return "Connect the topic's AWS account under Integrations → AWS to list its alarms.";
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

const NOTIFY_LABEL: Record<string, string> = {
  team: "Team channel",
  custom: "Own channel",
  off: "No notifications",
};

/** `arn:aws:sns:<region>:<account>:<name>` → account, when well-formed. */
function topicAccount(arn: string): string | null {
  const p = arn.trim().split(":");
  if (
    p.length !== 6 ||
    p[0] !== "arn" ||
    !p[1].startsWith("aws") ||
    p[2] !== "sns"
  )
    return null;
  if (!/^\d{12}$/.test(p[4]) || !p[3] || !p[5]) return null;
  return p[4];
}

function AlertsPage() {
  const { toast } = useToast();
  const [routes, setRoutes] = useState<AlertRoute[]>([]);
  const [endpointPath, setEndpointPath] = useState("/webhooks/alerts/sns");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [connections, setConnections] = useState<AwsConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AlertRoute | null>(null);
  const [isNew, setIsNew] = useState(false);
  const { confirm } = useConfirm();

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.listAlertRoutes().then((r) => {
        setRoutes(r.routes);
        setEndpointPath(r.endpoint_path);
      }),
      api
        .listRepos()
        .then((r) => setRepos(r.repos.filter((x) => x.enabled)))
        .catch(() => {}),
      api
        .listAwsConnections()
        .then((r) => setConnections(r.connections))
        .catch(() => {}),
    ])
      .catch(() => toast("Failed to load alert routes", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const endpoint = `${API_BASE_URL}${endpointPath}`;
  const connectedAccounts = new Set(connections.map((c) => c.connection_id));

  const remove = async (arn: string) => {
    const ok = await confirm({
      title: "Remove alert route?",
      message:
        "Alerts on this topic will no longer start runs. Unsubscribe the endpoint from the topic in AWS as well.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteAlertRoute(arn);
      toast("Route removed", "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to remove route", "error");
    }
  };

  const toggle = async (route: AlertRoute) => {
    try {
      await api.saveAlertRoute({ ...route, enabled: !route.enabled });
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update route", "error");
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Alert routes</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Turn monitoring alerts into pull requests or Teams cards. Each SNS
            topic gets rules: pick the alarms that should open a PR, the repo,
            and how to fix them. Every other alert just posts to Teams. Nothing
            merges without a person&apos;s approval.{" "}
            <Link
              href="/alerts"
              className="text-zinc-400 hover:text-zinc-200 underline"
            >
              See received alerts
            </Link>
          </p>
        </div>
        <button
          onClick={() => {
            setEditing({ ...EMPTY });
            setIsNew(true);
          }}
          className="px-4 py-2 text-sm font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer shrink-0 ml-4"
        >
          Add route
        </button>
      </div>

      <TeamsChannel />

      <AlertBudgetCard />

      <SetupSteps endpoint={endpoint} />

      {loading ? (
        <div className="text-sm text-zinc-500 mt-6">Loading...</div>
      ) : routes.length === 0 ? (
        <div className="border border-dashed border-zinc-700 rounded-xl p-8 text-center mt-6">
          <p className="text-sm text-zinc-400">No alert routes yet.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Add a route to map an SNS topic to a repository.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {routes.map((r) => {
            const account = topicAccount(r.topic_arn);
            const connected = account ? connectedAccounts.has(account) : false;
            return (
              <div
                key={r.topic_arn}
                className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${r.enabled ? "bg-emerald-400" : "bg-zinc-600"}`}
                        aria-label={r.enabled ? "enabled" : "paused"}
                      />
                      <span className="font-mono text-sm text-zinc-100 truncate">
                        {r.topic_arn.split(":").pop()}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-500 mt-1 truncate">
                      {r.topic_arn}
                    </p>
                    <RuleSummary rules={r.rules} />
                    <p className="text-[11px] text-zinc-500 mt-2">
                      Teams:{" "}
                      {NOTIFY_LABEL[r.notify_mode ?? "team"] ?? "Team channel"}
                    </p>
                    {!connected && (
                      <p className="text-xs text-yellow-400 mt-2">
                        The topic&apos;s AWS account ({account ?? "unknown"}) is
                        not connected — alerts are ignored until it is.
                      </p>
                    )}
                    {connected && <RouteAlarms route={r} />}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => toggle(r)}
                      className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    >
                      {r.enabled ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => {
                        setEditing({ ...r });
                        setIsNew(false);
                      }}
                      className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(r.topic_arn)}
                      className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <RouteEditor
          initial={editing}
          isNew={isNew}
          repos={repos}
          connectedAccounts={connectedAccounts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function WebhookField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      const r = await api.testAlertNotify(value.trim());
      if (r.ok) toast("Test card sent. Check the channel.", "success");
      else
        toast(
          r.error ? `Teams rejected it: ${r.error}` : "Teams rejected the card",
          "error",
        );
    } catch {
      toast("That URL isn't a Teams webhook URL", "error");
    } finally {
      setTesting(false);
    }
  };
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://….environment.api.powerplatform.com/…/workflows/…"
        className="flex-1 min-w-0 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-100"
      />
      <button
        type="button"
        onClick={test}
        disabled={!validTeamsUrl(value) || testing}
        className="px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:text-white disabled:opacity-40 cursor-pointer shrink-0"
      >
        {testing ? "Sending…" : "Send test"}
      </button>
    </div>
  );
}

function TeamsChannel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AlertNotifySettings>({
    teams_webhook_url: "",
    enabled: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getAlertNotify()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const urlOk = validTeamsUrl(settings.teams_webhook_url);
  const save = async () => {
    setSaving(true);
    try {
      await api.saveAlertNotify({
        ...settings,
        teams_webhook_url: settings.teams_webhook_url.trim(),
      });
      toast("Teams channel saved", "success");
    } catch {
      toast("Failed to save. Check the webhook URL.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-zinc-800 rounded-lg p-4 mb-4 text-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-zinc-200 font-medium">Teams channel for alerts</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Every alert on your routes posts a card here: red when an alarm
            fires, a follow-up with the PR link when CoderHelm opens one, and
            green recoveries for routes that turn them on. A route can use its
            own channel instead.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-300 shrink-0">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!loaded}
            onChange={(e) =>
              setSettings({ ...settings, enabled: e.target.checked })
            }
          />
          On
        </label>
      </div>
      <div className="mt-3">
        <WebhookField
          value={settings.teams_webhook_url}
          onChange={(v) => setSettings({ ...settings, teams_webhook_url: v })}
        />
      </div>
      <details className="mt-2 text-xs text-zinc-500">
        <summary className="cursor-pointer hover:text-zinc-300">
          How to get a webhook URL
        </summary>
        <ol className="list-decimal list-inside space-y-1 mt-2">
          <li>In the Teams channel, open ⋯ → Workflows.</li>
          <li>
            Pick “Send webhook alerts to a channel” (or “Post to a channel when
            a webhook request is received”).
          </li>
          <li>
            Name it, choose the team and channel, then copy the URL it shows and
            paste it above.
          </li>
          <li>
            Add a co-owner to the workflow so it keeps working if its creator
            leaves.
          </li>
        </ol>
      </details>
      <div className="flex justify-end mt-3">
        <button
          onClick={save}
          disabled={
            !loaded ||
            saving ||
            (settings.enabled && !urlOk) ||
            (!!settings.teams_webhook_url && !urlOk)
          }
          className="px-4 py-1.5 text-sm font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 disabled:opacity-40 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

/** "500k", "1.5M", "250,000" → tokens; null when not a number. */
function parseTokens(v: string): number | null {
  const m = v
    .trim()
    .replace(/,/g, "")
    .match(/^(\d+(?:\.\d+)?)\s*([km])?$/i);
  if (!m) return null;
  const mult =
    { k: 1_000, m: 1_000_000 }[(m[2] ?? "").toLowerCase() as "k" | "m"] ?? 1;
  return Math.round(Number(m[1]) * mult);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function AlertBudgetCard() {
  const { toast } = useToast();
  const [budget, setBudget] = useState<AlertBudget | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api
      .getAlertBudget()
      .then((b) => {
        setBudget(b);
        setValue(fmtTokens(b.daily_tokens));
      })
      .catch(() => {});
  }, []);
  const n = parseTokens(value);
  const valid = n !== null && n <= 100_000_000;
  const save = async () => {
    if (n === null) return;
    setSaving(true);
    try {
      await api.saveAlertBudget(n);
      setBudget(budget ? { ...budget, daily_tokens: n } : budget);
      setValue(fmtTokens(n));
      toast("Alert token budget saved", "success");
    } catch {
      toast("Failed to save the budget", "error");
    } finally {
      setSaving(false);
    }
  };
  const used = budget
    ? Math.min(
        100,
        (budget.used_24h_tokens / Math.max(budget.daily_tokens, 1)) * 100,
      )
    : 0;
  return (
    <div className="border border-zinc-800 rounded-lg p-4 mb-4 text-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-zinc-200 font-medium">Daily alert token budget</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Alert runs stop for the day once they&apos;ve used this many tokens
            (input + output, as in your monthly limit; a run in progress counts
            as {fmtTokens(budget?.open_run_reserve_tokens ?? 50_000)}). Alerts
            keep posting to Teams. Each rule also starts at most{" "}
            {budget?.max_runs_per_rule_per_day ?? 5} runs a day. 0 turns alert
            runs off.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="500k"
            className="w-24 px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-100"
          />
          <span className="text-zinc-500 text-xs">tokens</span>
          <button
            onClick={save}
            disabled={
              !valid || saving || (budget !== null && n === budget.daily_tokens)
            }
            className="px-3 py-1.5 text-xs font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 disabled:opacity-40 cursor-pointer"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {budget && (
        <div className="mt-3">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${used >= 100 ? "bg-red-400" : used >= 75 ? "bg-amber-400" : "bg-emerald-400"}`}
              style={{ width: `${used}%` }}
            />
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {fmtTokens(budget.used_24h_tokens)} of{" "}
            {fmtTokens(budget.daily_tokens)} tokens used in the last 24 hours
            {budget.open_runs > 0 &&
              ` · ${budget.open_runs} run${budget.open_runs > 1 ? "s" : ""} in progress`}
          </p>
        </div>
      )}
    </div>
  );
}

function SetupSteps({ endpoint }: { endpoint: string }) {
  const { toast } = useToast();
  return (
    <div className="border border-zinc-800 rounded-lg p-4 text-sm text-zinc-400 space-y-2">
      <p className="text-zinc-200 font-medium">How to connect a topic</p>
      <ol className="list-decimal list-inside space-y-1">
        <li>Connect the topic&apos;s AWS account under Integrations → AWS.</li>
        <li>
          Add a route below: the topic ARN, the repo, and how your team acts on
          its alerts.
        </li>
        <li>
          Subscribe this HTTPS endpoint to the topic (CoderHelm confirms the
          subscription automatically):
          <div className="flex items-center gap-2 mt-1.5">
            <code className="flex-1 px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs text-zinc-200 truncate">
              {endpoint}
            </code>
            <button
              onClick={() =>
                navigator.clipboard
                  .writeText(endpoint)
                  .then(() => toast("Copied", "success"))
              }
              className="px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-300 hover:text-white cursor-pointer"
            >
              Copy
            </button>
          </div>
        </li>
      </ol>
      <p className="text-xs text-zinc-500">
        Works with CloudWatch alarm notifications (only the ALARM state opens a
        PR; recoveries just notify), AWS Chatbot custom notifications,
        EventBridge events and plain messages. Repeats of the same alert
        collapse into one run, and each route starts at most 20 runs a day.
      </p>
    </div>
  );
}

function RuleSummary({ rules }: { rules: AlertRule[] }) {
  return (
    <div className="mt-2 space-y-1 text-xs">
      {rules.map((rule, i) => (
        <div
          key={rule.id ?? i}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
        >
          <span className="text-emerald-400 shrink-0">Opens a PR:</span>
          <span className="text-zinc-300 break-words">
            {rule.alarms.length > 0
              ? rule.alarms.length === 1
                ? rule.alarms[0]
                : `${rule.alarms[0]} +${rule.alarms.length - 1}`
              : rule.terms.length > 0
                ? `contains “${rule.terms.join("”, “")}”`
                : "every alert"}
          </span>
          <span className="text-zinc-600 shrink-0">→</span>
          <span className="font-mono text-zinc-300 break-all">{rule.repo}</span>
        </div>
      ))}
      <div className="flex items-baseline gap-2 text-zinc-500">
        <span>{rules.length ? "Everything else" : "Every alert"}</span>
        <span className="text-zinc-600">→</span>
        <span className="text-sky-400">Teams only</span>
      </div>
    </div>
  );
}

function RouteAlarms({ route }: { route: AlertRoute }) {
  const [open, setOpen] = useState(false);
  const { alarms, error } = useTopicAlarms(route.topic_arn, open);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
      >
        {open ? "Hide alarms" : "Show alarms on this topic"}
      </button>
      {open && (
        <div className="mt-2 border border-zinc-800 rounded-md max-h-72 overflow-y-auto">
          {error ? (
            <p className="text-[11px] text-yellow-400 p-2">{error}</p>
          ) : alarms === null ? (
            <p className="text-[11px] text-zinc-500 p-2">Loading...</p>
          ) : alarms.length === 0 ? (
            <p className="text-[11px] text-zinc-500 p-2">
              No alarms publish to this topic.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {alarms.map((a) => {
                const rule = ruleForAlarm(route.rules, a.name);
                return (
                  <li
                    key={a.name}
                    className="flex items-center gap-2 px-2 py-1.5 text-[11px]"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATE_DOT[a.state ?? ""] ?? "bg-zinc-600"}`}
                      title={a.state ?? ""}
                    />
                    <span
                      className="font-mono text-zinc-300 truncate flex-1"
                      title={a.description ?? ""}
                    >
                      {a.name}
                    </span>
                    {rule ? (
                      <span className="text-emerald-400 shrink-0">
                        PR · {rule.repo.split("/").pop()}
                      </span>
                    ) : (
                      <span className="text-sky-400 shrink-0">Teams</span>
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

function AlarmPicker({
  alarms,
  selected,
  onChange,
}: {
  alarms: TopicAlarm[];
  selected: string[];
  onChange: (names: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const shown = alarms.filter((a) =>
    a.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  // Selected alarms that no longer exist stay listed so they can be removed.
  const missing = selected.filter((n) => !alarms.some((a) => a.name === n));
  const toggle = (name: string) =>
    onChange(
      selected.includes(name)
        ? selected.filter((n) => n !== name)
        : [...selected, name],
    );
  return (
    <div className="border border-zinc-700 rounded-lg bg-zinc-950">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${alarms.length} alarms`}
        className="w-full px-3 py-2 bg-transparent border-b border-zinc-800 text-xs text-zinc-100"
      />
      <div className="max-h-48 overflow-y-auto py-1">
        {[
          ...missing.map((name) => ({ name, state: "missing" }) as TopicAlarm),
          ...shown,
        ].map((a) => (
          <label
            key={a.name}
            className="flex items-center gap-2 px-3 py-1 text-[11px] text-zinc-300 hover:bg-zinc-900 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(a.name)}
              onChange={() => toggle(a.name)}
            />
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATE_DOT[a.state ?? ""] ?? "bg-zinc-600"}`}
            />
            <span className="font-mono truncate">{a.name}</span>
            {a.state === "missing" && (
              <span className="text-yellow-400 shrink-0">not on topic</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

function RuleEditor({
  rule,
  index,
  repos,
  alarms,
  messages,
  alarmsError,
  onChange,
  onRemove,
}: {
  rule: AlertRule;
  index: number;
  repos: Repo[];
  alarms: TopicAlarm[] | null;
  messages: string[];
  alarmsError: string;
  onChange: (r: AlertRule) => void;
  onRemove: () => void;
}) {
  const [terms, setTerms] = useState(rule.terms.join(", "));
  const [names, setNames] = useState(rule.alarms.join(", "));
  const [by, setBy] = useState<"alarms" | "text">(
    rule.alarms.length === 0 && rule.terms.length > 0 ? "text" : "alarms",
  );
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
  const split = (v: string) =>
    v
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  return (
    <div className="border border-zinc-800 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">
          Rule {index + 1}
        </span>
        <button
          onClick={onRemove}
          className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
        >
          Remove
        </button>
      </div>
      <div>
        <span className="text-xs text-zinc-400">Match by</span>
        <div className="mt-1 grid grid-cols-2 gap-1 p-1 bg-zinc-950 border border-zinc-700 rounded-lg">
          {(
            [
              ["alarms", "CloudWatch alarms"],
              ["text", "Alert text"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => switchTo(mode)}
              className={`px-2 py-1.5 text-xs rounded-md cursor-pointer transition-colors ${
                by === mode
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {by === "alarms" ? (
        <div>
          <span className="text-xs text-zinc-400">Alarms that open a PR</span>
          <div className="mt-1">
            {alarms ? (
              <AlarmPicker
                alarms={alarms}
                selected={rule.alarms}
                onChange={(a) => onChange({ ...rule, alarms: a })}
              />
            ) : (
              <>
                <input
                  value={names}
                  onChange={(e) => {
                    setNames(e.target.value);
                    onChange({ ...rule, alarms: split(e.target.value) });
                  }}
                  placeholder="Alarm names, comma-separated"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-100"
                />
                {alarmsError && (
                  <span className="text-[11px] text-yellow-400">
                    {alarmsError}
                  </span>
                )}
              </>
            )}
          </div>
          {rule.alarms.length === 0 && (
            <span className="text-[11px] text-yellow-400">
              Pick at least one alarm.
            </span>
          )}
        </div>
      ) : (
        <label className="block">
          <span className="text-xs text-zinc-400">
            Alerts containing (comma-separated)
          </span>
          <input
            value={terms}
            onChange={(e) => {
              setTerms(e.target.value);
              onChange({ ...rule, terms: split(e.target.value) });
            }}
            placeholder="e.g. crawler TLS fingerprint"
            className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-zinc-100"
          />
          <span className="text-[11px] text-zinc-500">
            For alerts that aren&apos;t CloudWatch alarms, like the crawler
            fingerprint detector. Matches the alert&apos;s title or text.
          </span>
          {messages.length > 0 && (
            <div className="mt-2">
              <span className="text-[11px] text-zinc-400">
                Seen on this topic — click to use:
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {messages.map((m) => {
                  const on = rule.terms.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        const next = on
                          ? rule.terms.filter((t) => t !== m)
                          : [...rule.terms, m];
                        setTerms(next.join(", "));
                        onChange({ ...rule, terms: next });
                      }}
                      className={`px-2 py-0.5 text-[11px] rounded border cursor-pointer ${
                        on
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {rule.terms.length === 0 && (
            <span className="block text-[11px] text-yellow-400">
              Add at least one phrase.
            </span>
          )}
        </label>
      )}
      <div>
        <span className="text-xs text-zinc-400">Repository</span>
        <div className="mt-1">
          <RepoCombobox
            repos={repos}
            selected={rule.repo}
            onSelect={(name) => onChange({ ...rule, repo: name })}
          />
        </div>
      </div>
      <label className="block">
        <span className="text-xs text-zinc-400">How to fix these alerts</span>
        <textarea
          value={rule.instructions}
          onChange={(e) => onChange({ ...rule, instructions: e.target.value })}
          rows={5}
          maxLength={8000}
          placeholder="e.g. When memory passes 80%, resize the node in envs/prod/main.tf one size up. Quote the alarm's numbers in the PR."
          className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-zinc-100"
        />
        <span className="text-[11px] text-zinc-500">
          Alert text is treated as data, never as instructions — put every rule
          here.
        </span>
      </label>
    </div>
  );
}

function RouteEditor({
  initial,
  isNew,
  repos,
  connectedAccounts,
  onClose,
  onSaved,
}: {
  initial: AlertRoute;
  isNew: boolean;
  repos: Repo[];
  connectedAccounts: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [route, setRoute] = useState<AlertRoute>(initial);
  const [saving, setSaving] = useState(false);

  const account = topicAccount(route.topic_arn);
  const arnError =
    route.topic_arn && !account
      ? "Not an SNS topic ARN (arn:aws:sns:<region>:<account>:<name>)."
      : "";
  const accountError =
    account && !connectedAccounts.has(account)
      ? `Connect AWS account ${account} under Integrations → AWS first.`
      : "";
  const customUrlError =
    route.notify_mode === "custom" &&
    !validTeamsUrl(route.teams_webhook_url ?? "")
      ? "Paste a Teams Workflows webhook URL."
      : "";
  const {
    alarms,
    messages,
    error: alarmsLoadError,
  } = useTopicAlarms(route.topic_arn.trim(), !!account && !accountError);
  const notifyOnly = route.rules.length === 0;
  const silent = notifyOnly && route.notify_mode === "off";
  const canSave =
    !!account &&
    !accountError &&
    !customUrlError &&
    route.rules.every(
      (r) => !!r.repo && (r.alarms.length > 0 || r.terms.length > 0),
    ) &&
    !silent &&
    !saving;
  const setRule = (i: number, r: AlertRule) =>
    setRoute({ ...route, rules: route.rules.map((x, k) => (k === i ? r : x)) });

  const save = async () => {
    setSaving(true);
    try {
      await api.saveAlertRoute({
        topic_arn: route.topic_arn.trim(),
        rules: route.rules,
        enabled: route.enabled,
        notify_mode: route.notify_mode ?? "team",
        teams_webhook_url:
          route.notify_mode === "custom"
            ? (route.teams_webhook_url ?? "").trim()
            : "",
        post_recoveries: !!route.post_recoveries,
      });
      toast("Route saved", "success");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast(
        msg.includes("409")
          ? "That topic is already routed by another team."
          : msg.includes("403")
            ? "The topic's AWS account isn't connected to this team."
            : msg || "Failed to save route",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">
          {isNew ? "Add alert route" : "Edit alert route"}
        </h2>

        <label className="block">
          <span className="text-xs text-zinc-400">SNS topic ARN</span>
          <input
            value={route.topic_arn}
            disabled={!isNew}
            onChange={(e) => setRoute({ ...route, topic_arn: e.target.value })}
            placeholder="arn:aws:sns:us-east-1:123456789012:alarms"
            className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm font-mono text-zinc-100 disabled:opacity-60"
          />
          {(arnError || accountError) && (
            <span className="text-xs text-yellow-400">
              {arnError || accountError}
            </span>
          )}
        </label>

        <div className="space-y-3">
          <div>
            <span className="text-xs text-zinc-400">Rules</span>
            <p className="text-[11px] text-zinc-500">
              The first rule that takes an alert opens a PR. Every alert no rule
              takes only posts to Teams, at no token cost.
            </p>
          </div>
          {route.rules.map((rule, i) => (
            <RuleEditor
              key={rule.id ?? `new-${i}`}
              rule={rule}
              index={i}
              repos={repos}
              alarms={alarms}
              messages={messages}
              alarmsError={alarmsLoadError}
              onChange={(r) => setRule(i, r)}
              onRemove={() =>
                setRoute({
                  ...route,
                  rules: route.rules.filter((_, k) => k !== i),
                })
              }
            />
          ))}
          <button
            type="button"
            onClick={() =>
              setRoute({ ...route, rules: [...route.rules, { ...EMPTY_RULE }] })
            }
            className="w-full px-3 py-2 text-xs border border-dashed border-zinc-700 rounded-lg text-zinc-300 hover:text-white cursor-pointer"
          >
            Add rule
          </button>
        </div>

        <div>
          <span className="text-xs text-zinc-400">Teams notifications</span>
          <div className="mt-1 grid grid-cols-3 gap-1 p-1 bg-zinc-950 border border-zinc-700 rounded-lg">
            {(["team", "custom", "off"] as const)
              .filter((m) => !notifyOnly || m !== "off")
              .map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRoute({ ...route, notify_mode: m })}
                  className={`px-2 py-1.5 text-xs rounded-md cursor-pointer transition-colors ${
                    (route.notify_mode ?? "team") === m
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {NOTIFY_LABEL[m]}
                </button>
              ))}
          </div>
          {route.notify_mode === "custom" ? (
            <div className="mt-2">
              <WebhookField
                value={route.teams_webhook_url ?? ""}
                onChange={(v) => setRoute({ ...route, teams_webhook_url: v })}
              />
              {customUrlError && route.teams_webhook_url && (
                <span className="text-xs text-yellow-400">
                  {customUrlError}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-zinc-500">
              {(route.notify_mode ?? "team") === "team"
                ? "Uses the team channel set at the top of this page."
                : "This route's alerts won't post to Teams."}
            </span>
          )}
        </div>

        {route.notify_mode !== "off" && (
          <label className="flex items-start gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={!!route.post_recoveries}
              onChange={(e) =>
                setRoute({ ...route, post_recoveries: e.target.checked })
              }
            />
            <span>
              Post recoveries
              <span className="block text-[11px] text-zinc-500">
                Also post a green card when an alarm returns to OK. Off keeps
                the channel to alarms only; recoveries still show on the
                alert&apos;s page.
              </span>
            </span>
          </label>
        )}

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={route.enabled}
            onChange={(e) => setRoute({ ...route, enabled: e.target.checked })}
          />
          Enabled
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 disabled:opacity-40 cursor-pointer"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
