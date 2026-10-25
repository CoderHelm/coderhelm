"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { EMAIL_OK_KEY, loadSetupChecks, setupProgress, useInstallAdmin, type SetupCheck } from "@/lib/install";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Chip } from "@/components/list";
import { linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { CheckIcon } from "@/components/icons";

/** Settings → Setup: what is left to set up on a new install, checked live (self-hosted, install admins). */
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
          lead={progress ? `${progress.done} of ${progress.total} required steps done. Each item checks itself when this page opens.` : "What is left to set up on this install."}
        />
      </div>
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
