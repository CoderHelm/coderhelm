"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ModelProviderConfig } from "@/lib/api";
import { MODELS, MODEL_ROLES, modelInfo, modelName, type ModelRole, type ModelRoleKey } from "@/lib/models";
import { useToast } from "@/components/toast";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Chip, StatusDot, timeAgo } from "@/components/list";
import { inputClass, linkButton, monoInputClass, secondaryButton } from "@/components/ui";
import { Code, SaveBar, SettingsRow, SettingsSection, useDirtyForm } from "@/components/settings";

export default function ModelProviderPageGuarded() {
  return <RoleGuard need="model_provider"><ModelProviderPage /></RoleGuard>;
}

type Models = Record<ModelRoleKey, string>;
/** The form: the two models, and a key typed into the box ("" when none). */
type Form = Models & { api_key: string };

const RECOMMENDED: Models = Object.fromEntries(MODEL_ROLES.map((r) => [r.key, r.recommended])) as Models;

/** What the gateway has saved, with the recommended model where nothing is chosen yet. */
function savedModels(c: ModelProviderConfig): Models {
  return { primary_model: c.primary_model || RECOMMENDED.primary_model, heavy_model: c.heavy_model || RECOMMENDED.heavy_model };
}

/** A typed key counts once it has more than spaces; models compare as they are. */
const sameField = (a: unknown, b: unknown, key: keyof Form) =>
  key === "api_key" ? String(a ?? "").trim() === String(b ?? "").trim() : a === b;

/** "sk-ant-...igAA" → "igAA". The gateway masks short keys as "****". */
function keyEnding(masked: string | null): string | null {
  if (!masked || !/[A-Za-z0-9_-]{4}$/.test(masked) || masked.startsWith("*")) return null;
  return masked.slice(-4);
}

type TestState =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok" }
  | { state: "fail"; message: string };

// ── The page ────────────────────────────────────────────────────────

function ModelProviderPage() {
  const { toast } = useToast();
  const [load, setLoad] = useState<"loading" | "error" | "ready">("loading");
  const [config, setConfig] = useState<ModelProviderConfig | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [test, setTest] = useState<TestState>({ state: "idle" });
  // The gateway checks the key with Anthropic on every save, so a save that
  // went through is also a passed test. It does not report when that last
  // happened, so this only knows about saves made on this visit.
  const [testedAt, setTestedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Nothing is unsaved until the saved settings are on screen.
  const form = useDirtyForm<Form>({ ...RECOMMENDED, api_key: "" }, { same: sameField, disabled: load !== "ready" });
  const models: Models = { primary_model: form.values.primary_model, heavy_model: form.values.heavy_model };
  const apiKey = form.values.api_key;
  const { reset } = form;

  const fetchConfig = useCallback(async () => {
    setLoad("loading");
    try {
      const data = await api.getModelProvider();
      setConfig(data);
      reset({ ...savedModels(data), api_key: "" });
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, [reset]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Keep "2 min ago" moving.
  useEffect(() => {
    if (!testedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [testedAt]);

  const hasKey = !!config?.api_key_masked;
  const ending = keyEnding(config?.api_key_masked ?? null);
  const showKeyInput = !hasKey || replacing;
  const typedKey = apiKey.trim();
  const unsavedCount = form.count;
  const dirty = form.dirty;

  /**
   * The one write: PUT the chosen models, plus the typed key when there is
   * one, then re-read. The gateway checks the key with Anthropic before it
   * stores anything. A key Anthropic refuses comes back as 200 with an
   * `error` field, so that is a failure too.
   */
  const put = async (): Promise<string | null> => {
    const body: { api_key?: string; primary_model: string; heavy_model: string } = {
      primary_model: models.primary_model,
      heavy_model: models.heavy_model,
    };
    if (typedKey) body.api_key = typedKey;
    try {
      const res = (await api.updateModelProvider(body)) as { error?: string } | undefined;
      if (res && typeof res.error === "string" && res.error) {
        return res.error === "Invalid API key" ? "Anthropic did not accept this key. Check it and try again." : res.error;
      }
    } catch (e) {
      if (e instanceof Error && "status" in e && (e as { status: number }).status === 503) {
        return "Anthropic did not answer, so the key could not be checked. Try again in a moment.";
      }
      return e instanceof Error ? e.message : "Could not reach the server. Try again.";
    }
    try {
      const updated = await api.getModelProvider();
      setConfig(updated);
      form.reset({ ...savedModels(updated), api_key: "" });
    } catch {
      // Saved, but the re-read failed: what was sent is what is saved.
      setConfig((c) => (c ? { ...c, ...models, api_key_masked: typedKey ? `sk-ant-...${typedKey.slice(-4)}` : c.api_key_masked } : c));
      form.reset({ ...models, api_key: "" });
    }
    setReplacing(false);
    setTestedAt(new Date().toISOString());
    return null;
  };

  const runTest = async () => {
    if (!typedKey && !hasKey) {
      setTest({ state: "fail", message: "Paste a key first." });
      return;
    }
    setTest({ state: "testing" });
    setProblem(null);
    const err = await put();
    setTest(err ? { state: "fail", message: err } : { state: "ok" });
  };

  const save = async () => {
    if (!typedKey && !hasKey) {
      setProblem("Add your Anthropic API key first. Nothing is saved without one.");
      return;
    }
    setSaving(true);
    setProblem(null);
    const err = await put();
    setSaving(false);
    if (err) {
      setProblem(err);
      toast(err, "error");
      return;
    }
    setTest({ state: "idle" });
    toast("AI model settings saved");
  };

  const discard = () => {
    form.discard();
    setReplacing(false);
    setProblem(null);
    setTest({ state: "idle" });
  };

  const header = (
    <div className="mb-6">
      <PageHeader title="AI models" lead="Your Anthropic API key, and which Claude model does each part of a run." />
    </div>
  );

  if (load === "loading") {
    return (
      <Page>
        {header}
        <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Page>
    );
  }

  if (load === "error") {
    return (
      <Page>
        {header}
        <Callout variant="error" title="Could not load your AI model settings">
          <p>Nothing is shown, so the saved settings cannot be overwritten by mistake.</p>
          <button type="button" onClick={fetchConfig} className={`mt-2 ${secondaryButton}`}>Try again</button>
        </Callout>
      </Page>
    );
  }

  const testing = test.state === "testing";

  return (
    <Page>
      {header}

      <div className="space-y-8">
        <SettingsSection id="api-key" title="Anthropic API key">
          <SettingsRow
            label="API key"
            testId="key-row"
            controlClassName="sm:w-80"
            help="Every run calls Anthropic with this key. It is encrypted at rest with AWS KMS, and only your team can use it."
            control={(ids) => (
              <div className="min-w-0 space-y-3">
                {/* Status: what is saved now. */}
                <p data-testid="key-status" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                  {hasKey ? (
                    <>
                      <StatusDot tone="success" />
                      <span className="text-zinc-200">Key saved</span>
                      {ending && <span className="whitespace-nowrap text-zinc-400">· ends <Code>{ending}</Code></span>}
                      {testedAt && <span className="whitespace-nowrap text-zinc-400">· last tested <span aria-hidden="true" className="text-emerald-400">✓</span><span className="sr-only">passed</span> {timeAgo(testedAt)}</span>}
                    </>
                  ) : (
                    <>
                      <StatusDot tone="waiting" />
                      <span className="text-amber-300">No key saved</span>
                      <span className="text-zinc-400">· add one to start runs</span>
                    </>
                  )}
                </p>

                {showKeyInput && (
                  <div>
                    <input
                      id={ids.inputId}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={apiKey}
                      onChange={(e) => {
                        form.set("api_key", e.target.value);
                        if (test.state !== "testing") setTest({ state: "idle" });
                      }}
                      placeholder="sk-ant-api03-…"
                      aria-describedby={ids.helpId}
                      className={monoInputClass}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={runTest}
                    disabled={testing || saving || (!hasKey && !typedKey)}
                    className={secondaryButton}
                  >
                    {testing ? "Testing…" : "Test key"}
                  </button>
                  {hasKey && !replacing && (
                    <button type="button" onClick={() => { setReplacing(true); setTest({ state: "idle" }); }} className={linkButton}>
                      Replace key
                    </button>
                  )}
                  {hasKey && replacing && (
                    <button type="button" onClick={() => { setReplacing(false); form.set("api_key", ""); setTest({ state: "idle" }); }} className={linkButton}>
                      Keep the saved key
                    </button>
                  )}
                </div>

                <div aria-live="polite" data-testid="key-test-result">
                  {test.state === "ok" && (
                    <p className="text-sm text-emerald-300">
                      <span aria-hidden="true">✓ </span>The key works. It is saved, with the models below.
                    </p>
                  )}
                  {test.state === "fail" && <p className="text-sm text-red-300">{test.message}</p>}
                </div>
              </div>
            )}
          />
        </SettingsSection>

        <SettingsSection id="models" title="Models" description="Changes apply from the next run. Runs already going keep the models they started with.">
          {MODEL_ROLES.map((role) => (
            <ModelRow
              key={role.key}
              role={role}
              value={models[role.key]}
              unsaved={form.isDirty(role.key)}
              onChange={(v) => form.set(role.key, v)}
            />
          ))}
        </SettingsSection>
      </div>

      <SaveBar count={unsavedCount} problem={problem} onSave={save} onDiscard={discard} saving={saving} busy={testing} idleText="Nothing to save" />
    </Page>
  );
}

function ModelRow({ role, value, unsaved, onChange }: { role: ModelRole; value: string; unsaved: boolean; onChange: (v: string) => void }) {
  const info = modelInfo(value);
  const current = MODELS.filter((m) => !m.legacy);
  const older = MODELS.filter((m) => m.legacy);
  return (
    <SettingsRow
      label={role.label}
      testId={`model-row-${role.key}`}
      help={role.does}
      controlClassName="sm:w-80"
      unsaved={unsaved}
      control={(ids) => (
        <div className="min-w-0">
          <select
            id={ids.inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={[ids.helpId, `${ids.inputId}-about`].filter(Boolean).join(" ")}
            className={inputClass}
          >
            {!info && <option value={value}>{value} (no longer listed)</option>}
            {current.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
            {older.length > 0 && (
              <optgroup label="Older models">
                {older.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <p id={`${ids.inputId}-about`} className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            {value === role.recommended && <Chip tone="success">Recommended</Chip>}
            <span>{info ? info.blurb : "Not on the current list. Pick another model to move off it."}</span>
            {value !== role.recommended && (
              <button type="button" onClick={() => onChange(role.recommended)} className={`${linkButton} !text-xs !text-zinc-400 hover:!text-zinc-200`}>
                Use recommended ({modelName(role.recommended)})
              </button>
            )}
          </p>
        </div>
      )}
    />
  );
}
