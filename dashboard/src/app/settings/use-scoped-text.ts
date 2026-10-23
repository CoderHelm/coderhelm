"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { useDirtyForm } from "@/components/settings";
import type { Scope } from "./scope-bar";

/**
 * One markdown text per scope (every repository, or one repository), edited
 * with a save bar: the voice and instructions pages. Switching scope with
 * unsaved text asks first.
 */
export function useScopedText({
  loadGlobal,
  loadRepo,
}: {
  loadGlobal: () => Promise<string>;
  loadRepo: (repo: string) => Promise<string>;
}) {
  const { confirm } = useConfirm();
  const [scope, setScopeRaw] = useState<Scope>("global");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepoRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const form = useDirtyForm({ content: "" }, { disabled: loading || failed });
  const { reset } = form;

  useEffect(() => {
    api.listRepos().then((data) => {
      const enabled = data.repos.filter((r) => r.enabled);
      setRepos(enabled);
      if (enabled.length > 0) setRepoRaw(enabled[0].name);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (scope === "repo" && !repo) {
      reset({ content: "" });
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const content = scope === "global" ? await loadGlobal() : await loadRepo(repo);
      reset({ content });
    } catch {
      setFailed(true);
      reset({ content: "" });
    } finally {
      setLoading(false);
    }
    // The loaders are plain functions from the page; the scope and repo pick what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, repo, reset]);

  useEffect(() => {
    load();
  }, [load]);

  /** Asks before throwing away unsaved text. */
  const leave = async () =>
    !form.dirty ||
    !!(await confirm({ title: "Discard unsaved changes?", message: "What you typed here has not been saved.", confirmLabel: "Discard", destructive: true }));

  const setScope = async (s: Scope) => {
    if (s !== scope && (await leave())) setScopeRaw(s);
  };
  const setRepo = async (r: string) => {
    if (r !== repo && (await leave())) setRepoRaw(r);
  };

  return { scope, setScope, repos, repo, setRepo, loading, failed, reload: load, form };
}
