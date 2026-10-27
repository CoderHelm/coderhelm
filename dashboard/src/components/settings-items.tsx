import type { ReactNode } from "react";
import { ANY_CHANGE } from "@/lib/capabilities";
import {
  BellIcon, BookIcon, CpuIcon, DatabaseIcon, GitBranchIcon, KeyIcon, LifeBuoyIcon,
  LockIcon, PenIcon, PlanIcon, PluginIcon, RepeatIcon, ShieldCheckIcon, ShieldIcon, TargetIcon, UsersIcon, WrenchIcon,
} from "./icons";

/** Keys for the small "current value" line some items show on the hub. */
export type SettingsStatusKey =
  | "usage" | "repos" | "team" | "alerts" | "dataSources" | "integrations" | "models" | "security";

export interface SettingsItem {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  /** The capability (lib/capabilities.ts) that opens the page. */
  view: string;
  /** The capability that changes what the page shows. */
  edit: string;
  status?: SettingsStatusKey;
  /** Only on a self-hosted install, and only for its install admins. */
  selfHostOnly?: boolean;
  /** Only on a self-hosted install (for whoever holds `view`). */
  selfHosted?: boolean;
}

export interface SettingsGroup {
  id: string;
  label: string;
  items: SettingsItem[];
}

// The one list of settings pages. The hub, the breadcrumb on every settings
// page and the e2e test that opens each page all read it, so a page cannot be
// listed in one place and missing (or gated differently) in another.
//
// `view`/`edit` are capabilities from the gateway's table, the same ones its
// checks use: a page is only listed for someone whose requests it would
// accept, so nothing on the hub leads to a page that turns the person away.
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "account",
    label: "You",
    items: [
      { href: "/settings/notifications", title: "Notifications", description: "Choose which emails Coderhelm sends you.", icon: <BellIcon />, view: "own_account", edit: "own_account" },
      { href: "/settings/security", title: "Security", description: "Change your password and turn on two step sign in.", icon: <LockIcon />, view: "own_account", edit: "own_account", status: "security" },
    ],
  },
  {
    id: "team",
    label: "Team",
    items: [
      { href: "/settings/team", title: "Team", description: "Who is on the team, their roles and what each role can do.", icon: <UsersIcon />, view: "view_team", edit: "people", status: "team" },
      { href: "/settings/sign-in", title: "Sign-in", description: "Whether everyone must use two-factor sign-in, and who has it set up.", icon: <LockIcon />, view: "sign_in", edit: "sign_in" },
      { href: "/settings/support-access", title: "Support access", description: "Let Coderhelm support look at your workspace for a while, without changing anything. See every page they open.", icon: <LifeBuoyIcon />, view: "support", edit: "support" },
      { href: "/settings/api-keys", title: "API keys", description: "Let your own scripts and tools use Coderhelm. For developers.", icon: <KeyIcon />, view: "api_keys", edit: "api_keys" },
    ],
  },
  {
    id: "automation",
    label: "How Coderhelm works",
    items: [
      { href: "/settings/repos", title: "Repositories", description: "Turn Coderhelm on or off for each repository.", icon: <GitBranchIcon />, view: ANY_CHANGE, edit: "repos", status: "repos" },
      { href: "/settings/agents", title: "Agent permissions", description: "What agents may do on their own, what waits for approval, and pausing all agents.", icon: <ShieldCheckIcon />, view: "view", edit: "agents.permissions" },
      { href: "/settings/workflow", title: "Workflow", description: "Where plans go, what lands in the pull request and which tools plans may use.", icon: <PlanIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/guardrails", title: "Guardrails", description: "Rules Coderhelm always follows, for every repository or just one.", icon: <ShieldIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/voice", title: "Team voice", description: "How Coderhelm writes commits, pull requests and comments.", icon: <PenIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/instructions", title: "Custom instructions", description: "Conventions and preferences Coderhelm reads before it starts work.", icon: <WrenchIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/models", title: "AI models", description: "Which AI does the work, and whose account pays for it.", icon: <CpuIcon />, view: "model_provider", edit: "model_provider", status: "models" },
    ],
  },
  {
    id: "connections",
    label: "Connections and usage",
    items: [
      { href: "/settings/integrations", title: "Integrations", description: "GitHub, Jira, AWS and the other tools Coderhelm works with, and whether each one is working.", icon: <PluginIcon />, view: "view_integrations", edit: "integrations", status: "integrations" },
      { href: "/connections", title: "Connections", description: "Accounts and remote servers your team has connected, for plugins and agents to use.", icon: <PluginIcon />, view: "view_integrations", edit: "integrations" },
      { href: "/data-sources", title: "Data sources", description: "Live systems the reviewer may read to check facts. Read only.", icon: <DatabaseIcon />, view: "data_sources", edit: "data_sources", status: "dataSources" },
      { href: "/skills", title: "Skills", description: "Step by step guides from a repository that Coderhelm follows for common jobs.", icon: <BookIcon />, view: ANY_CHANGE, edit: ANY_CHANGE },
      { href: "/settings/webhooks", title: "Webhooks", description: "Send Coderhelm's events (runs, pull requests, reviews, alerts) to your own systems, signed.", icon: <RepeatIcon />, view: "webhooks", edit: "webhooks" },
      { href: "/settings/deliveries", title: "Deliveries", description: "Every webhook in and notice out, whether it worked, and how to fix the ones that failed.", icon: <RepeatIcon />, view: "integrations", edit: "integrations" },
      { href: "/settings/alerts", title: "Alert routes", description: "Turn monitoring alerts into pull requests or chat messages.", icon: <BellIcon />, view: "view_alerts", edit: "alerts", status: "alerts" },
      { href: "/settings/budget", title: "Token limit", description: "Monthly limits for new tokens, cache reads and cache writes. Work pauses when the team reaches one.", icon: <TargetIcon />, view: ANY_CHANGE, edit: "budget", status: "usage" },
    ],
  },
  {
    id: "install",
    label: "This install",
    items: [
      { href: "/settings/setup", title: "Setup", description: "What is left to set up, checked live: GitHub, repositories, models, email, updates.", icon: <WrenchIcon />, view: "system", edit: "system", selfHostOnly: true },
      { href: "/settings/emails", title: "Emails", description: "Which optional emails this install sends, and whether email goes out through your own Amazon SES or Coderhelm.", icon: <BellIcon />, view: "emails", edit: "emails", selfHostOnly: true },
      { href: "/settings/system", title: "System", description: "Which version runs, updates and their history, automatic updates and roll back.", icon: <CpuIcon />, view: "system", edit: "system", selfHostOnly: true },
    ],
  },
];

export const SETTINGS_ITEMS: SettingsItem[] = SETTINGS_GROUPS.flatMap((g) => g.items);

/** Whether this install offers the item at all (before any capability check). */
export function offered(item: SettingsItem, selfHosted: boolean, platformAdmin: boolean): boolean {
  if (item.selfHostOnly) return selfHosted && platformAdmin;
  if (item.selfHosted) return selfHosted;
  return true;
}

/** The settings item for a path such as "/settings/budget/" (trailing slash optional). */
export function settingsItemFor(pathname: string): SettingsItem | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_ITEMS.find((i) => path === i.href || path.startsWith(`${i.href}/`));
}
