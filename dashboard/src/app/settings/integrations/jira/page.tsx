"use client";

import { useCan } from "@/hooks/use-can";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, type JiraCheck, type JiraConfig, type JiraEvent, type JiraProject, type Repo } from "@/lib/api";
import { timeAgo } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Stepper } from "@/components/stepper";
import { Segmented } from "@/components/segmented";
import { CopyButton } from "@/components/copy-button";
import { Disclosure } from "@/components/disclosure";
import { Skeleton } from "@/components/skeleton";
import { AtlassianIcon, ExternalLinkIcon } from "@/components/icons";
import { Page, PageHeader, Section } from "@/components/page";
import { Code, Field, SaveBar, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";
import { buttonClass, focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";

export default function JiraPageGuarded() {
  return (
    <RoleGuard need="integrations">
      <JiraPage />
    </RoleGuard>
  );
}

const TRIGGER_LABEL = "coderhelm";

/** The Coderhelm Jira app's install page. */
const INSTALL_URL =
  "https://developer.atlassian.com/console/install/de730821-2955-4d78-836e-55b6e7c23c88?signature=AYABePrR09vSK2DTVLCCzK%2Bt04oAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4IOp8r3eKNYw8z2v%2FEq3%2FfvrZguoGsXpNSaDveR%2FF%2Fo0BXAmH88tVaInK7U6E2MFkZAAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDJMQ6B1ogvNrk2X41AIBEIA7UEnUW%2FGBqNgbzivPOfH9txPwU4gjvklvkmwbZWb%2FmZoMMd5lsRvkJ7OzWCYtJAbfrF2hZZcREGnfeoMAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHijmwVTMt6Oj3F%2B0%2B0cVrojrS8yZ9ktpdfDxqPMSIkvHAEGa2reJg8L%2FrWqEbgFRPADAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMThkIkAaI7FAPWkeTAgEQgDtGtXT7SzNrjUqpB8Pm474FMrk2aPj2FtBDtjW9vNYK3NZ0oNloPH9XPGbn1uS7YTPJZPTB561JZvBdcgAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeLKa7Dfn9BgbXaQmJGrkKztjV4vrreTkqr7wGwhqIYs5AaBDJ8FvKCFfzHTyolwIyC8AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAyQ9HvoMmjskgnJCTUCARCAO%2FkpeTKd8IIamduK2tZFv2a8kDZoP7FTtAuky6S0LNmrEoIuYnHoMEyydCQLXHgjex%2FsD71J9OlNG%2Bx9AgAAAAAMAAAQAAAAAAAAAAAAAAAAAMx%2BPlN5fhsnaG9wdl169OP%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADLtyR6xQ9Nnc2%2F0GV7Dz3xCvKwGrAD%2BuvAz%2FU5KYYo7ZAgS%2FpCTSkiLEvuK6Ij5gvJQHM4oYSv%2FXgh40M6Ouxvc4a8%3D&product=jira";

type Load = { state: "loading" } | { state: "error" } | { state: "ready" };

function JiraPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [check, setCheck] = useState<JiraCheck | null>(null);
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const { can } = useCan();
  // Removing the integration is an owner-level capability.
  const canDisconnect = can("disconnect");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, cfg] = await Promise.all([api.getJiraCheck(), api.getJiraConfig()]);
      setCheck(c);
      setConfig(cfg);
      setLoad({ state: "ready" });
    } catch {
      setLoad((prev) => (prev.state === "ready" ? prev : { state: "error" }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const appLinked = !!(config?.list_projects_url && config?.create_ticket_url);
  const webhookOn = !!check?.webhook_url;
  const connected = appLinked || webhookOn;
  const enabledRepos = check?.configured_repos.enabled ?? 0;

  const removeIntegration = async () => {
    const ok = await confirm({
      title: "Remove the Jira integration?",
      message: "This deletes the Jira settings, webhook credentials, project choices and event history. Tickets stop starting runs. You can set it up again any time.",
      confirmLabel: "Remove integration",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.deleteJiraIntegration();
      setRevealedSecret(null);
      toast("Jira integration removed");
      await refresh();
    } catch {
      toast("Could not remove the integration. Nothing was changed.", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Jira"
        lead={
          <>
            Add the <code className="text-zinc-200">{TRIGGER_LABEL}</code> label to a Jira ticket and assign it: Coderhelm picks the repository,
            opens a pull request and keeps the ticket in step.
          </>
        }
      />

      {load.state === "loading" && (
        <div className="mt-8 grid gap-4 lg:grid-cols-3" aria-busy="true">
          <Skeleton className="h-44 lg:col-span-2" />
          <Skeleton className="h-44" />
        </div>
      )}

      {load.state === "error" && (
        <div className="mt-8">
          <Callout variant="error" title="Could not load the Jira settings">
            <p>Nothing was changed.</p>
            <p>
              <button type="button" onClick={() => { setLoad({ state: "loading" }); refresh(); }} className={linkButton}>
                Try again
              </button>
            </p>
          </Callout>
        </div>
      )}

      {load.state === "ready" && check && config && (
        <>
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <StatusCard check={check} config={config} appLinked={appLinked} webhookOn={webhookOn} onChanged={refresh} setConfig={setConfig} />
            </div>
            <HowItWorks />
          </div>

          {!connected && (
            <Section id="setup" title="Set up" description="Pick one way to connect. The Jira app is quicker and can also post back to tickets.">
              <SetupGuide check={check} onChanged={refresh} revealedSecret={revealedSecret} setRevealedSecret={setRevealedSecret} />
            </Section>
          )}

          {connected && enabledRepos === 0 && (
            <div className="mt-6">
              <Callout variant="warning" title="No repository is turned on">
                <p>
                  Tickets can&apos;t start runs until at least one repository is on.{" "}
                  <Link href="/settings/repos" className={linkButton}>Turn one on</Link>
                </p>
              </Callout>
            </div>
          )}

          {appLinked && <ProjectsSection config={config} setConfig={setConfig} />}

          {connected && (
            <Section id="webhook" title="Jira webhook" description="Optional when the Jira app is linked. A native Jira webhook sends ticket updates to Coderhelm.">
              <WebhookPanel check={check} onChanged={refresh} revealedSecret={revealedSecret} setRevealedSecret={setRevealedSecret} />
            </Section>
          )}

          <Section id="events" title="Recent Jira events" description="The last 20 ticket updates Coderhelm received and what it did with each.">
            <EventsList />
          </Section>

          <Section id="related" title="Related settings">
            <div className="grid gap-3 sm:grid-cols-2">
              <RelatedLink href="/reviewer/config" title="Release notes and Confluence">
                Where release notes are published, including the Confluence page they go under.
              </RelatedLink>
              <RelatedLink href="/settings/repos" title="Repositories">
                Which repositories Coderhelm may work in, and their roles for routing tickets.
              </RelatedLink>
            </div>
          </Section>

          {(check.secret_configured || appLinked || config.projects.length > 0) && (
            <Section id="remove" title="Remove the integration">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-500/20 p-4">
                <p className="max-w-prose text-sm text-zinc-400">
                  Deletes every Jira setting, the webhook credentials and the event history.
                  {!canDisconnect && " Only the team owner can do this."}
                </p>
                {canDisconnect && (
                  <button
                    type="button"
                    onClick={removeIntegration}
                    disabled={deleting}
                    className={buttonClass("danger")}
                  >
                    {deleting ? "Removing…" : "Remove integration"}
                  </button>
                )}
              </div>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}

function RelatedLink({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <Link href={href} className={`block rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-600 ${focusRing}`}>
      <span className="block font-semibold text-zinc-100">{title}</span>
      <span className="mt-1 block text-sm text-zinc-400">{children}</span>
    </Link>
  );
}

// ── Status ───────────────────────────────────────────────────────────

function StatusRow({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-400" : "bg-zinc-600"}`} />
      <span className={ok ? "text-zinc-200" : "text-zinc-400"}>
        <span className="sr-only">{ok ? "Done: " : "Not yet: "}</span>
        {children}
      </span>
    </li>
  );
}

function StatusCard({
  check,
  config,
  appLinked,
  webhookOn,
  onChanged,
  setConfig,
}: {
  check: JiraCheck;
  config: JiraConfig;
  appLinked: boolean;
  webhookOn: boolean;
  onChanged: () => void;
  setConfig: (c: JiraConfig) => void;
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const site = config.site_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const connected = appLinked || webhookOn;
  const enabled = check.configured_repos.enabled;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const { projects } = await api.fetchJiraProjects();
      setTest({ ok: true, text: `Coderhelm reached ${site || "your Jira site"} and can see ${projects.length} project${projects.length === 1 ? "" : "s"}.` });
    } catch (e) {
      setTest({ ok: false, text: e instanceof Error && e.message ? e.message : "Coderhelm could not reach the Jira app." });
    } finally {
      setTesting(false);
    }
  };

  const unlink = async () => {
    const ok = await confirm({
      title: "Disconnect the Jira app?",
      message: "Tickets stop starting runs through the app, and Coderhelm stops posting to tickets. Your project choices are kept. Save the app's settings in Jira again to reconnect.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setUnlinking(true);
    try {
      await api.updateJiraConfig({ list_projects_url: "", create_ticket_url: "", add_comment_url: "" });
      setConfig({ ...config, list_projects_url: "", create_ticket_url: "", add_comment_url: "" });
      toast("Jira app disconnected");
      onChanged();
    } catch {
      toast("Could not disconnect. The app is still linked.", "error");
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <section aria-labelledby="status-heading" className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-sky-400">
          <AtlassianIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="status-heading" className="font-semibold text-zinc-100">
            {connected ? (site ? site : "Jira") : "Jira is not connected"}
          </h2>
          <p className="text-sm text-zinc-400">
            {appLinked ? "Through the Coderhelm Jira app" : webhookOn ? "Through a Jira webhook" : "Follow the setup below to connect."}
          </p>
        </div>
        {connected && check.ready ? (
          <StatusPill tone="success">Connected</StatusPill>
        ) : connected ? (
          <StatusPill tone="warning">Needs a repository</StatusPill>
        ) : (
          <StatusPill>Not connected</StatusPill>
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        <StatusRow ok={appLinked}>{appLinked ? "Jira app linked" : "Jira app not linked"}</StatusRow>
        <StatusRow ok={webhookOn}>{webhookOn ? "Webhook credentials made" : "No webhook"}</StatusRow>
        <StatusRow ok={enabled > 0}>
          {enabled} of {check.configured_repos.total} repositor{check.configured_repos.total === 1 ? "y" : "ies"} turned on
        </StatusRow>
        <StatusRow ok={check.jira_events_seen || (check.jira_event_count ?? 0) > 0}>
          {check.last_jira_event_at
            ? `Last ticket run ${timeAgo(check.last_jira_event_at)}`
            : "No ticket has started a run yet"}
          {check.jira_event_count ? `, ${check.jira_event_count.toLocaleString()} events received` : ""}
        </StatusRow>
      </ul>

      {test && (
        <div className="mt-4">
          <Callout variant={test.ok ? "success" : "error"} title={test.ok ? "The connection works" : "The check failed"}>
            <p>{test.text}</p>
          </Callout>
        </div>
      )}

      {appLinked && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
          <button type="button" onClick={runTest} disabled={testing} className={secondaryButton}>
            {testing ? "Checking…" : "Check the connection"}
          </button>
          {config.site_url && (
            <a href={config.site_url} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} gap-2`}>
              Open Jira
              <span aria-hidden="true" className="scale-90"><ExternalLinkIcon /></span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          <button
            type="button"
            onClick={unlink}
            disabled={unlinking}
            className={`${buttonClass("danger")} sm:ml-auto`}
          >
            {unlinking ? "Disconnecting…" : "Disconnect the app"}
          </button>
        </div>
      )}
    </section>
  );
}

function HowItWorks() {
  return (
    <aside aria-labelledby="how-heading" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm">
      <h2 id="how-heading" className="font-semibold text-zinc-100">What starts a run</h2>
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-zinc-400">
        <li>
          A ticket in a turned on project gets the <code className="text-zinc-200">{TRIGGER_LABEL}</code> label. The label is fixed.
        </li>
        <li>Someone assigns the ticket.</li>
        <li>Coderhelm picks the repository (or uses the one set for the project), works on a branch and opens a pull request.</li>
        <li>Progress shows on the Runs page and, with the Jira app, as comments on the ticket.</li>
      </ol>
    </aside>
  );
}

// ── Setup ────────────────────────────────────────────────────────────

const APP_STEPS = [
  { id: "install", label: "Install the Jira app" },
  { id: "configure", label: "Paste your Team ID and secret" },
  { id: "try", label: "Label and assign a ticket" },
];

function SetupGuide({
  check,
  onChanged,
  revealedSecret,
  setRevealedSecret,
}: {
  check: JiraCheck;
  onChanged: () => void;
  revealedSecret: string | null;
  setRevealedSecret: (s: string | null) => void;
}) {
  const [how, setHow] = useState<"app" | "webhook">("app");
  const [installed, setInstalled] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-full"><Segmented
        label="How to connect"
        options={[
          { value: "app", label: "Jira app (recommended)" },
          { value: "webhook", label: "Jira webhook" },
        ]}
        value={how}
        onChange={setHow}
      /></div>
      {how === "app" ? (
        <div className="grid gap-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <Stepper steps={APP_STEPS} current={installed ? "configure" : "install"} label="Jira app steps" />
          <div className="flex min-w-0 flex-col gap-6 text-sm text-zinc-400">
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-zinc-100">1. Install the Jira app</h3>
              <p>You need to be a Jira admin. The install page opens in a new tab.</p>
              <div>
                <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer" onClick={() => setInstalled(true)} className={`${primaryButton} gap-2`}>
                  Install on Jira
                  <span aria-hidden="true" className="scale-90"><ExternalLinkIcon /></span>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-zinc-100">2. Paste your Team ID and secret</h3>
              <p>
                In Jira, open <span className="text-zinc-200">Apps, Manage your apps, Coderhelm</span>, paste both values and press Save. Coderhelm
                registers itself; this page then shows the app as linked.
              </p>
              <CopyRow label="Team ID" value={check.team_id} />
              {check.forge_secret && <CopyRow label="Secret" value={check.forge_secret} secret />}
              <p>
                <button type="button" onClick={onChanged} className={linkButton}>I saved it in Jira, check again</button>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-zinc-100">3. Label and assign a ticket</h3>
              <p>
                Add the <code className="text-zinc-200">{TRIGGER_LABEL}</code> label to a ticket and assign it. A run appears on the Runs page within a
                minute.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <WebhookPanel check={check} onChanged={onChanged} revealedSecret={revealedSecret} setRevealedSecret={setRevealedSecret} />
        </div>
      )}
    </div>
  );
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Code className="min-w-0 flex-1">{shown ? value : "•".repeat(24)}</Code>
        {secret && (
          <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} className={`${secondaryButton} !px-3 !py-1 text-xs`}>
            {shown ? "Hide" : "Show"}
          </button>
        )}
        <CopyButton text={value} />
      </div>
    </div>
  );
}

function WebhookPanel({
  check,
  onChanged,
  revealedSecret,
  setRevealedSecret,
}: {
  check: JiraCheck;
  onChanged: () => void;
  revealedSecret: string | null;
  setRevealedSecret: (s: string | null) => void;
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState<"" | "make" | "remove">("");

  const make = async () => {
    if (check.webhook_url) {
      const ok = await confirm({
        title: "Make new webhook credentials?",
        message: "The current address and secret stop working at once. Update the webhook in Jira with the new ones.",
        confirmLabel: "Make new ones",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy("make");
    try {
      const r = await api.generateJiraSecret();
      setRevealedSecret(r.webhook_secret);
      toast("Webhook credentials made. Copy the secret now; it is shown only once.");
      onChanged();
    } catch {
      toast("Could not make webhook credentials", "error");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Remove the webhook?",
      message: "Jira webhooks stop working until you make new credentials.",
      confirmLabel: "Remove webhook",
      destructive: true,
    });
    if (!ok) return;
    setBusy("remove");
    try {
      await api.deleteJiraSecret();
      setRevealedSecret(null);
      toast("Webhook removed");
      onChanged();
    } catch {
      toast("Could not remove the webhook", "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-col gap-4 text-sm text-zinc-400">
      {check.webhook_url ? (
        <>
          <CopyRow label="Webhook address" value={check.webhook_url} />
          {revealedSecret ? (
            <>
              <CopyRow label="Webhook secret" value={revealedSecret} />
              <Callout variant="warning" title="Copy the secret now">
                <p>It is not shown again after you leave this page. Make new credentials if you lose it.</p>
              </Callout>
            </>
          ) : (
            <p>The secret was shown once when it was made. Make new credentials to get a new one.</p>
          )}
          <Disclosure summary="How to add it in Jira">
            <ol className="flex list-decimal flex-col gap-1.5 pl-5">
              <li>Open <span className="text-zinc-200">your-site.atlassian.net/plugins/servlet/webhooks</span> and create a webhook.</li>
              <li>Paste the webhook address, and the secret in the secret field.</li>
              <li>Under events, choose Issue, updated. Save.</li>
              <li>Jira signs each request with the secret, so Coderhelm can tell it came from your site.</li>
            </ol>
          </Disclosure>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={make} disabled={!!busy} className={secondaryButton}>
              {busy === "make" ? "Making…" : "Make new credentials"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={!!busy}
              className={buttonClass("danger")}
            >
              {busy === "remove" ? "Removing…" : "Remove webhook"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Make a webhook address and signing secret for your team, then add them as a webhook in Jira.</p>
          <div>
            <button type="button" onClick={make} disabled={!!busy} className={primaryButton}>
              {busy === "make" ? "Making…" : "Make webhook credentials"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Projects ─────────────────────────────────────────────────────────

type ProjectsForm = { projects: JiraProject[]; default_project: string };

/** Projects compare by what can change on them; their order and other fields come from Jira. */
function sameProjectsField(a: unknown, b: unknown, k: keyof ProjectsForm): boolean {
  if (k !== "projects") return (a ?? "") === (b ?? "");
  const x = (a as JiraProject[]) ?? [];
  const y = (b as JiraProject[]) ?? [];
  return x.length === y.length && x.every((p, i) => p.key === y[i]?.key && !!p.enabled === !!y[i]?.enabled && (p.repo ?? "") === (y[i]?.repo ?? ""));
}

function ProjectsSection({ config, setConfig }: { config: JiraConfig; setConfig: (c: JiraConfig) => void }) {
  const { toast } = useToast();
  const form = useDirtyForm<ProjectsForm>({ projects: config.projects, default_project: config.default_project }, { same: sameProjectsField });
  const { reset } = form;
  const projects = form.values.projects;
  const [repos, setRepos] = useState<Repo[]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.listRepos().then((r) => setRepos(r.repos.filter((x) => x.enabled))).catch(() => {});
  }, []);

  const savedByKey = useMemo(() => new Map(form.saved.projects.map((p) => [p.key, p])), [form.saved.projects]);
  const changedProject = (p: JiraProject) => {
    const s = savedByKey.get(p.key);
    return !s || !!s.enabled !== !!p.enabled || (s.repo ?? "") !== (p.repo ?? "");
  };
  const count = projects.filter(changedProject).length + (form.isDirty("default_project") ? 1 : 0);

  const setProject = (k: string, patch: Partial<JiraProject>) =>
    form.set("projects", projects.map((x) => (x.key === k ? { ...x, ...patch } : x)));

  const fetchProjects = async () => {
    setFetching(true);
    try {
      const { projects: fetched } = await api.fetchJiraProjects();
      const existing = new Map(projects.map((p) => [p.key, p]));
      const merged = fetched.map((p) => ({ ...p, enabled: existing.get(p.key)?.enabled ?? false, repo: existing.get(p.key)?.repo ?? "" }));
      try {
        await api.updateJiraProjects(merged);
        setConfig({ ...config, projects: merged });
        reset({ ...form.values, projects: merged });
        toast(`Found ${merged.length} project${merged.length === 1 ? "" : "s"}`);
      } catch {
        toast("Could not save the project list", "error");
      }
    } catch {
      toast("Could not reach Jira to list the projects", "error");
    } finally {
      setFetching(false);
    }
  };

  const enabledProjects = projects.filter((p) => p.enabled);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects.filter((p) => !needle || p.key.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle));
  }, [projects, q]);

  const save = async () => {
    setSaving(true);
    setProblem(null);
    const next: ProjectsForm = { ...form.saved };
    const failed: string[] = [];
    if (form.isDirty("projects")) {
      try {
        await api.updateJiraProjects(projects);
        next.projects = projects;
      } catch {
        failed.push("the projects");
      }
    }
    if (form.isDirty("default_project")) {
      try {
        await api.updateJiraConfig({ default_project: form.values.default_project });
        next.default_project = form.values.default_project;
      } catch {
        failed.push("the default project");
      }
    }
    const edited = form.values;
    reset(next);
    setConfig({ ...config, projects: next.projects, default_project: next.default_project });
    if (failed.length) {
      form.update(edited);
      setProblem(`Could not save ${failed.join(" or ")}. Try again.`);
      toast("Could not save every change", "error");
    } else {
      toast("Jira projects saved");
    }
    setSaving(false);
  };

  return (
    <Section
      id="projects"
      title={`Projects that start work (${enabledProjects.length} on)`}
      description="Only tickets in projects that are on start runs. Set a repository to skip Coderhelm's own choice for that project."
      actions={
        <button type="button" onClick={fetchProjects} disabled={fetching || saving} className={secondaryButton}>
          {fetching ? "Listing…" : projects.length ? "Refresh from Jira" : "List projects from Jira"}
        </button>
      }
    >
      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
          No projects listed yet. Press List projects from Jira.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.length > 8 && (
            <>
              <label htmlFor="project-search" className="sr-only">Search projects</label>
              <input id="project-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${projects.length} projects`} className={`${inputClass} sm:max-w-sm`} />
            </>
          )}
          <div className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid="jira-projects">
            {shown.map((p) => (
              <SettingsRow
                key={p.key}
                testId={`project-${p.key}`}
                label={`${p.name} (${p.key})`}
                layout="toggle"
                unsaved={changedProject(p)}
                help={p.lead ? `Lead: ${p.lead}` : undefined}
                control={(ids) => (
                  <Switch id={ids.inputId} checked={!!p.enabled} onChange={(on) => setProject(p.key, { enabled: on })} labelledBy={ids.labelId} describedBy={ids.helpId} />
                )}
              >
                {p.enabled && repos.length > 0 ? (
                  <Field as="select" label="Repository" controlClassName="sm:w-72" value={p.repo ?? ""} onChange={(e) => setProject(p.key, { repo: e.target.value })}>
                    <option value="">Coderhelm picks</option>
                    {repos.map((r) => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </Field>
                ) : null}
              </SettingsRow>
            ))}
          </div>
          {shown.length === 0 && <p className="text-sm text-zinc-500">No project matches &ldquo;{q}&rdquo;.</p>}
        </div>
      )}

      {enabledProjects.length > 0 && (
        <div className="mt-6">
          <SettingsSection id="jira-plans" title="Plans">
            <SettingsRow
              label="Default project for tickets made from plans"
              controlClassName="sm:w-72"
              unsaved={form.isDirty("default_project")}
              control={(ids) => (
                <select
                  id={ids.inputId}
                  value={form.values.default_project}
                  onChange={(e) => form.set("default_project", e.target.value)}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {enabledProjects.map((p) => (
                    <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                  ))}
                </select>
              )}
            />
          </SettingsSection>
        </div>
      )}

      <SaveBar count={count} onSave={save} onDiscard={() => { form.discard(); setProblem(null); }} saving={saving} busy={fetching} problem={problem} />
    </Section>
  );
}

// ── Events ───────────────────────────────────────────────────────────

const EVENT_STATUS: Record<string, { tone: "success" | "neutral" | "error"; label: string }> = {
  processed: { tone: "success", label: "Handled" },
  filtered: { tone: "neutral", label: "Skipped" },
  error: { tone: "error", label: "Failed" },
  signature_rejected: { tone: "error", label: "Signature refused" },
};

function EventsList() {
  const [events, setEvents] = useState<JiraEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    api
      .listJiraEvents()
      .then((r) => {
        setEvents(r.events);
        setTotal(r.total ?? r.events.length);
      })
      .catch(() => {
        setError(true);
        setEvents((prev) => prev ?? []);
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (events === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (error) {
    return (
      <Callout variant="error" title="Could not load the Jira events">
        <p><button type="button" onClick={load} className={linkButton}>Try again</button></p>
      </Callout>
    );
  }
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
        No Jira events yet. Label and assign a ticket to send the first one.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-500">Showing {events.length} of {total}</p>
      <ul className="overflow-hidden rounded-lg border border-zinc-800 divide-y divide-zinc-800">
        {events.map((e) => {
          const st = EVENT_STATUS[e.status] ?? { tone: "neutral" as const, label: e.status.replace(/[_-]+/g, " ") };
          return (
            <li key={e.event_id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="shrink-0 text-xs font-medium text-zinc-300 sm:w-24">{e.ticket_key || "No ticket"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-zinc-100">{e.title || "Untitled ticket"}</span>
                <span className="block text-xs text-zinc-500">
                  {e.repo || "No repository"} · <time dateTime={e.created_at}>{timeAgo(e.created_at)}</time>
                </span>
              </span>
              <span className="shrink-0"><StatusPill tone={st.tone}>{st.label}</StatusPill></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
