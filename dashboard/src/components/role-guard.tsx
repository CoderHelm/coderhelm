"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCan } from "@/hooks/use-can";
import { builtInRoleFor } from "@/lib/capabilities";
import { whoCan } from "@/lib/roles";
import { Callout } from "./callout";
import { linkButton } from "./ui";
import { Page } from "./page";

/**
 * Renders its children only for someone whose role includes `need` (a
 * capability key, or `ANY_CHANGE`). Anyone else sees why the page is closed
 * to them and who can open it, instead of being sent away without a word.
 */
export function RoleGuard({ need, children }: { need: string; children: ReactNode }) {
  const { ready, failed, can } = useCan();
  const inSettings = (usePathname() ?? "").startsWith("/settings");

  if (!ready) return null;
  if (!failed && can(need)) return <>{children}</>;

  return (
    <Page>
      <div className="max-w-xl">
      <Callout
        variant={failed ? "error" : "info"}
        title={failed ? "Could not check your access" : "This page needs a different role"}
      >
        <p>
          {failed
            ? "Reload the page to try again."
            : `Only ${whoCan(builtInRoleFor(need))} can open this page. A custom role that includes it can too. Ask them if you need a change here.`}
        </p>
        <p className="pt-1">
          <Link href={inSettings ? "/settings" : "/"} className={linkButton}>
            {inSettings ? "Back to Settings" : "Back to Runs"}
          </Link>
        </p>
      </Callout>
      </div>
    </Page>
  );
}
