import type { ReactNode } from "react";
import { ANY_CHANGE } from "@/lib/capabilities";
import {
  BellIcon, BookIcon, CpuIcon, DatabaseIcon, GitBranchIcon, KeyIcon, LifeBuoyIcon,
  LockIcon, PenIcon, PlanIcon, PluginIcon, RepeatIcon, ShieldCheckIcon, ShieldIcon, TargetIcon, UsersIcon, WrenchIcon,
} from "./icons";

/** Keys for the small "current value" line some items show on the hub. */
export type SettingsStatusKey =
  | "usage" | "repos" | "team" | "alerts" | "dataSources" | "integrations" | "models" | "security"
  | "setup" | "deliveries" | "system";

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
  /** Listed in the menu under this item's href instead of on its own (a tab of it). */
  navUnder?: string;
  /** The SETTINGS_TABS set this page belongs to. */
  tabs?: string;
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
      { href: "/settings/notifications", title: "Notifications", description: "Which emails Coderhelm sends you.", icon: <BellIcon />, view: "own_account", edit: "own_account" },
      { href: "/settings/security", title: "Security", description: "Your password and your authenticator app.", icon: <LockIcon />, view: "own_account", edit: "own_account", status: "security" },
      { href: "/settings/connected-apps", title: "Connected AI apps", description: "Claude, Cursor and other apps you let use Coderhelm as you.", icon: <PluginIcon />, view: "own_account", edit: "own_account" },
    ],
  },
  {
    id: "team",
    label: "Team",
    items: [
      { href: "/settings/team", title: "Members and roles", description: "Who is on the team and what each role can do.", icon: <UsersIcon />, view: "view_team", edit: "people", status: "team" },
      { href: "/settings/sign-in", title: "Sign-in rules", description: "Whether everyone must use two-factor sign-in, and who has it set up.", icon: <LockIcon />, view: "sign_in", edit: "sign_in" },
      { href: "/settings/api-keys", title: "API keys", description: "Keys for your own scripts and tools.", icon: <KeyIcon />, view: "api_keys", edit: "api_keys" },
      { href: "/settings/support-access", title: "Support access", description: "Let Coderhelm support look, read only, for a while.", icon: <LifeBuoyIcon />, view: "support", edit: "support" },
    ],
  },
  {
    id: "automation",
    label: "How Coderhelm works",
    items: [
      { href: "/settings/repos", title: "Repositories", description: "Turn Coderhelm on or off for each repository.", icon: <GitBranchIcon />, view: ANY_CHANGE, edit: "repos", status: "repos" },
      { href: "/settings/workflow", title: "Workflow", description: "Where plans go and what lands in the pull request.", icon: <PlanIcon />, view: "agent_settings", edit: "agent_settings" },
      { href: "/settings/instructions", title: "Instructions", description: "Rules, voice and conventions Coderhelm follows.", icon: <WrenchIcon />, view: "agent_settings", edit: "agent_settings", tabs: "instructions" },
      { href: "/settings/guardrails", title: "Rules", description: "Rules Coderhelm always follows, for every repository or just one.", icon: <ShieldIcon />, view: "agent_settings", edit: "agent_settings", navUnder: "/settings/instructions", tabs: "instructions" },
      { href: "/settings/voice", title: "Voice", description: "How Coderhelm writes commits, pull requests and comments.", icon: <PenIcon />, view: "agent_settings", edit: "agent_settings", navUnder: "/settings/instructions", tabs: "instructions" },
      { href: "/settings/agents", title: "Agent permissions", description: "What agents may do alone, and what waits for approval.", icon: <ShieldCheckIcon />, view: "view", edit: "agents.permissions" },
      { href: "/settings/models", title: "AI models", description: "Which AI does the work, and whose account pays.", icon: <CpuIcon />, view: "model_provider", edit: "model_provider", status: "models" },
    ],
  },
  {
    id: "connections",
    label: "Integrations",
    items: [
      { href: "/settings/integrations", title: "Integrations", description: "GitHub, Jira, AWS and chat, and whether each works.", icon: <PluginIcon />, view: "view_integrations", edit: "integrations", status: "integrations" },
      { href: "/connections", title: "Connected accounts", description: "Accounts and remote servers plugins and agents may use.", icon: <PluginIcon />, view: "view_integrations", edit: "integrations" },
      { href: "/data-sources", title: "Data sources", description: "Live systems the reviewer may read. Read only.", icon: <DatabaseIcon />, view: "data_sources", edit: "data_sources", status: "dataSources" },
      { href: "/skills", title: "Skills", description: "Step by step guides from a repository.", icon: <BookIcon />, view: ANY_CHANGE, edit: ANY_CHANGE },
      { href: "/settings/alerts", title: "Alert routes", description: "Turn monitoring alerts into pull requests or messages.", icon: <BellIcon />, view: "view_alerts", edit: "alerts", status: "alerts" },
      { href: "/settings/webhooks", title: "Outgoing webhooks", description: "Send Coderhelm's events to your own systems, signed.", icon: <RepeatIcon />, view: "webhooks", edit: "webhooks" },
    ],
  },
  {
    id: "usage",
    label: "Usage and activity",
    items: [
      { href: "/settings/budget", title: "Token limit", description: "Monthly limits. Work pauses when the team reaches one.", icon: <TargetIcon />, view: ANY_CHANGE, edit: "budget", status: "usage" },
      { href: "/settings/deliveries", title: "Deliveries", description: "Every event in and message out, and the ones that failed.", icon: <RepeatIcon />, view: "integrations", edit: "integrations", status: "deliveries" },
    ],
  },
  {
    id: "install",
    label: "This install",
    items: [
      { href: "/settings/setup", title: "Setup checks", description: "What is left to set up, checked live.", icon: <WrenchIcon />, view: "system", edit: "system", selfHostOnly: true, status: "setup" },
      { href: "/settings/system", title: "Version and updates", description: "The running version, updates, history and roll back.", icon: <CpuIcon />, view: "system", edit: "system", selfHostOnly: true, status: "system" },
      { href: "/settings/sign-in-apps", title: "Sign-in apps", description: "The apps people sign in to connectors with.", icon: <KeyIcon />, view: "system", edit: "system", selfHostOnly: true },
      { href: "/settings/emails", title: "Email", description: "Which emails this install sends, and how.", icon: <BellIcon />, view: "emails", edit: "emails", selfHostOnly: true },
    ],
  },
];

/** Pages shown as tabs of one settings item (Instructions: rules, voice, conventions). */
export const SETTINGS_TABS: Record<string, { href: string; label: string }[]> = {
  instructions: [
    { href: "/settings/instructions", label: "Conventions" },
    { href: "/settings/guardrails", label: "Rules" },
    { href: "/settings/voice", label: "Voice" },
  ],
};

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

/** The menu entry a path highlights: a tab page highlights the item it sits under. */
export function navItemFor(pathname: string): SettingsItem | undefined {
  const item = settingsItemFor(pathname);
  if (!item?.navUnder) return item;
  return SETTINGS_ITEMS.find((i) => i.href === item.navUnder);
}

