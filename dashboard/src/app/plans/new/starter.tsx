"use client";

import Link from "next/link";
import type { RefObject } from "react";
import type { Repo, Template } from "@/lib/api";
import { GitHubIcon, AtlassianIcon, ChevronRightIcon } from "@/components/icons";
import { List, ListRow } from "@/components/list";
import { Skeleton } from "@/components/skeleton";
import { focusRing } from "@/components/ui";
import { Composer } from "./composer";

// A fresh plan asks one thing: what do you want to change? Below the box,
// a line on what Coderhelm can read and what happens next. Templates and
// where tasks go are folded under "More options".

const EXAMPLES = [
  "Add a page that shows the class schedule by day",
  "Retry failed sync jobs with a backoff",
  "Move billing calls to the new payments API",
];

export function Starter({
  input,
  setInput,
  onSend,
  inputRef,
  repos,
  templates,
  usingTemplate,
  onUseTemplate,
  destination,
  jiraReady,
  onDestination,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  repos: Repo[];
  /** null while they load. */
  templates: Template[] | null;
  usingTemplate: string | null;
  onUseTemplate: (id: string) => void;
  destination: "github" | "jira";
  jiraReady: boolean;
  onDestination: (d: "github" | "jira") => void;
}) {
  const dest = destination === "jira" && jiraReady ? "jira" : "github";
  const where = dest === "jira" ? "a Jira ticket" : "a GitHub issue";
  const repoLine =
    repos.length === 0 ? null : repos.length === 1 ? repos[0].name : `${repos[0].name} and ${repos.length - 1} more`;
  return (
    <div className="mx-auto w-full max-w-2xl" data-testid="plan-starter">
      <h1 className="mt-2 text-2xl font-bold text-zinc-100 sm:mt-10">What do you want to change?</h1>
      <p className="mt-1 max-w-prose text-sm text-zinc-400">
        Describe it in your own words. Coderhelm reads your code and drafts a plan you can change before anything runs.
      </p>

      <div className="mt-5">
        <Composer
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSend={onSend}
          onStop={() => {}}
          busy={false}
          large
          sendLabel="Draft a plan"
          placeholder="e.g. Add a page that shows the class schedule by day, with the API it needs"
        />
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 text-xs text-zinc-400">
          {repoLine ? (
            <p>
              Reads <span className="text-zinc-300" title={repos.map((r) => r.name).join(", ")}>{repoLine}</span>
            </p>
          ) : null}
          <p>AI can make mistakes: review the plan before it runs.</p>
        </div>
      </div>

      {!input.trim() && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Examples">
          {EXAMPLES.map((e) => (
            <li key={e} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => {
                  setInput(e);
                  inputRef.current?.focus();
                }}
                className={`max-w-full truncate rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 ${focusRing}`}
              >
                {e}
              </button>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="next-heading" className="mt-10">
        <h2 id="next-heading" className="text-sm font-semibold text-zinc-100">
          What happens next
        </h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["Draft", "Coderhelm reads your repos and writes a plan of small tasks."],
            ["Refine", "Ask for changes here. Save it when it looks right."],
            ["Approve", `Approve the steps on the plan's page. Each step becomes ${where}, and a change your developers review before it goes live.`],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3 sm:block">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-xs tabular-nums text-zinc-400">
                {i + 1}
              </span>
              <div className="min-w-0 sm:mt-2">
                <p className="text-sm font-medium text-zinc-200">{title}</p>
                <p className="mt-0.5 text-sm text-zinc-400">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <details className="group mt-10 rounded-lg border border-zinc-800/80" data-testid="more-options">
        <summary
          className={`flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 [&::-webkit-details-marker]:hidden ${focusRing}`}
        >
          <span aria-hidden="true" className="inline-flex text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none">
            <ChevronRightIcon />
          </span>
          More options
          <span className="text-xs text-zinc-400">Destination{templates && templates.length > 0 ? ", templates" : ""}</span>
        </summary>
        <div className="space-y-5 border-t border-zinc-800/80 px-3 py-4">
          <div>
            <p className="mb-1.5 text-xs text-zinc-400">Each task becomes</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Destination">
              {(["github", "jira"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={dest === d}
                  disabled={d === "jira" && !jiraReady}
                  title={d === "jira" && !jiraReady ? "Connect Jira in settings first" : undefined}
                  onClick={() => onDestination(d)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${focusRing} ${
                    dest === d ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <span aria-hidden="true" className="inline-flex scale-90">
                    {d === "github" ? <GitHubIcon /> : <AtlassianIcon />}
                  </span>
                  {d === "github" ? "GitHub Issues" : "Jira Tickets"}
                </button>
              ))}
            </div>
            {!jiraReady && (
              <p className="mt-1.5 text-xs text-zinc-400">
                Connect Jira in{" "}
                <Link href="/settings/integrations/jira/" className={`rounded underline hover:text-zinc-300 ${focusRing}`}>
                  settings
                </Link>{" "}
                to send tasks there.
              </p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-400">Start from a template</p>
              <Link href="/plans/templates" className={`inline-flex items-center gap-0.5 rounded text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}>
                All templates
                <span aria-hidden="true">
                  <ChevronRightIcon />
                </span>
              </Link>
            </div>
            {templates === null ? (
              <Skeleton className="h-12 w-full" />
            ) : templates.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No templates yet. Save a plan as a template from its page to reuse it here.
              </p>
            ) : (
              <List label="Templates">
                {templates.map((t) => (
                  <ListRow
                    key={t.template_id}
                    title={t.title}
                    meta={[
                      `${t.task_count} task${t.task_count === 1 ? "" : "s"}`,
                      `used ${t.usage_count} time${t.usage_count === 1 ? "" : "s"}`,
                    ]}
                    actions={
                      <button
                        type="button"
                        onClick={() => onUseTemplate(t.template_id)}
                        disabled={usingTemplate === t.template_id}
                        aria-label={`Use template ${t.title}`}
                        className={`inline-flex min-h-7 items-center rounded-md border border-zinc-700 bg-zinc-800 px-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 ${focusRing}`}
                      >
                        {usingTemplate === t.template_id ? "Opening…" : "Use"}
                      </button>
                    }
                  />
                ))}
              </List>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
