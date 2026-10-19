"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, type AwsRoleCheck, type Connector, type ConnectorAwsAccount, type ConnectorKind } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { Callout } from "./callout";
import { Field, SecretInput } from "./field";
import { StatusPill } from "./status-pill";
import { Section } from "./page";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";
import { inputClass, linkButton, primaryButton, secondaryButton } from "./ui";

/** What each connection gives agents, for its card. */
const ABOUT: Record<ConnectorKind, { what: string; needs: string }> = {
  newrelic: {
    what: "NRQL queries, entity search, deployment markers and change events, and response time, error rate and throughput before and after a deploy.",
    needs: "A New Relic user key (starts with NRAK-). Coderhelm only sends read queries.",
  },
  confluence: {
    what: "Search and read Confluence pages. Optionally, add text to the end of pages you list, such as a lessons page.",
    needs: "Your Confluence address, the email of an Atlassian account and an API token from id.atlassian.com.",
  },
  metrics: {
    what: "CloudWatch metrics for ECS, RDS, Lambda, CloudFront, load balancers, SQS and DynamoDB, through your connected AWS role.",
    needs: "A connected AWS account whose CoderHelm role can read metrics (Settings → AWS shows a one-click update if it can't).",
  },
  airflow: {
    what: "Airflow on MWAA: DAGs, DAG runs, task instances, task logs and import errors. Read as Airflow's Viewer role.",
    needs: "A connected AWS account whose CoderHelm role can read Airflow, and the names of your MWAA environments.",
  },
};

const list = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

function statusPill(c: Connector) {
  if (!c.connected) return <StatusPill>Not connected</StatusPill>;
  if (c.status !== "ready") return <StatusPill tone="error">Needs attention</StatusPill>;
  if (!c.enabled) return <StatusPill tone="warning">Paused</StatusPill>;
  return <StatusPill tone="success">On</StatusPill>;
}

/** The monitoring, docs and pipeline connections on the Data sources page. */
export function ConnectionsSection() {
  const [items, setItems] = useState<Connector[] | null>(null);
  const [accounts, setAccounts] = useState<ConnectorAwsAccount[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await api.listConnectors();
      setItems(r.connectors);
      setAccounts(r.aws_accounts);
    } catch (e) {
      setError(errorMessage(e, "The request failed."));
      setItems((prev) => prev ?? []);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // `?connect=<kind>` (from a skill check's link) opens that card.
  const [wanted, setWanted] = useState("");
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("connect") ?? "";
    setWanted(k);
  }, []);
  useEffect(() => {
    if (!wanted || !items) return;
    document.getElementById(`connection-${wanted}`)?.scrollIntoView({ block: "center" });
  }, [wanted, items]);

  const replace = (next: Connector) => setItems((prev) => (prev ? prev.map((c) => (c.kind === next.kind ? next : c)) : prev));

  return (
    <Section
      id="connections"
      title="Monitoring, docs and pipelines"
      description="Let agents read the systems your skills rely on. Each one is off until you turn it on, reads only, and every call shows in the activity log."
    >
      {error && (
        <Callout variant="error" title="We couldn't load these connections">
          <p>{error}</p>
          <p>
            <button type="button" onClick={load} className={linkButton}>
              Try again
            </button>
          </p>
        </Callout>
      )}
      {items === null ? (
        <p role="status" className="text-sm text-zinc-500">
          Loading…
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="connections">
          {items.map((c) => (
            <ConnectionCard key={c.kind} item={c} accounts={accounts} onChange={replace} onRemoved={load} startOpen={wanted === c.kind} />
          ))}
        </div>
      )}
    </Section>
  );
}

function ConnectionCard({
  item,
  accounts,
  onChange,
  onRemoved,
  startOpen = false,
}: {
  item: Connector;
  accounts: ConnectorAwsAccount[];
  onChange: (c: Connector) => void;
  onRemoved: () => void;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const about = ABOUT[item.kind];

  const test = async () => {
    setBusy(true);
    try {
      const r = await api.testConnector(item.kind);
      onChange(r.connector);
      toast(r.connector.status === "ready" ? `${item.label} works` : `${item.label} needs attention`, r.connector.status === "ready" ? "success" : "error");
    } catch (e) {
      toast(errorMessage(e, "The test failed."), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${item.label}?`,
      message: "Agents stop using it right away and the saved key is deleted.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.removeConnector(item.kind);
      onRemoved();
    } catch (e) {
      toast(errorMessage(e, "Couldn't remove it."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id={`connection-${item.kind}`} className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5" data-testid={`connection-${item.kind}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-100">{item.label}</h3>
        {statusPill(item)}
      </div>
      <p className="mt-1 text-sm text-zinc-400">{about.what}</p>
      {item.connected && item.status_message && (
        <p className={`mt-2 text-sm ${item.status === "ready" ? "text-zinc-400" : "text-red-300"}`}>{item.status_message}</p>
      )}
      {item.kind === "confluence" && item.write_enabled && (item.write_pages?.length ?? 0) > 0 && (
        <p className="mt-2 text-sm text-amber-300">Writes on: may add text to pages {item.write_pages?.join(", ")}.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={item.connected ? secondaryButton : primaryButton}>
          {item.connected ? "Edit" : "Connect"}
        </button>
        {item.connected && (
          <>
            <button type="button" onClick={test} disabled={busy} className={secondaryButton}>
              Test again
            </button>
            <button type="button" onClick={remove} disabled={busy} className={linkButton}>
              Remove
            </button>
          </>
        )}
      </div>
      {open && (
        <ConnectionForm
          item={item}
          accounts={accounts}
          onSaved={(c) => {
            onChange(c);
            if (c.status === "ready") setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ConnectionForm({
  item,
  accounts,
  onSaved,
}: {
  item: Connector;
  accounts: ConnectorAwsAccount[];
  onSaved: (c: Connector) => void;
}) {
  const k = item.kind;
  const [key, setKey] = useState("");
  const [region, setRegion] = useState(item.region || (k === "newrelic" ? "us" : accounts[0]?.region || ""));
  const [accountIds, setAccountIds] = useState((item.account_ids ?? []).join(", "));
  const [site, setSite] = useState(item.site ?? "");
  const [email, setEmail] = useState(item.email ?? "");
  const [spaces, setSpaces] = useState((item.spaces ?? []).join(", "));
  const [writeEnabled, setWriteEnabled] = useState(item.write_enabled ?? false);
  const [writePages, setWritePages] = useState((item.write_pages ?? []).join(", "));
  const [account, setAccount] = useState(item.aws?.account ?? accounts[0]?.account ?? "");
  const [environments, setEnvironments] = useState((item.environments ?? []).join(", "));
  const [enabled, setEnabled] = useState(item.connected ? Boolean(item.enabled) : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const id = (f: string) => `${k}-${f}`;
  const aws = k === "metrics" || k === "airflow";

  if (aws && accounts.length === 0) {
    return (
      <div className="mt-4">
        <Callout variant="info" live={false}>
          <p>
            Connect your AWS account first. <Link href="/settings/aws" className={linkButton}>Go to Settings → AWS</Link>
          </p>
        </Callout>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = { enabled };
    if (key.trim()) body.key = key.trim();
    if (k === "newrelic") Object.assign(body, { region, account_ids: list(accountIds) });
    if (k === "confluence")
      Object.assign(body, { site, email, spaces: list(spaces), write_enabled: writeEnabled, write_pages: writeEnabled ? list(writePages) : [] });
    if (aws) Object.assign(body, { account, region });
    if (k === "airflow") body.environments = list(environments);
    try {
      const r = await api.saveConnector(k, body);
      setKey("");
      onSaved(r.connector);
      if (r.connector.status !== "ready") setError(r.connector.status_message || "The test didn't pass.");
    } catch (e) {
      setError(errorMessage(e, "Couldn't save it."));
    } finally {
      setSaving(false);
    }
  };

  const text = (fid: string, label: string, value: string, set: (v: string) => void, helper?: ReactNode, placeholder?: string) => (
    <Field id={id(fid)} label={label} helper={helper}>
      {(p) => <input {...p} className={inputClass} value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} autoComplete="off" />}
    </Field>
  );

  return (
    <form
      className="mt-4 flex flex-col gap-4 border-t border-zinc-800 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-sm text-zinc-400">{ABOUT[k].needs}</p>
      {(k === "newrelic" || k === "confluence") && (
        <Field
          id={id("key")}
          label={k === "newrelic" ? "User key" : "API token"}
          helper={item.key_hint ? `A key ending in ${item.key_hint} is saved. Leave this empty to keep it.` : "Encrypted for your team and never shown again."}
        >
          {(p) => <SecretInput {...p} className={inputClass} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />}
        </Field>
      )}
      {k === "newrelic" && (
        <>
          <Field id={id("region")} label="Region">
            {(p) => (
              <select {...p} className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="us">US</option>
                <option value="eu">EU</option>
              </select>
            )}
          </Field>
          {text("accounts", "Account ids", accountIds, setAccountIds, "Only these accounts are queried. Leave empty for every account the key can see.", "1234567")}
        </>
      )}
      {k === "confluence" && (
        <>
          {text("site", "Confluence address", site, setSite, undefined, "https://yourcompany.atlassian.net")}
          {text("email", "Account email", email, setEmail, "The Atlassian account the token belongs to. Coderhelm sees what it can see.")}
          {text("spaces", "Spaces", spaces, setSpaces, "Space keys agents may read, like ENG. Leave empty for every space the account can see.", "ENG, OPS")}
          <label className="flex items-start gap-2 text-sm text-zinc-200">
            <input type="checkbox" className="mt-1" checked={writeEnabled} onChange={(e) => setWriteEnabled(e.target.checked)} />
            <span>
              Allow agents to add text to the end of the pages listed below
              <span className="block text-zinc-500">Off by default. Nothing else can be written; every addition is logged.</span>
            </span>
          </label>
          {writeEnabled && text("pages", "Writable page ids", writePages, setWritePages, "The number in the page's address, after /pages/.", "123456789")}
        </>
      )}
      {aws && (
        <>
          <Field id={id("account")} label="AWS account">
            {(p) => (
              <select
                {...p}
                className={inputClass}
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  const a = accounts.find((x) => x.account === e.target.value);
                  if (a && !region) setRegion(a.region);
                }}
              >
                {accounts.map((a) => (
                  <option key={a.account} value={a.account}>
                    {a.account} ({a.role})
                  </option>
                ))}
              </select>
            )}
          </Field>
          {text("region", "Region", region, setRegion, "Where the metrics or Airflow live.", "us-east-1")}
        </>
      )}
      {k === "airflow" && text("envs", "MWAA environments", environments, setEnvironments, "Names of the environments agents may read.", "prod-airflow")}
      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Let agents use it once the test passes
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving and testing…" : "Save and test"}
        </button>
      </div>
    </form>
  );
}

/**
 * On Settings → AWS: whether the CoderHelm role can read metrics and
 * Airflow, with the one-click stack that adds them when it can't.
 */
export function AwsRoleAccess({ account }: { account: string }) {
  const [res, setRes] = useState<AwsRoleCheck | null>(null);
  const [error, setError] = useState("");
  const run = useCallback(async () => {
    setError("");
    setRes(null);
    try {
      setRes(await api.checkAwsRole(account));
    } catch (e) {
      setError(errorMessage(e, "The check failed."));
    }
  }, [account]);
  useEffect(() => {
    run();
  }, [run]);

  if (error) return <p className="text-sm text-zinc-500">Couldn&apos;t check what the role can read: {error}</p>;
  if (!res) return <p role="status" className="text-sm text-zinc-500">Checking what the role can read…</p>;
  if (!res.check.works) return null;
  if (!res.update_url) {
    return (
      <p className="text-sm text-zinc-400" data-testid="aws-role-access">
        The role can read logs, CloudWatch metrics and Airflow.
      </p>
    );
  }
  const names = res.missing.map((m) => (m === "metrics" ? "CloudWatch metrics" : "Airflow")).join(" and ");
  return (
    <div data-testid="aws-role-access">
      <Callout variant="warning" title={`Update your CoderHelm role stack to enable ${names}`} live={false}>
        <p>
          The role can&apos;t read {names} yet, so agents can&apos;t check them. One click adds read-only access as a small stack in your account
          ({res.stack_name}); it doesn&apos;t change your existing stack, and deleting it takes the access away.
        </p>
        <p className="mt-2 flex flex-wrap gap-3">
          <a href={res.update_url} target="_blank" rel="noreferrer" className={primaryButton}>
            Add metrics and Airflow access in AWS
          </a>
          <button type="button" onClick={run} className={secondaryButton}>
            Check again
          </button>
        </p>
      </Callout>
    </div>
  );
}
