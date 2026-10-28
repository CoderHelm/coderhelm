"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type ModelAccess, type ModelCheck, type ModelProviderId, type ModelsChoice, type SystemModels } from "@/lib/api";
import { FixBlock } from "@/components/install-checks";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Chip, Time } from "@/components/list";
import { Select } from "@/components/select";
import { useToast } from "@/components/toast";
import { Code, Field, SettingsDisclosure } from "@/components/settings";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";

const PROVIDERS: { id: ModelProviderId; title: string; help: string }[] = [
  { id: "bedrock", title: "Claude on Amazon Bedrock", help: "Runs in this AWS account with its own role. No API key; usage is on the AWS bill." },
  { id: "anthropic", title: "Anthropic API keys", help: "Each team uses its own key from Settings, AI models; usage is on each team's Anthropic bill." },
];

const PREFIX_LABEL: Record<string, string> = {
  "us.": "us. (United States)",
  "eu.": "eu. (Europe)",
  "apac.": "apac. (Asia Pacific)",
  "global.": "global. (any region)",
  "": "None (in-region model ids)",
};

function providerName(p: ModelProviderId | string | null | undefined): string {
  return p === "bedrock" ? "Claude on Amazon Bedrock" : "Anthropic API keys";
}

/** The Bedrock id a model is called by, before any override. */
function defaultId(prefix: string, model: string, current: SystemModels): string {
  const shown = current.bedrock_ids[model];
  // The server's id carries the saved prefix; swap in the one picked here.
  if (shown && shown.startsWith(current.inference_prefix) && !current.model_ids[model]) {
    return `${prefix}${shown.slice(current.inference_prefix.length)}`;
  }
  return `${prefix}anthropic.${model}`;
}

/** One model's test call: passed, or what is wrong and how to fix it. */
export function ModelResult({ r }: { r: ModelAccess }) {
  return (
    <li className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3" data-testid={`model-result-${r.model}`} data-status={r.status}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-100">
        <Code>{r.model}</Code>
        {r.status === "pass" ? <Chip tone="success">Answers</Chip> : r.status === "skip" ? <Chip tone="neutral">Not checked</Chip> : <Chip tone="danger">Refused</Chip>}
      </p>
      <p className="mt-1 break-words text-sm text-zinc-300">{r.detail}</p>
      {r.status !== "pass" && (r.fix || r.url || r.href) && <FixBlock fix={{ text: r.fix ?? "", url: r.url, href: r.href }} />}
    </li>
  );
}

/**
 * Settings, System, Models: switch between Claude on Amazon Bedrock and
 * Anthropic API keys at any time. Every model the release calls gets a
 * test call first; a refused one stops the switch with its fix.
 */
export function ModelsSection() {
  const { toast } = useToast();
  const [current, setCurrent] = useState<SystemModels | null>(null);
  const [failed, setFailed] = useState(false);
  const [provider, setProvider] = useState<ModelProviderId>("anthropic");
  const [prefix, setPrefix] = useState("us.");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "check" | "save">("");
  const [results, setResults] = useState<{ ok: boolean; items: ModelAccess[]; error?: string } | null>(null);

  const reset = (m: SystemModels) => {
    setCurrent(m);
    setProvider(m.provider);
    setPrefix(m.inference_prefix);
    setOverrides(m.model_ids ?? {});
  };
  const load = useCallback(() => {
    api
      .getSystemModels()
      .then((m) => {
        if (!m?.provider || !Array.isArray(m.models) || !Array.isArray(m.prefixes)) throw new Error("not a models answer");
        reset(m);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (failed) {
    return (
      <div className="px-4 py-4">
        <Callout variant="error" title="Couldn't load how this install calls Claude">
          <button type="button" className={`mt-2 ${secondaryButton}`} onClick={load}>Try again</button>
        </Callout>
      </div>
    );
  }
  if (!current) return <div className="px-4 py-4"><Skeleton className="h-32 w-full" /></div>;

  const cleanOverrides = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v.trim()));
  const choice: ModelsChoice = provider === "bedrock" ? { provider, inference_prefix: prefix, model_ids: cleanOverrides } : { provider };
  const dirty =
    provider !== current.provider ||
    (provider === "bedrock" && (prefix !== current.inference_prefix || JSON.stringify(cleanOverrides) !== JSON.stringify(current.model_ids ?? {})));

  const check = async () => {
    setBusy("check");
    try {
      const r = await api.checkSystemModels(choice);
      setResults({ ok: r.ok, items: r.results });
    } catch (e) {
      setResults({ ok: false, items: [], error: e instanceof Error ? e.message : "The check couldn't run" });
    } finally {
      setBusy("");
    }
  };
  const save = async () => {
    setBusy("save");
    try {
      const r = await api.setSystemModels(choice);
      if (r.ok) {
        reset(r);
        setResults({ ok: true, items: r.results ?? [] });
        toast(`Now calling Claude through ${providerName(r.provider)}. Runs under way finish where they started.`);
      } else {
        setResults({ ok: false, items: r.results ?? [], error: r.error });
      }
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-w-0 space-y-4 px-4 py-4" data-testid="models-section">
      <p className="text-sm text-zinc-300" data-testid="models-current">
        Now: <span className="font-medium text-zinc-100">{providerName(current.provider)}</span>
        {current.provider === "bedrock" && <> with <Code>{current.inference_prefix || "in-region"}</Code> ids</>}.{" "}
        <span className="text-zinc-400">
          {current.source === "settings" && current.updated_at ? (
            <>Changed here{current.updated_by ? ` by ${current.updated_by}` : ""} <Time iso={current.updated_at} />.</>
          ) : (
            "From the install config, used until someone changes it here."
          )}
        </span>
      </p>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-zinc-100">How this install calls Claude</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.id}
              className={`flex min-w-0 cursor-pointer gap-3 rounded-lg border p-3 ${provider === p.id ? "border-sky-500/70 bg-sky-500/5" : "border-zinc-800 hover:bg-zinc-900"}`}
            >
              <input
                type="radio"
                name="model-provider"
                value={p.id}
                className={`mt-1 ${focusRing}`}
                checked={provider === p.id}
                onChange={() => {
                  setProvider(p.id);
                  setResults(null);
                }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-100">{p.title}</span>
                <span className="block text-sm text-zinc-400">{p.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {provider === "bedrock" ? (
        <div className="min-w-0 space-y-3">
          <Field as="custom" label="Inference profile prefix" help={`Pick the one for this install's region (${current.region}).`}>
            {(ids) => (
              <Select
                id={ids.id}
                aria-describedby={ids["aria-describedby"]}
                value={prefix}
                onChange={(v) => { setPrefix(v); setResults(null); }}
                className="sm:w-72"
                options={current.prefixes.map((p) => ({ value: p, label: PREFIX_LABEL[p] ?? p }))}
              />
            )}
          </Field>
          <SettingsDisclosure summary="Advanced: exact Bedrock ids" defaultOpen={Object.keys(current.model_ids ?? {}).length > 0}>
            <p className="text-sm text-zinc-400">Leave empty to use the id shown. Set one to call an application inference profile ARN or another id.</p>
            {current.models.map((m) => (
              <Field
                key={m}
                as="input"
                mono
                label={<>Bedrock id for <Code>{m}</Code></>}
                placeholder={defaultId(prefix, m, current)}
                value={overrides[m] ?? ""}
                onChange={(e) => { setOverrides({ ...overrides, [m]: e.target.value }); setResults(null); }}
                autoComplete="off"
                spellCheck={false}
              />
            ))}
          </SettingsDisclosure>
          <p className="text-sm text-zinc-400">
            Someone in your company turns on model access, submits the use case form and accepts Anthropic&apos;s terms in the AWS console. Coderhelm never does that for you; it checks the result.{" "}
            <a className={linkButton} href={`https://console.aws.amazon.com/bedrock/home?region=${current.region}#/modelaccess`} target="_blank" rel="noopener noreferrer">Open Model access</a>
          </p>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">
          Each team keeps its own key in <Link href="/settings/models" className={linkButton}>Settings, AI models</Link>. The switch is checked with your team&apos;s key, so add yours first.
        </p>
      )}

      <p className="text-sm text-zinc-400">
        Before anything changes, each model this release calls ({current.models.map((m, i) => <span key={m}>{i > 0 && ", "}<Code>{m}</Code></span>)}) answers one test call. Runs under way finish where they started; new model calls use the new choice within 30 seconds.
      </p>

      {results && (
        <div className="min-w-0 space-y-2" data-testid="models-results" aria-live="polite">
          {results.ok ? (
            <Callout variant="success" title="Every model answered" />
          ) : (
            <Callout variant="error" title={results.error ?? "Not switched: a model was refused"}>
              <p>Fix it in the console, then check again. Nothing has changed.</p>
            </Callout>
          )}
          {results.items.length > 0 && (
            <ul className="space-y-2" aria-label="Test calls">
              {results.items.map((r) => <ModelResult key={r.model} r={r} />)}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" className={primaryButton} disabled={!dirty || !!busy} onClick={save}>
          {busy === "save" ? "Checking and switching..." : provider === current.provider ? "Check and save" : `Check and switch to ${providerName(provider)}`}
        </button>
        <button type="button" className={secondaryButton} disabled={!!busy} onClick={check}>
          {busy === "check" ? "Checking..." : results && !results.ok ? "Check again" : "Check access"}
        </button>
      </div>
    </div>
  );
}

/**
 * "Update to vX needs your action": a model the next release calls was
 * refused. Shown on Settings, System and Setup with each model's fix.
 */
export function UpdateNeedsAction({ check, onChecked, onSkip }: { check: ModelCheck | null | undefined; onChecked?: (c: ModelCheck | null) => void; onSkip?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [mc, setMc] = useState(check ?? null);
  useEffect(() => setMc(check ?? null), [check]);
  if (!mc || mc.ok) return null;
  if (mc.pending) {
    return (
      <Callout
        variant="neutral"
        testId="update-checking"
        title={`Checking ${mc.version} before it can be applied`}
        actions={<button type="button" className={secondaryButton} onClick={() => api.checkUpdateModels().then((r) => { setMc(r.model_check); onChecked?.(r.model_check); }).catch(() => {})}>Check again</button>}
      >
        <p>Coderhelm checks the release&apos;s signature, then tries each model it calls. This takes a few minutes.</p>
      </Callout>
    );
  }
  const failing = mc.results.filter((r) => r.status === "fail");
  const again = async () => {
    setBusy(true);
    try {
      const r = await api.checkUpdateModels();
      setMc(r.model_check);
      onChecked?.(r.model_check);
    } catch {
      // Keep what was shown; the next daily check runs anyway.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Callout
      variant="error"
      testId="update-needs-action"
      title={`Update to ${mc.version} needs your action`}
      actions={
        <>
          <button type="button" className={secondaryButton} onClick={again} disabled={busy}>{busy ? "Checking..." : "Check again"}</button>
          {mc.skippable && onSkip && <button type="button" className={secondaryButton} onClick={onSkip}>Skip this check</button>}
        </>
      }
    >
      <p>
        {mc.version} calls {failing.length === 1 ? "a model" : "models"} this install can&apos;t call yet{mc.provider ? ` through ${providerName(mc.provider)}` : ""}, so it won&apos;t be applied until {failing.length === 1 ? "it answers" : "they answer"}. The check runs again daily; with automatic updates on, the update applies by itself once it passes.
      </p>
      <ul className="mt-2 space-y-2">
        {failing.map((r) => <ModelResult key={r.model} r={r} />)}
      </ul>
      <p className="text-zinc-400">Accepting model terms and the Bedrock use case form are done by a person in the AWS console; Coderhelm only checks.</p>
      <p className="text-xs text-zinc-400">Checked <Time iso={mc.checked_at} />.</p>
    </Callout>
  );
}
