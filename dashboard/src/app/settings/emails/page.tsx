"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type EmailTransport, type SystemEmails } from "@/lib/api";
import { useInstallAdmin } from "@/lib/install";
import { useToast } from "@/components/toast";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Redirect } from "@/components/redirect";
import { StatusPill } from "@/components/status-pill";
import { linkButton, secondaryButton } from "@/components/ui";
import { SettingsRow, SettingsSection, Switch } from "@/components/settings";

/**
 * Settings, then Emails (self-hosted installs, install admins): which
 * optional emails the install sends (all off until an admin turns them on),
 * the essential ones and why they are needed, and how email leaves: the
 * install's own Amazon SES, or Coderhelm's mail service. Each person's own
 * unsubscribe (Settings, Notifications) still applies on top.
 */
export default function EmailsPage() {
  const { ready, allowed } = useInstallAdmin();
  if (!ready) return null;
  if (!allowed) {
    return (
      <Page>
        <div data-testid="emails-unavailable">
          <Redirect to="/settings/" />
        </div>
      </Page>
    );
  }
  return <Emails />;
}

const TRANSPORTS: { value: EmailTransport; label: string; help: string }[] = [
  {
    value: "ses",
    label: "Through my own Amazon SES",
    help: "Email leaves from this install's AWS account and its sender address, once the sender is verified.",
  },
  {
    value: "coderhelm",
    label: "Through Coderhelm (easiest)",
    help: "No SES setup. Coderhelm sends from its own address with your install's name, only to your install's people and pending invites.",
  },
];

function Emails() {
  const { toast } = useToast();
  const [data, setData] = useState<SystemEmails | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    api.getSystemEmails().then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const save = async (change: { optional?: Record<string, boolean>; transport?: EmailTransport }, what: string) => {
    setSaving(what);
    const before = data;
    // Show the choice at once; put it back if the save fails.
    if (data) {
      setData({
        ...data,
        transport: change.transport ?? data.transport,
        optional: data.optional.map((o) => (change.optional && o.id in change.optional ? { ...o, on: change.optional[o.id] } : o)),
      });
    }
    try {
      const next = await api.setSystemEmails(change);
      setData(next);
      toast("Saved", "success");
    } catch (e) {
      if (before) setData(before);
      const msg = e instanceof ApiError ? e.message : "Couldn't save. Check your connection and try again.";
      toast(msg, "error");
    } finally {
      setSaving(null);
    }
  };

  const header = (
    <div className="mb-6">
      <PageHeader
        title="Emails"
        lead="Optional emails stay off until you turn them on. Essential emails always go out. Each person can still turn their own emails off in Notifications."
      />
    </div>
  );

  if (failed) {
    return (
      <Page>
        {header}
        <Callout variant="error" title="Couldn't load this install's email settings">
          <button type="button" onClick={load} className={`mt-2 ${secondaryButton}`}>Try again</button>
        </Callout>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        {header}
        <div className="max-w-3xl space-y-6" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Page>
    );
  }

  const relayStatus = data.relay.status;
  const relayError = relayStatus && "error" in relayStatus ? relayStatus : null;
  const relayOk = relayStatus && !("error" in relayStatus) ? relayStatus : null;

  return (
    <Page>
      {header}
      <div className="max-w-3xl space-y-8" data-testid="emails-page">
        <SettingsSection
          id="optional"
          title="Optional emails"
          description="Off on a new install. Turning one on sends it to everyone on the install who hasn't turned it off for themselves."
        >
          {data.optional.map((o) => (
            <SettingsRow
              key={o.id}
              label={o.label}
              help={o.description}
              layout="toggle"
              testId={`optional-${o.id}`}
              control={(ids) => (
                <Switch
                  id={ids.inputId}
                  checked={o.on}
                  labelledBy={ids.labelId}
                  describedBy={ids.helpId}
                  disabled={saving !== null}
                  onChange={(on) => save({ optional: { [o.id]: on } }, o.id)}
                />
              )}
            />
          ))}
        </SettingsSection>

        <section aria-labelledby="send-heading" className="min-w-0" data-testid="transport">
          <h2 id="send-heading" className="text-sm font-semibold text-zinc-100">Send email</h2>
          <p className="mt-1 max-w-prose text-sm text-zinc-400">
            Applies to every email: invites, approvals, alerts, and the optional ones you turned on. Nothing falls back to the other way if the one you chose fails.
          </p>
          <div role="radiogroup" aria-labelledby="send-heading" className="mt-3 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
            {TRANSPORTS.map((t) => {
              const checked = data.transport === t.value;
              const blocked = t.value === "coderhelm" && !data.relay.available && !checked;
              return (
                <label
                  key={t.value}
                  className={`flex min-w-0 cursor-pointer gap-3 px-4 py-4 ${blocked ? "cursor-not-allowed opacity-60" : ""}`}
                  data-testid={`transport-${t.value}`}
                >
                  <input
                    type="radio"
                    name="transport"
                    value={t.value}
                    checked={checked}
                    disabled={blocked || saving !== null}
                    onChange={() => save({ transport: t.value }, "transport")}
                    className="mt-1 h-4 w-4 shrink-0 accent-sky-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-zinc-100">{t.label}</span>
                    <span className="mt-0.5 block max-w-prose text-sm text-zinc-400">{t.help}</span>
                    {t.value === "ses" && (
                      <span className="mt-2 block max-w-prose text-sm text-zinc-400">
                        {data.ses.from ? <>Sends from <span className="wrap-anywhere text-zinc-200">{data.ses.from}</span>. </> : null}
                        {data.ses.note}{" "}
                        <Link href="/settings/setup#email" className={linkButton}>Check email setup</Link>
                      </span>
                    )}
                    {t.value === "coderhelm" && (
                      <span className="mt-2 block max-w-prose text-sm text-zinc-400" data-testid="relay-trust">
                        {data.relay.trust}
                        {blocked && (
                          <>
                            {" "}
                            {data.relay.turned_off
                              ? "This install's config turned hybrid off."
                              : "Register this install with Coderhelm first, in "}
                            {!data.relay.turned_off && (
                              <Link href="/settings/system#hybrid" className={linkButton}>System, Hybrid</Link>
                            )}
                            {!data.relay.turned_off && "."}
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          {data.transport === "coderhelm" && relayError && (
            <div className="mt-3">
              <Callout variant="error" title="Coderhelm's mail service didn't answer">
                <p>{relayError.message} Nothing is sent another way meanwhile; Deliveries lists each email that failed.</p>
              </Callout>
            </div>
          )}
          {data.transport === "coderhelm" && relayOk?.paused && (
            <div className="mt-3">
              <Callout variant="error" title="Email is paused for this install">
                <p>Coderhelm paused email after too many {relayOk.paused.reason}. Fix the addresses in Deliveries, then ask Coderhelm support to resume, or switch to your own Amazon SES.</p>
              </Callout>
            </div>
          )}
          {data.transport === "coderhelm" && relayOk && !relayOk.paused && (
            <p className="mt-3 text-sm text-zinc-400" data-testid="relay-status">
              <StatusPill tone="success">Working</StatusPill>{" "}
              Sends as <span className="wrap-anywhere text-zinc-200">{relayOk.display_name}</span>. {relayOk.sent_today} of {relayOk.quota} sent today.
            </p>
          )}
        </section>

        <SettingsSection
          id="essential"
          title="Essential emails"
          description="Always sent: Coderhelm can't work without them. They can't be turned off here."
        >
          {data.essential.map((e) => (
            <div key={e.id} className="min-w-0 px-4 py-4" data-testid={`essential-${e.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-zinc-100">{e.label}</span>
                <StatusPill tone="neutral">Always on</StatusPill>
              </div>
              <p className="mt-0.5 max-w-prose text-sm text-zinc-400">{e.why}</p>
            </div>
          ))}
        </SettingsSection>
      </div>
    </Page>
  );
}
