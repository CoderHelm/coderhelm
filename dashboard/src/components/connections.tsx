"use client";

import { useState, type ReactNode } from "react";
import { api, type AwsAccountAbilities, type AwsAbilityReply, type Connector, type ConnectorId, type KeyConnectorKind } from "@/lib/api";
import { errorMessage, timeAgo } from "@/lib/data-sources";
import { Callout } from "./callout";
import { Field, SecretInput } from "./field";
import { Switch } from "./teams-webhook";
import { useToast } from "./toast";
import { inputClass, primaryButton, secondaryButton } from "./ui";

/** What a key-based connection needs, shown above its form. */
const NEEDS: Record<KeyConnectorKind, string> = {
  newrelic: "A New Relic user key (starts with NRAK-). Coderhelm only sends read queries.",
  confluence: "Your Confluence address, the email of an Atlassian account and an API token from id.atlassian.com.",
  opensearch:
    "Your cluster's https address and a user with read-only access to the indexes agents may search. Coderhelm only lists, searches and counts; scripts are refused.",
  rest: "The API's base address, the header its key goes in and the key. Coderhelm only sends GET requests, and only under the paths you list.",
};

const list = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * New Relic, Confluence or OpenSearch: the key or password (sealed for the
 * team, never shown again) and what agents may read. Saving tests it.
 */
export function ConnectorForm({ item, onSaved }: { item: Connector; onSaved: (c: Connector) => void }) {
  const k = item.kind as KeyConnectorKind;
  const [key, setKey] = useState("");
  const [region, setRegion] = useState(item.region || "us");
  const [accountIds, setAccountIds] = useState((item.account_ids ?? []).join(", "));
  const [site, setSite] = useState(item.site ?? "");
  const [email, setEmail] = useState(item.email ?? "");
  const [spaces, setSpaces] = useState((item.spaces ?? []).join(", "));
  const [writeEnabled, setWriteEnabled] = useState(item.write_enabled ?? false);
  const [writePages, setWritePages] = useState((item.write_pages ?? []).join(", "));
  const [indexes, setIndexes] = useState((item.indexes ?? []).join(", "));
  const [hiddenFields, setHiddenFields] = useState((item.hidden_fields ?? []).join(", "));
  const [headerName, setHeaderName] = useState(item.header_name || "X-Api-Key");
  const [paths, setPaths] = useState((item.paths ?? []).join(", "));
  const [enabled, setEnabled] = useState(item.connected ? Boolean(item.enabled) : true);
  const [name, setName] = useState(item.name ?? "");
  const [guide, setGuide] = useState(item.instructions ?? "");
  // A saved key is never sent back: the form shows that one is saved and
  // offers to replace it, instead of an empty box that looks like nothing is.
  const [replacingKey, setReplacingKey] = useState(!item.key_hint);
  // A new REST API, or another OpenSearch cluster, is named here; a saved one
  // keeps its name (it's its key).
  const naming = !item.connected && (k === "rest" || Boolean(item.needs_name));
  const nameInvalid = naming && name !== "" && !/^[a-z][a-z0-9_-]{0,39}$/.test(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Unique per connection: two of a kind can be open at once.
  const id = (f: string) => `${(item.id ?? k).replace(/[^a-z0-9_-]/gi, "-")}-${f}`;

  const save = async () => {
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = { enabled, instructions: guide };
    if (key.trim()) body.key = key.trim();
    if (k === "newrelic") Object.assign(body, { region, account_ids: list(accountIds) });
    if (k === "confluence")
      Object.assign(body, { site, email, spaces: list(spaces), write_enabled: writeEnabled, write_pages: writeEnabled ? list(writePages) : [] });
    if (k === "opensearch") Object.assign(body, { site, email, indexes: list(indexes), hidden_fields: list(hiddenFields) });
    if (k === "rest") Object.assign(body, { site, header_name: headerName, paths: list(paths), hidden_fields: list(hiddenFields) });
    if (naming) {
      if (!name || nameInvalid) {
        setError("Give it a name: lowercase letters, digits, - and _, starting with a letter.");
        setSaving(false);
        return;
      }
      body.name = name;
    }
    const target = (item.connected && item.id ? item.id : k) as ConnectorId;
    try {
      const r = await api.saveConnector(target, body);
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
      {naming &&
        text(
          "name",
          "Name",
          name,
          (v) => setName(v.trim().toLowerCase()),
          nameInvalid
            ? "Lowercase letters, digits, - and _, starting with a letter."
            : `How agents pick this one, like ${k === "rest" ? "billing or bookings" : "search or logs"}. It can't be changed later.`,
          k === "rest" ? "bookings" : "search",
        )}
      {replacingKey ? (
        <Field
          id={id("key")}
          label={k === "newrelic" ? "User key" : k === "opensearch" ? "Password" : k === "rest" ? "API key" : "API token"}
          helper={item.key_hint ? "Paste the new one. The saved one stays until you save." : "Encrypted for your team and never shown again."}
        >
          {(p) => <SecretInput {...p} className={inputClass} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />}
        </Field>
      ) : (
        <div>
          <p className="text-sm font-medium text-zinc-200">{k === "opensearch" ? "Password" : k === "newrelic" ? "User key" : "API key"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            <span className="font-mono text-sm text-zinc-300" aria-label={`Saved, ending in ${item.key_hint}`}>
              ••••••••{item.key_hint}
            </span>
            <span className="text-xs text-emerald-400">Saved</span>
            <button type="button" onClick={() => setReplacingKey(true)} className={`ml-auto ${secondaryButton}`}>
              Replace key
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Encrypted for your team. It can be replaced but never shown.</p>
        </div>
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
      {k === "opensearch" && (
        <>
          {text("site", "Cluster address", site, setSite, undefined, "https://search.example.com")}
          {text("email", "User", email, setEmail, "A user with read-only access. Coderhelm sees what it can see.")}
          {text("indexes", "Indexes", indexes, setIndexes, "Index names or patterns agents may search, like orders or logs-*. Leave empty for every index the user can see.", "orders, logs-*")}
          {text(
            "hidden",
            "Hidden fields",
            hiddenFields,
            setHiddenFields,
            "Field names whose values are never shown, on top of emails, phones, addresses and keys.",
            "notes, dob",
          )}
        </>
      )}
      {k === "rest" && (
        <>
          {text("site", "API address", site, setSite, undefined, "https://api.example.com")}
          {text("header", "Key header", headerName, setHeaderName, "The header the API expects the key in, like X-Api-Key or Authorization.")}
          {text(
            "paths",
            "Paths agents may read",
            paths,
            setPaths,
            "One or more path prefixes, like /v1/orders. Agents can GET these and anything under them, nothing else.",
            "/v1/orders, /v1/customers",
          )}
          {text("hidden", "Hidden fields", hiddenFields, setHiddenFields, "Field names whose values are never shown, on top of emails, phones, addresses and keys.", "notes, dob")}
        </>
      )}
      <Field
        id={id("guide")}
        label="Guide for agents"
        helper="What agents should know when they use it: what the system is, what its fields mean, where else its data lives. Sent with every lookup."
      >
        {(p) => (
          <textarea
            {...p}
            rows={5}
            maxLength={4000}
            className={inputClass}
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            placeholder="quantity on a product is sessions per week on weekly packs, but the session count on season packs. Raw copies of these records are in the warehouse."
          />
        )}
      </Field>
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

/** "Logs · Metrics · Airflow (prod-data-airflow)" with each one's state, for a card. */
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
