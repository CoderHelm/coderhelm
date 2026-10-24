"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadSetupChecks, setupProgress, useInstallAdmin } from "@/lib/install";
import { linkButton } from "./ui";

const DISMISS_KEY = "coderhelm.setup.banner_dismissed";

/**
 * On a new self-hosted install, the first admin sees how far setup has come
 * on every page, with a link to the checklist, until the required steps are
 * done (or they hide it). Nothing is fetched on the hosted dashboard.
 */
export function SetupBanner() {
  const { ready, allowed } = useInstallAdmin();
  const path = usePathname() ?? "";
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!ready || !allowed) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {}
    setHidden(false);
    loadSetupChecks().then((c) => setProgress(setupProgress(c))).catch(() => {});
  }, [ready, allowed]);

  if (hidden || !progress || progress.done >= progress.total || path.startsWith("/settings/setup")) return null;
  return (
    <div role="status" data-testid="setup-banner" className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-900 bg-blue-950/40 px-4 py-3 text-sm text-blue-100">
      <p className="min-w-0">Finish setting up Coderhelm: {progress.done} of {progress.total} steps done.</p>
      <div className="flex items-center gap-4">
        <Link href="/settings/setup" className={linkButton}>Open the checklist</Link>
        <button
          type="button"
          className="text-xs text-blue-300 hover:text-blue-100"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
    </div>
  );
}
