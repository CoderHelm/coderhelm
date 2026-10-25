"use client";

import { useCan } from "@/hooks/use-can";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type AwsAccountAbilities, type AwsConnection, type LogGroup } from "@/lib/api";
import { timeAgo } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Stepper } from "@/components/stepper";
import { Field } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { CodeBlock } from "@/components/code-block";
import { Skeleton } from "@/components/skeleton";
import { AwsIcon, ExternalLinkIcon } from "@/components/icons";
import { Page, PageHeader, Section } from "@/components/page";
import { buttonClass, inputClass, linkButton, monoInputClass, primaryButton, secondaryButton } from "@/components/ui";
import { Code, SaveBar, SettingsRow, Switch, useDirtyForm, type DirtyForm } from "@/components/settings";
import { Chip, MoreMenu } from "@/components/list";
import { securityEmail } from "@/lib/runtime-config";

export default function AwsPageGuarded() {
  return (
    <RoleGuard need="view_integrations">
      <AwsPage />
    </RoleGuard>
  );
}

/** The account Coderhelm assumes the role from. Shown in the manual setup. */
const CODERHELM_ACCOUNT = "654654210434";
const ROLE_NAME = "CoderHelmLogReader";
const ROLE_ARN_RE = /^arn:aws:iam::\d{12}:role\/CoderHelmLogReader$/;
const REGION_RE = /^[a-z]{2}(-[a-z0-9]+)+-\d+$/;
const COMMON_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "eu-west-1", "eu-west-2", "eu-central-1",
  "eu-north-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1",
];

/** What the role lets Coderhelm do, from the CloudFormation template it ships. */
const SCOPES: { title: string; detail: string }[] = [
  { title: "List your log groups", detail: "Names, sizes and how long each keeps logs." },
  { title: "Search logs", detail: "Run Logs Insights queries and read matching lines, in the log groups you choose." },
  { title: "Read alarm settings", detail: "So alert routes can list the alarms on a topic." },
];
const CANNOT = [
  "Change, delete or write anything in your account",
  "Read anything outside CloudWatch Logs and alarms",
  "Keep raw log lines. Only the finding and its error pattern are saved.",
];

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; connections: AwsConnection[] };

function AwsPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const { can } = useCan();
  const canEdit = can("integrations");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useDirtyForm<AccountsForm>({}, { same: sameAccountField, disabled: load.state !== "ready" });
  const { reset } = form;

  const refresh = useCallback(async () => {
    try {
      const r = await api.listAwsConnections();
      setLoad({ state: "ready", connections: r.connections });
      reset(formFrom(r.connections));
    } catch {
      setLoad((prev) => (prev.state === "ready" ? prev : { state: "error" }));
    }
  }, [reset]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connections = load.state === "ready" ? load.connections : [];
  const empty = load.state === "ready" && connections.length === 0;
  const showConnect = canEdit && (adding || empty);

  /** Every changed account, through the same requests the page always sent. */
  const save = async () => {
    for (const c of connections) {
      const f = accountValues(form.values, c.connection_id);
      if (!ROLE_ARN_RE.test(f.role_arn.trim())) return setProblem(`The role for account ${c.connection_id} must be named ${ROLE_NAME}.`);
      if (!REGION_RE.test(f.region.trim())) return setProblem(`Enter an AWS region such as us-east-1 for account ${c.connection_id}.`);
    }
    setSaving(true);
    setProblem(null);
    const roleChanged = connections.some((c) => form.isDirty(key(c.connection_id, "role_arn"), key(c.connection_id, "region")));
    const failed: string[] = [];
    for (const c of connections) {
      const id = c.connection_id;
      const f = accountValues(form.values, id);
      const dirty = (k: keyof AccountForm) => form.isDirty(key(id, k));
      try {
        if (dirty("role_arn") || dirty("region")) await api.updateAwsConnection(id, { role_arn: f.role_arn.trim(), region: f.region.trim() });
        if (dirty("log_groups")) await api.updateAwsConnection(id, { log_groups: f.log_groups });
        const account = c.abilities?.account ?? id;
        if (dirty("metrics")) await api.setAwsAbilities(account, { metrics: f.metrics });
        if (dirty("airflow")) await api.setAwsAbilities(account, { airflow: f.airflow });
        if (dirty("environments")) await api.setAwsAbilities(account, { airflow_environments: f.environments });
      } catch (e) {
        failed.push(`${id}: ${e instanceof Error && e.message ? e.message : "the request failed"}`);
      }
    }
    const edited = form.values;
    await refresh();
    if (failed.length) {
      form.update(edited);
      setProblem(`Not everything was saved. ${failed.join(" ")}`);
      toast("Could not save every change", "error");
    } else {
      toast(roleChanged ? "Saved. Test the connection to check the new role." : "AWS settings saved");
    }
    setSaving(false);
  };

  const discard = () => {
    form.discard();
    setProblem(null);
  };

  return (
    <Page>
      <PageHeader
        title="AWS"
        lead="Connect an AWS account and Coderhelm reads its CloudWatch logs every 6 hours, groups the errors it finds and suggests fixes you can turn into plans. It can only read."
        actions={
          canEdit && connections.length > 0 && !adding ? (
            <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
              Connect another account
            </button>
          ) : undefined
        }
      />

      {!canEdit && load.state !== "loading" && (
        <div className="mt-6">
          <Callout variant="neutral" live={false}>
            <p>You can see the connected accounts and act on findings. Only an admin or the owner can connect, test or remove an account.</p>
          </Callout>
        </div>
      )}

      {load.state === "loading" && (
        <div className="mt-8 grid gap-4 lg:grid-cols-3" aria-busy="true">
          <Skeleton className="h-48 lg:col-span-2" />
          <Skeleton className="h-48" />
        </div>
      )}

      {load.state === "error" && (
        <div className="mt-8">
          <Callout variant="error" title="Could not load your AWS accounts">
            <p>Nothing was changed.</p>
            <p>
              <button type="button" onClick={() => { setLoad({ state: "loading" }); refresh(); }} className={linkButton}>
                Try again
              </button>
            </p>
          </Callout>
        </div>
      )}

      {load.state === "ready" && (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-8 lg:col-span-2">
            {showConnect && (
              <ConnectPanel
                first={empty}
                onCancel={empty ? undefined : () => setAdding(false)}
                onConnected={() => {
                  setAdding(false);
                  refresh();
                }}
              />
            )}
            {empty && !canEdit && (
              <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center">
                <p className="font-semibold text-zinc-100">No AWS account is connected</p>
                <p className="mt-1 text-sm text-zinc-400">Ask an admin or the owner to connect one.</p>
              </div>
            )}
            {connections.map((c) => (
              <AccountSettings key={c.connection_id} connection={c} canEdit={canEdit} form={form} onChanged={refresh} />
            ))}
          </div>
          <ScopeCard />
        </div>
      )}

      {canEdit && <SaveBar count={form.count} onSave={save} onDiscard={discard} saving={saving} problem={problem} />}

      {load.state === "ready" && connections.length > 0 && <FindingsMoved />}
    </Page>
  );
}

// ── One account's settings ───────────────────────────────────────────

/** What one account's rows edit. */
interface AccountForm {
  role_arn: string;
  region: string;
  log_groups: string[];
  metrics: boolean;
  airflow: boolean;
  /** The Airflow environments agents may read. */
  environments: string[];
}

/** Every account's fields in one flat form, keyed "<account>:<field>", so the save bar counts fields. */
type AccountsForm = Record<string, unknown>;

const key = (id: string, field: keyof AccountForm) => `${id}:${field}`;

function airflowOn(a: AwsAccountAbilities): boolean {
  return a.airflow.on || (a.airflow.available === true && !a.airflow.switched_off && a.airflow.found.length > 0);
}

function formFrom(connections: AwsConnection[]): AccountsForm {
  const out: AccountsForm = {};
  for (const c of connections) {
    const a = c.abilities;
    const f: AccountForm = {
      role_arn: c.role_arn,
      region: c.region,
      log_groups: c.log_groups,
      metrics: a ? a.metrics.on : false,
      airflow: a ? airflowOn(a) : false,
      environments: a ? a.airflow.found.filter((e) => !a.airflow.skipped.includes(e)) : [],
    };
    for (const [k, v] of Object.entries(f)) out[key(c.connection_id, k as keyof AccountForm)] = v;
  }
  return out;
}

function accountValues(values: AccountsForm, id: string): AccountForm {
  return {
    role_arn: String(values[key(id, "role_arn")] ?? ""),
    region: String(values[key(id, "region")] ?? ""),
    log_groups: (values[key(id, "log_groups")] as string[]) ?? [],
    metrics: !!values[key(id, "metrics")],
    airflow: !!values[key(id, "airflow")],
    environments: (values[key(id, "environments")] as string[]) ?? [],
  };
}

/** Lists compare as sets (ticking a box off and on again is no change); text without its outer spaces. */
function sameAccountField(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = [...((a as string[]) ?? [])].sort();
    const y = [...((b as string[]) ?? [])].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  if (typeof a === "string" || typeof b === "string") return String(a ?? "").trim() === String(b ?? "").trim();
  return !!a === !!b;
}

type TestResult = { ok: boolean; message: string; at: string };

function AccountSettings({
  connection: c,
  canEdit,
  form,
  onChanged,
}: {
  connection: AwsConnection;
  canEdit: boolean;
  form: DirtyForm<AccountsForm>;
  onChanged: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [pickGroups, setPickGroups] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const id = c.connection_id;
  const a = c.abilities ?? null;
  const v = accountValues(form.values, id);
  const set = <K extends keyof AccountForm>(k: K, value: AccountForm[K]) => form.set(key(id, k), value);
  const dirty = (k: keyof AccountForm) => form.isDirty(key(id, k));
  const healthy = c.status !== "error";
  const lastAnalysisFailed = !!c.error_message && healthy;
  const arnOk = ROLE_ARN_RE.test(v.role_arn.trim());
  const regionOk = REGION_RE.test(v.region.trim());
  const missing = (a?.missing ?? []).map((m) => (m === "metrics" ? "CloudWatch metrics" : "Airflow"));

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const r = await api.testAwsConnection(id);
      setTest({ ok: r.status === "connected", message: r.status === "connected" ? "Coderhelm assumed the role." : r.message, at: new Date().toISOString() });
      onChanged();
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error && e.message ? e.message : "The test could not run.", at: new Date().toISOString() });
    } finally {
      setTesting(false);
    }
  };

  const checkAbilities = async () => {
    if (!a) return;
    setChecking(true);
    try {
      await api.checkAwsAbilities(a.account);
      toast("Checked what the role can do");
      onChanged();
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "The check didn't work.", "error");
    } finally {
      setChecking(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: `Disconnect AWS account ${id}?`,
      message: "Coderhelm stops reading its logs right away. Findings you already have are kept. The role stays in your AWS account until you delete it there.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await api.deleteAwsConnection(id);
      toast(`AWS account ${id} disconnected`);
      onChanged();
    } catch {
      toast("Could not disconnect. The account is still connected.", "error");
      setRemoving(false);
    }
  };

  const groupsText = v.log_groups.length > 0 ? `${v.log_groups.length} chosen` : "All log groups";

  return (
    <article aria-label={`AWS account ${id}`} className="min-w-0">
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-orange-400">
          <AwsIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold text-zinc-100">
            AWS account {id}
            {healthy ? <Chip tone="success">Connected</Chip> : <Chip tone="danger">Cannot use the role</Chip>}
          </h2>
          <p className="text-sm text-zinc-500">
            Last analysis {c.last_analyzed_at ? timeAgo(c.last_analyzed_at) : "not yet. The first one runs within 6 hours."}
            {(c.updated_at || c.created_at) && ` · changed ${timeAgo(c.updated_at || c.created_at || "")}`}
          </p>
        </div>
        {canEdit && (
          <MoreMenu
            label={removing ? "Disconnecting…" : testing ? "Testing…" : checking ? "Checking…" : "Actions"}
            items={[
              { label: "Test connection", onSelect: runTest, disabled: testing },
              ...(a ? [{ label: "Check what the role can do", onSelect: checkAbilities, disabled: checking }] : []),
              { label: "Disconnect", onSelect: disconnect, disabled: removing },
            ]}
          />
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3 empty:hidden">
        {!healthy && (
          <Callout variant="error" title="Coderhelm cannot use the role" live={false}>
            <p>{c.error_message || "The last check failed."}</p>
            <p>No logs are read until this is fixed. Check the role&apos;s trust policy, then test again.</p>
          </Callout>
        )}
        {lastAnalysisFailed && (
          <Callout variant="warning" title="The last analysis failed" live={false}>
            <p>
              {c.last_error_at ? `${timeAgo(c.last_error_at)}: ` : ""}
              {c.error_message}
            </p>
          </Callout>
        )}
        {test && (
          <Callout variant={test.ok ? "success" : "error"} title={test.ok ? "The connection works" : "The test failed"}>
            <p>{test.message}</p>
          </Callout>
        )}
        {a?.check_error && (
          <Callout variant="error" title="Coderhelm couldn't take on the role" live={false}>
            <p>{a.check_error}</p>
          </Callout>
        )}
      </div>

      <div className="mt-3 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid={`aws-panel-${a?.account ?? id}`}>
        <SettingsRow
          label="Role"
          layout="stacked"
          unsaved={dirty("role_arn")}
          help={`The read only role Coderhelm takes on. It must be named ${ROLE_NAME}.`}
          control={(ids) =>
            canEdit ? (
              <div>
                <input
                  id={ids.inputId}
                  value={v.role_arn}
                  onChange={(e) => set("role_arn", e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-describedby={ids.helpId}
                  aria-invalid={arnOk ? undefined : true}
                  className={inputClass}
                />
                {!arnOk && <p role="alert" className="mt-1.5 text-xs text-red-400">The role must be named {ROLE_NAME}.</p>}
              </div>
            ) : (
              <p id={ids.inputId} className="wrap-anywhere text-sm text-zinc-200">{c.role_arn}</p>
            )
          }
        />
        <SettingsRow
          label="Region"
          controlClassName="sm:w-48"
          unsaved={dirty("region")}
          help="Coderhelm reads log groups in this region."
          control={(ids) =>
            canEdit ? (
              <div>
                <input
                  id={ids.inputId}
                  value={v.region}
                  onChange={(e) => set("region", e.target.value)}
                  list={`aws-regions-${id}`}
                  spellCheck={false}
                  autoComplete="off"
                  aria-describedby={ids.helpId}
                  aria-invalid={regionOk ? undefined : true}
                  className={inputClass}
                />
                <datalist id={`aws-regions-${id}`}>
                  {COMMON_REGIONS.map((r) => <option key={r} value={r} />)}
                </datalist>
                {!regionOk && <p role="alert" className="mt-1.5 text-xs text-red-400">Enter an AWS region such as us-east-1.</p>}
              </div>
            ) : (
              <p id={ids.inputId} className="text-sm text-zinc-200">{c.region}</p>
            )
          }
        />
        <SettingsRow
          label="Log groups"
          unsaved={dirty("log_groups")}
          help={`Which log groups Coderhelm reads. With none chosen it reads every log group in ${v.region || c.region}.`}
          control={(ids) => (
            <div className="flex flex-wrap items-center gap-3">
              <span id={ids.inputId} className="text-sm text-zinc-200">{groupsText}</span>
              {canEdit && (
                <button type="button" aria-expanded={pickGroups} onClick={() => setPickGroups((p) => !p)} className={buttonClass("secondary", "sm")}>
                  {pickGroups ? "Done" : "Choose log groups"}
                </button>
              )}
            </div>
          )}
        >
          {pickGroups && <LogGroupsPicker connection={c} chosen={v.log_groups} onChange={(g) => set("log_groups", g)} />}
        </SettingsRow>
        {a && (
          <>
            <SettingsRow
              label="Metrics"
              layout="toggle"
              unsaved={dirty("metrics")}
              help={
                <>
                  CloudWatch metrics for ECS, RDS, Lambda, CloudFront, load balancers, SQS and DynamoDB.
                  {a.metrics.available === false && <span className="block text-amber-300">The role can&apos;t read this yet.</span>}
                  {a.metrics.available === null && <span className="block text-amber-300">Not checked yet.</span>}
                </>
              }
              control={(ids) => (
                <Switch
                  id={ids.inputId}
                  checked={v.metrics}
                  onChange={(on) => set("metrics", on)}
                  labelledBy={ids.labelId}
                  describedBy={ids.helpId}
                  disabled={!canEdit || a.metrics.available !== true}
                />
              )}
            />
            <SettingsRow
              label="Airflow"
              layout="toggle"
              unsaved={dirty("airflow") || dirty("environments")}
              help={
                <>
                  DAGs, DAG runs, task instances, task logs and import errors on MWAA, read as Airflow&apos;s Viewer role.
                  {a.airflow.available === false && <span className="block text-amber-300">The role can&apos;t read this yet.</span>}
                  {a.airflow.available === null && <span className="block text-amber-300">Not checked yet.</span>}
                </>
              }
              control={(ids) => (
                <Switch
                  id={ids.inputId}
                  checked={v.airflow}
                  onChange={(on) => set("airflow", on)}
                  labelledBy={ids.labelId}
                  describedBy={ids.helpId}
                  disabled={!canEdit || a.airflow.available !== true}
                />
              )}
            >
              {a.airflow.available && a.airflow.found.length > 0 && v.airflow && (
                <fieldset className="min-w-0">
                  <legend className="text-sm font-medium text-zinc-200">Airflow environments</legend>
                  <p className="mt-0.5 text-sm text-zinc-400">Found in {a.region}. Agents read the production one unless the work names another.</p>
                  <ul className="mt-2 space-y-1.5">
                    {a.airflow.found.map((env) => (
                      <li key={env}>
                        <label className="flex items-center gap-2.5 text-sm text-zinc-200">
                          <input
                            type="checkbox"
                            checked={v.environments.includes(env)}
                            disabled={!canEdit}
                            onChange={(e) =>
                              set("environments", a.airflow.found.filter((x) => (x === env ? e.target.checked : v.environments.includes(x))))
                            }
                            className="h-4 w-4 accent-emerald-500"
                          />
                          <span className="wrap-anywhere">{env}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}
            </SettingsRow>
          </>
        )}
      </div>

      {a && missing.length > 0 && a.update_url && (
        <div className="mt-3">
          <Callout variant="warning" title={`Add ${missing.join(" and ")} to your Coderhelm role`} live={false}>
            <p>
              The role can&apos;t read {missing.join(" or ")} yet. One click adds read only access as a small stack in your account
              ({a.stack_name ?? "CoderHelmLogReaderOps"}); it doesn&apos;t change your existing stack, and deleting it takes the access away.
              Then choose &ldquo;Check what the role can do&rdquo; under Actions.
            </p>
            {canEdit && (
              <p className="mt-2">
                <a href={a.update_url} target="_blank" rel="noreferrer" className={primaryButton}>
                  Add access in AWS
                </a>
              </p>
            )}
          </Callout>
        </div>
      )}
    </article>
  );
}

const GROUP_PAGE = 50;

/** The log groups in the account, ticked into the form; the save bar saves them. */
function LogGroupsPicker({ connection, chosen, onChange }: { connection: AwsConnection; chosen: string[]; onChange: (names: string[]) => void }) {
  const [groups, setGroups] = useState<LogGroup[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(GROUP_PAGE);

  useEffect(() => {
    let live = true;
    api
      .discoverLogGroups(connection.connection_id)
      .then((r) => live && setGroups(r.log_groups))
      .catch(() => live && (setError(true), setGroups([])));
    return () => {
      live = false;
    };
  }, [connection.connection_id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = groups ?? [];
    // Chosen groups that no longer exist stay listed so they can be removed.
    const gone = connection.log_groups.filter((n) => !all.some((g) => g.name === n)).map((name) => ({ name }) as LogGroup);
    return [...gone, ...all].filter((g) => g.name.toLowerCase().includes(needle));
  }, [groups, q, connection.log_groups]);

  const toggle = (name: string) => onChange(chosen.includes(name) ? chosen.filter((n) => n !== name) : [...chosen, name]);
  const searchId = `lg-search-${connection.connection_id}`;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {error && (
        <Callout variant="warning" title="Could not list the log groups">
          <p>Test the connection first. You can still remove groups chosen earlier.</p>
        </Callout>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={searchId} className="sr-only">Search log groups</label>
        <input
          id={searchId}
          value={q}
          onChange={(e) => { setQ(e.target.value); setShown(GROUP_PAGE); }}
          placeholder={groups ? `Search ${groups.length} log groups` : "Search log groups"}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="button" onClick={() => onChange([])} disabled={chosen.length === 0} className={buttonClass("ghost", "sm")}>
          Clear (read all)
        </button>
      </div>
      {groups === null ? (
        <p role="status" className="text-sm text-zinc-500">Listing log groups…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">{q ? `No log group matches "${q}".` : "No log groups in this region."}</p>
      ) : (
        <ul className="max-h-80 divide-y divide-zinc-800 overflow-y-auto rounded-lg border border-zinc-800">
          {filtered.slice(0, shown).map((g) => (
            <li key={g.name}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-900">
                <input type="checkbox" checked={chosen.includes(g.name)} onChange={() => toggle(g.name)} className="h-4 w-4 shrink-0 accent-emerald-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-200">{g.name}</span>
                  {g.stored_bytes !== undefined ? (
                    <span className="block text-xs text-zinc-500">
                      {formatBytes(g.stored_bytes)}
                      {g.retention_days ? ` · kept ${g.retention_days} days` : ""}
                    </span>
                  ) : groups.length > 0 ? (
                    <span className="block text-xs text-amber-400">No longer in this account</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {filtered.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + GROUP_PAGE)} className={`${linkButton} self-start`}>
          Show {Math.min(GROUP_PAGE, filtered.length - shown)} more
        </button>
      )}
    </div>
  );
}

// ── What the role allows ─────────────────────────────────────────────

function ScopeCard() {
  return (
    <aside aria-labelledby="scope-heading" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm">
      <h2 id="scope-heading" className="font-semibold text-zinc-100">What Coderhelm can do with it</h2>
      <p className="mt-1 text-zinc-400">
        The role is read only. Its policy allows exactly this, and the External ID means only your team&apos;s Coderhelm can use it.
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {SCOPES.map((s) => (
          <li key={s.title} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <span className="block text-zinc-200">{s.title}</span>
              <span className="block text-zinc-500">{s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-semibold text-zinc-200">It cannot</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-zinc-400">
        {CANNOT.map((c) => (
          <li key={c} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
            {c}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-zinc-500">
        Questions? Write to{" "}
        <a href={`mailto:${securityEmail()}`} className={`${linkButton} text-zinc-300`}>
          {securityEmail()}
        </a>
        .
      </p>
    </aside>
  );
}

// ── Connecting an account ────────────────────────────────────────────

const CONNECT_STEPS = [
  { id: "role", label: "Create the read-only role" },
  { id: "details", label: "Paste its ARN and region" },
  { id: "check", label: "Check and connect" },
];

function ConnectPanel({ first, onCancel, onConnected }: { first: boolean; onCancel?: () => void; onConnected: () => void }) {
  const [how, setHow] = useState<"stack" | "manual">("stack");
  const [cfn, setCfn] = useState<{ cfn_url: string; external_id: string } | null>(null);
  const [cfnError, setCfnError] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [roleArn, setRoleArn] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { toast } = useToast();

  // The External ID is stored per team, so both ways of setting up agree on it.
  useEffect(() => {
    let live = true;
    api.getCfnUrl().then((d) => live && setCfn(d)).catch(() => live && setCfnError(true));
    return () => {
      live = false;
    };
  }, []);

  const arn = roleArn.trim();
  const arnOk = ROLE_ARN_RE.test(arn);
  const regionOk = REGION_RE.test(region.trim());
  const current = !launched && how === "stack" && !arn ? "role" : !arnOk || !regionOk ? "details" : "check";

  const connect = async () => {
    setSaving(true);
    setResult(null);
    try {
      const r = await api.createAwsConnection(arn, region.trim());
      if (r.error) {
        setResult({ ok: false, message: r.message || "Coderhelm could not use the role." });
      } else {
        toast("AWS account connected");
        onConnected();
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error && e.message ? e.message : "The request failed. Nothing was saved." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="connect-heading" className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="connect-heading" className="text-lg font-semibold text-zinc-100">
            {first ? "Connect your AWS account" : "Connect another AWS account"}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">About 3 minutes. You need permission to create an IAM role in the account.</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <Stepper steps={CONNECT_STEPS} current={current} label="Connection steps" />

        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-zinc-100">1. Create the read-only role</h3>
            <div className="max-w-full"><Segmented
              label="How to create the role"
              options={[
                { value: "stack", label: "With CloudFormation" },
                { value: "manual", label: "I'll make it myself" },
              ]}
              value={how}
              onChange={setHow}
            /></div>
            {how === "stack" ? (
              <div className="flex flex-col gap-3 text-sm text-zinc-400">
                <p>
                  Opens the AWS console with a stack that creates the role <code className="text-zinc-200">{ROLE_NAME}</code> and nothing else.
                  Review it, press Create stack, then copy <span className="text-zinc-200">RoleArn</span> from the stack&apos;s Outputs tab.
                </p>
                <div>
                  <a
                    href={cfn?.cfn_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!cfn}
                    onClick={(e) => {
                      if (!cfn) e.preventDefault();
                      else setLaunched(true);
                    }}
                    className={`${primaryButton} gap-2 ${cfn ? "" : "pointer-events-none opacity-50"}`}
                  >
                    Open the stack in AWS
                    <span aria-hidden="true" className="scale-90"><ExternalLinkIcon /></span>
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </div>
                {cfnError && (
                  <Callout variant="error" title="Could not prepare the stack link">
                    <p>Reload the page, or create the role yourself with the other option.</p>
                  </Callout>
                )}
              </div>
            ) : (
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-zinc-400">
                <li>
                  Create an IAM role named <code className="text-zinc-200">{ROLE_NAME}</code>.
                </li>
                <li>
                  Let account <code className="text-zinc-200">{CODERHELM_ACCOUNT}</code> assume it, on the condition that{" "}
                  <code className="text-zinc-200">sts:ExternalId</code> equals your External ID below.
                </li>
                <li>
                  Allow <code className="text-zinc-200">logs:DescribeLogGroups</code>, <code className="text-zinc-200">logs:StartQuery</code>,{" "}
                  <code className="text-zinc-200">logs:GetQueryResults</code>, <code className="text-zinc-200">logs:StopQuery</code>,{" "}
                  <code className="text-zinc-200">logs:FilterLogEvents</code>, <code className="text-zinc-200">logs:GetLogEvents</code>,{" "}
                  <code className="text-zinc-200">cloudwatch:DescribeAlarms</code> and <code className="text-zinc-200">sts:GetCallerIdentity</code>. Nothing else.
                </li>
              </ol>
            )}
            <div>
              {cfn ? (
                <CodeBlock code={cfn.external_id} title="Your External ID" testId="external-id" />
              ) : (
                <p className="text-xs text-zinc-500">{cfnError ? "Your External ID couldn't load." : "Loading your External ID…"}</p>
              )}
              <p className="mt-1.5 text-xs text-zinc-500">It stops anyone else using Coderhelm from assuming your role. The stack fills it in for you.</p>
            </div>
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (arnOk && regionOk && !saving) connect();
            }}
          >
            <h3 className="font-semibold text-zinc-100">2. Paste its ARN and region</h3>
            <Field
              id="aws-role-arn"
              label="Role ARN"
              helper={<>Looks like <code className="wrap-anywhere">arn:aws:iam::123456789012:role/{ROLE_NAME}</code>.</>}
              error={arn && !arnOk ? <>The role must be named {ROLE_NAME}: <code className="wrap-anywhere">arn:aws:iam::&lt;12 digit account&gt;:role/{ROLE_NAME}</code></> : undefined}
            >
              {(props) => (
                <input
                  {...props}
                  value={roleArn}
                  onChange={(e) => { setRoleArn(e.target.value); setResult(null); }}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={`arn:aws:iam::123456789012:role/${ROLE_NAME}`}
                  className={monoInputClass}
                />
              )}
            </Field>
            <Field
              id="aws-region"
              label="Region of your logs"
              helper="Coderhelm reads log groups in this region."
              error={region.trim() && !regionOk ? "Enter an AWS region such as us-east-1." : undefined}
            >
              {(props) => (
                <>
                  <input
                    {...props}
                    value={region}
                    onChange={(e) => { setRegion(e.target.value); setResult(null); }}
                    list="aws-regions"
                    spellCheck={false}
                    autoComplete="off"
                    className={`${inputClass} max-w-xs`}
                  />
                  <datalist id="aws-regions">
                    {COMMON_REGIONS.map((r) => <option key={r} value={r} />)}
                  </datalist>
                </>
              )}
            </Field>

            <h3 className="font-semibold text-zinc-100">3. Check and connect</h3>
            <p className="-mt-2 text-sm text-zinc-400">Coderhelm tries the role once before it saves anything.</p>
            {result && !result.ok && (
              <Callout variant="error" title="Coderhelm could not use the role">
                <p>{result.message}</p>
                <p>Check that the trust policy names account {CODERHELM_ACCOUNT} and your External ID, then try again.</p>
              </Callout>
            )}
            <div>
              <button type="submit" disabled={!arnOk || !regionOk || saving} className={primaryButton}>
                {saving ? "Checking the role…" : "Check and connect"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

// ── Findings ─────────────────────────────────────────────────────────

/** Findings moved to the Logs page; this anchor (#findings) points there. */
function FindingsMoved() {
  return (
    <Section id="findings" title="Findings" description="Errors Coderhelm finds in these accounts' logs.">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
        <p className="min-w-0 text-zinc-400">
          Findings, fix PRs and automatic fixes now live on the Logs page.
        </p>
        <Link href="/logs" className={secondaryButton}>
          Open Logs
        </Link>
      </div>
    </Section>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "Empty";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
