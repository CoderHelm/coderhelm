"use client";

import { useState, type ReactNode } from "react";
import { api, type AwsAccountAbilities, type AwsAbilityReply, type Connector } from "@/lib/api";
import { errorMessage, timeAgo } from "@/lib/data-sources";
import { Callout } from "./callout";
import { Field, SecretInput } from "./field";
import { Switch } from "./teams-webhook";
import { useToast } from "./toast";
import { inputClass, primaryButton, secondaryButton } from "./ui";

/** What a key-based connection needs, shown above its form. */
const NEEDS: Record<"newrelic" | "confluence", string> = {
  newrelic: "A New Relic user key (starts with NRAK-). Coderhelm only sends read queries.",
  confluence: "Your Confluence address, the email of an Atlassian account and an API token from id.atlassian.com.",
};

const list = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * New Relic or Confluence: the key (sealed for the team, never shown again)
 * and what agents may read. Saving tests it.
 */
export function ConnectorForm({ item, onSaved }: { item: Connector; onSaved: (c: Connector) => void }) {
  const k = item.kind as "newrelic" | "confluence";
  const [key, setKey] = useState("");
  const [region, setRegion] = useState(item.region || "us");
  const [accountIds, setAccountIds] = useState((item.account_ids ?? []).join(", "));
  const [site, setSite] = useState(item.site ?? "");
  const [email, setEmail] = useState(item.email ?? "");
  const [spaces, setSpaces] = useState((item.spaces ?? []).join(", "));
  const [writeEnabled, setWriteEnabled] = useState(item.write_enabled ?? false);
  const [writePages, setWritePages] = useState((item.write_pages ?? []).join(", "));
  const [enabled, setEnabled] = useState(item.connected ? Boolean(item.enabled) : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const id = (f: string) => `${k}-${f}`;

  const save = async () => {
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = { enabled };
    if (key.trim()) body.key = key.trim();
    if (k === "newrelic") Object.assign(body, { region, account_ids: list(accountIds) });
    if (k === "confluence")
      Object.assign(body, { site, email, spaces: list(spaces), write_enabled: writeEnabled, write_pages: writeEnabled ? list(writePages) : [] });
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
      <p className="text-sm text-zinc-400">{NEEDS[k]}</p>
      <Field
        id={id("key")}
        label={k === "newrelic" ? "User key" : "API token"}
        helper={item.key_hint ? `A key ending in ${item.key_hint} is saved. Leave this empty to keep it.` : "Encrypted for your team and never shown again."}
      >
        {(p) => <SecretInput {...p} className={inputClass} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />}
      </Field>
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

/** "Logs · Metrics · Airflow (prod-bi-airflow)" with each one's state, for a card. */
export function AwsAbilitySummary({ a }: { a: AwsAccountAbilities }) {
  const row = (name: string, on: boolean, available: boolean | null, extra?: string) => {
    const state = on ? "On" : available === false ? "No access yet" : available === null ? "Not checked yet" : "Off";
    const tone = on ? "text-emerald-400" : available === false ? "text-amber-300" : "text-zinc-500";
    return (
      <li key={name} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="font-medium text-zinc-200">{name}</span>
        <span className={tone}>{state}</span>
        {extra && <span className="min-w-0 break-words text-zinc-400">{extra}</span>}
      </li>
    );
  };
  return (
    <ul className="mt-3 space-y-1 text-sm" aria-label="What Coderhelm can do in this account" data-testid={`aws-abilities-${a.account}`}>
      {row("Logs", a.logs.on, a.logs.available)}
      {row("Metrics", a.metrics.on, a.metrics.available, a.metrics.on ? `CloudWatch, ${a.region}` : undefined)}
      {row("Airflow", a.airflow.on, a.airflow.available, a.airflow.on ? a.airflow.environments.join(", ") : undefined)}
    </ul>
  );
}

/**
 * An AWS account's abilities: switches for metrics and Airflow, the Airflow
 * environments the check found (all on unless deselected), "Check again",
 * and the one-click stack when the role lacks a permission.
 */
export function AwsAbilitiesPanel({
  a,
  canEdit,
  onChange,
}: {
  a: AwsAccountAbilities;
  canEdit: boolean;
  onChange: (r: AwsAbilityReply) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const run = async (f: () => Promise<AwsAbilityReply>, done: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await f();
      onChange(r);
      toast(done);
    } catch (e) {
      setError(errorMessage(e, "That didn't work."));
    } finally {
      setBusy(false);
    }
  };
  const check = () => run(() => api.checkAwsAbilities(a.account), "Checked what the role can do");
  const set = (body: Parameters<typeof api.setAwsAbilities>[1]) => run(() => api.setAwsAbilities(a.account, body), "Saved");
  const missing = (a.missing ?? []).map((m) => (m === "metrics" ? "CloudWatch metrics" : "Airflow"));

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-zinc-800 pt-4" data-testid={`aws-panel-${a.account}`}>
      <p className="text-sm text-zinc-400">
        Coderhelm checks what the CoderHelmLogReader role can do (one read of metrics, one list of Airflow environments) and turns each
        ability on when the role allows it. {a.checked_at ? `Last checked ${timeAgo(a.checked_at)}.` : "Not checked yet."}
      </p>
      {a.check_error && (
        <Callout variant="error" title="Coderhelm couldn't take on the role" live={false}>
          <p>{a.check_error}</p>
        </Callout>
      )}
      <div className="flex flex-col gap-3">
        <AbilityRow
          name="Metrics"
          what="CloudWatch metrics for ECS, RDS, Lambda, CloudFront, load balancers, SQS and DynamoDB."
          on={a.metrics.on}
          available={a.metrics.available}
          disabled={!canEdit || busy}
          onToggle={(on) => set({ metrics: on })}
        />
        <AbilityRow
          name="Airflow"
          what="DAGs, DAG runs, task instances, task logs and import errors on MWAA, read as Airflow's Viewer role."
          on={a.airflow.on || (a.airflow.available === true && !a.airflow.switched_off && a.airflow.found.length > 0)}
          available={a.airflow.available}
          disabled={!canEdit || busy}
          onToggle={(on) => set({ airflow: on })}
        />
        {a.airflow.available && a.airflow.found.length > 0 && !a.airflow.switched_off && (
          <fieldset className="ml-0 sm:ml-14">
            <legend className="text-sm font-semibold text-zinc-100">Airflow environments</legend>
            <p className="mt-1 text-sm text-zinc-400">Found in {a.region}. Agents read the production one unless the work names another.</p>
            <ul className="mt-2 space-y-1">
              {a.airflow.found.map((env) => {
                const checked = !a.airflow.skipped.includes(env);
                return (
                  <li key={env}>
                    <label className="flex items-center gap-2 text-sm text-zinc-200">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit || busy}
                        onChange={(e) => {
                          const keep = a.airflow.found.filter((x) => (x === env ? e.target.checked : !a.airflow.skipped.includes(x)));
                          set({ airflow_environments: keep });
                        }}
                      />
                      <span className="break-all font-mono">{env}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
      </div>
      {missing.length > 0 && a.update_url && (
        <Callout variant="warning" title={`Add ${missing.join(" and ")} to your CoderHelm role`} live={false}>
          <p>
            The role can&apos;t read {missing.join(" or ")} yet. One click adds read-only access as a small stack in your account
            ({a.stack_name ?? "CoderHelmLogReaderOps"}); it doesn&apos;t change your existing stack, and deleting it takes the access away. Then
            check again.
          </p>
          {canEdit && (
            <p className="mt-2">
              <a href={a.update_url} target="_blank" rel="noreferrer" className={primaryButton}>
                Add access in AWS
              </a>
            </p>
          )}
        </Callout>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {canEdit && (
        <div>
          <button type="button" onClick={check} disabled={busy} className={secondaryButton}>
            {busy ? "Checking…" : "Check again"}
          </button>
        </div>
      )}
    </div>
  );
}

function AbilityRow({
  name,
  what,
  on,
  available,
  disabled,
  onToggle,
}: {
  name: string;
  what: string;
  on: boolean;
  available: boolean | null;
  disabled: boolean;
  onToggle: (on: boolean) => void;
}) {
  const note = available === false ? "The role can't read this yet." : available === null ? "Not checked yet." : null;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Switch checked={on} onChange={onToggle} disabled={disabled || available !== true} label={`Let agents read ${name}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-100">{name}</p>
        <p className="text-sm text-zinc-400">{what}</p>
        {note && <p className="text-sm text-amber-300">{note}</p>}
      </div>
    </div>
  );
}
