"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  api, type AwsAccess, type AwsConnectResult, type AwsExistingConnection, type AwsSetup,
} from "@/lib/api";
import {
  AWS_CONNECT_CHECKS, AWS_FLOW_STEPS, DATABASE_CHECKS, LOGS_CHECKS, WAREHOUSE_CHECKS, errorMessage, runningChecks, toCheckItems,
  writeSetupHint,
} from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { CheckList, type CheckItem } from "@/components/check-list";
import { CopyButton } from "@/components/copy-button";
import { Disclosure } from "@/components/disclosure";
import { FlowShell } from "@/components/data-source-flow-shell";
import { LogGroupPicker } from "@/components/log-group-picker";
import { ExternalLinkIcon } from "@/components/icons";
import { inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";

export default function ConnectAwsPageGuarded() {
  return (
    <RoleGuard minRole="admin">
      <Suspense fallback={null}>
        <ConnectAwsPage />
      </Suspense>
    </RoleGuard>
  );
}

const HUB = "/data-sources";
const CONNECT = "/data-sources/connect";
const CLOUDSHELL = "https://console.aws.amazon.com/cloudshell/home";

type Goal = "logs" | "database";

/** Access that has passed its checks, with what it can reach. */
interface Connected {
  access: AwsAccess;
  result: AwsConnectResult;
  /** Groups the existing connection already watches, to start from. */
  preselect: string[];
}

function ConnectAwsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const goal: Goal = params.get("for") === "database" ? "database" : "logs";
  const [setup, setSetup] = useState<AwsSetup | null>(null);
  const [setupError, setSetupError] = useState("");
  const [connected, setConnected] = useState<Connected | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getAwsSetup()
      .then((res) => { if (!cancelled) setSetup(res); })
      .catch((e) => { if (!cancelled) setSetupError(errorMessage(e, "The request failed.")); });
    return () => { cancelled = true; };
  }, []);

  // The step is in the address so Back (the link or the browser's) returns to
  // the first step. What was checked lives only in this page.
  const step = connected && params.get("step") === "pick" ? "pick" : "access";
  const onConnected = (c: Connected) => {
    setConnected(c);
    router.push(`${CONNECT}/aws?for=${goal}&step=pick`);
  };
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById("step-heading")?.focus({ preventScroll: true });
  }, [step]);

  const finish = (id: string) => {
    writeSetupHint(id, { stage: "choose" });
    router.push(`${CONNECT}?step=choose&id=${encodeURIComponent(id)}`);
  };

  if (connected && step === "pick") {
    return (
      <FlowShell
        steps={AWS_FLOW_STEPS}
        step="pick"
        title={goal === "logs" ? "Choose which logs Coderhelm may search" : "Check and connect"}
        back={{ href: `${CONNECT}/aws?for=${goal}`, label: "Back" }}
      >
        {goal === "logs"
          ? <PickLogs connected={connected} onConnected={finish} />
          : <PickDatabase connected={connected} onConnected={finish} />}
      </FlowShell>
    );
  }

  return (
    <FlowShell
      steps={AWS_FLOW_STEPS}
      step="access"
      title="Give Coderhelm read-only access"
      back={{ href: HUB, label: "Back to data sources" }}
    >
      {setupError ? (
        <Callout variant="error" title="We couldn't prepare the setup">
          <p>{setupError} Nothing was changed. Reload the page to try again.</p>
        </Callout>
      ) : setup === null ? (
        <p role="status" className="text-sm text-zinc-500">Preparing your setup…</p>
      ) : (
        <AccessStep goal={goal} setup={setup} onConnected={onConnected} />
      )}
    </FlowShell>
  );
}

// ── Step 1: access ────────────────────────────────────────────────

function AccessStep({
  goal,
  setup,
  onConnected,
}: {
  goal: Goal;
  setup: AwsSetup;
  onConnected: (c: Connected) => void;
}) {
  const reusable = goal === "logs" ? setup.existing : [];
  const [mode, setMode] = useState<"existing" | "script">(reusable.length ? "existing" : "script");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState("");
  const pasted = useRef(false);

  const check = async (access: AwsAccess, preselect: string[]) => {
    setChecking(true);
    setError("");
    setItems(runningChecks(AWS_CONNECT_CHECKS));
    try {
      const res = await api.connectAws(access);
      setItems(toCheckItems(res.checks, AWS_CONNECT_CHECKS));
      if (!res.ok) {
        setError("A check didn't pass. Nothing was saved.");
        return;
      }
      if (goal === "database" && !res.database && !res.warehouse) {
        setError("That line doesn't include a database or a warehouse. Run the script again and type the number of the one Coderhelm should read when it asks.");
        return;
      }
      onConnected({ access, result: res, preselect });
    } catch (e) {
      setItems(null);
      setError(`${errorMessage(e, "The request failed.")} Nothing was saved. Try again.`);
    } finally {
      setChecking(false);
    }
  };

  const line = code.trim();
  const looksRight = line.startsWith("coderhelm:") && line.length > 20;
  const submitCode = () => { if (looksRight && !checking) check({ code: line }, []); };

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm text-zinc-400">
        {goal === "logs"
          ? "Coderhelm needs permission to search your logs in AWS. It gets a role that can only read, and only Coderhelm can use it."
          : "Coderhelm needs permission to read a PostgreSQL database or a Redshift warehouse in AWS. It gets a role and a database user that can only read, and only Coderhelm can use them."}
      </p>

      {reusable.length > 0 && mode === "existing" && (
        <div className="flex flex-col gap-3">
          {reusable.map((c) => (
            <ExistingConnectionCard key={c.role_arn} connection={c} busy={checking} onUse={() => check({ role_arn: c.role_arn, region: c.region }, c.log_groups)} />
          ))}
          <p>
            <button type="button" className={linkButton} onClick={() => { setMode("script"); setItems(null); setError(""); }}>
              Set up a new connection instead
            </button>
          </p>
        </div>
      )}

      {mode === "script" && (
        <>
          <ol className="flex flex-col gap-5">
            <Instruction n={1} title="Open AWS CloudShell">
              <p>Sign in to the AWS account where your {goal === "logs" ? "logs are" : "database is"}, then open CloudShell. It&apos;s a terminal in your browser, already signed in.</p>
              <p>
                <a href={CLOUDSHELL} target="_blank" rel="noopener noreferrer" className={`${primaryButton} gap-2`}>
                  Open AWS CloudShell
                  <span aria-hidden="true"><ExternalLinkIcon /></span>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </p>
            </Instruction>
            <Instruction n={2} title="Paste this script and press Enter">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
                  <span className="text-xs text-zinc-500">Setup script</span>
                  <CopyButton text={setup.script} label="Copy script" />
                </div>
                <pre
                  tabIndex={0}
                  aria-label="Setup script"
                  className="max-h-56 overflow-auto p-3 font-mono text-xs leading-relaxed text-zinc-300 whitespace-pre"
                >
                  {setup.script}
                </pre>
              </div>
            </Instruction>
            <Instruction n={3} title="Answer its questions">
              {goal === "database" ? (
                <>
                  <p>
                    It lists your PostgreSQL databases first. Type the number of the one Coderhelm should read and press Enter, then press
                    Enter again to keep the suggested database name. Type 0 to skip.
                  </p>
                  <p>
                    Then it lists your Redshift warehouses. Type the number of the one Coderhelm should read, or 0 to skip. Every database in that
                    warehouse is shared; you can still hide columns afterwards.
                  </p>
                </>
              ) : (
                <p>It asks whether to share a database and a warehouse too. Type 0 and press Enter at each question to share only logs.</p>
              )}
            </Instruction>
            <Instruction n={4} title="Copy the last line it prints">
              <p>It starts with <span className="font-mono text-xs text-zinc-200">coderhelm:</span>. Paste it here.</p>
              <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submitCode(); }}>
                <label htmlFor="aws-code" className="text-sm font-semibold text-zinc-100">The line from CloudShell</label>
                <input
                  id="aws-code"
                  type="text"
                  value={code}
                  onPaste={() => { pasted.current = true; }}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError("");
                    setItems(null);
                    const v = e.target.value.trim();
                    if (pasted.current && v.startsWith("coderhelm:")) {
                      pasted.current = false;
                      check({ code: v }, []);
                    }
                    pasted.current = false;
                  }}
                  placeholder="coderhelm:…"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={line && !looksRight ? true : undefined}
                  aria-describedby={line && !looksRight ? "aws-code-error" : undefined}
                  className={`${inputClass} font-mono text-xs`}
                />
                {line && !looksRight && (
                  <p id="aws-code-error" role="alert" className="text-sm text-red-400">
                    That isn&apos;t the line from the script. Copy the whole last line, starting with coderhelm:
                  </p>
                )}
                <div>
                  <button type="submit" disabled={!looksRight || checking} className={primaryButton}>
                    {checking ? "Checking…" : "Continue"}
                  </button>
                </div>
              </form>
            </Instruction>
          </ol>

          <Disclosure summary="What does this script do?">
            <ul className="list-disc space-y-1 pl-5">
              <li>Creates a role called {setup.role_prefix} in your AWS account. It can read logs and nothing else.</li>
              <li>Only Coderhelm can use the role, and only with your team&apos;s private ID, which is built into the script.</li>
              <li>
                If you choose a database, it creates a database user called coderhelm_readonly that can read every table and change none,
                and stores its password as a secret in your account that only that role can read.
              </li>
              <li>
                If you choose a Redshift warehouse, it creates a warehouse user called coderhelm_readonly with no password, gives it read
                access in every database, and lets the role sign in only as that user.
              </li>
              <li>You can remove access any time by deleting the role in your AWS account.</li>
            </ul>
          </Disclosure>
          <Disclosure summary="Technical details">
            <p>The role trusts Coderhelm&apos;s AWS account only when the request carries your private ID (an external ID). Running the script again updates the role in place.</p>
            <p>Logs: DescribeLogGroups, StartQuery, GetQueryResults and StopQuery. Unmasking masked values is explicitly denied.</p>
            <p>
              Database: through the RDS Data API, the role may begin a transaction, run a statement and roll back, on the one database you
              choose. Committing is explicitly denied. The database user defaults to read-only, and every lookup runs read-only and is rolled back.
            </p>
            <p>
              Warehouse: through the Redshift Data API, the role may sign in only as coderhelm_readonly and run one statement at a time; batches
              and every other way of signing in are explicitly denied. Redshift has no read-only transaction, so Coderhelm checks that the user
              can&apos;t change any table before it connects and again before it reads.
            </p>
            <p>The role can read only secrets whose names start with coderhelm-readonly-.</p>
          </Disclosure>
        </>
      )}

      {items && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <CheckList items={items} label="Checks for this connection" />
        </div>
      )}
      {error && <Callout variant="error" title="We couldn't use this connection"><p>{error}</p></Callout>}
    </div>
  );
}

function Instruction({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-600 text-xs text-zinc-300">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-zinc-400">
        <h2 className="text-sm font-semibold text-zinc-100">
          <span className="sr-only">Step {n}: </span>{title}
        </h2>
        {children}
      </div>
    </li>
  );
}

function ExistingConnectionCard({
  connection,
  busy,
  onUse,
}: {
  connection: AwsExistingConnection;
  busy: boolean;
  onUse: () => void;
}) {
  return (
    <section aria-label={`AWS account ${connection.account}`} className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-5">
      <h2 className="font-semibold text-zinc-100">Use the connection you already have</h2>
      <p className="mt-1 text-sm text-zinc-400">
        AWS account <span className="font-mono text-xs text-zinc-200">{connection.account}</span>, {connection.region}. You set this up for
        log alerts. It can only read logs, so there&apos;s nothing to run.
      </p>
      <div className="mt-4">
        <button type="button" onClick={onUse} disabled={busy} className={primaryButton}>
          {busy ? "Checking…" : "Use this connection"}
        </button>
      </div>
    </section>
  );
}

// ── Step 2: what to share ─────────────────────────────────────────

function PickLogs({ connected, onConnected }: { connected: Connected; onConnected: (id: string) => void }) {
  const { toast } = useToast();
  const groups = connected.result.log_groups ?? [];
  const known = new Set(groups.map((g) => g.name));
  const [chosen, setChosen] = useState<string[]>(() => connected.preselect.filter((g) => known.has(g) || g.endsWith("*")));
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.createLogsSource({ ...connected.access, log_groups: chosen });
      if (res.ok) {
        toast("Logs connected");
        onConnected(res.source.id);
        return;
      }
      if (res.checks) setItems(toCheckItems(res.checks, LOGS_CHECKS));
      setError(`${res.error} Nothing was saved.`);
    } catch (e) {
      setError(`We couldn't save the connection (${errorMessage(e, "the request failed")}). Nothing was saved. Try again.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-zinc-400">
        Coderhelm can search only the log groups you choose here, in AWS account{" "}
        <span className="font-mono text-xs text-zinc-200">{connected.result.account}</span>. Pick the ones for the services it works on.
        You can change this later.
      </p>
      <LogGroupPicker groups={groups} value={chosen} onChange={setChosen} />
      {items && <CheckList items={items} label="Checks for this connection" />}
      {error && <Callout variant="error" title="We couldn't connect these logs"><p>{error}</p></Callout>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={chosen.length === 0 || saving} className={primaryButton}>
          {saving ? "Connecting…" : chosen.length === 0 ? "Choose at least one log group" : `Connect ${chosen.length === 1 ? "this log group" : `these ${chosen.length} log groups`}`}
        </button>
      </div>
    </div>
  );
}

type Engine = "postgres" | "redshift";

/** One database or warehouse the pasted line includes. */
interface DbTarget {
  engine: Engine;
  title: string;
  rows: [string, string][];
}

function dbTargets(connected: Connected): DbTarget[] {
  const r = connected.result;
  const account = `${r.account}, ${r.region}`;
  const out: DbTarget[] = [];
  if (r.database) {
    out.push({
      engine: "postgres",
      title: "PostgreSQL database",
      rows: [["Database", r.database.database], ["Cluster", r.database.cluster], ["AWS account", account]],
    });
  }
  if (r.warehouse) {
    out.push({
      engine: "redshift",
      title: "Redshift warehouse",
      rows: [["Warehouse", r.warehouse.cluster], ["Databases", r.warehouse.databases.join(", ")], ["AWS account", account]],
    });
  }
  return out;
}

function PickDatabase({ connected, onConnected }: { connected: Connected; onConnected: (id: string) => void }) {
  const targets = dbTargets(connected);
  // Both came in one line: connecting the first keeps the second on offer.
  const [done, setDone] = useState<{ engine: Engine; id: string }[]>([]);
  const remaining = targets.filter((t) => !done.some((d) => d.engine === t.engine));

  const connectedOne = (engine: Engine, id: string) => {
    const next = [...done, { engine, id }];
    if (next.length >= targets.length) {
      onConnected(next[0].id);
    } else {
      setDone(next);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {done.length > 0 && (
        <Callout variant="success" title={`${done.length === 1 ? "One source is" : "Sources are"} connected`}>
          <p>You can connect the {remaining.map((t) => t.title.toLowerCase()).join(" and ")} below too, or continue with what you connected.</p>
          <p>
            <button type="button" className={primaryButton} onClick={() => onConnected(done[0].id)}>Continue</button>
          </p>
        </Callout>
      )}
      {remaining.map((t) => (
        <ConnectDbTarget key={t.engine} target={t} connected={connected} showTitle={targets.length > 1} onConnected={(id) => connectedOne(t.engine, id)} />
      ))}
    </div>
  );
}

function ConnectDbTarget({
  target,
  connected,
  showTitle,
  onConnected,
}: {
  target: DbTarget;
  connected: Connected;
  showTitle: boolean;
  onConnected: (id: string) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState("");
  const code = "code" in connected.access ? connected.access.code : "";
  const warehouse = target.engine === "redshift";
  const expected = warehouse ? WAREHOUSE_CHECKS : DATABASE_CHECKS;
  const noun = warehouse ? "warehouse" : "database";

  const save = async () => {
    setSaving(true);
    setError("");
    setItems(runningChecks(expected));
    try {
      const res = await api.createDatabaseSource({ code, engine: target.engine });
      if (res.ok) {
        setItems(toCheckItems(res.checks, expected));
        toast(warehouse ? "Warehouse connected" : "Database connected");
        onConnected(res.source.id);
        return;
      }
      setItems(res.checks ? toCheckItems(res.checks, expected) : null);
      setError(`${res.error} Nothing was saved.`);
    } catch (e) {
      setItems(null);
      setError(`We couldn't save the connection (${errorMessage(e, "the request failed")}). Nothing was saved. Try again.`);
    } finally {
      setSaving(false);
    }
  };

  const headingId = `target-${target.engine}`;
  return (
    <section aria-labelledby={showTitle ? headingId : undefined} className="flex flex-col gap-5">
      {showTitle && <h2 id={headingId} className="text-sm font-semibold text-zinc-100">{target.title}</h2>}
      <dl className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {target.rows.map(([k, v]) => (
          <div key={k} className="grid gap-x-4 gap-y-1 px-5 py-3.5 sm:grid-cols-[150px_minmax(0,1fr)]">
            <dt className="text-sm text-zinc-400">{k}</dt>
            <dd className="min-w-0 break-all font-mono text-xs text-zinc-100">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="max-w-prose text-sm text-zinc-400">
        {warehouse
          ? "Before connecting, Coderhelm signs in as the new user in every shared database and proves it can't change any table. If it could, nothing is saved."
          : "Before connecting, Coderhelm signs in as the new user and proves it can't change any table. If it could, nothing is saved."}
      </p>
      {items && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <CheckList items={items} label={`Checks for this ${noun}`} />
        </div>
      )}
      {error && <Callout variant="error" title={`We couldn't connect this ${noun}`}><p>{error}</p></Callout>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className={primaryButton}>
          {saving ? "Checking…" : items && error ? "Check again" : showTitle ? `Check and connect the ${noun}` : "Check and connect"}
        </button>
        {!showTitle && (
          <Link href={`${CONNECT}/aws?for=database`} className={secondaryButton}>Use a different {noun}</Link>
        )}
      </div>
    </section>
  );
}
