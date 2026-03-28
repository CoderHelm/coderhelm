"use client";

import { useEffect, useState } from "react";
import { api, type JiraCheck } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";

type Tab = "app" | "webhook";

export default function JiraPage() {
  const [check, setCheck] = useState<JiraCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const [generatingSecret, setGeneratingSecret] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("app");
  const { toast } = useToast();

  useEffect(() => {
    api.getJiraCheck()
      .then((c) => { setCheck(c); setLoading(false); })
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

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Jira Integration</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Connect Jira so assigning or transitioning issues triggers d3ftly automatically.
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
          <p>{(check?.configured_repos.enabled ?? 0) > 0 ? "✓" : "○"} {check?.configured_repos.enabled ?? 0} enabled repo(s)</p>
          <p>{check?.jira_events_seen ? "✓" : "○"} Jira events received</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg mb-6 w-fit">
        {(["app", "webhook"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
            {t === "app" ? "Forge App" : "Webhook"}
          </button>
        ))}
      </div>

      {tab === "app" ? (
        <ForgeAppTab check={check} copy={copy} copied={copied} />
      ) : (
        <WebhookTab
          check={check}
          setCheck={setCheck}
          secret={secret}
          generatingSecret={generatingSecret}
          generateSecret={generateSecret}
          deleteSecret={deleteSecret}
          copy={copy}
          copied={copied}
          toast={toast}
        />
      )}
    </div>
  );
}

function ForgeAppTab({ check, copy, copied }: { check: JiraCheck | null; copy: (t: string, l: string) => void; copied: string | null }) {
  const installUrl = "https://developer.atlassian.com/console/install/0f707126-f6c4-4cae-9332-d736617d4d53?signature=AYABeK8ie1a%2BTEeiPiM3T34MbZ0AAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4IOp8r3eKNYw8z2v%2FEq3%2FfvrZguoGsXpNSaDveR%2FF%2Fo0BLruyVn8r%2FEOK5h8zi1R8RgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDOwhe7cajq6Kgf30AgIBEIA7g6njzGaMjLWQyz%2BCDOQNFhkv1Ghs8zFsfBdFyAvBn%2FBzsFg5WiL%2FGR2qcsFcIlAEiiqP02TVMaE7Y2kAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHijmwVTMt6Oj3F%2B0%2B0cVrojrS8yZ9ktpdfDxqPMSIkvHAHG51UcQbI0xcGuuDtvUzJqAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMcjwGpZCf3N2rvLLrAgEQgDsbrPOc%2FNcsNH7s%2F4VR%2FWHVwx3PlPH0N3ECm3npY13Nb%2FdShsRRInN4SIU3UnDNjFHQxozi8SY65YXnjgAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeLKa7Dfn9BgbXaQmJGrkKztjV4vrreTkqr7wGwhqIYs5AUgWk554l4fXM9HqT0ByV70AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAyhb0F6qjUivcDxj6oCARCAOz9RXk9GwPGp7n3Re50PKAi18EmdnrKe9QXFaBC2XlmEPMU%2FdfyAb43jE3uE2aOzp74GG6mb4q9XZfYrAgAAAAAMAAAQAAAAAAAAAAAAAAAAACsLtWLW%2Fsef6SMqv5DtUiX%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADKjtj7iA2wG62JAY42sMdcdN14Kj4fecUhXoAwxaA0oFCWepgmVkD3w4J4O3Nqtkx9cBmtjrK1gYmQIJpPW9N%2Fd278%3D&product=jira";

  return (
    <div className="space-y-6">
      <p className="text-zinc-400 text-sm">
        Install the d3ftly Forge app on your Jira site. When you assign a ticket with a <code className="text-zinc-300 bg-zinc-800 px-1 rounded">d3ftly</code> label, d3ftly determines the right repo from the ticket context and starts working.
      </p>

      <div className="space-y-6">
        <Step number={1} title="Install the Forge app">
          <p className="text-zinc-400 text-sm mb-3">
            Click the button below to install d3ftly on your Jira site. You need to be a Jira admin.
          </p>
          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white transition-colors"
          >
            Install on Jira
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        </Step>

        <Step number={2} title="Label and assign">
          <p className="text-zinc-400 text-sm">
            Add a <code className="text-zinc-300 bg-zinc-800 px-1 rounded">d3ftly</code> label to any Jira issue, then assign it. d3ftly picks the right repo automatically based on the ticket.
          </p>
        </Step>

        <Step number={3} title="Check the Runs page">
          <p className="text-zinc-400 text-sm">
            A new run should appear within a minute. d3ftly creates a branch, implements the change, and opens a draft PR.
          </p>
        </Step>
      </div>
    </div>
  );
}

interface WebhookTabProps {
  check: JiraCheck | null;
  setCheck: React.Dispatch<React.SetStateAction<JiraCheck | null>>;
  secret: string | null;
  generatingSecret: boolean;
  generateSecret: () => void;
  deleteSecret: () => void;
  copy: (text: string, label: string) => void;
  copied: string | null;
  toast: (msg: string, type?: "error" | "success") => void;
}

function WebhookTab({ check, setCheck, secret, generatingSecret, generateSecret, deleteSecret, copy, copied, toast }: WebhookTabProps) {
  return (
    <div className="space-y-6 mb-8">
      <p className="text-zinc-400 text-sm">
        Alternatively, use a Jira Automation rule to send webhooks to d3ftly when issues are created or transitioned.
      </p>

      <Step number={1} title="Generate webhook secret">
        <p className="text-zinc-400 text-sm mb-3">
          This secret verifies Jira webhooks are legitimate.
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

      <Step number={2} title="Create a Jira Automation rule">
        <p className="text-zinc-400 text-sm">
          In your Jira project: <strong className="text-zinc-200">Project Settings → Automation → Create rule</strong>
        </p>
        <p className="text-zinc-500 text-xs mt-1">
          Trigger: <strong className="text-zinc-300">Issue created</strong> or <strong className="text-zinc-300">Issue transitioned</strong>.
          Action: <strong className="text-zinc-300">Send web request</strong>.
        </p>
      </Step>

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

      <Step number={4} title="Enable and test">
        <p className="text-zinc-400 text-sm">
          Save the rule, create a test issue, and check the Runs page.
        </p>
      </Step>

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


