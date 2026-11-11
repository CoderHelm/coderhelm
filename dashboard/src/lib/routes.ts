// Every page's name, what it is and where it sits, in one place. The top bar
// builds its breadcrumb trail from this map, the back arrow on a phone goes to
// `parent`, the browser tab is named after `label` (or `tab`), and link
// previews (lib/link-preview.ts) take the name and `description`. A page that
// is not listed here fails `npm run lint`, so a new page cannot ship without a
// name.

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
  /**
   * One line saying what the page is, for link previews (Teams, Slack, email)
   * and search. It is in the static HTML, which anyone with the link can read
   * before signing in, so it describes the page, never a team's data.
   */
  description: string;
}

export const ROUTES: Record<string, RouteInfo> = {
  "/": { label: "Runs", description: "Every run Coderhelm is working on or has finished: tickets and issues turned into pull requests, with their status." },
  "/runs/detail": { label: "Run", parent: "/", detail: true, description: "One run, step by step: from the ticket to the plan, the code, the tests and the pull request." },

  "/setup": { label: "Setup", description: "Recommended settings for every repo: what Coderhelm found in each one, what it recommends and why, and the runs that applied them." },
  "/setup/run": { label: "Run", parent: "/setup", detail: true, tab: "Setup run", description: "One Setup run: pick repos, see what Coderhelm found, review each recommendation next to the current value, then apply or undo." },

  "/reviewer": { label: "Reviewer", description: "Pull requests Coderhelm reviewed: findings, verdicts and what holds each merge." },
  "/reviewer/detail": { label: "Review", parent: "/reviewer", detail: true, description: "One review: its findings on the pull request, each with the code it points at." },
  "/reviewer/pr": { label: "Pull request", parent: "/reviewer", detail: true, description: "One pull request's reviews over time, and whether its merge check passes." },
  "/reviewer/session": { label: "Review session", parent: "/reviewer", detail: true, description: "One review session: what the reviewer read, what it found and the verdict it gave." },
  "/reviewer/config": { label: "Settings", parent: "/reviewer", tab: "Reviewer settings", description: "How the reviewer works: which pull requests it reviews, what it checks and when it blocks a merge." },

  "/tests": { label: "Tests", description: "The test suites Coderhelm runs against your apps, and how each one did on its last run." },
  "/tests/run": { label: "Test run", parent: "/tests", detail: true, description: "One test run: each check, what passed, what failed and why." },
  "/tests/test": { label: "Test", parent: "/tests", detail: true, description: "One test: its steps, the app it checks and its recent runs." },
  "/logs": { label: "Logs", description: "Logs from the agent, the API and the services behind this install, searchable by time and level." },

  "/releases": { label: "Releases", description: "What's new in each Coderhelm version, and how to update this install." },
  "/graph": { label: "Code graph", description: "A map of your code: modules, files and how they call each other." },

  "/plans": { label: "Plans", description: "Plans written with Coderhelm: specs and task lists to review before any code is written." },
  "/plans/detail": { label: "Plan", parent: "/plans", detail: true, description: "One plan: its spec, tasks and the runs that carry it out." },
  "/plans/new": { label: "New plan", parent: "/plans", description: "Write a new plan with Coderhelm: describe the change, then review the spec and tasks." },
  "/plans/templates": { label: "Templates", parent: "/plans", description: "Plan templates your team starts from, so similar changes are planned the same way." },

  "/data-sources": { label: "Data sources", description: "The data Coderhelm can read while it works: databases, logs, documents and team tools." },
  "/data-sources/activity": { label: "Activity", parent: "/data-sources", tab: "Data source activity", description: "What each data source was asked recently, by which run, and how it answered." },
  "/data-sources/connect": { label: "Connect", parent: "/data-sources", tab: "Connect a data source", description: "Connect a data source so Coderhelm can read it while it works." },
  "/data-sources/connect/aws": { label: "AWS account", parent: "/data-sources", tab: "Connect an AWS account", description: "Connect an AWS account with read access, so Coderhelm can read its logs and resources." },
  "/data-sources/connect/reader": { label: "Connect a source", parent: "/data-sources", tab: "Connect a source", description: "Connect a source for Coderhelm to read, step by step." },
  "/data-sources/tools": { label: "Team tools", parent: "/data-sources", description: "Tools your team built for Coderhelm to call: what each one does and who can use it." },
  "/data-sources/tools/new": { label: "New tool", parent: "/data-sources/tools", description: "Build a new team tool for Coderhelm to call." },
  "/data-sources/tools/tool": { label: "Tool", parent: "/data-sources/tools", detail: true, description: "One team tool: what it does, its settings and its recent calls." },

  "/analytics": { label: "Analytics", description: "How Coderhelm is doing for your team: runs, merged pull requests, time saved and token use." },
  "/learning": { label: "Learning", description: "How people answered the reviewer's comments, and the changes in its behavior that came from those answers." },
  "/infrastructure": { label: "Infrastructure", description: "The cloud resources Coderhelm can see, and what changed in them." },
  "/alerts": { label: "Alerts", description: "Alerts Coderhelm picked up from your monitoring, and what it did about each one." },
  "/alerts/detail": { label: "Alert", parent: "/alerts", detail: true, description: "One alert: when it fired, what Coderhelm found and the fix it proposed." },
  "/security": { label: "Security", description: "Advisories that touch your dependencies, whether your code reaches the vulnerable part, and the fix for each one." },
  "/security/detail": { label: "Finding", parent: "/security", detail: true, description: "One security finding: the advisory, why Coderhelm thinks the repo is affected, the fix and its deadline." },
  "/security/infrastructure": { label: "Infrastructure", parent: "/security", tab: "Infrastructure vulnerabilities", description: "What runs in your AWS accounts, checked against AWS's security bulletins: the fix PR, the step in AWS, or AWS-managed." },
  "/security/policy": { label: "Policy", parent: "/security", tab: "Security policy", description: "What Coderhelm does about advisories: which get a pull request and when, what is posted, the deadlines and labels." },
  "/health": { label: "System health", description: "Whether every part of this install is working: services, queues, integrations and checks." },
  "/memory": { label: "Memory", description: "What Coderhelm remembers about your team, code and conventions, and where it learned it." },

  "/chat": { label: "Chat", description: "Ask Coderhelm about your code, runs and documents, with answers that cite their sources." },
  "/knowledge": { label: "Knowledge", description: "The documents and sources Chat answers from, and how fresh each one is." },
  "/knowledge/bedrock": { label: "Use in Bedrock", parent: "/knowledge", description: "Let Amazon Bedrock search your team's knowledge live, or keep chosen knowledge bases copied into your AWS account." },
  "/knowledge/base": { label: "Knowledge base", parent: "/knowledge", detail: true, description: "One knowledge base: its sources, what it holds and when it was last read." },
  // Knowledge's old addresses, which redirect to it.
  "/brain/knowledge": { label: "Knowledge", description: "The documents and sources Chat answers from, and how fresh each one is." },
  "/brain/knowledge/base": { label: "Knowledge base", parent: "/knowledge", detail: true, description: "One knowledge base: its sources, what it holds and when it was last read." },

  "/skills": { label: "Skills", description: "Skills and agents Coderhelm uses: how-tos, checks and instructions it follows on each run." },
  "/skills/item": { label: "Skill", parent: "/skills", detail: true, description: "One skill: what it tells Coderhelm to do, when it applies and how often it is used." },
  "/skills/agent": { label: "Agent", parent: "/skills", detail: true, description: "One agent: its role, the skills it uses and what it may do." },

  "/connections": { label: "Connected accounts", description: "The outside accounts you connected to Coderhelm, and what each one lets it do." },

  "/plugins": { label: "Plugins", description: "Plugins that add tools and actions to Coderhelm, and which are turned on." },
  "/plugins/plugin": { label: "Plugin", parent: "/plugins", detail: true, description: "One plugin: what it adds, its settings and its recent use." },
  "/plugins/review": { label: "Review", parent: "/plugins", tab: "Drafts waiting for review", description: "Plugin drafts waiting for someone to review and approve them." },
  "/plugins/draft": { label: "Draft", parent: "/plugins/review", detail: true, description: "One plugin draft: what it would add and the changes waiting for approval." },
  "/plugins/runs": { label: "Plugin run", parent: "/plugins", detail: true, description: "One plugin run: what it was asked to do and what it returned." },
  "/audit": { label: "Audit log", description: "Every plugin step in one place: who started it, each tool it used, who approved it and what happened." },

  "/settings": { label: "Settings", description: "Settings for your team: members, repositories, integrations, models, security and more." },
  "/settings/notifications": { label: "Notifications", parent: "/settings", description: "Choose which emails Coderhelm sends you. These settings are yours alone." },
  "/settings/security": { label: "Security", parent: "/settings", description: "Your password and two step sign in: change them, and see how you sign in to this team." },
  "/settings/team": { label: "Members and roles", parent: "/settings", description: "Who is on the team, their roles and what each role may do." },
  "/settings/connected-apps": { label: "Connected AI apps", parent: "/settings", description: "The AI apps you connected to Coderhelm, such as Claude, Cursor and VS Code, and how to connect one." },
  "/authorize": { label: "Connect an app", description: "An app asks to use Coderhelm as you. Check who is asking and what it may do." },
  "/settings/api-keys": { label: "API keys", parent: "/settings", description: "API keys for scripts and tools that call Coderhelm, with their scopes and limits." },
  "/settings/sign-in": { label: "Sign-in rules", parent: "/settings", description: "How people may sign in to this team, and who may join." },
  "/settings/support-access": { label: "Support access", parent: "/settings", description: "Whether support may look at your team's setup, and for how long." },
  "/settings/repos": { label: "Repositories", parent: "/settings", description: "The repositories Coderhelm works in, and the settings for each one." },
  "/settings/repos/codegen": { label: "Codegen environment", parent: "/settings/repos", description: "The environment Coderhelm builds and tests code in: tools, versions and setup commands." },
  "/settings/workflow": { label: "Workflow", parent: "/settings", description: "How a run goes from ticket to pull request: triggers, branches, reviews and approvals." },
  "/settings/agents": { label: "Agent permissions", parent: "/settings", description: "What Coderhelm's agents may do on their own, and what needs someone's approval." },
  "/settings/guardrails": { label: "Rules", parent: "/settings/instructions", description: "Rules Coderhelm must follow in every run, and what it must never do." },
  "/settings/voice": { label: "Voice", parent: "/settings/instructions", description: "How Coderhelm writes: tone and style for pull requests, comments and messages." },
  "/settings/instructions": { label: "Instructions", parent: "/settings", description: "Standing instructions Coderhelm follows on every run, with its rules and voice." },
  "/settings/models": { label: "AI models", parent: "/settings", description: "The AI models Coderhelm uses for each kind of work." },
  "/settings/alerts": { label: "Alert routes", parent: "/settings", description: "Where alerts go: which channels hear about each alarm, and how often they are reminded." },
  "/settings/budget": { label: "Token limit", parent: "/settings", description: "How many tokens your team may use, and what happens when the limit is reached." },
  "/settings/setup": { label: "Setup checks", parent: "/settings", description: "Checks that this install is set up right, with the fix for anything that is not." },
  "/settings/system": { label: "Version and updates", parent: "/settings", description: "This install's version, the updates available and how to install them." },
  "/settings/sign-in-apps": { label: "Sign-in apps", parent: "/settings", description: "The apps people sign in to connectors with, such as Notion and Google Drive, and which ones are set up." },
  "/settings/emails": { label: "Email", parent: "/settings", description: "The emails Coderhelm sends: sender name, address and which messages go out." },
  "/settings/deliveries": { label: "Deliveries", parent: "/settings", tab: "Webhook deliveries", description: "Every webhook, email and alert message Coderhelm sent or received recently, and whether it was delivered." },
  "/settings/webhooks": { label: "Outgoing webhooks", parent: "/settings", description: "Outgoing webhooks: where Coderhelm sends run and review events." },
  "/settings/integrations": { label: "Integrations", parent: "/settings", description: "The services Coderhelm works with, such as GitHub, Jira, AWS and MCP servers." },
  "/settings/integrations/aws": { label: "AWS", parent: "/settings/integrations", tab: "AWS integration", description: "Connect AWS so Coderhelm can read your logs, alarms and resources." },
  "/settings/integrations/github": { label: "GitHub", parent: "/settings/integrations", tab: "GitHub integration", description: "Connect GitHub so Coderhelm can read issues and open pull requests." },
  "/settings/integrations/jira": { label: "Jira", parent: "/settings/integrations", tab: "Jira integration", description: "Connect Jira so tickets can start runs and get updates." },
  "/settings/integrations/mcp-callback": { label: "Finish a sign-in", parent: "/settings/integrations", tab: "Finish a sign-in", description: "Finish signing Coderhelm in to an app, an MCP server or a knowledge source." },
  // Old addresses that redirect to their new place.
  "/settings/aws": { label: "AWS", parent: "/settings/integrations", description: "Connect AWS so Coderhelm can read your logs, alarms and resources." },
  "/settings/github": { label: "GitHub", parent: "/settings/integrations", description: "Connect GitHub so Coderhelm can read issues and open pull requests." },
  "/settings/jira": { label: "Jira", parent: "/settings/integrations", description: "Connect Jira so tickets can start runs and get updates." },
  "/settings/plugins": { label: "Integrations", parent: "/settings", description: "The services Coderhelm works with, such as GitHub, Jira, AWS and MCP servers." },
  "/brain": { label: "Chat", description: "Ask Coderhelm about your code, runs and documents, with answers that cite their sources." },

  "/support": { label: "Support", description: "Get help with Coderhelm: your requests and their answers." },
  "/support/ticket": { label: "Request", parent: "/support", detail: true, description: "One support request and its conversation." },
  "/support/move": { label: "Move your team", parent: "/support", description: "Move your team from hosted Coderhelm to your own install." },

  "/admin": { label: "Platform admin", description: "Platform administration across every team: usage, support and operations." },
  "/admin/tickets": { label: "Support queue", parent: "/admin", description: "Support requests from every team, waiting for an answer." },
  "/admin/self-host": { label: "Self-host", parent: "/admin", description: "Self-hosted installs: their versions, health and updates." },
  "/admin/queue": { label: "Shared queue", parent: "/admin", tab: "Shared failed-message queue", description: "Messages that failed to process in the shared queue, waiting to be retried or dropped." },
};

/**
 * Where the team's knowledge lives (the sources Chat answers from). Every link
 * to it goes through this one constant, so the page can move without a hunt.
 */
export const KNOWLEDGE_HREF = "/knowledge/";

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
