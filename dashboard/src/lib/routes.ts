// Every page's name and where it sits, in one place. The top bar builds its
// breadcrumb trail from this map, the back arrow on a phone goes to `parent`,
// and the browser tab is named after `label` (or `tab`). A page that is not
// listed here fails `npm run lint`, so a new page cannot ship without a name.

export interface RouteInfo {
  /** The page's name in the trail. */
  label: string;
  /** The page one level up; omitted for a top-level page. */
  parent?: string;
  /**
   * One item's page (a run, a review, a plan). The page supplies the item's
   * name for the last crumb and shows it as its title; `label` is only shown
   * while the item loads.
   */
  detail?: boolean;
  /** A longer name for the browser tab when `label` alone is ambiguous. */
  tab?: string;
}

export const ROUTES: Record<string, RouteInfo> = {
  "/": { label: "Runs" },
  "/runs/detail": { label: "Run", parent: "/", detail: true },

  "/reviewer": { label: "Reviewer" },
  "/reviewer/detail": { label: "Review", parent: "/reviewer", detail: true },
  "/reviewer/pr": { label: "Pull request", parent: "/reviewer", detail: true },
  "/reviewer/config": { label: "Settings", parent: "/reviewer", tab: "Reviewer settings" },

  "/tests": { label: "Tests" },
  "/tests/run": { label: "Test run", parent: "/tests", detail: true },
  "/tests/test": { label: "Test", parent: "/tests", detail: true },

  "/releases": { label: "Releases" },
  "/graph": { label: "Code graph" },

  "/plans": { label: "Plans" },
  "/plans/detail": { label: "Plan", parent: "/plans", detail: true },
  "/plans/new": { label: "New plan", parent: "/plans" },
  "/plans/templates": { label: "Templates", parent: "/plans" },

  "/data-sources": { label: "Data sources" },
  "/data-sources/activity": { label: "Activity", parent: "/data-sources", tab: "Data source activity" },
  "/data-sources/connect": { label: "Connect", parent: "/data-sources", tab: "Connect a data source" },
  "/data-sources/connect/aws": { label: "AWS account", parent: "/data-sources", tab: "Connect an AWS account" },
  "/data-sources/connect/reader": { label: "Read-only access", parent: "/data-sources", tab: "Read-only access" },
  "/data-sources/tools": { label: "Team tools", parent: "/data-sources" },
  "/data-sources/tools/new": { label: "New tool", parent: "/data-sources/tools" },
  "/data-sources/tools/tool": { label: "Tool", parent: "/data-sources/tools", detail: true },

  "/analytics": { label: "Analytics" },
  "/infrastructure": { label: "Infrastructure" },
  "/alerts": { label: "Alerts" },
  "/alerts/detail": { label: "Alert", parent: "/alerts", detail: true },
  "/health": { label: "System health" },
  "/memory": { label: "Memory" },

  "/skills": { label: "Skills" },
  "/skills/item": { label: "Skill", parent: "/skills", detail: true },
  "/skills/agent": { label: "Agent", parent: "/skills", detail: true },

  "/settings": { label: "Settings" },
  "/settings/notifications": { label: "Notifications", parent: "/settings" },
  "/settings/security": { label: "Security", parent: "/settings" },
  "/settings/team": { label: "Team", parent: "/settings" },
  "/settings/support-access": { label: "Support access", parent: "/settings" },
  "/settings/repos": { label: "Repositories", parent: "/settings" },
  "/settings/workflow": { label: "Workflow", parent: "/settings" },
  "/settings/guardrails": { label: "Guardrails", parent: "/settings" },
  "/settings/voice": { label: "Team voice", parent: "/settings" },
  "/settings/instructions": { label: "Custom instructions", parent: "/settings" },
  "/settings/models": { label: "AI models", parent: "/settings" },
  "/settings/alerts": { label: "Alert routes", parent: "/settings" },
  "/settings/budget": { label: "Token limit", parent: "/settings" },
  "/settings/integrations": { label: "Integrations", parent: "/settings" },
  "/settings/integrations/aws": { label: "AWS", parent: "/settings/integrations", tab: "AWS integration" },
  "/settings/integrations/github": { label: "GitHub", parent: "/settings/integrations", tab: "GitHub integration" },
  "/settings/integrations/jira": { label: "Jira", parent: "/settings/integrations", tab: "Jira integration" },
  // Old addresses that redirect to their new place.
  "/settings/aws": { label: "AWS", parent: "/settings/integrations" },
  "/settings/github": { label: "GitHub", parent: "/settings/integrations" },
  "/settings/jira": { label: "Jira", parent: "/settings/integrations" },
  "/settings/plugins": { label: "Integrations", parent: "/settings" },

  "/support": { label: "Support" },
  "/support/ticket": { label: "Request", parent: "/support", detail: true },

  "/admin": { label: "Platform admin" },
  "/admin/tickets": { label: "Support queue", parent: "/admin" },
};

export interface Crumb {
  label: string;
  /** Absent on the current page. */
  href?: string;
}

/** "/settings/team/" → "/settings/team"; "" → "/". */
export function normalizePath(pathname: string | null | undefined): string {
  return (pathname || "/").replace(/\/+$/, "") || "/";
}

/** The page's entry; null for an address no page answers (the 404 page). */
export function routeFor(pathname: string | null | undefined): { path: string; info: RouteInfo } | null {
  const path = normalizePath(pathname);
  return ROUTES[path] ? { path, info: ROUTES[path] } : null;
}

/**
 * The trail from the top-level page down to this one. `item` is the name the
 * page gives itself (a run's title): it replaces the label of a detail route,
 * and is added after any other page (Support › New request).
 */
export function trailFor(pathname: string | null | undefined, item?: string | null): Crumb[] {
  const found = routeFor(pathname);
  if (!found) return item ? [{ label: item }] : [];
  const chain: { path: string; info: RouteInfo }[] = [];
  const seen = new Set<string>();
  for (let at: string | undefined = found.path; at && ROUTES[at] && !seen.has(at); at = ROUTES[at].parent) {
    seen.add(at);
    chain.unshift({ path: at, info: ROUTES[at] });
  }
  const crumbs: Crumb[] = chain.map((c) => ({ label: c.info.label, href: c.path }));
  const last = crumbs[crumbs.length - 1];
  if (item && found.info.detail) last.label = item;
  else if (item) crumbs.push({ label: item });
  delete crumbs[crumbs.length - 1].href;
  return crumbs;
}

/** Where "back" goes when there is no in-app history: one level up. */
export function parentHref(pathname: string | null | undefined, item?: string | null): string | null {
  const found = routeFor(pathname);
  if (!found) return null;
  // A page with an extra crumb (Support › New request) goes back to itself.
  if (item && !found.info.detail) return found.path;
  return found.info.parent ?? null;
}

/** The browser tab's name for this page. */
export function tabTitle(pathname: string | null | undefined, item?: string | null): string {
  if (item) return item;
  const found = routeFor(pathname);
  return found ? found.info.tab ?? found.info.label : "";
}
