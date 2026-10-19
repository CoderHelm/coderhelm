"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type AwsConnection, type LogGroup, type Recommendation } from "@/lib/api";
import { hasRole } from "@/lib/roles";
import { timeAgo } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Stepper } from "@/components/stepper";
import { Field } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { CopyButton } from "@/components/copy-button";
import { Skeleton } from "@/components/skeleton";
import { Disclosure } from "@/components/disclosure";
import { AwsIcon, ExternalLinkIcon } from "@/components/icons";
import { Page, PageHeader, Section } from "@/components/page";
import { AwsRoleAccess } from "@/components/connections";
import { TeamsWebhookField, validTeamsUrl } from "@/components/teams-webhook";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";

export default function AwsPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <AwsPage />
    </RoleGuard>
  );
}

/** The account CoderHelm assumes the role from. Shown in the manual setup. */
const CODERHELM_ACCOUNT = "654654210434";
const ROLE_NAME = "CoderHelmLogReader";
const ROLE_ARN_RE = /^arn:aws:iam::\d{12}:role\/CoderHelmLogReader$/;
const REGION_RE = /^[a-z]{2}(-[a-z0-9]+)+-\d+$/;
const COMMON_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "eu-west-1", "eu-west-2", "eu-central-1",
  "eu-north-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1",
];

/** What the role lets CoderHelm do, from the CloudFormation template it ships. */
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
  const [canEdit, setCanEdit] = useState(false);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.listAwsConnections();
      setLoad({ state: "ready", connections: r.connections });
    } catch {
      setLoad((prev) => (prev.state === "ready" ? prev : { state: "error" }));
    }
  }, []);

  useEffect(() => {
    api.me().then((me) => setCanEdit(hasRole(me.role, "admin"))).catch(() => setCanEdit(false));
    refresh();
  }, [refresh]);

  const connections = load.state === "ready" ? load.connections : [];
  const empty = load.state === "ready" && connections.length === 0;
  const showConnect = canEdit && (adding || empty);

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
          <Callout variant="info" live={false}>
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
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
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
              <div key={c.connection_id} className="flex min-w-0 flex-col gap-3">
                <ConnectionCard connection={c} canEdit={canEdit} onChanged={refresh} />
                {canEdit && <AwsRoleAccess account={c.connection_id} />}
              </div>
            ))}
          </div>
          <ScopeCard />
        </div>
      )}

      {load.state === "ready" && connections.length > 0 && <Findings canEditNotify={canEdit} />}
    </Page>
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
        <a href="mailto:security@coderhelm.com" className={`${linkButton} text-zinc-300`}>
          security@coderhelm.com
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
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs text-zinc-500">Your External ID</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="min-w-0 break-all font-mono text-sm text-zinc-200">{cfn?.external_id ?? "Loading…"}</code>
                {cfn && <CopyButton text={cfn.external_id} />}
              </div>
              <p className="mt-1 text-xs text-zinc-500">It stops anyone else using Coderhelm from assuming your role. The stack fills it in for you.</p>
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
              helper={<>Looks like <code className="break-all">arn:aws:iam::123456789012:role/{ROLE_NAME}</code>.</>}
              error={arn && !arnOk ? <>The role must be named {ROLE_NAME}: <code className="break-all">arn:aws:iam::&lt;12 digit account&gt;:role/{ROLE_NAME}</code></> : undefined}
            >
              {(props) => (
                <input
                  {...props}
                  value={roleArn}
                  onChange={(e) => { setRoleArn(e.target.value); setResult(null); }}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={`arn:aws:iam::123456789012:role/${ROLE_NAME}`}
                  className={`${inputClass} font-mono`}
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
                    className={`${inputClass} max-w-xs font-mono`}
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
                <p className="break-words">{result.message}</p>
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

// ── One connected account ────────────────────────────────────────────

type Panel = null | "groups" | "edit";
type TestResult = { ok: boolean; message: string; at: string };

function ConnectionCard({ connection: c, canEdit, onChanged }: { connection: AwsConnection; canEdit: boolean; onChanged: () => void }) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [removing, setRemoving] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const healthy = c.status !== "error";
  const lastAnalysisFailed = !!c.error_message && healthy;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const r = await api.testAwsConnection(c.connection_id);
      setTest({ ok: r.status === "connected", message: r.status === "connected" ? "Coderhelm assumed the role." : r.message, at: new Date().toISOString() });
      onChanged();
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error && e.message ? e.message : "The test could not run.", at: new Date().toISOString() });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: `Disconnect AWS account ${c.connection_id}?`,
      message: "Coderhelm stops reading its logs right away. Findings you already have are kept. The role stays in your AWS account until you delete it there.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await api.deleteAwsConnection(c.connection_id);
      toast(`AWS account ${c.connection_id} disconnected`);
      onChanged();
    } catch {
      toast("Could not disconnect. The account is still connected.", "error");
      setRemoving(false);
    }
  };

  return (
    <article aria-label={`AWS account ${c.connection_id}`} className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-orange-400">
          <AwsIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-zinc-100">AWS account {c.connection_id}</h2>
          <p className="text-sm text-zinc-400">{c.region}</p>
        </div>
        {healthy ? <StatusPill tone="success">Connected</StatusPill> : <StatusPill tone="error">Cannot use the role</StatusPill>}
      </div>

      {!healthy && (
        <div className="mt-4">
          <Callout variant="error" title="Coderhelm cannot use the role" live={false}>
            <p className="break-words">{c.error_message || "The last check failed."}</p>
            <p>No logs are read until this is fixed. Check the role&apos;s trust policy, then test again.</p>
          </Callout>
        </div>
      )}
      {lastAnalysisFailed && (
        <div className="mt-4">
          <Callout variant="warning" title="The last analysis failed" live={false}>
            <p className="break-words">
              {c.last_error_at ? `${timeAgo(c.last_error_at)}: ` : ""}
              {c.error_message}
            </p>
          </Callout>
        </div>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Fact label="Role" wide>
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 break-all font-mono text-xs text-zinc-300">{c.role_arn}</code>
            <CopyButton text={c.role_arn} label="Copy" />
          </span>
        </Fact>
        <Fact label="Log groups">{c.log_groups.length > 0 ? `${c.log_groups.length} chosen` : "All log groups"}</Fact>
        <Fact label="Last analysis">{c.last_analyzed_at ? timeAgo(c.last_analyzed_at) : "Not yet. The first one runs within 6 hours."}</Fact>
        <Fact label="Last change">{c.updated_at ? timeAgo(c.updated_at) : c.created_at ? timeAgo(c.created_at) : "Unknown"}</Fact>
      </dl>

      {test && (
        <div className="mt-4">
          <Callout variant={test.ok ? "success" : "error"} title={test.ok ? "The connection works" : "The test failed"}>
            <p className="break-words">{test.message}</p>
          </Callout>
        </div>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
          <button type="button" onClick={runTest} disabled={testing} className={secondaryButton}>
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            aria-expanded={panel === "groups"}
            onClick={() => setPanel((p) => (p === "groups" ? null : "groups"))}
            className={secondaryButton}
          >
            Choose log groups
          </button>
          <button
            type="button"
            aria-expanded={panel === "edit"}
            onClick={() => setPanel((p) => (p === "edit" ? null : "edit"))}
            className={secondaryButton}
          >
            Change role or region
          </button>
          <button
            type="button"
            onClick={disconnect}
            disabled={removing}
            className={`inline-flex min-h-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 sm:ml-auto ${focusRing}`}
          >
            {removing ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      )}

      {panel === "groups" && (
        <LogGroupsPanel connection={c} onClose={() => setPanel(null)} onSaved={() => { setPanel(null); onChanged(); }} />
      )}
      {panel === "edit" && <EditPanel connection={c} onClose={() => setPanel(null)} onSaved={() => { setPanel(null); onChanged(); }} />}
    </article>
  );
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-200">{children}</dd>
    </div>
  );
}

const GROUP_PAGE = 50;

function LogGroupsPanel({ connection, onClose, onSaved }: { connection: AwsConnection; onClose: () => void; onSaved: () => void }) {
  const [groups, setGroups] = useState<LogGroup[] | null>(null);
  const [error, setError] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set(connection.log_groups));
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(GROUP_PAGE);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

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

  const toggle = (name: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAwsConnection(connection.connection_id, { log_groups: Array.from(chosen) });
      toast(chosen.size ? `Coderhelm reads ${chosen.size} log group${chosen.size === 1 ? "" : "s"}` : "Coderhelm reads every log group");
      onSaved();
    } catch {
      toast("Could not save. The earlier choice is still in use.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4">
      <div>
        <h3 className="font-semibold text-zinc-100">Which log groups Coderhelm reads</h3>
        <p className="text-sm text-zinc-400">Choose none to let it read every log group in {connection.region}.</p>
      </div>
      {error && (
        <Callout variant="warning" title="Could not list the log groups">
          <p>Test the connection first. You can still remove groups chosen earlier.</p>
        </Callout>
      )}
      <label htmlFor={`lg-search-${connection.connection_id}`} className="sr-only">Search log groups</label>
      <input
        id={`lg-search-${connection.connection_id}`}
        value={q}
        onChange={(e) => { setQ(e.target.value); setShown(GROUP_PAGE); }}
        placeholder={groups ? `Search ${groups.length} log groups` : "Search log groups"}
        className={inputClass}
      />
      {groups === null ? (
        <p role="status" className="text-sm text-zinc-500">Listing log groups…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">{q ? `No log group matches "${q}".` : "No log groups in this region."}</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
          {filtered.slice(0, shown).map((g) => (
            <li key={g.name}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-900">
                <input type="checkbox" checked={chosen.has(g.name)} onChange={() => toggle(g.name)} className="h-4 w-4 shrink-0 accent-emerald-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-zinc-200">{g.name}</span>
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
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={primaryButton}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setChosen(new Set())} className={secondaryButton}>
          Clear (read all)
        </button>
        <button type="button" onClick={onClose} className={secondaryButton}>
          Close
        </button>
        <span className="text-sm text-zinc-500">{chosen.size} chosen</span>
      </div>
    </div>
  );
}

function EditPanel({ connection, onClose, onSaved }: { connection: AwsConnection; onClose: () => void; onSaved: () => void }) {
  const [roleArn, setRoleArn] = useState(connection.role_arn);
  const [region, setRegion] = useState(connection.region);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const arnOk = ROLE_ARN_RE.test(roleArn.trim());
  const regionOk = REGION_RE.test(region.trim());
  const id = connection.connection_id;

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAwsConnection(id, { role_arn: roleArn.trim(), region: region.trim() });
      toast("Saved. Test the connection to check the new role.");
      onSaved();
    } catch {
      toast("Could not save. The earlier role and region are still in use.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mt-4 flex flex-col gap-4 border-t border-zinc-800 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (arnOk && regionOk && !saving) save();
      }}
    >
      <Field id={`edit-arn-${id}`} label="Role ARN" error={!arnOk ? `The role must be named ${ROLE_NAME}.` : undefined}>
        {(props) => <input {...props} value={roleArn} onChange={(e) => setRoleArn(e.target.value)} spellCheck={false} className={`${inputClass} font-mono`} />}
      </Field>
      <Field id={`edit-region-${id}`} label="Region" error={!regionOk ? "Enter an AWS region such as us-east-1." : undefined}>
        {(props) => (
          <input {...props} value={region} onChange={(e) => setRegion(e.target.value)} list="aws-regions-edit" spellCheck={false} className={`${inputClass} max-w-xs font-mono`} />
        )}
      </Field>
      <datalist id="aws-regions-edit">
        {COMMON_REGIONS.map((r) => <option key={r} value={r} />)}
      </datalist>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!arnOk || !regionOk || saving} className={primaryButton}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Findings ─────────────────────────────────────────────────────────

const SEVERITY: Record<Recommendation["severity"], { tone: "error" | "warning" | "neutral"; label: string }> = {
  critical: { tone: "error", label: "Critical" },
  warning: { tone: "warning", label: "Warning" },
  info: { tone: "neutral", label: "Info" },
};

function Findings({ canEditNotify }: { canEditNotify: boolean }) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const load = useCallback(() => {
    setError(false);
    api
      .listRecommendations({ status: "pending" })
      .then((r) => setRecs(r.recommendations))
      .catch(() => {
        setError(true);
        setRecs((prev) => prev ?? []);
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  const plan = (rec: Recommendation) => {
    const parts = [`Create a plan to fix this issue found in our AWS logs:`, "", `**${rec.title}**`, "", rec.summary];
    if (rec.source_log_group) parts.push("", `Affected service (log group: ${rec.source_log_group})`);
    if (rec.error_pattern) parts.push("", `Error pattern: ${rec.error_pattern}`);
    if (rec.suggested_action) parts.push("", `Suggested fix: ${rec.suggested_action}`);
    router.push(`/plans/new?prefill=${encodeURIComponent(parts.join("\n"))}`);
  };

  const dismiss = async (rec: Recommendation) => {
    try {
      await api.dismissRecommendation(rec.rec_id);
      setRecs((prev) => (prev ?? []).filter((r) => r.rec_id !== rec.rec_id));
      toast("Finding dismissed");
    } catch {
      toast("Could not dismiss the finding", "error");
    }
  };

  const count = recs?.length ?? 0;

  return (
    <Section
      id="findings"
      title={`Findings${count ? ` (${count})` : ""}`}
      description="Errors Coderhelm found in your logs since the last analysis. Turn one into a plan, or dismiss it."
    >
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {recs === null ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error ? (
            <Callout variant="error" title="Could not load the findings">
              <p>
                <button type="button" onClick={load} className={linkButton}>Try again</button>
              </p>
            </Callout>
          ) : recs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
              No open findings. New ones appear here after each analysis.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {recs.map((rec) => {
                const sev = SEVERITY[rec.severity] ?? SEVERITY.info;
                return (
                  <li key={rec.rec_id} className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={sev.tone}>{sev.label}</StatusPill>
                      {typeof rec.error_count === "number" && rec.error_count > 0 && (
                        <span className="text-xs text-zinc-500">{rec.error_count.toLocaleString()} times</span>
                      )}
                      {rec.created_at && <span className="text-xs text-zinc-500">found {timeAgo(rec.created_at)}</span>}
                    </div>
                    <h3 className="mt-2 font-semibold text-zinc-100">{rec.title}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{rec.summary}</p>
                    {rec.source_log_group && <p className="mt-2 break-all font-mono text-xs text-zinc-500">{rec.source_log_group}</p>}
                    {rec.suggested_action && (
                      <div className="mt-3">
                        <Disclosure summary="Suggested fix">
                          <p className="text-zinc-300">{rec.suggested_action}</p>
                        </Disclosure>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => plan(rec)} className={primaryButton}>
                        Create a plan
                      </button>
                      <button type="button" onClick={() => dismiss(rec)} className={secondaryButton}>
                        Dismiss
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {canEditNotify && <FindingsNotify />}
      </div>
    </Section>
  );
}

const NOTIFY_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "team", label: "Team channel" },
  { value: "custom", label: "Own channel" },
] as const;

type NotifyMode = (typeof NOTIFY_OPTIONS)[number]["value"];

function FindingsNotify() {
  const { toast } = useToast();
  const [saved, setSaved] = useState<{ mode: NotifyMode; url: string } | null>(null);
  const [mode, setMode] = useState<NotifyMode>("off");
  const [url, setUrl] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getRecNotify()
      .then((r) => {
        setSaved({ mode: r.notify_mode, url: r.teams_webhook_url });
        setMode(r.notify_mode);
        setUrl(r.teams_webhook_url);
      })
      .catch(() => setLoadError(true));
  }, []);

  const dirty = !!saved && (saved.mode !== mode || (mode === "custom" && saved.url !== url.trim()));
  const valid = mode !== "custom" || validTeamsUrl(url);

  const save = async () => {
    setSaving(true);
    try {
      const nextUrl = mode === "custom" ? url.trim() : "";
      await api.saveRecNotify(mode, nextUrl);
      setSaved({ mode, url: nextUrl });
      toast("Saved where new findings are posted");
    } catch {
      toast("Could not save. Check the webhook address.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside aria-labelledby="findings-notify-heading" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm">
      <h3 id="findings-notify-heading" className="font-semibold text-zinc-100">Post new findings to Teams</h3>
      <p className="mt-1 text-zinc-400">
        After each analysis, new findings post as one card. The team channel is the one set in{" "}
        <Link href="/settings/alerts" className={linkButton}>Alert routes</Link>.
      </p>
      {loadError ? (
        <div className="mt-3">
          <Callout variant="error"><p>Could not load this setting. Reload the page to try again.</p></Callout>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="max-w-full"><Segmented label="Where to post new findings" options={[...NOTIFY_OPTIONS]} value={mode} onChange={setMode} disabled={!saved} /></div>
          {mode === "custom" && <TeamsWebhookField id="findings-webhook" value={url} onChange={setUrl} />}
          <div>
            <button type="button" onClick={save} disabled={!dirty || !valid || saving} className={primaryButton}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "Empty";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
