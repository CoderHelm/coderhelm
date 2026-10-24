"use client";

import { useEffect, useState } from "react";
import { api, type SystemVersion } from "@/lib/api";
import { isSelfHosted } from "@/lib/runtime-config";

/**
 * Whether this person may see the install's pages (Setup, System): a
 * self-hosted install, and an install admin. The server checks again.
 */
export function useInstallAdmin(): { ready: boolean; allowed: boolean } {
  const [state, setState] = useState({ ready: false, allowed: false });
  useEffect(() => {
    if (!isSelfHosted()) {
      setState({ ready: true, allowed: false });
      return;
    }
    api
      .me()
      .then((me) => setState({ ready: true, allowed: (me as { platform_admin?: boolean }).platform_admin === true }))
      .catch(() => setState({ ready: true, allowed: false }));
  }, []);
  return state;
}

export type SetupKey = "github" | "repos" | "models" | "email" | "chat" | "updates" | "run";

export interface SetupCheck {
  key: SetupKey;
  label: string;
  done: boolean | null;
  optional?: boolean;
  detail: string;
  href: string;
  action: string;
}

/** The test email's result, kept in this browser (a send is the check). */
export const EMAIL_OK_KEY = "coderhelm.setup.email_ok";

function emailOk(): boolean {
  try {
    return localStorage.getItem(EMAIL_OK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Every setup item, each from its own live call; one failing leaves its item unknown. */
export async function loadSetupChecks(): Promise<SetupCheck[]> {
  const settle = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  const [integrations, repos, model, system, runs] = await Promise.all([
    settle(api.getIntegrations()),
    settle(api.listRepos()),
    settle(api.getModelProvider()),
    settle(api.getSystemVersion()),
    settle(api.listRuns()),
  ]);
  const item = (id: string) => integrations?.items.find((i) => i.id === id);
  const github = item("github");
  const chat = integrations?.items.filter((i) => ["jira", "teams", "slack"].includes(i.id) && i.status === "connected") ?? [];
  const enabled = repos ? repos.repos.filter((r) => r.enabled).length : null;
  const sys = system as SystemVersion | null;
  return [
    {
      key: "github",
      label: "GitHub App connected",
      done: integrations ? github?.status === "connected" : null,
      detail: github?.status === "connected" ? "Coderhelm can read your repositories." : "Install your GitHub App on the repositories Coderhelm should work on.",
      href: "/settings/github",
      action: "Connect GitHub",
    },
    {
      key: "repos",
      label: "Repositories turned on",
      done: enabled === null ? null : enabled > 0,
      detail: enabled ? `${enabled} on.` : "Turn Coderhelm on for at least one repository.",
      href: "/settings/repos",
      action: "Choose repositories",
    },
    {
      key: "models",
      label: "Claude access working",
      done: model ? model.deployment_provider === "bedrock" || !!model.api_key_masked : null,
      detail: model?.deployment_provider === "bedrock" ? "Amazon Bedrock in this AWS account." : model?.api_key_masked ? "Your team's Anthropic key is saved." : "Add your team's Anthropic API key.",
      href: "/settings/models",
      action: "Set up models",
    },
    {
      key: "email",
      label: "Email working",
      done: emailOk(),
      detail: emailOk() ? "A test email went out." : "Send yourself a test email (new AWS accounts start in the SES sandbox).",
      href: "/settings/setup#email",
      action: "Send a test email",
    },
    {
      key: "chat",
      label: "Jira, Slack or Teams connected",
      optional: true,
      done: integrations ? chat.length > 0 : null,
      detail: chat.length ? `${chat.map((c) => c.name).join(", ")} connected.` : "Optional: tickets from Jira, notices in Slack or Teams.",
      href: "/settings/integrations",
      action: "Connect",
    },
    {
      key: "updates",
      label: "Automatic updates on",
      optional: true,
      done: sys?.settings ? sys.settings.auto : null,
      detail: sys?.settings?.auto ? `In the window ${sys.settings.day} ${String(sys.settings.hour).padStart(2, "0")}:00 ${sys.settings.timezone}.` : "Optional: install new releases in a maintenance window.",
      href: "/settings/system",
      action: "Turn on",
    },
    {
      key: "run",
      label: "First run tried",
      done: runs ? runs.runs.length > 0 : null,
      detail: runs?.runs.length ? "Coderhelm has worked on a ticket." : 'Assign an issue to Coderhelm, or add the "coderhelm" label.',
      href: "/",
      action: "See runs",
    },
  ];
}

/** Required items done, and how many there are. */
export function setupProgress(checks: SetupCheck[]): { done: number; total: number } {
  const req = checks.filter((c) => !c.optional);
  return { done: req.filter((c) => c.done === true).length, total: req.length };
}
