"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type AwsConnection, type LogGroup } from "@/lib/api";
import { useToast } from "@/components/toast";

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  error: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  testing: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
};

export default function AwsConnectionsPage() {
  const [connections, setConnections] = useState<AwsConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"cfn" | "manual">("cfn");
  const { toast } = useToast();

  const refresh = useCallback(() => {
    setLoading(true);
    api
      .listAwsConnections()
      .then((r) => setConnections(r.connections))
      .catch(() => toast("Failed to load connections", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">AWS Connections</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Connect your AWS accounts to analyze CloudWatch Logs and get recommendations.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-sm font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors"
        >
          Connect AWS
        </button>
      </div>

      {/* Existing connections */}
      {loading ? (
        <div className="text-sm text-zinc-500">Loading...</div>
      ) : connections.length === 0 ? (
        <EmptyState onConnect={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <ConnectionCard key={conn.connection_id} connection={conn} onRefresh={refresh} />
          ))}
        </div>
      )}

      {/* Add connection modal */}
      {showAdd && (
        <AddConnectionModal
          mode={addMode}
          setMode={setAddMode}
          onClose={() => setShowAdd(false)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="border border-dashed border-zinc-700 rounded-xl p-8 text-center">
      <div className="text-4xl mb-3">☁️</div>
      <h3 className="text-lg font-semibold text-zinc-100 mb-2">No AWS accounts connected</h3>
      <p className="text-sm text-zinc-500 mb-4 max-w-md mx-auto">
        Connect your AWS account to let Coderhelm analyze your CloudWatch Logs, detect errors,
        and suggest fixes — all without storing any raw log data.
      </p>
      <button
        onClick={onConnect}
        className="px-6 py-2.5 text-sm font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors"
      >
        Connect AWS Account
      </button>
    </div>
  );
}

function ConnectionCard({ connection: conn, onRefresh }: { connection: AwsConnection; onRefresh: () => void }) {
  const [testing, setTesting] = useState(false);
  const [showLogGroups, setShowLogGroups] = useState(false);
  const [logGroups, setLogGroups] = useState<LogGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(conn.log_groups));
  const [savingGroups, setSavingGroups] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const { toast } = useToast();
  const s = STATUS_STYLES[conn.status] || STATUS_STYLES.active;

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await api.testAwsConnection(conn.connection_id);
      toast(result.message, result.status === "connected" ? "success" : "error");
      onRefresh();
    } catch {
      toast("Connection test failed", "error");
    } finally {
      setTesting(false);
    }
  };

  const handleDiscover = async () => {
    setShowLogGroups(true);
    try {
      const result = await api.discoverLogGroups(conn.connection_id);
      setLogGroups(result.log_groups);
    } catch {
      toast("Failed to discover log groups", "error");
    }
  };

  const handleSaveLogGroups = async () => {
    setSavingGroups(true);
    try {
      await api.updateAwsConnection(conn.connection_id, {
        log_groups: Array.from(selectedGroups),
      });
      toast("Log groups saved");
      setShowLogGroups(false);
      onRefresh();
    } catch {
      toast("Failed to save log groups", "error");
    } finally {
      setSavingGroups(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteAwsConnection(conn.connection_id);
      toast("Connection removed");
      setShowDelete(false);
      onRefresh();
    } catch {
      toast("Failed to remove connection", "error");
    }
  };

  const toggleGroup = (name: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <>
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold text-zinc-100">
                AWS Account {conn.connection_id}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {conn.status}
              </span>
            </div>
            <div className="space-y-1 text-xs text-zinc-500">
              <p>Role: <code className="text-zinc-400">{conn.role_arn}</code></p>
              <p>Region: {conn.region}</p>
              <p>Log groups: {conn.log_groups.length > 0 ? conn.log_groups.length : "auto-discover"}</p>
              {conn.updated_at && (
                <p>Last updated: {new Date(conn.updated_at).toLocaleString()}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              {testing ? "Testing..." : "Test"}
            </button>
            <button
              onClick={handleDiscover}
              className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700"
            >
              Log Groups
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700"
            >
              Edit
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="px-3 py-1.5 text-xs bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/20"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      {/* Log Groups Discovery Modal */}
      {showLogGroups && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowLogGroups(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Select Log Groups</h3>
            <p className="text-xs text-zinc-500 mb-4">
              Choose which log groups Coderhelm should monitor. Leave empty to auto-discover.
            </p>

            <div className="flex-1 overflow-y-auto space-y-1 mb-4">
              {logGroups.length === 0 ? (
                <p className="text-sm text-zinc-500">Loading log groups...</p>
              ) : (
                logGroups.map((lg) => (
                  <label
                    key={lg.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroups.has(lg.name)}
                      onChange={() => toggleGroup(lg.name)}
                      className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{lg.name}</p>
                      {lg.stored_bytes !== undefined && (
                        <p className="text-xs text-zinc-500">
                          {formatBytes(lg.stored_bytes)}
                          {lg.retention_days ? ` · ${lg.retention_days}d retention` : ""}
                        </p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-zinc-800">
              <span className="text-xs text-zinc-500">
                {selectedGroups.size} selected
              </span>
              <div className="flex gap-3">
                <button onClick={() => setShowLogGroups(false)} className="text-sm text-zinc-400">
                  Cancel
                </button>
                <button
                  onClick={handleSaveLogGroups}
                  disabled={savingGroups}
                  className="px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50"
                >
                  {savingGroups ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <EditConnectionModal
          connection={conn}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false);
            onRefresh();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDelete(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Remove Connection</h3>
            <p className="text-sm text-zinc-400 mb-4">
              This will disconnect AWS account {conn.connection_id}. Existing recommendations will be kept.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDelete(false)} className="text-sm text-zinc-400">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EditConnectionModal({
  connection,
  onClose,
  onSuccess,
}: {
  connection: AwsConnection;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [roleArn, setRoleArn] = useState(connection.role_arn);
  const [region, setRegion] = useState(connection.region);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateAwsConnection(connection.connection_id, { role_arn: roleArn, region });
      toast("Connection updated");
      onSuccess();
    } catch {
      toast("Failed to update connection", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold text-zinc-100 mb-4">Edit Connection</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Role ARN</label>
            <input
              value={roleArn}
              onChange={(e) => setRoleArn(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100"
              placeholder="arn:aws:iam::123456789012:role/CoderHelmLogReader"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Region</label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100"
              placeholder="us-east-1"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="text-sm text-zinc-400">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddConnectionModal({
  mode,
  setMode,
  onClose,
  onSuccess,
}: {
  mode: "cfn" | "manual";
  setMode: (m: "cfn" | "manual") => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [roleArn, setRoleArn] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [saving, setSaving] = useState(false);
  const [cfnData, setCfnData] = useState<{ cfn_url: string; external_id: string } | null>(null);
  const [loadingCfn, setLoadingCfn] = useState(false);
  const { toast } = useToast();

  const handleLaunchStack = async () => {
    setLoadingCfn(true);
    try {
      const data = await api.getCfnUrl();
      setCfnData(data);
      window.open(data.cfn_url, "_blank");
    } catch {
      toast("Failed to generate CloudFormation URL", "error");
    } finally {
      setLoadingCfn(false);
    }
  };

  const handleManualConnect = async () => {
    if (!roleArn.match(/^arn:aws:iam::\d{12}:role\/.+$/)) {
      toast("Invalid Role ARN format", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await api.createAwsConnection(roleArn, region);
      if (result.error) {
        toast(result.message || "Failed to connect", "error");
      } else {
        toast("AWS account connected successfully");
        onClose();
        onSuccess();
      }
    } catch {
      toast("Failed to connect AWS account", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-lg w-full">
        <h3 className="text-lg font-semibold text-zinc-100 mb-4">Connect AWS Account</h3>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg mb-6">
          <button
            onClick={() => setMode("cfn")}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "cfn" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            CloudFormation (recommended)
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "manual" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            I have a role
          </button>
        </div>

        {mode === "cfn" ? (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <h4 className="text-sm font-medium text-zinc-200 mb-2">How it works</h4>
              <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
                <li>Click &ldquo;Launch Stack&rdquo; to open AWS CloudFormation</li>
                <li>Review the template and click &ldquo;Create stack&rdquo;</li>
                <li>Copy the Role ARN from the Outputs tab</li>
                <li>Paste it below and click &ldquo;Connect&rdquo;</li>
              </ol>
              <p className="text-xs text-zinc-500 mt-3">
                The stack creates a read-only IAM role with access to CloudWatch Logs only.
                No data is written to your account.
              </p>
            </div>

            <button
              onClick={handleLaunchStack}
              disabled={loadingCfn}
              className="w-full px-4 py-2.5 bg-[#FF9900] text-zinc-900 rounded-lg text-sm font-semibold hover:bg-[#FFB347] disabled:opacity-50 transition-colors"
            >
              {loadingCfn ? "Generating..." : "Launch Stack in AWS"}
            </button>

            {cfnData && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-xs text-emerald-400 mb-1">Stack launched! External ID:</p>
                <code className="text-xs text-zinc-300 block bg-zinc-800 px-2 py-1 rounded">
                  {cfnData.external_id}
                </code>
              </div>
            )}

            <div className="border-t border-zinc-800 pt-4">
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Role ARN (from CloudFormation Outputs)
              </label>
              <input
                value={roleArn}
                onChange={(e) => setRoleArn(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100"
                placeholder="arn:aws:iam::123456789012:role/CoderHelmLogReader"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <h4 className="text-sm font-medium text-zinc-200 mb-2">Manual setup</h4>
              <p className="text-xs text-zinc-400">
                Create an IAM role in your account with a trust policy allowing account{" "}
                <code className="text-zinc-300">REDACTED_AWS_ACCOUNT_ID</code> to assume it. The role needs{" "}
                <code className="text-zinc-300">logs:StartQuery</code>,{" "}
                <code className="text-zinc-300">logs:GetQueryResults</code>, and{" "}
                <code className="text-zinc-300">logs:DescribeLogGroups</code> permissions.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Role ARN</label>
              <input
                value={roleArn}
                onChange={(e) => setRoleArn(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100"
                placeholder="arn:aws:iam::123456789012:role/YourRoleName"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Region</label>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100"
                placeholder="us-east-1"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="text-sm text-zinc-400">Cancel</button>
          <button
            onClick={handleManualConnect}
            disabled={saving || !roleArn}
            className="px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50"
          >
            {saving ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
