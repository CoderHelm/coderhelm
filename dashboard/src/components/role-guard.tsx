"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { hasRole, whoCan, type Role } from "@/lib/roles";
import { Callout } from "./callout";
import { linkButton } from "./ui";
import { Page } from "./page";

type MinRole = Exclude<Role, "viewer">;

type Access = "checking" | "allowed" | "denied" | "error";

/**
 * Renders its children only for `minRole` or higher. Anyone else sees why the
 * page is closed to them and who can open it, instead of being sent away
 * without a word.
 */
export function RoleGuard({ minRole, children }: { minRole: MinRole; children: ReactNode }) {
  const [access, setAccess] = useState<Access>("checking");
  const inSettings = (usePathname() ?? "").startsWith("/settings");

  useEffect(() => {
    let live = true;
    api
      .me()
      .then((u) => live && setAccess(hasRole(u.role, minRole) ? "allowed" : "denied"))
      .catch(() => live && setAccess("error"));
    return () => {
      live = false;
    };
  }, [minRole]);

  if (access === "checking") return null;
  if (access === "allowed") return <>{children}</>;

  return (
    <Page>
      <div className="max-w-xl">
      <Callout
        variant={access === "error" ? "error" : "info"}
        title={access === "error" ? "Could not check your access" : "This page needs a different role"}
      >
        <p>
          {access === "error"
            ? "Reload the page to try again."
            : `Only ${whoCan(minRole)} can open this page. Ask them if you need a change here.`}
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
