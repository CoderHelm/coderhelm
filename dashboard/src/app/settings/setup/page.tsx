"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type SystemChecks } from "@/lib/api";
import { EMAIL_OK_KEY, loadSetupChecks, setupProgress, useInstallAdmin, type SetupCheck } from "@/lib/install";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Chip } from "@/components/list";
import { linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { CheckRow } from "@/components/install-checks";
import { CodeBlock } from "@/components/code-block";

/** The same checks from the operator's machine. */
const DOCTOR = "npx -y github:coderhelm/coderhelm-platform doctor";

/**
 * Settings, then Setup: the install's own checks (GET /api/system/checks),
 * each with what is wrong, why it matters and how to fix it, then what is
 * left to get started. Self-hosted installs, install admins.
 */
export default function SetupPage() {
  const { ready, allowed } = useInstallAdmin();
  if (!ready) return null;
  if (!allowed) {
    return (
      <Page>
        <div className="max-w-xl" data-testid="setup-unavailable">
          <Callout variant="neutral" title="Not available here">
            <p>This page is for the admins of a self-hosted Coderhelm install.</p>
            <p className="pt-1"><Link href="/settings" className={linkButton}>Back to Settings</Link></p>
          </Callout>
        </div>
      </Page>
    );
  }
  return <Setup />;
}

function Setup() {
  const [checks, setChecks] = useState<SetupCheck[] | null>(null);
  const [server, setServer] = useState<SystemChecks | null>(null);
  const [serverState, setServerState] = useState<"loading" | "ready" | "failed">("loading");

  const runChecks = useCallback(() => {
    setServerState("loading");
    api
      .getSystemChecks()
      .then((r) => {
        setServer(r);
        setServerState("ready");
      })
      .catch(() => setServerState("failed"));
  }, []);
  useEffect(() => {
    runChecks();
  }, [runChecks]);
  const [email, setEmail] = useState<{ state: "idle" | "sending" | "sent" | "failed"; text?: string }>({ state: "idle" });

  const load = useCallback(() => {
    loadSetupChecks().then(setChecks).catch(() => setChecks([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const sendTest = async () => {
    setEmail({ state: "sending" });
    try {
      const r = await api.sendTestEmail();
      if (r.sent) {
        try {
          localStorage.setItem(EMAIL_OK_KEY, "1");
        } catch {}
        setEmail({ state: "sent", text: `Sent to ${r.to}. Check your inbox (and spam).` });
        load();
      } else {
        setEmail({ state: "failed", text: r.reason ?? "Amazon SES refused the email." });
      }
    } catch (e) {
      setEmail({ state: "failed", text: e instanceof Error ? e.message : "Could not send" });
    }
  };

  const progress = checks ? setupProgress(checks) : null;

  return (
    <Page>
      <div className="mb-6">
        <PageHeader
          title="Setup"
          lead={progress ? `${progress.done} of ${progress.total} getting-started steps done. The install checks itself each time this page opens, and anything that needs a fix says how.` : "The install checks itself each time this page opens, and anything that needs a fix says how."}
        />
      </div>
      <InstallChecks data={server} state={serverState} onRecheck={runChecks} />

      <h2 className="mb-3 mt-10 text-xs font-semibold uppercase tracking-wider text-zinc-500" id="getting-started">Getting started</h2>
      {!checks ? (
        <div className="space-y-3" aria-busy="true" aria-label="Checking">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <ol className="space-y-3" data-testid="setup-checklist" aria-label="Setup checklist">
          {checks.map((c) => (
            <li
              key={c.key}
              id={c.key}
              data-done={c.done === true ? "yes" : c.done === false ? "no" : "unknown"}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${c.done ? "border-emerald-400 bg-emerald-400 text-emerald-950" : "border-zinc-600"}`}
                >
                  {c.done && <span className="scale-75"><CheckIcon /></span>}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                    {c.label}
                    <span className="sr-only">{c.done ? "done" : "not done"}</span>
                    {c.optional && <Chip tone="muted">Optional</Chip>}
                    {c.done === null && <Chip tone="neutral">Couldn&apos;t check</Chip>}
                  </p>
                  <p className="text-sm text-zinc-400">{c.detail}</p>
                  {c.key === "email" && email.text && (
                    <p role="status" className={`mt-1 text-sm ${email.state === "failed" ? "text-red-300" : "text-emerald-300"}`}>{email.text}</p>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                {c.key === "email" ? (
                  <button type="button" className={c.done ? secondaryButton : primaryButton} onClick={sendTest} disabled={email.state === "sending"}>
                    {email.state === "sending" ? "Sending…" : c.done ? "Send again" : "Send a test email"}
                  </button>
                ) : (
                  !c.done && <Link href={c.href} className={linkButton}>{c.action}</Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Page>
  );
}

/** The server-side checks, grouped, failing first within the summary. */
function InstallChecks({ data, state, onRecheck }: { data: SystemChecks | null; state: "loading" | "ready" | "failed"; onRecheck: () => void }) {
  const groups: [string, SystemChecks["checks"]][] = [];
  for (const c of data?.checks ?? []) {
    const g = groups.find(([name]) => name === c.group);
    if (g) g[1].push(c);
    else groups.push([c.group, [c]]);
  }
  const s = data?.summary;
  return (
    <section aria-labelledby="install-checks-heading" data-testid="install-checks" className="min-w-0">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="install-checks-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Install checks</h2>
          <p className="mt-1 text-sm text-zinc-400" data-testid="install-checks-summary" aria-live="polite">
            {state === "loading" && !data
              ? "Checking GitHub, email, Claude and the rest..."
              : s
                ? `${s.pass} passed, ${s.warn} warning${s.warn === 1 ? "" : "s"}, ${s.fail} need${s.fail === 1 ? "s" : ""} a fix. Checked ${data!.checked_at.slice(11, 16)} UTC.`
                : ""}
          </p>
        </div>
        <button type="button" className={secondaryButton} onClick={onRecheck} disabled={state === "loading"}>
          {state === "loading" ? "Checking..." : "Check again"}
        </button>
      </div>
      {state === "failed" && (
        <Callout variant="error" title="The install checks couldn't run">
          <p>The gateway didn&apos;t answer. Run the doctor from your machine for the same checks:</p>
          <div className="mt-2"><CodeBlock code={DOCTOR} lang="bash" label="Doctor command" /></div>
        </Callout>
      )}
      {s && (
        <div className="mb-4">
          {s.ready ? (
            <Callout variant="success" title={s.warn ? "Nothing needs a fix" : "Everything passes"}>
              <p>{s.warn ? "The warnings below can wait, but read them." : "This install is ready."}</p>
            </Callout>
          ) : (
            <Callout variant="error" title={`${s.fail} check${s.fail === 1 ? " needs" : "s need"} a fix`}>
              <p>Each one below says what is wrong, why it matters and how to fix it. Then press Check again.</p>
            </Callout>
          )}
        </div>
      )}
      {!data && state === "loading" && (
        <div className="space-y-3" aria-busy="true" aria-label="Checking">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}
      <div className="space-y-4">
        {groups.map(([name, list]) => (
          <div key={name} className="min-w-0">
            <h3 className="mb-1.5 text-sm font-medium text-zinc-300">{name}</h3>
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40" aria-label={`${name} checks`}>
              {list.map((c) => <CheckRow key={c.key} check={c} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
