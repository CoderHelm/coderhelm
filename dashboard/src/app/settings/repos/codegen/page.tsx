"use client";

// A repository's codegen environment: the PUBLIC values its code generators
// need in the sandbox (a CMS project id and dataset, for example). The
// sandbox holds no secrets, so these must be values that already ship to the
// browser; the gateway refuses names and values that look like credentials.

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type CodegenVar } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Page, PageHeader } from "@/components/page";
import { buttonClass, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { useToast } from "@/components/toast";

export default function CodegenEnvPageGuarded() {
  return (
    <RoleGuard need="repos">
      <Suspense fallback={null}>
        <CodegenEnvPage />
      </Suspense>
    </RoleGuard>
  );
}

const empty = (): CodegenVar => ({ name: "", value: "" });

function CodegenEnvPage() {
  const params = useSearchParams();
  const repo = params.get("repo") ?? "";
  // Names a stopped run asked for, pre-filled so the person only adds values.
  const asked = (params.get("need") ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  const { toast } = useToast();
  const [vars, setVars] = useState<CodegenVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!repo) return;
    setLoading(true);
    setLoadError(false);
    api
      .getCodegenEnv(repo)
      .then((r) => {
        const have = r.vars;
        const add = asked.filter((n) => !have.some((v) => v.name === n)).map((name) => ({ name, value: "" }));
        const all = [...have, ...add];
        setVars(all.length ? all : [empty()]);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);
  useEffect(load, [load]);

  const set = (i: number, field: keyof CodegenVar, value: string) =>
    setVars((prev) => prev.map((v, j) => (j === i ? { ...v, [field]: field === "name" ? value.toUpperCase() : value } : v)));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const kept = vars.filter((v) => v.name.trim());
      await api.setCodegenEnv(repo, kept);
      toast("Saved. The next run uses these values.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!repo) {
    return (
      <Page>
        <PageHeader title="Codegen environment" />
        <p className="mt-6 text-sm text-zinc-400">
          Pick a repository on <Link href="/settings/repos" className="underline">Repositories</Link>.
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Codegen environment"
        lead={`Public values ${repo}'s code generators read when Coderhelm regenerates generated files (types from a CMS schema, a GraphQL client) in its sandbox.`}
      />
      <div className="mt-6 max-w-2xl space-y-4">
        <Callout variant="warning" title="Public values only" live={false} testId="codegen-env-warning">
          <p>
            These values are copied into the build sandbox. Only put values that already ship to the browser, such as a
            project id or a dataset name. Never put tokens, passwords or keys here; names and values that look like
            secrets are refused.
          </p>
        </Callout>
        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : loadError ? (
          <Callout variant="error" title="Couldn't load the codegen environment" actions={<button type="button" onClick={load} className={secondaryButton}>Try again</button>}>
            <p>Nothing has changed.</p>
          </Callout>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="space-y-3"
            data-testid="codegen-env-form"
          >
            {vars.map((v, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-300">Name</span>
                  <input
                    className={inputClass}
                    value={v.name}
                    onChange={(e) => set(i, "name", e.target.value)}
                    placeholder="SANITY_STUDIO_PROJECT_ID"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-300">Value</span>
                  <input
                    className={inputClass}
                    value={v.value}
                    onChange={(e) => set(i, "value", e.target.value)}
                    placeholder="public value"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setVars((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [empty()]))}
                  className={buttonClass("secondary", "sm")}
                  aria-label={`Remove ${v.name || "this variable"}`}
                >
                  Remove
                </button>
              </div>
            ))}
            {error && (
              <p role="alert" className="text-sm text-red-300" data-testid="codegen-env-error">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => setVars((prev) => [...prev, empty()])} className={secondaryButton}>
                Add a variable
              </button>
              <button type="submit" disabled={saving} className={primaryButton}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Page>
  );
}
