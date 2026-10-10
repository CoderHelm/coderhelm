"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, API_BASE_URL, type AlertRoute, type AwsConnection, type Repo } from "@/lib/api";
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

const EMPTY: AlertRoute = { topic_arn: "", repo: "", instructions: "", match_terms: [], enabled: true };

/** `arn:aws:sns:<region>:<account>:<name>` → account, when well-formed. */
function topicAccount(arn: string): string | null {
  const p = arn.trim().split(":");
  if (p.length !== 6 || p[0] !== "arn" || !p[1].startsWith("aws") || p[2] !== "sns") return null;
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
      api.listRepos().then((r) => setRepos(r.repos.filter((x) => x.enabled))).catch(() => {}),
      api.listAwsConnections().then((r) => setConnections(r.connections)).catch(() => {}),
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
      message: "Alerts on this topic will no longer start runs. Unsubscribe the endpoint from the topic in AWS as well.",
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
            Turn monitoring alerts into pull requests. CoderHelm reads the alerts on an SNS topic, makes the change your
            instructions describe in the mapped repo, and opens a PR for review. Nothing merges without a person&apos;s
            approval.{" "}
            <Link href="/alerts" className="text-zinc-400 hover:text-zinc-200 underline">
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

      <SetupSteps endpoint={endpoint} />

      {loading ? (
        <div className="text-sm text-zinc-500 mt-6">Loading...</div>
      ) : routes.length === 0 ? (
        <div className="border border-dashed border-zinc-700 rounded-xl p-8 text-center mt-6">
          <p className="text-sm text-zinc-400">No alert routes yet.</p>
          <p className="text-xs text-zinc-500 mt-1">Add a route to map an SNS topic to a repository.</p>
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {routes.map((r) => {
            const account = topicAccount(r.topic_arn);
            const connected = account ? connectedAccounts.has(account) : false;
            return (
              <div key={r.topic_arn} className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
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
                      <span className="text-zinc-600">→</span>
                      <span className="font-mono text-sm text-zinc-300 truncate">{r.repo}</span>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-500 mt-1 truncate">{r.topic_arn}</p>
                    {r.match_terms.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {r.match_terms.map((t) => (
                          <span key={t} className="px-2 py-0.5 text-[11px] bg-zinc-800 text-zinc-300 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {!connected && (
                      <p className="text-xs text-yellow-400 mt-2">
                        The topic&apos;s AWS account ({account ?? "unknown"}) is not connected — alerts are ignored until
                        it is.
                      </p>
                    )}
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

function SetupSteps({ endpoint }: { endpoint: string }) {
  const { toast } = useToast();
  return (
    <div className="border border-zinc-800 rounded-lg p-4 text-sm text-zinc-400 space-y-2">
      <p className="text-zinc-200 font-medium">How to connect a topic</p>
      <ol className="list-decimal list-inside space-y-1">
        <li>Connect the topic&apos;s AWS account under Integrations → AWS.</li>
        <li>Add a route below: the topic ARN, the repo, and how your team acts on its alerts.</li>
        <li>
          Subscribe this HTTPS endpoint to the topic (CoderHelm confirms the subscription automatically):
          <div className="flex items-center gap-2 mt-1.5">
            <code className="flex-1 px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs text-zinc-200 truncate">
              {endpoint}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(endpoint).then(() => toast("Copied", "success"))}
              className="px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-300 hover:text-white cursor-pointer"
            >
              Copy
            </button>
          </div>
        </li>
      </ol>
      <p className="text-xs text-zinc-500">
        Works with CloudWatch alarm notifications (only the ALARM state acts), AWS Chatbot custom notifications,
        EventBridge events and plain messages. Repeats of the same alert collapse into one run, and each route starts at
        most 20 runs a day.
      </p>
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
  const [terms, setTerms] = useState(initial.match_terms.join(", "));
  const [saving, setSaving] = useState(false);

  const account = topicAccount(route.topic_arn);
  const arnError = route.topic_arn && !account ? "Not an SNS topic ARN (arn:aws:sns:<region>:<account>:<name>)." : "";
  const accountError =
    account && !connectedAccounts.has(account)
      ? `Connect AWS account ${account} under Integrations → AWS first.`
      : "";
  const canSave = !!account && !accountError && !!route.repo && !saving;

  const save = async () => {
    setSaving(true);
    try {
      await api.saveAlertRoute({
        topic_arn: route.topic_arn.trim(),
        repo: route.repo,
        instructions: route.instructions,
        match_terms: terms
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        enabled: route.enabled,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{isNew ? "Add alert route" : "Edit alert route"}</h2>

        <label className="block">
          <span className="text-xs text-zinc-400">SNS topic ARN</span>
          <input
            value={route.topic_arn}
            disabled={!isNew}
            onChange={(e) => setRoute({ ...route, topic_arn: e.target.value })}
            placeholder="arn:aws:sns:us-east-1:123456789012:alarms"
            className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm font-mono text-zinc-100 disabled:opacity-60"
          />
          {(arnError || accountError) && <span className="text-xs text-yellow-400">{arnError || accountError}</span>}
        </label>

        <div>
          <span className="text-xs text-zinc-400">Repository</span>
          <div className="mt-1">
            <RepoCombobox repos={repos} selected={route.repo} onSelect={(name) => setRoute({ ...route, repo: name })} />
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-zinc-400">How your team acts on these alerts</span>
          <textarea
            value={route.instructions}
            onChange={(e) => setRoute({ ...route, instructions: e.target.value })}
            rows={7}
            maxLength={8000}
            placeholder="e.g. For a new crawler fingerprint, add it to the block list in envs/prod/main.tf, or to the challenge list when the alert says it may be real users. Quote the request and IP counts in the PR."
            className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-100"
          />
          <span className="text-[11px] text-zinc-500">
            Alert text itself is treated as data, never as instructions — put every rule here.
          </span>
        </label>

        <label className="block">
          <span className="text-xs text-zinc-400">Only alerts containing (optional, comma-separated)</span>
          <input
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="e.g. fingerprint, 5xx"
            className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-100"
          />
          <span className="text-[11px] text-zinc-500">Empty = every alert on the topic.</span>
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={route.enabled}
            onChange={(e) => setRoute({ ...route, enabled: e.target.checked })}
          />
          Enabled
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white cursor-pointer">
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
