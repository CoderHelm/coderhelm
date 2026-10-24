import type { ReactNode } from "react";
import { ANY_CHANGE } from "@/lib/capabilities";
import {
  BellIcon, BookIcon, CpuIcon, DatabaseIcon, GitBranchIcon,
  LockIcon, PenIcon, PlanIcon, PluginIcon, ShieldCheckIcon, TargetIcon, UsersIcon, WrenchIcon,
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
    label: "Your account",
    items: [
      { href: "/settings/notifications", title: "Notifications", description: "Choose which emails Coderhelm sends you.", icon: <BellIcon />, view: "own_account", edit: "own_account" },
      { href: "/settings/security", title: "Security", description: "Change your password and turn on two step sign in.", icon: <LockIcon />, view: "own_account", edit: "own_account", status: "security" },
    ],
  },
  {
    id: "team",
    label: "Team and access",
    items: [
      { href: "/settings/team", title: "Team", description: "Who is on the team, their roles and what each role can do.", icon: <UsersIcon />, view: "view_team", edit: "people", status: "team" },
      { href: "/settings/support-access", title: "Support access", description: "Let Coderhelm support see your workspace, read only, for a while. See every page they read.", icon: <ShieldCheckIcon />, view: "support", edit: "support" },
    ],
  },
  {
    id: "code",
    label: "Repositories",
    items: [
      { href: "/settings/repos", title: "Repositories", description: "Turn Coderhelm on or off for each repository.", icon: <GitBranchIcon />, view: ANY_CHANGE, edit: "repos", status: "repos" },
    ],
  },
  {
    id: "automation",
    label: "How Coderhelm works",
    items: [
      { href: "/settings/workflow", title: "Workflow", description: "Where plans go, what lands in the pull request and which tools plans may use.", icon: <PlanIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/guardrails", title: "Guardrails", description: "Rules Coderhelm always follows, for every repository or just one.", icon: <ShieldCheckIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/voice", title: "Team voice", description: "How Coderhelm writes commits, pull requests and comments.", icon: <PenIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/instructions", title: "Custom instructions", description: "Conventions and preferences Coderhelm reads before it starts work.", icon: <WrenchIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/models", title: "AI models", description: "Your Anthropic API key and which Claude models do the work.", icon: <CpuIcon />, view: "model_provider", edit: "model_provider", status: "models" },
    ],
  },
  {
    id: "alerts",
    label: "Alerts",
    items: [
      { href: "/settings/alerts", title: "Alert routes", description: "Turn monitoring alerts into pull requests or Teams cards.", icon: <BellIcon />, view: "view_alerts", edit: "alerts", status: "alerts" },
    ],
  },
  {
    id: "data",
    label: "Data sources",
    items: [
      { href: "/data-sources", title: "Data sources", description: "Live systems the reviewer may read to check facts. Read only.", icon: <DatabaseIcon />, view: "data_sources", edit: "data_sources", status: "dataSources" },
      { href: "/skills", title: "Skills", description: "Written know how from a repository that Coderhelm can follow.", icon: <BookIcon />, view: ANY_CHANGE, edit: ANY_CHANGE },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [
      { href: "/settings/integrations", title: "Integrations", description: "GitHub, Jira, AWS, New Relic, Sentry, Confluence, Teams and other tools: what each can do and whether it works.", icon: <PluginIcon />, view: "view_integrations", edit: "integrations", status: "integrations" },
    ],
  },
  {
    id: "install",
    label: "This install",
    items: [
      { href: "/settings/setup", title: "Setup", description: "What is left to set up, checked live: GitHub, repositories, models, email, updates.", icon: <WrenchIcon />, view: "system", edit: "system", selfHostOnly: true },
      { href: "/settings/system", title: "System", description: "Which version runs, updates and their history, automatic updates and roll back.", icon: <CpuIcon />, view: "system", edit: "system", selfHostOnly: true },
    ],
  },
  {
    id: "usage",
    label: "Usage and limits",
    items: [
      { href: "/settings/budget", title: "Token limit", description: "A monthly cap on tokens. Runs pause when the team reaches it.", icon: <TargetIcon />, view: ANY_CHANGE, edit: "budget", status: "usage" },
    ],
  },
];

export const SETTINGS_ITEMS: SettingsItem[] = SETTINGS_GROUPS.flatMap((g) => g.items);

/** The settings item for a path such as "/settings/budget/" (trailing slash optional). */
export function settingsItemFor(pathname: string): SettingsItem | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_ITEMS.find((i) => path === i.href || path.startsWith(`${i.href}/`));
}
