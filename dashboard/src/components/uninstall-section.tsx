"use client";

import { useEffect, useState } from "react";
import { api, type HybridStatus, type SystemVersion, type UninstallMode } from "@/lib/api";
import { Callout } from "@/components/callout";
import { dangerButton, inputClass, secondaryButton, smallDangerButton } from "@/components/ui";

/** The uninstall page on the docs site (docs.coderhelm.com/self-host/uninstall/). */
export const UNINSTALL_GUIDE = "https://docs.coderhelm.com/self-host/uninstall/";

/** The page's link with this install filled in: its name and region. Never a choice to delete. */
export function uninstallLink(install: SystemVersion["install"], hybrid: HybridStatus | null): string {
  const q = new URLSearchParams();
  if (install?.stage) q.set("stage", install.stage);
  if (install?.region) q.set("region", install.region);
  void hybrid;
  const s = q.toString();
  return s ? `${UNINSTALL_GUIDE}?${s}` : UNINSTALL_GUIDE;
}

/**
 * Keep the data, or delete everything when the stack is deleted. Nothing is
 * deleted here: the stack's own delete reads the choice. Turning on needs
 * the install's name typed back.
 */
function DataChoice({ stage, initial }: { stage: string; initial: UninstallMode }) {
  const [mode, setMode] = useState<UninstallMode>(initial);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (on: boolean) => {
    setBusy(true);
    setError("");
    try {
      const r = await api.setUninstallMode(on, on ? typed.trim() : "");
      setMode(r.uninstall);
      setAsking(false);
      setTyped("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not saved");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border border-border p-4" data-testid="uninstall-data">
      <p className="text-sm font-medium">When Coderhelm is uninstalled</p>
      {mode.delete_data ? (
        <Callout variant="warning" title="Delete everything" testId="uninstall-data-on">
          Deleting the stack also deletes the tables, data bucket, sign-in users and secret, and schedules the KMS keys for deletion (AWS&apos;s 7-day minimum).
          {mode.changed_by ? ` Turned on by ${mode.changed_by}.` : ""} Nothing is deleted until the stack is.
        </Callout>
      ) : (
        <p className="text-sm text-text-secondary" data-testid="uninstall-data-off">
          Keep my data: deleting the stack removes Coderhelm, and the tables, data bucket, keys, sign-in users and secret stay.
        </p>
      )}
      {mode.delete_data ? (
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => save(false)} data-testid="uninstall-data-keep">
          Keep my data instead
        </button>
      ) : asking ? (
        <div className="space-y-2">
          <label className="block text-sm" htmlFor="uninstall-confirm">
            Type <code className="font-mono">{stage}</code> to delete everything when the stack is deleted
          </label>
          <input id="uninstall-confirm" className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="uninstall-confirm" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallDangerButton} disabled={busy || typed.trim() !== stage} onClick={() => save(true)} data-testid="uninstall-data-delete">
              Delete everything on uninstall
            </button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => { setAsking(false); setTyped(""); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={secondaryButton} onClick={() => setAsking(true)} data-testid="uninstall-data-ask">
          Delete everything on uninstall
        </button>
      )}
      {error ? <p className="text-sm text-red-400" role="alert">{error}</p> : null}
    </div>
  );
}

/** Settings, then System, Uninstall (install admins: the page itself is admin only). */
export function UninstallSection({ version }: { version: SystemVersion | null }) {
  const [hybrid, setHybrid] = useState<HybridStatus | null>(null);
  useEffect(() => {
    api.getHybrid().then(setHybrid).catch(() => setHybrid(null));
  }, []);
  const links = hybrid?.registered && hybrid.github?.mode === "hosted" ? hybrid.github.links.length : 0;
  const jira = !!(hybrid?.registered && hybrid.jira?.link);
  const install = version?.install ?? null;
  const choice = version?.uninstall ?? null;
  return (
    <div className="space-y-4" data-testid="uninstall-section">
      <p className="text-sm text-text-secondary">
        Remove Coderhelm from this AWS account{install ? <> (<code className="font-mono">coderhelm-{install.stage}</code> in {install.region})</> : null}. It is one CloudFormation stack: deleting it removes Coderhelm.{" "}
        {choice
          ? "Choose below whether its data goes with it."
          : <>Its <code className="font-mono">KeepDataOnDelete</code> setting decides whether the tables, data bucket, keys, sign-in users and secret stay (they do unless you change it; KMS keys go after AWS&apos;s 7-day minimum).</>}{" "}
        The page walks you through it and ends with a check that nothing is left.
      </p>
      {choice && install ? <DataChoice stage={install.stage} initial={choice} /> : null}
      {hybrid?.registered ? (
        <Callout variant="warning" title={links || jira ? "Coderhelm forwards GitHub or Jira events here" : "This install is hybrid"} testId="uninstall-hybrid">
          {links || jira
            ? `Coderhelm hosted forwards ${[links ? `${links} GitHub installation${links === 1 ? "" : "s"}` : "", jira ? "a Jira site" : ""].filter(Boolean).join(" and ")} to this install. Uninstalling hands them back to Coderhelm hosted: their events go there again, as before the move.`
            : "Uninstalling releases this install's coderhelm.com address and its links first."}
        </Callout>
      ) : null}
      <a className={dangerButton} href={uninstallLink(install, hybrid)} target="_blank" rel="noopener noreferrer" data-testid="uninstall-link">
        Uninstall Coderhelm
      </a>
    </div>
  );
}
