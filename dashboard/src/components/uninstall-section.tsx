"use client";

import { useEffect, useState } from "react";
import { api, type HybridStatus, type SystemVersion } from "@/lib/api";
import { Callout } from "@/components/callout";
import { dangerButton } from "@/components/ui";

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

/** Settings, then System, Uninstall (install admins: the page itself is admin only). */
export function UninstallSection({ version }: { version: SystemVersion | null }) {
  const [hybrid, setHybrid] = useState<HybridStatus | null>(null);
  useEffect(() => {
    api.getHybrid().then(setHybrid).catch(() => setHybrid(null));
  }, []);
  const links = hybrid?.registered && hybrid.github?.mode === "hosted" ? hybrid.github.links.length : 0;
  const jira = !!(hybrid?.registered && hybrid.jira?.link);
  const install = version?.install ?? null;
  return (
    <div className="space-y-4" data-testid="uninstall-section">
      <p className="text-sm text-text-secondary">
        Remove Coderhelm from this AWS account{install ? <> (<code className="font-mono">coderhelm-{install.stage}</code> in {install.region})</> : null}. It is one CloudFormation stack: deleting it removes Coderhelm. Its <code className="font-mono">KeepDataOnDelete</code> setting decides whether the tables, data bucket, keys, sign-in users and secret stay (they do unless you change it; KMS keys go after AWS&apos;s 7-day minimum). The page walks you through it and ends with a check that nothing is left.
      </p>
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
