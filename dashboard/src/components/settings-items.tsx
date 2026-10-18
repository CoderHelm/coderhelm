import type { ReactNode } from "react";
import type { Role } from "@/lib/roles";
import {
  AtlassianIcon, AwsIcon, BellIcon, BookIcon, CpuIcon, DatabaseIcon, GitBranchIcon, GitHubIcon,
  LockIcon, PenIcon, PlanIcon, PluginIcon, ShieldCheckIcon, TargetIcon, UsersIcon, WrenchIcon,
} from "./icons";

/** Keys for the small "current value" line some items show on the hub. */
export type SettingsStatusKey =
  | "usage" | "repos" | "github" | "team" | "alerts" | "dataSources" | "plugins" | "jira" | "models" | "security";

export interface SettingsItem {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  /** Lowest role that can open the page. */
  view: Role;
  /** Lowest role that can change what the page shows. */
  edit: Role;
  status?: SettingsStatusKey;
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
// `view`/`edit` match the gateway's checks: a page is only listed for roles
// whose requests it would accept, so nothing on the hub leads to a page that
// turns the person away.
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "account",
    label: "Your account",
    items: [
      { href: "/settings/notifications", title: "Notifications", description: "Choose which emails Coderhelm sends you.", icon: <BellIcon />, view: "viewer", edit: "viewer" },
      { href: "/settings/security", title: "Security", description: "Change your password and turn on two step sign in.", icon: <LockIcon />, view: "viewer", edit: "viewer", status: "security" },
    ],
  },
  {
    id: "team",
    label: "Team and access",
    items: [
      { href: "/settings/team", title: "Team", description: "Who is on the team, their roles and what each role can do.", icon: <UsersIcon />, view: "viewer", edit: "admin", status: "team" },
    ],
  },
  {
    id: "code",
    label: "Repositories and GitHub",
    items: [
      { href: "/settings/repos", title: "Repositories", description: "Turn Coderhelm on or off for each repository.", icon: <GitBranchIcon />, view: "member", edit: "admin", status: "repos" },
      { href: "/settings/github", title: "GitHub", description: "The GitHub App that gives Coderhelm access to your code.", icon: <GitHubIcon />, view: "member", edit: "admin", status: "github" },
    ],
  },
  {
    id: "automation",
    label: "How Coderhelm works",
    items: [
      { href: "/settings/workflow", title: "Workflow", description: "Where plans go, what lands in the pull request and which tools plans may use.", icon: <PlanIcon />, view: "admin", edit: "admin" },
      { href: "/settings/guardrails", title: "Guardrails", description: "Rules Coderhelm always follows, for every repository or just one.", icon: <ShieldCheckIcon />, view: "admin", edit: "admin" },
      { href: "/settings/voice", title: "Team voice", description: "How Coderhelm writes commits, pull requests and comments.", icon: <PenIcon />, view: "admin", edit: "admin" },
      { href: "/settings/instructions", title: "Custom instructions", description: "Conventions and preferences Coderhelm reads before it starts work.", icon: <WrenchIcon />, view: "admin", edit: "admin" },
      { href: "/settings/models", title: "AI models", description: "Your Anthropic API key and which Claude models do the work.", icon: <CpuIcon />, view: "admin", edit: "admin", status: "models" },
    ],
  },
  {
    id: "alerts",
    label: "Alerts",
    items: [
      { href: "/settings/alerts", title: "Alert routes", description: "Turn monitoring alerts into pull requests or Teams cards.", icon: <BellIcon />, view: "admin", edit: "admin", status: "alerts" },
    ],
  },
  {
    id: "data",
    label: "Data sources",
    items: [
      { href: "/data-sources", title: "Data sources", description: "Live systems the reviewer may read to check facts. Read only.", icon: <DatabaseIcon />, view: "admin", edit: "admin", status: "dataSources" },
      { href: "/settings/aws", title: "AWS", description: "AWS accounts whose CloudWatch logs Coderhelm reads for findings.", icon: <AwsIcon />, view: "admin", edit: "admin" },
      { href: "/skills", title: "Skills", description: "Written know how from a repository that Coderhelm can follow.", icon: <BookIcon />, view: "member", edit: "member" },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [
      { href: "/settings/jira", title: "Jira", description: "Start work from Jira tickets and keep their status in step.", icon: <AtlassianIcon />, view: "admin", edit: "admin", status: "jira" },
      { href: "/settings/plugins", title: "MCP servers", description: "Connect tools such as Figma, Sentry and Linear.", icon: <PluginIcon />, view: "admin", edit: "admin", status: "plugins" },
    ],
  },
  {
    id: "usage",
    label: "Usage and limits",
    items: [
      { href: "/settings/budget", title: "Token limit", description: "A monthly cap on tokens. Runs pause when the team reaches it.", icon: <TargetIcon />, view: "member", edit: "owner", status: "usage" },
    ],
  },
];

export const SETTINGS_ITEMS: SettingsItem[] = SETTINGS_GROUPS.flatMap((g) => g.items);

/** The settings item for a path such as "/settings/budget/" (trailing slash optional). */
export function settingsItemFor(pathname: string): SettingsItem | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_ITEMS.find((i) => path === i.href || path.startsWith(`${i.href}/`));
}
