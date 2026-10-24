"use client";

import { PageHeader } from "@/components/page";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  api, type DataSource, type DataSourceCheckResult, type DataSourceSample, type DataSourceStepError,
  type DataSourceTryResult, type Repo,
} from "@/lib/api";
import {
  AWS_FLOW_STEPS, DEFAULT_HIDDEN_FIELDS, clearSetupHint, errorMessage, formatDuration, hiddenNoun, prettyJson,
  isWarehouse, readSetupHint, runningChecks, stepLabel, toCheckItems, whereLabel, writeSetupHint,
} from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { CheckList, type CheckItem } from "@/components/check-list";
import { CodeBlock } from "@/components/code-block";
import { Disclosure } from "@/components/disclosure";
import { Field, SecretInput } from "@/components/field";
import { HiddenFieldsEditor } from "@/components/hidden-fields-editor";
import { Segmented } from "@/components/segmented";
import { FlowShell as BaseFlowShell } from "@/components/data-source-flow-shell";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";

export default function ConnectDataSourcePageGuarded() {
  return (
    <RoleGuard need="data_sources">
      <Suspense fallback={null}>
        <ConnectDataSourcePage />
      </Suspense>
    </RoleGuard>
  );
}

const HUB = "/data-sources";
const CONNECT = "/data-sources/connect";
const WRITE_QUERY = "mutation { __typename }";
const WRITE_SQL = "DELETE FROM coderhelm_example";
const DEBOUNCE_MS = 600;

const STEPS = [
  { id: "address", label: "Where your API is" },
  { id: "key", label: "A key to read it" },
  { id: "choose", label: "Choose what it may use" },
  { id: "try", label: "Try it" },
  { id: "review", label: "Check and turn on" },
] as const;
type StepId = (typeof STEPS)[number]["id"] | "done";
const STEP_IDS: string[] = [...STEPS.map((s) => s.id), "done"];

function ConnectDataSourcePage() {
  const params = useSearchParams();
  const router = useRouter();
  const rawStep = params.get("step") ?? "address";
  const step = (STEP_IDS.includes(rawStep) ? rawStep : "address") as StepId;
  const id = params.get("id") ?? "";
  const url = params.get("url") ?? "";

  const go = useCallback(
    (next: StepId, query: Record<string, string> = {}) => {
      router.push(`${CONNECT}?${new URLSearchParams({ step: next, ...query }).toString()}`);
    },
    [router],
  );

  // Move focus to the new question when the step changes, so keyboard and
  // screen reader users land on it. Skipped on first load.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById("step-heading")?.focus({ preventScroll: true });
  }, [step]);

  // Steps after "key" work on a saved source, loaded by id so any of them can
  // be reopened from a link.
  const needsSource = step !== "address" && step !== "key";
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!needsSource) return;
    let cancelled = false;
    setLoadError("");
    api.listDataSources()
      .then((res) => { if (!cancelled) setSources(res.sources); })
      .catch((e) => { if (!cancelled) setLoadError(errorMessage(e, "The request failed.")); });
    return () => { cancelled = true; };
  }, [needsSource, id]);

  const source = sources?.find((s) => s.id === id) ?? null;
  const updateSource = (next: DataSource) =>
    setSources((prev) => (prev ? prev.map((s) => (s.id === next.id ? next : s)) : [next]));

  if (step === "address") {
    return (
      <FlowShell step="address" title="Where is your API?" back={{ href: HUB, label: "Back to data sources" }}>
        <AddressStep initialUrl={url} onContinue={(u) => go("key", { url: u })} />
      </FlowShell>
    );
  }
  if (step === "key") {
    return (
      <FlowShell
        step="key"
        title="Paste a key Coderhelm can use"
        back={{ href: `${CONNECT}?${new URLSearchParams({ step: "address", url }).toString()}`, label: "Back" }}
      >
        <KeyStep
          url={url}
          onConnected={(s) => {
            setSources((prev) => (prev ? [...prev.filter((p) => p.id !== s.id), s] : null));
            go("choose", { id: s.id });
          }}
        />
      </FlowShell>
    );
  }

  const titles: Record<Exclude<StepId, "address" | "key">, string> = {
    choose: "Choose what Coderhelm may use",
    try: "Run a lookup the way Coderhelm would",
    review: "Check before you turn it on",
    done: "Fact-checking is on",
  };
  const backs: Record<Exclude<StepId, "address" | "key">, { href: string; label: string }> = {
    choose: { href: HUB, label: "Back to data sources" },
    try: { href: `${CONNECT}?step=choose&id=${encodeURIComponent(id)}`, label: "Back" },
    review: { href: `${CONNECT}?step=try&id=${encodeURIComponent(id)}`, label: "Back" },
    done: { href: HUB, label: "Back to data sources" },
  };

  let body: ReactNode;
  if (loadError) {
    body = (
      <Callout variant="error" title="We couldn't load this source">
        <p>{loadError} Nothing was changed. Reload the page to try again, or go back to <Link href={HUB} className={linkButton}>data sources</Link>.</p>
      </Callout>
    );
  } else if (sources === null) {
    body = <p role="status" className="text-sm text-zinc-500">Loading…</p>;
  } else if (!source) {
    body = (
      <Callout variant="error" title="We couldn't find that source">
        <p>It may have been removed, or the link is incomplete. Go back to <Link href={HUB} className={linkButton}>data sources</Link> and pick it from the list, or connect it again.</p>
      </Callout>
    );
  } else if (step === "choose") {
    body = (
      <ChooseStep
        key={source.id}
        source={source}
        onSaved={(saved) => { updateSource(saved); go("try", { id: source.id }); }}
      />
    );
  } else if (step === "try") {
    body = <TryStep key={source.id} source={source} onContinue={() => go("review", { id: source.id })} />;
  } else if (step === "review") {
    body = (
      <ReviewStep
        source={source}
        onTurnedOn={(s) => { updateSource(s); go("done", { id: s.id }); }}
      />
    );
  } else {
    return (
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <PageHeader
          detail
          crumb={false}
          title="Fact-checking is on"
          titleId="step-heading"
          lead="Coderhelm uses it from now on, while it plans, writes code and reviews. When it looks something up, the plan or pull request shows what it asked and what came back."
        />
        {!source.enabled && (
          <div className="mt-5 max-w-prose">
            <Callout variant="warning" title={`${source.name} is paused right now`}>
              <p>Turn it on with its switch on the data sources page.</p>
            </Callout>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={HUB} className={primaryButton}>Back to data sources</Link>
          <Link href={`${HUB}#activity`} className={secondaryButton}>See activity</Link>
          <Link href={HUB} className={secondaryButton}>Add another source</Link>
        </div>
      </div>
    );
  }

  return (
    <FlowShell step={step} title={titles[step]} back={backs[step]} steps={source && source.kind !== "api" ? AWS_FLOW_STEPS : undefined}>
      {body}
    </FlowShell>
  );
}

// ── Layout shared by every setup screen ───────────────────────────

function FlowShell(props: {
  step: string;
  title: string;
  back: { href: string; label: string };
  children: ReactNode;
  steps?: { id: string; label: string }[];
}) {
  return <BaseFlowShell {...props} steps={props.steps ?? [...STEPS]} />;
}


function StepErrorText({ error }: { error: DataSourceStepError }) {
  return (
    <>
      <span className="font-semibold">{stepLabel(error.step)}: </span>
      {error.message} <span className="text-zinc-200">{error.fix}</span>
    </>
  );
}

// ── Step 1: the address ───────────────────────────────────────────

type ProbeState =
  | { state: "idle" | "checking" | "ok" }
  | { state: "error"; error: DataSourceStepError };

function AddressStep({ initialUrl, onContinue }: { initialUrl: string; onContinue: (url: string) => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [probe, setProbe] = useState<ProbeState>({ state: "idle" });
  const seq = useRef(0);
  const probed = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const runProbe = useCallback(async (value: string): Promise<boolean> => {
    clearTimeout(timer.current);
    const target = value.trim();
    const mine = ++seq.current;
    probed.current = target;
    if (!target) {
      setProbe({ state: "idle" });
      return false;
    }
    if (!/^https?:\/\/\S+$/i.test(target)) {
      setProbe({
        state: "error",
        error: {
          step: "Web address",
          message: "That doesn't look like a web address.",
          fix: "It should start with https:// and have no spaces, like https://api.yourcompany.com/graphql.",
        },
      });
      return false;
    }
    setProbe({ state: "checking" });
    try {
      const res = await api.probeDataSourceApi(target);
      if (mine !== seq.current) return false;
      if (res.ok && res.kind === "graphql") {
        setProbe({ state: "ok" });
        return true;
      }
      setProbe({
        state: "error",
        error: res.error ?? {
          step: "reach",
          message: "We reached that address, but it didn't answer like a GraphQL API.",
          fix: "Check the address with an engineer. It often ends in /graphql.",
        },
      });
      return false;
    } catch (e) {
      if (mine !== seq.current) return false;
      setProbe({
        state: "error",
        error: {
          step: "reach",
          message: `We couldn't check that address (${errorMessage(e, "the request failed")}).`,
          fix: "Check your connection, then press Continue to try again.",
        },
      });
      return false;
    }
  }, []);

  // A link from a teammate can arrive with the address already filled in.
  useEffect(() => {
    if (initialUrl) runProbe(initialUrl);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setUrl(value);
    seq.current++;
    probed.current = "";
    setProbe({ state: "idle" });
    clearTimeout(timer.current);
    if (value.trim()) timer.current = setTimeout(() => runProbe(value), DEBOUNCE_MS);
  };

  const submit = async () => {
    const target = url.trim();
    if (!target) return;
    if (probe.state === "ok" && probed.current === target) return onContinue(target);
    if (await runProbe(target)) onContinue(target);
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Field
        id="api-url"
        label="Web address"
        helper="Paste the address your apps use. An engineer will know it, or you can find it in your app's settings."
        error={probe.state === "error" ? <StepErrorText error={probe.error} /> : undefined}
      >
        {(props) => (
          <input
            {...props}
            type="url"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
            value={url}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => { if (url.trim() && probed.current !== url.trim()) runProbe(url); }}
            placeholder="https://api.yourcompany.com/graphql"
            className={inputClass}
          />
        )}
      </Field>
      {probe.state === "checking" && <p role="status" className="text-sm text-zinc-400">Checking the address…</p>}
      {probe.state === "ok" && <Callout variant="success"><p>Found a GraphQL API at that address.</p></Callout>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!url.trim() || probe.state === "checking"} className={primaryButton}>
          {probe.state === "checking" ? "Checking…" : "Continue"}
        </button>
      </div>
      <Disclosure summary="Technical details">
        <p>
          For now this works with GraphQL APIs. To find out what is at the address we send one small POST request to exactly
          that address, without a key. Redirects are not followed.
        </p>
      </Disclosure>
    </form>
  );
}

// ── Step 2: the key ───────────────────────────────────────────────

function KeyStep({ url, onConnected }: { url: string; onConnected: (source: DataSource) => void }) {
  const { toast } = useToast();
  const [key, setKey] = useState("");
  const [phase, setPhase] = useState<"idle" | "checking" | "checked">("idle");
  const [result, setResult] = useState<DataSourceCheckResult | null>(null);
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [checkError, setCheckError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pasted = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  const runCheck = useCallback(async (value: string) => {
    clearTimeout(timer.current);
    const secret = value.trim();
    const mine = ++seq.current;
    setCheckError("");
    setConnectError("");
    setResult(null);
    if (!secret) {
      setPhase("idle");
      setItems(null);
      return;
    }
    setPhase("checking");
    setItems(runningChecks());
    try {
      const res = await api.checkDataSourceApi(url, secret);
      if (mine !== seq.current) return;
      setResult(res);
      setItems(toCheckItems(res.checks));
      setPhase("checked");
    } catch (e) {
      if (mine !== seq.current) return;
      setItems(null);
      setPhase("idle");
      setCheckError(`We couldn't check the key (${errorMessage(e, "the request failed")}). Nothing was saved. Paste it again to retry.`);
    }
  }, [url]);

  const onChange = (value: string) => {
    setKey(value);
    seq.current++;
    setPhase("idle");
    setResult(null);
    setItems(null);
    setCheckError("");
    setConnectError("");
    clearTimeout(timer.current);
    if (!value.trim()) return;
    if (pasted.current) {
      pasted.current = false;
      runCheck(value);
    } else {
      timer.current = setTimeout(() => runCheck(value), DEBOUNCE_MS);
    }
  };

  const connect = async () => {
    setConnecting(true);
    setConnectError("");
    try {
      const res = await api.createDataSourceApi({ url, key: key.trim() });
      if (res.ok) {
        writeSetupHint(res.source.id, { stage: "choose" });
        toast("API connected");
        onConnected(res.source);
        return;
      }
      if (res.checks) setItems(toCheckItems(res.checks));
      setResult(null);
      setConnectError(`${res.error} Nothing was saved.`);
    } catch (e) {
      setConnectError(`We couldn't save the connection (${errorMessage(e, "the request failed")}). Nothing was saved. Press Connect to try again.`);
    } finally {
      setConnecting(false);
    }
  };

  if (!url) {
    return (
      <Callout variant="warning" title="We need the address first">
        <p>This step checks a key against your API&apos;s address. <Link href={`${CONNECT}?step=address`} className={linkButton}>Enter the address</Link>, then come back here.</p>
      </Callout>
    );
  }

  const ready = phase === "checked" && result?.ok === true;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !connecting) connect();
        else if (phase === "idle" && key.trim()) runCheck(key);
      }}
    >
      <p className="text-sm text-zinc-400 break-all">
        For <span className="font-mono text-xs text-zinc-200">{url}</span>
      </p>
      <Field
        id="api-key"
        label="API key"
        helper="Use a read-only key if you can. We check it the moment you paste it."
        error={checkError || undefined}
      >
        {(props) => (
          <SecretInput
            {...props}
            value={key}
            onPaste={() => { pasted.current = true; }}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste the key here"
          />
        )}
      </Field>

      {items && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <CheckList items={items} label="Checks for this key" />
        </div>
      )}
      {ready && result && (
        <Callout variant="success">
          <p>
            This key works.
            {typeof result.kinds === "number" ? ` It can read ${result.kinds} kind${result.kinds === 1 ? "" : "s"} of data.` : ""}
          </p>
        </Callout>
      )}
      {ready && result?.has_mutations && (
        <Callout variant="warning" title="This API can also change data.">
          <p>
            Coderhelm can&apos;t: every lookup is checked before it leaves Coderhelm and anything that isn&apos;t a
            pure read is refused.
          </p>
        </Callout>
      )}
      {ready && result && !result.schema_available && (
        <Callout variant="info">
          <p>This API doesn&apos;t share its list of data, so we can&apos;t suggest example lookups. You can still write your own on the Try it step.</p>
        </Callout>
      )}
      {connectError && (
        <Callout variant="error" title="We couldn't connect this API"><p>{connectError}</p></Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!ready || connecting} className={primaryButton}>
          {connecting ? "Connecting…" : phase === "checking" ? "Checking the key…" : "Connect"}
        </button>
      </div>

      <Disclosure summary="Where do I find a key?">
        <p>
          Keys are created by whoever runs your API. Ask them for &quot;a read-only API key for Coderhelm&quot;. If you
          are not the right person to ask, use the link below to send this step to a teammate.
        </p>
      </Disclosure>
      <Disclosure summary="Technical details">
        <p>
          The key is sent as a request header. Only POST requests to this exact address are sent, and redirects are not
          followed.
        </p>
        <p>
          A request is refused unless it parses as a single read query. Anything that would change data is refused
          before it leaves Coderhelm.
        </p>
        <p>The key is encrypted with a key dedicated to secrets and is never shown again.</p>
      </Disclosure>
    </form>
  );
}

// ── Step 3: choose ────────────────────────────────────────────────

function ChooseStep({ source, onSaved }: { source: DataSource; onSaved: (saved: DataSource) => void }) {
  const [hint] = useState(() => readSetupHint(source.id));
  const [repoMode, setRepoMode] = useState<"all" | "some">(source.repos.length ? "some" : "all");
  const [picked, setPicked] = useState<string[]>(source.repos);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposError, setReposError] = useState("");
  // The server seeds the hidden list when a source is created. The suggested
  // list is only a fallback for a new source that came back with none.
  const [hidden, setHidden] = useState<string[]>(() =>
    source.hidden_fields.length === 0 && !source.setup_complete && (!hint || hint.stage === "choose")
      ? DEFAULT_HIDDEN_FIELDS
      : source.hidden_fields,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const noun = hiddenNoun(source.kind);

  useEffect(() => {
    api.listRepos()
      .then((res) => setRepos(res.repos))
      .catch((e) => { setRepos([]); setReposError(errorMessage(e, "The request failed.")); });
  }, []);

  const repoNames = Array.from(new Set([...(repos ?? []).map((r) => r.name), ...picked])).sort();
  const noneChosen = repoMode === "some" && picked.length === 0;

  const save = async () => {
    if (noneChosen) return;
    setSaving(true);
    setError("");
    try {
      // On/off is not touched here: a new source stays off until the last step.
      const res = await api.updateDataSource(source.id, {
        hidden_fields: hidden,
        repos: repoMode === "all" ? [] : picked,
      });
      if (!source.setup_complete) {
        writeSetupHint(source.id, { stage: hint?.stage === "review" ? "review" : "try" });
      }
      onSaved(res.source);
    } catch (e) {
      setError(`${errorMessage(e, "The request failed.")} Your choices here were not saved. Press Continue to try again.`);
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {!source.setup_complete && (
        <p className="text-sm text-zinc-400 max-w-prose">
          {source.name} is connected but off. It stays off until you turn it on at the last step.
        </p>
      )}

      <section aria-labelledby="repos-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="repos-heading" className="text-sm font-semibold text-zinc-100">Which repositories may use {source.name}?</h2>
          <p className="mt-1 text-sm text-zinc-400 max-w-prose">Work in other repositories won&apos;t look anything up here.</p>
        </div>
        <div>
          <Segmented
            label="Repositories"
            options={[{ value: "all", label: "All repositories" }, { value: "some", label: "Only some" }]}
            value={repoMode}
            onChange={setRepoMode}
          />
        </div>
        {repoMode === "some" && (
          <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <legend className="sr-only">Repositories that may use this source</legend>
            {repos === null ? (
              <p role="status" className="text-sm text-zinc-500">Loading repositories…</p>
            ) : repoNames.length === 0 ? (
              <p className="text-sm text-zinc-400">
                {reposError
                  ? `We couldn't load your repositories (${reposError}). Choose All repositories for now, or reload the page.`
                  : "No repositories are connected yet. Choose All repositories for now."}
              </p>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-2">
                {repoNames.map((name) => (
                  <li key={name}>
                    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded px-1 text-sm text-zinc-200 hover:bg-zinc-800/50">
                      <input
                        type="checkbox"
                        checked={picked.includes(name)}
                        onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, name] : prev.filter((p) => p !== name)))}
                        className={`h-4 w-4 shrink-0 accent-white ${focusRing}`}
                      />
                      <span className="break-all">{name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {noneChosen && repoNames.length > 0 && (
              <p role="alert" className="mt-3 text-sm text-red-400">
                Pick at least one repository, or choose All repositories.
              </p>
            )}
          </fieldset>
        )}
      </section>

      <section aria-labelledby="hidden-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="hidden-heading" className="text-sm font-semibold text-zinc-100">What Coderhelm can&apos;t see</h2>
          <p className="mt-1 text-sm text-zinc-400 max-w-prose">
            {source.kind === "database"
              ? "Columns with these names are hidden wherever they appear: a lookup that asks for one, or filters or sorts by one, is refused."
              : source.kind === "logs"
                ? "Fields with these names are hidden wherever they appear. Secrets, email addresses and card numbers inside log lines are always hidden too."
                : "Fields with these names are hidden from Coderhelm wherever they appear."}{" "}
            Remove one to show it, or add your own.
          </p>
        </div>
        <HiddenFieldsEditor value={hidden} onChange={setHidden} idPrefix="choose" noun={noun.one as "field" | "column"} />
      </section>

      {error && <Callout variant="error" title="We couldn't save your choices"><p>{error}</p></Callout>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving || noneChosen} className={primaryButton}>
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

// ── Step 4: try ───────────────────────────────────────────────────

const TRY_RANGES = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last day" },
  { value: "7d", label: "Last 7 days" },
] as const;
type TryRange = (typeof TRY_RANGES)[number]["value"];

function TryStep({ source, onContinue }: { source: DataSource; onContinue: () => void }) {
  const kind = source.kind;
  const warehouse = isWarehouse(source);
  const databases = warehouse ? source.aws?.databases ?? [] : [];
  const exactGroups = (source.aws?.log_groups ?? []).filter((g) => !g.endsWith("*"));
  const [samples, setSamples] = useState<DataSourceSample[] | null>(null);
  const [samplesError, setSamplesError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(exactGroups[0] ?? "");
  const [database, setDatabase] = useState(databases[0] ?? "");
  const [range, setRange] = useState<TryRange>("1h");
  const [running, setRunning] = useState(false);
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<DataSourceTryResult | null>(null);
  const [runError, setRunError] = useState("");
  const [succeeded, setSucceeded] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const noun = hiddenNoun(kind);

  useEffect(() => {
    api.getDataSourceSamples(source.id)
      .then((res) => setSamples(res.samples))
      .catch((e) => { setSamples([]); setSamplesError(errorMessage(e, "The request failed.")); });
  }, [source.id]);

  const pickSample = (sample: DataSourceSample) => {
    setQuery(sample.query);
    const g = sample.log_groups?.find((x) => x && exactGroups.includes(x));
    if (g) setGroup(g);
    const r = TRY_RANGES.find((x) => x.value === sample.since);
    if (r) setRange(r.value);
    if (sample.database && databases.includes(sample.database)) setDatabase(sample.database);
  };

  const run = async (q: string) => {
    const text = q.trim();
    if (!text || running) return;
    setRunning(true);
    setRunError("");
    setResult(null);
    setAsked(text);
    try {
      const res = await api.tryDataSource(
        source.id,
        text,
        kind === "logs" ? { log_groups: group ? [group] : [], since: range } : warehouse ? { database } : {},
      );
      setResult(res);
      if (res.ok && !res.refused && !res.error) {
        setSucceeded(true);
        if (!source.setup_complete) {
          writeSetupHint(source.id, { stage: "review" });
        }
      }
    } catch (e) {
      setRunError(`${errorMessage(e, "The request failed.")} Nothing was changed. Press Run to try again.`);
    } finally {
      setRunning(false);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "nearest" }));
    }
  };

  const panel = "rounded-lg border border-zinc-800 bg-zinc-900/50 p-5";
  const panelTitle = "text-xs font-semibold uppercase tracking-wider text-zinc-500";
  const queryLabel = kind === "database" ? "One SQL SELECT" : kind === "logs" ? "A Logs Insights search" : "A GraphQL read query";
  const placeholder =
    kind === "database"
      ? "SELECT id, status FROM orders ORDER BY id DESC LIMIT 5"
      : kind === "logs"
        ? "fields @timestamp, @message | filter @message like /error/ | sort @timestamp desc | limit 20"
        : "{ __typename }";
  const writeQuery = kind === "database" ? WRITE_SQL : kind === "api" ? WRITE_QUERY : "";
  const lookupWord = kind === "logs" ? "search" : "lookup";
  const canRun = !!query.trim() && !running && (kind !== "logs" || !!group) && (!warehouse || !!database);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-zinc-400 max-w-prose">
        This runs a real {lookupWord} on {source.name} with the access you just set up, so you can see exactly what
        Coderhelm sees before you turn it on.
      </p>

      <div>
        <h2 className="text-sm font-semibold text-zinc-100">Pick a {lookupWord}</h2>
        {samples === null ? (
          <p role="status" className="mt-2 text-sm text-zinc-500">Loading examples…</p>
        ) : samples.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">
            {samplesError
              ? `We couldn't load examples (${samplesError}). You can still write your own below.`
              : `There are no examples for this ${warehouse ? "warehouse" : kind === "database" ? "database" : kind === "logs" ? "source" : "API"}. Write your own below.`}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {samples.map((s) => (
              <button
                key={s.label}
                type="button"
                aria-pressed={query === s.query}
                onClick={() => pickSample(s)}
                className={`min-h-8 rounded-full border px-3 py-1 text-left text-sm ${
                  query === s.query
                    ? "border-zinc-100 bg-zinc-100 text-zinc-900 font-medium"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-400"
                } ${focusRing}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {kind === "logs" && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="try-group" className="block mb-1.5 text-sm font-semibold text-zinc-100">Log group</label>
            {exactGroups.length > 0 ? (
              <select
                id="try-group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className={`${inputClass} font-mono text-xs`}
              >
                {exactGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            ) : (
              <p className="text-sm text-amber-200">
                This source only names groups by prefix. Choose exact log groups on the data sources page to try a search here.
              </p>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-zinc-100">Time</p>
            <Segmented label="Time to search" options={[...TRY_RANGES]} value={range} onChange={setRange} />
          </div>
        </div>
      )}

      {warehouse && databases.length > 0 && (
        <div className="max-w-sm">
          <label htmlFor="try-database" className="block mb-1.5 text-sm font-semibold text-zinc-100">Database</label>
          <select
            id="try-database"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            className={`${inputClass} font-mono text-xs`}
          >
            {databases.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}

      <Disclosure summary="Write your own" defaultOpen={kind !== "api" || (samples !== null && samples.length === 0)}>
        <label htmlFor="try-query" className="text-sm font-semibold text-zinc-100">{queryLabel}</label>
        <textarea
          id="try-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={placeholder}
          className={`${inputClass} font-mono text-xs`}
        />
      </Disclosure>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" onClick={() => run(query)} disabled={!canRun} className={primaryButton}>
          {running ? "Running…" : "Run"}
        </button>
        {writeQuery && (
          <button type="button" onClick={() => run(writeQuery)} disabled={running} className={linkButton}>
            Try a write, to see it refused
          </button>
        )}
      </div>

      <div ref={resultRef} className="flex flex-col gap-3">
        {runError && <Callout variant="error" title={`The ${lookupWord} couldn't run`}><p>{runError}</p></Callout>}
        {result && (
          <>
            <section aria-labelledby="asked-heading" className={panel}>
              <h2 id="asked-heading" className={panelTitle}>What was asked</h2>
              <CodeBlock
                code={result.query || asked}
                lang={kind === "database" ? "sql" : kind === "logs" ? undefined : "graphql"}
                title={kind === "logs" ? "Logs Insights" : undefined}
                label="What was asked"
                maxHeightClass="max-h-96"
                className="mt-2"
              />
              {kind === "logs" && result.fields.length > 0 && (
                <p className="mt-2 text-xs text-zinc-500">In {result.fields.join(", ")}</p>
              )}
            </section>
            <section aria-labelledby="back-heading" className={panel}>
              <h2 id="back-heading" className={panelTitle}>What came back</h2>
              {result.refused ? (
                <div className="mt-2">
                  <Callout variant="error" title="Refused">
                    <p>{result.refused}</p>
                  </Callout>
                </div>
              ) : result.error ? (
                <div className="mt-2">
                  <Callout variant="error" title={`${stepLabel(result.error.step, kind)} failed`}>
                    <p>{result.error.message}</p>
                    <p><span className="font-semibold text-zinc-100">What to do: </span>{result.error.fix}</p>
                  </Callout>
                </div>
              ) : !result.ok ? (
                <div className="mt-2">
                  <Callout variant="error" title={`The ${lookupWord} failed`}>
                    <p>No result came back. Try one of the examples, or check what you wrote.</p>
                  </Callout>
                </div>
              ) : (
                <>
                  <CodeBlock code={prettyJson(result.result ?? "")} lang="json" label="What came back" maxHeightClass="max-h-96" className="mt-2" />
                  <p className="mt-2 text-xs text-zinc-500">
                    {result.note && (
                      <span>
                        {result.note}
                        <span aria-hidden="true"> · </span>
                      </span>
                    )}
                    {result.hidden_count > 0 && (
                      <span className="text-amber-300">
                        {result.hidden_count} {kind === "api" ? noun.one : "value"}{result.hidden_count === 1 ? "" : "s"} hidden
                        <span aria-hidden="true"> · </span>
                      </span>
                    )}
                    Took {formatDuration(result.ms)}
                  </p>
                </>
              )}
            </section>
            <p className="text-sm text-zinc-400">Nothing was changed. This {lookupWord} is in your activity log.</p>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onContinue} className={succeeded ? primaryButton : secondaryButton}>
          {succeeded ? "Continue" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}

// ── Step 5: review ────────────────────────────────────────────────

function ReviewStep({ source, onTurnedOn }: { source: DataSource; onTurnedOn: (s: DataSource) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const chooseHref = `${CONNECT}?step=choose&id=${encodeURIComponent(source.id)}`;

  const turnOn = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.updateDataSource(source.id, { enabled: true });
      clearSetupHint(source.id);
      onTurnedOn(res.source);
    } catch (e) {
      setError(`${errorMessage(e, "The request failed.")} Fact-checking is still off. Press the button to try again.`);
      setSaving(false);
    }
  };

  const kind = source.kind;
  const noun = hiddenNoun(kind);
  const where = whereLabel(source);
  const sharedDbs = source.aws?.databases ?? [];
  const cannot: ReactNode[] =
    kind === "database" && isWarehouse(source)
      ? [
          "Change or delete anything. Each lookup is one SELECT, run as a warehouse user with no password that can only read. Coderhelm checks it can't change any table before it connects and again before it reads",
          `Read databases you didn't share${sharedDbs.length ? ` (it may read ${sharedDbs.length === 1 ? "one database" : `${sharedDbs.length} databases`})` : ""}`,
          "Read more than 200 rows at a time",
        ]
      : kind === "database"
      ? [
          "Change or delete anything. Each lookup is one SELECT, run as a database user that can only read, inside a transaction that is always rolled back",
          "Read more than 200 rows at a time",
        ]
      : kind === "logs"
        ? [
            "Change or delete anything",
            `Search log groups you didn't choose${source.aws?.log_groups.length ? ` (it may search ${source.aws.log_groups.length === 1 ? "one group" : `${source.aws.log_groups.length} groups`})` : ""}`,
            "Search more than two weeks at a time",
            "See secrets, email addresses or card numbers in log lines. They are hidden before Coderhelm reads them",
          ]
        : ["Change or delete anything"];

  const rows: { k: string; v: ReactNode; change?: { href: string; label: string } }[] = [
    {
      k: "Connected",
      v: (
        <>
          <span>{source.name}</span>
          {where && <span className="block break-all font-mono text-xs text-zinc-400">{where}</span>}
          {kind === "logs" && source.aws?.log_groups.length ? (
            <span className="block break-all font-mono text-xs text-zinc-400">{source.aws.log_groups.join(", ")}</span>
          ) : null}
        </>
      ),
      change: { href: HUB, label: "Change what is connected" },
    },
    {
      k: "Coderhelm can",
      v: (
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {kind === "logs" ? "Search these logs" : "Look things up"} while it plans, writes code and reviews
            {source.repos.length === 0 ? " in any repository" : ` in ${source.repos.length === 1 ? "one repository" : `${source.repos.length} repositories`}`}
            {source.repos.length > 0 && <span className="block break-all text-xs text-zinc-400">{source.repos.join(", ")}</span>}
          </li>
          <li>Quote what it found, with the {kind === "logs" ? "search" : "lookup"} it ran</li>
        </ul>
      ),
      change: { href: chooseHref, label: "Change what Coderhelm can do" },
    },
    {
      k: "Coderhelm cannot",
      v: (
        <ul className="list-disc space-y-1 pl-5">
          {cannot.map((c, i) => <li key={i}>{c}</li>)}
          <li>
            {source.hidden_fields.length === 0
              ? `No ${noun.many} are hidden`
              : `See ${source.hidden_fields.length === 1 ? `the hidden ${noun.one}` : `the ${source.hidden_fields.length} hidden ${noun.many}`}`}
            {source.hidden_fields.length > 0 && (
              <span className="block font-mono text-xs text-zinc-400">{source.hidden_fields.join(", ")}</span>
            )}
          </li>
          <li>Use a source that is paused or needs attention</li>
        </ul>
      ),
      change: { href: chooseHref, label: "Change what Coderhelm cannot see" },
    },
    {
      k: "We store",
      v:
        kind === "api"
          ? "The address, the key (encrypted, never shown again) and a log of every lookup. Not your data."
          : `The name of the read-only role in your AWS account, ${kind === "logs" ? "which log groups it may search" : isWarehouse(source) ? "which warehouse databases it may read" : "which database it may read"}, and a log of every lookup. No passwords, and not your data.`,
    },
    {
      k: "Turning it off",
      v:
        kind === "api"
          ? "Pause it with one switch on the data sources page, or remove the source. Revoking the key at your API also cuts access immediately."
          : "Pause it with one switch on the data sources page, or remove the source. Deleting the CoderhelmReadOnly role in your AWS account also cuts access immediately.",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <dl className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {rows.map((row) => (
          <div key={row.k} className="grid gap-x-4 gap-y-1 px-5 py-3.5 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
            <dt className="text-sm text-zinc-400">{row.k}</dt>
            <dd className="min-w-0 text-sm text-zinc-100">{row.v}</dd>
            {row.change ? (
              <dd>
                <Link href={row.change.href} aria-label={row.change.label} className={linkButton}>Change</Link>
              </dd>
            ) : (
              <span aria-hidden="true" className="hidden sm:block" />
            )}
          </div>
        ))}
      </dl>

      {source.status === "error" && (
        <Callout variant="warning" title={`${source.name} needs attention`}>
          <p>{source.status_message || "Its last check failed."} You can turn it on, but Coderhelm won&apos;t use it until the problem is fixed. Use Test again on the data sources page to see what to do.</p>
        </Callout>
      )}
      {error && <Callout variant="error" title="We couldn't turn it on"><p>{error}</p></Callout>}

      {source.enabled ? (
        <>
          <Callout variant="success"><p>Fact-checking is already on for {source.name}.</p></Callout>
          <div><Link href={HUB} className={primaryButton}>Back to data sources</Link></div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={turnOn} disabled={saving} className={primaryButton}>
            {saving ? "Turning on…" : "Turn on fact-checking"}
          </button>
        </div>
      )}
    </div>
  );
}
