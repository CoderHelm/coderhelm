"use client";

import type { ReactNode } from "react";
import NotFound from "../not-found";
import { isSelfHosted } from "@/lib/runtime-config";

/**
 * The platform pages (every team, beta sign-ups, the allowlist, the support
 * queue) belong to the hosted service. A self-hosted install has none of
 * them: its admins manage their team in Settings, and its tickets go to
 * Coderhelm support. The gateway answers their APIs with 404 there too.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  if (isSelfHosted()) return <NotFound />;
  return <>{children}</>;
}
