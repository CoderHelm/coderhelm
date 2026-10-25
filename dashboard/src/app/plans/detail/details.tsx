"use client";

import Link from "next/link";
import type { Plan } from "@/lib/api";
import { ChevronRightIcon, GitHubIcon, AtlassianIcon } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import { Time } from "@/components/list";
import { focusRing } from "@/components/ui";

// What a plan page rarely needs, folded under "Details": where its tasks are
// sent (changeable until it starts), the MCP servers its chat used, tokens,
// and the plan's id and times.

export function destinationWords(dest: string | undefined): string {
  return (dest ?? "github") === "jira" ? "Sends to Jira tickets" : "Sends to GitHub issues";
}

export function PlanDetails({
  plan,
  open,
  onOpenChange,
  jiraReady,
  updatingDest,
  onDestination,
}: {
  plan: Plan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jiraReady: boolean;
  updatingDest: boolean;
  onDestination: (d: "github" | "jira") => void;
}) {
  const draft = plan.status === "draft";
  const dest = plan.destination ?? "github";
  const tokens = (plan.tokens_in ?? 0) + (plan.tokens_out ?? 0);
  const row = "flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3";
  const label = "shrink-0 text-xs text-zinc-400 sm:w-32";
  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange((e.currentTarget as HTMLDetailsElement).open)}
      className="group rounded-lg border border-zinc-800/80 text-sm"
      data-testid="plan-details"
    >
      <summary
        className={`flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <span aria-hidden="true" className="inline-flex text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none">
          <ChevronRightIcon />
        </span>
        <span className="font-medium text-zinc-300">Details</span>
        <span className="text-zinc-500">{destinationWords(dest).replace("Sends to ", "")}</span>
      </summary>
      <dl className="space-y-3 border-t border-zinc-800/80 px-3 py-3 [overflow-wrap:anywhere]">
        <div className={row}>
          <dt className={label}>Destination</dt>
          <dd className="min-w-0">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Destination">
              {(["github", "jira"] as const).map((d) => {
                const on = dest === d;
                const off = (d === "jira" && !jiraReady) || updatingDest || !draft;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    disabled={off}
                    onClick={() => onDestination(d)}
                    className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${focusRing} ${
                      on ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    } ${off && !on ? "opacity-40" : ""} disabled:cursor-default`}
                  >
                    <span aria-hidden="true" className="inline-flex scale-90">
                      {d === "github" ? <GitHubIcon /> : <AtlassianIcon />}
                    </span>
                    {d === "github" ? "GitHub Issues" : "Jira Tickets"}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">
              {!draft ? (
                "Locked once the plan starts."
              ) : !jiraReady ? (
                <>
                  Connect Jira in{" "}
                  <Link href="/settings/integrations/jira/" className={`rounded underline hover:text-zinc-300 ${focusRing}`}>
                    settings
                  </Link>{" "}
                  to send tasks there.
                </>
              ) : (
                "Each approved task opens one there."
              )}
            </p>
          </dd>
        </div>
        {plan.repo && (
          <div className={row}>
            <dt className={label}>Repo</dt>
            <dd className="min-w-0 text-zinc-300">{plan.repo}</dd>
          </div>
        )}
        {plan.mcp_servers && plan.mcp_servers.length > 0 && (
          <div className={row}>
            <dt className={label}>MCP servers</dt>
            <dd className="flex min-w-0 flex-wrap gap-1.5">
              {plan.mcp_servers.map((id) => (
                <span key={id} className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                  {id}
                </span>
              ))}
            </dd>
          </div>
        )}
        {tokens > 0 && (
          <div className={row}>
            <dt className={label}>Tokens</dt>
            <dd className="text-zinc-300">{(tokens / 1000).toFixed(1)}K</dd>
          </div>
        )}
        <div className={row}>
          <dt className={label}>Created</dt>
          <dd className="text-zinc-300">
            <Time iso={plan.created_at} />
            {plan.updated_at && plan.updated_at !== plan.created_at && (
              <span className="text-zinc-500">
                {" "}
                · updated <Time iso={plan.updated_at} />
              </span>
            )}
          </dd>
        </div>
        {plan.executed_at && (
          <div className={row}>
            <dt className={label}>Started</dt>
            <dd className="text-zinc-300">
              <Time iso={plan.executed_at} />
              {plan.executed_by && <span className="text-zinc-500"> by {plan.executed_by}</span>}
            </dd>
          </div>
        )}
        <div className={row}>
          <dt className={label}>Plan id</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="font-mono text-xs text-zinc-400">{plan.plan_id}</code>
            <CopyButton text={plan.plan_id} variant="link" label={<span className="text-xs">Copy</span>} />
          </dd>
        </div>
      </dl>
    </details>
  );
}
