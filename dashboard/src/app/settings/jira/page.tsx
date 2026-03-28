"use client";

import { useEffect, useState, useRef } from "react";
import { api, type JiraCheck } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";

export default function JiraPage() {
  const [check, setCheck] = useState<JiraCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    api.getJiraCheck().then((data) => {
      setCheck(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
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

  const webhookUrl = "https://api.d3ftly.com/webhooks/jira";
  const payload = check?.payload_template
    ? JSON.stringify(check.payload_template, null, 2)
    : "";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Jira Integration</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Connect Jira so issues assigned in Jira automatically trigger d3ftly runs.
        Uses a Jira Automation rule to send a webhook.
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

      {/* Setup steps */}
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Setup steps</h2>

      <div className="space-y-4 mb-8">
        <Step number={1} title="Create a Jira Automation rule">
          <p className="text-zinc-400 text-sm">
            In your Jira project, go to <strong className="text-zinc-200">Project Settings → Automation</strong> and create a new rule.
          </p>
          <p className="text-zinc-500 text-xs mt-1">
            Trigger: <strong className="text-zinc-300">Issue created</strong> or <strong className="text-zinc-300">Issue transitioned</strong>.
          </p>
        </Step>

        <Step number={2} title="Add a &quot;Send web request&quot; action">
          <div className="mt-2">
            <label className="text-xs text-zinc-500 block mb-1">Webhook URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-200 font-mono">
                {webhookUrl}
              </code>
              <button
                onClick={() => copy(webhookUrl, "url")}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                {copied === "url" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <p className="text-zinc-500 text-xs mt-2">
            Method: <strong className="text-zinc-300">POST</strong> · Headers: <strong className="text-zinc-300">Content-Type: application/json</strong>
          </p>
        </Step>

        <Step number={3} title="Set the JSON payload">
          <p className="text-zinc-400 text-sm mb-2">
            Include your GitHub repo mapping. Replace <code className="text-zinc-200">your-org</code> and <code className="text-zinc-200">your-repo</code> with the actual owner/name.
          </p>
          <div className="relative">
            <pre className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 font-mono overflow-x-auto">
              {payload}
            </pre>
            <button
              onClick={() => copy(payload, "payload")}
              className="absolute top-2 right-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {copied === "payload" ? "Copied!" : "Copy"}
            </button>
          </div>
        </Step>

        <Step number={4} title="Add HMAC webhook secret (optional but recommended)">
          <p className="text-zinc-400 text-sm">
            In the web request action, add a <strong className="text-zinc-200">Secret</strong> header.
            Contact us to configure the shared secret on both sides.
          </p>
        </Step>

        <Step number={5} title="Enable the rule and test">
          <p className="text-zinc-400 text-sm">
            Create a test issue in Jira. You should see a new run appear on the Runs page within a minute.
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
  const [result, setResult] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null);

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
          {result.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400">• {e}</p>
          ))}
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-400">• {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
