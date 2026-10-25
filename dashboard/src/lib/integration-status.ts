// One status per integration, everywhere. The Integrations overview, the
// GitHub page and the Jira page all read the same card from
// GET /api/integrations, so a connection can never show "Connected" on one
// page and "Not installed" on another.

import type { Integration, IntegrationStatus } from "./api";

/** The words and tone each status shows as, on every page. */
export const INTEGRATION_STATUS: Record<IntegrationStatus, { label: string; tone: "success" | "warning" | "error" | "neutral" }> = {
  connected: { label: "Connected", tone: "success" },
  needs_credentials: { label: "Needs credentials", tone: "warning" },
  needs_reconnect: { label: "Needs reconnecting", tone: "warning" },
  error: { label: "Not working", tone: "error" },
  not_connected: { label: "Not connected", tone: "neutral" },
};

/** The overview card for one integration id (`github`, `jira`), if the server listed it. */
export function findCard(items: Integration[] | undefined, id: string): Integration | undefined {
  return items?.find((i) => i.id === id);
}
