"use client";

import { useEffect, useState } from "react";
import { api, type JiraCheck, type Repo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { RepoCombobox } from "@/components/repo-combobox";

export default function JiraPage() {
  const [check, setCheck] = useState<JiraCheck | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const [generatingSecret, setGeneratingSecret] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([api.getJiraCheck(), api.listRepos()])
      .then(([c, r]) => {
        setCheck(c);
        const enabled = r.repos.filter((repo) => repo.enabled);
        setRepos(enabled);
        if (enabled.length > 0) setSelectedRepo(enabled[0].name);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const generateSecret = async () => {
    setGeneratingSecret(true);
    try {
      const res = await api.generateJiraSecret();
      setSecret(res.secret);
      setCheck((c) => c ? { ...c, secret_configured: true } : c);
      toast("Secret generated — copy it now, it won't be shown again");
    } catch {
      toast("Failed to generate secret", "error");
    }
    setGeneratingSecret(false);
  };

  const deleteSecret = async () => {
    if (!confirm("Remove the webhook secret? Jira webhooks will no longer be signature-verified.")) return;
    try {
      await api.deleteJiraSecret();
      setSecret(null);
      setCheck((c) => c ? { ...c, secret_configured: false } : c);
      toast("Secret removed");
    } catch {
      toast("Failed to remove secret", "error");
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Jira Integration</h1>
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const [repoOwner, repoName] = selectedRepo.includes("/")
    ? selectedRepo.split("/")
    : ["your-org", "your-repo"];

  const payloadTemplate = JSON.stringify(
    {
      installation_id: check?.installation_id ?? 0,
      repo_owner: repoOwner,
      repo_name: repoName,
      issue: {
        key: "{{issue.key}}",
        fields: {
          summary: "{{issue.summary}}",
          description: "{{issue.description}}",
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Jira Integration</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Connect Jira so issues trigger d3ftly runs automatically.
        Create a Jira Automation rule that sends a webhook when issues are created or transitioned.
      </p>

      {/* Status */}
      <div className={`p-4 rounded-lg border mb-6 ${
        check?.ready
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-yellow-500/5 border-yellow-500/20"
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={check?.ready ? "text-emerald-400" : "text-yellow-400"}>
            {check?.ready ? "✓" : "○"}
          </span>
          <span className={`text-sm font-medium ${check?.ready ? "text-emerald-400" : "text-yellow-400"}`}>
            {check?.ready ? "Connected" : "Not connected yet"}
          </span>
        </div>
        <div className="text-xs text-zinc-500 mt-1 space-y-0.5">
          <p>{check?.secret_configured ? "✓" : "○"} Webhook secret configured</p>
          <p>{(check?.configured_repos.enabled ?? 0) > 0 ? "✓" : "○"} {check?.configured_repos.enabled ?? 0} enabled repo(s)</p>
          <p>{check?.jira_events_seen ? "✓" : "○"} Jira events received</p>
        </div>
      </div>

      {/* Step 1: Webhook secret */}
      <div className="space-y-6 mb-8">
        <Step number={1} title="Generate webhook secret">
          <p className="text-zinc-400 text-sm mb-3">
            This secret verifies Jira webhooks are legitimate. Generate one here, then paste it into your Jira automation rule&apos;s headers.
          </p>
          {secret ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-emerald-400 font-mono truncate">
                  {secret}
                </code>
                <button onClick={() => copy(secret, "secret")} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors shrink-0">
                  {copied === "secret" ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-yellow-400">Copy this secret now — it won&apos;t be shown again.</p>
            </div>
          ) : check?.secret_configured ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-emerald-400">✓ Secret configured</span>
              <button onClick={generateSecret} disabled={generatingSecret} className="text-xs text-zinc-500 hover:text-zinc-300 underline">
                {generatingSecret ? "Generating..." : "Regenerate"}
              </button>
              <button onClick={deleteSecret} className="text-xs text-zinc-600 hover:text-red-400 underline">
                Remove
              </button>
            </div>
          ) : (
            <button onClick={generateSecret} disabled={generatingSecret} className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors">
              {generatingSecret ? "Generating..." : "Generate secret"}
            </button>
          )}
        </Step>

        {/* Step 2: Jira Automation rule */}
        <Step number={2} title="Create a Jira Automation rule">
          <p className="text-zinc-400 text-sm">
            In your Jira project: <strong className="text-zinc-200">Project Settings → Automation → Create rule</strong>
          </p>
          <p className="text-zinc-500 text-xs mt-1">
            Trigger: <strong className="text-zinc-300">Issue created</strong> or <strong className="text-zinc-300">Issue transitioned</strong>.
            Action: <strong className="text-zinc-300">Send web request</strong>.
          </p>
        </Step>

        {/* Step 3: Webhook URL */}
        <Step number={3} title="Paste the webhook URL">
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-200 font-mono">
                {check?.webhook_url ?? "https://api.d3ftly.com/webhooks/jira"}
              </code>
              <button onClick={() => copy(check?.webhook_url ?? "https://api.d3ftly.com/webhooks/jira", "url")} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors">
                {copied === "url" ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-zinc-500 text-xs mt-2">
              Method: <strong className="text-zinc-300">POST</strong> · Headers: <strong className="text-zinc-300">Content-Type: application/json</strong>
              {(secret || check?.secret_configured) && (
                <span> · <strong className="text-zinc-300">x-hub-signature-256: sha256=&lt;hmac&gt;</strong></span>
              )}
            </p>
          </div>
        </Step>

        {/* Step 4: Payload with repo selector */}
        <Step number={4} title="Set the JSON payload">
          <p className="text-zinc-400 text-sm mb-2">
            Select the repo this Jira project maps to. The payload template updates automatically.
          </p>
          {repos.length > 0 && (
            <div className="mb-3">
              <RepoCombobox repos={repos} selected={selectedRepo} onSelect={setSelectedRepo} />
            </div>
          )}
          <div className="relative">
            <pre className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre">
              {payloadTemplate}
            </pre>
            <button
              onClick={() => copy(payloadTemplate, "payload")}
              className="absolute top-2 right-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {copied === "payload" ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-zinc-600 text-xs mt-2">
            Jira smart values like <code className="text-zinc-400">{"{{issue.key}}"}</code> are auto-replaced by Jira at runtime.
          </p>
        </Step>

        {/* Step 5: Test */}
        <Step number={5} title="Enable the rule and test">
          <p className="text-zinc-400 text-sm">
            Save and enable the automation rule, then create a test issue.
            A new run should appear on the Runs page within a minute.
          </p>
        </Step>
      </div>

      {/* Test payload */}
      <TestPayload toast={toast} />
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
        {number}
      </div>
      <div className="flex-1 pt-0.5">
        <h3 className="text-sm font-medium text-zinc-100 mb-1">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function TestPayload({ toast }: { toast: (msg: string, type?: "error" | "success") => void }) {
  const [payload, setPayload] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; missing: string[]; next_step: string } | null>(null);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const parsed = JSON.parse(payload);
      const res = await api.validateJiraPayload(parsed);
      setResult(res);
    } catch {
      toast("Invalid JSON payload", "error");
    }
    setTesting(false);
  };

  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Test your payload</h3>
      <textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        rows={6}
        placeholder='Paste your Jira automation payload JSON here...'
        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-mono placeholder-zinc-700 focus:outline-none focus:border-zinc-500 resize-y mb-3"
      />
      <button
        onClick={test}
        disabled={testing || !payload.trim()}
        className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
      >
        {testing ? "Validating..." : "Validate payload"}
      </button>

      {result && (
        <div className={`mt-3 p-3 rounded-lg border text-sm ${
          result.valid
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
            : "bg-red-500/5 border-red-500/20 text-red-400"
        }`}>
          <p className="font-medium mb-1">{result.valid ? "✓ Payload is valid" : "✗ Payload has issues"}</p>
          {result.missing.map((m, i) => (
            <p key={i} className="text-xs text-red-400">Missing: {m}</p>
          ))}
          <p className="text-xs text-zinc-400 mt-1">{result.next_step}</p>
        </div>
      )}
    </div>
  );
}
