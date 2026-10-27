"use client";

import { useEffect, useId, useState } from "react";
import { api, type StagingCms } from "@/lib/api";
import { SecretInput } from "./field";
import { Modal, ModalFooter } from "./modal";
import { inputClass, primaryButton, secondaryButton } from "./ui";

// A repository's staging CMS write connection. When a feature changes the CMS
// schema and the end-to-end tests read pages from the CMS, Coderhelm updates
// the staging content those tests read through this connection, never
// production. Without one, the run stops and lists the content to change.

/** Dataset names Coderhelm refuses: they look like production. */
const PRODUCTION_WORDS = ["production", "prod", "prd", "live", "master", "main"];

export function looksLikeProduction(dataset: string): boolean {
  return dataset
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => PRODUCTION_WORDS.includes(w));
}

export function StagingCmsDialog({
  repo,
  open,
  onOpenChange,
}: {
  repo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [conn, setConn] = useState<StagingCms | null>(null);
  const [projectId, setProjectId] = useState("");
  const [dataset, setDataset] = useState("");
  const [prodDataset, setProdDataset] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = { project: useId(), dataset: useId(), prod: useId(), token: useId() };

  // Each opening reads the saved connection; the token is never sent back.
  useEffect(() => {
    if (!open) return;
    setError("");
    setToken("");
    setConn(null);
    api
      .getStagingCms(repo)
      .then((c) => {
        setConn(c);
        setProjectId(c.project_id ?? "");
        setDataset(c.dataset ?? "");
        setProdDataset(c.production_dataset ?? "");
      })
      .catch(() => setError("Couldn't load the connection. Try again."));
  }, [open, repo]);

  const production = looksLikeProduction(dataset) || (!!prodDataset && prodDataset === dataset);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const c = await api.saveStagingCms(repo, {
        provider: "sanity",
        project_id: projectId.trim(),
        dataset: dataset.trim(),
        production_dataset: prodDataset.trim(),
        token: token.trim() || undefined,
      });
      setConn(c);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api.deleteStagingCms(repo);
      onOpenChange(false);
    } catch {
      setError("Couldn't remove the connection. Try again.");
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !busy && onOpenChange(v)}
      testId="staging-cms-dialog"
      title={`Staging content for ${repo}`}
      description="When a new feature changes the CMS schema and the end-to-end tests read pages from the CMS, Coderhelm updates the staging content those tests read. It never writes to production. Without a connection, the run stops and lists the content to change."
    >
      <form
        id="staging-cms-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!production) void save();
        }}
      >
        <p className="text-sm text-zinc-300">CMS: Sanity</p>
        <div>
          <label htmlFor={ids.project} className="mb-1 block text-sm font-medium text-zinc-200">
            Project id
          </label>
          <input
            id={ids.project}
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label htmlFor={ids.dataset} className="mb-1 block text-sm font-medium text-zinc-200">
            Staging dataset
          </label>
          <input
            id={ids.dataset}
            type="text"
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
            className={inputClass}
            autoComplete="off"
            aria-invalid={production || undefined}
            aria-describedby={`${ids.dataset}-help`}
            required
          />
          <p id={`${ids.dataset}-help`} className={`mt-1 text-xs ${production ? "text-red-400" : "text-zinc-400"}`}>
            {production
              ? "This looks like production. Coderhelm writes only to staging; enter the staging dataset."
              : "The dataset your end-to-end tests read on staging."}
          </p>
        </div>
        <div>
          <label htmlFor={ids.prod} className="mb-1 block text-sm font-medium text-zinc-200">
            Production dataset <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id={ids.prod}
            type="text"
            value={prodDataset}
            onChange={(e) => setProdDataset(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-400">Named so Coderhelm refuses it, whatever it is called.</p>
        </div>
        <div>
          <label htmlFor={ids.token} className="mb-1 block text-sm font-medium text-zinc-200">
            Token with write access to the staging dataset
          </label>
          <SecretInput
            id={ids.token}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={conn?.token_set ? "Saved. Enter a new one to replace it." : ""}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <ModalFooter>
          {conn?.configured && (
            <button type="button" onClick={remove} disabled={busy} className={secondaryButton}>
              Remove connection
            </button>
          )}
          <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" form="staging-cms-form" disabled={busy || production} className={primaryButton}>
            {busy ? "Saving…" : "Save"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
