"use client";

// The team's (self-hosted: the organization's) own Microsoft Entra tenant, for
// Require single sign-on. The owner enters the tenant ID (and on hosted the
// email domains, proven in DNS like Okta's), runs Test sign-in through that
// tenant as themselves, and turns it on within the hour. Sign in with
// Microsoft for everyone else is unchanged.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type MicrosoftTenantSettings } from "@/lib/api";
import { Code, Field, SettingsSection, Switch } from "@/components/settings";
import { MicrosoftMark } from "@/components/brand-icons";
import { StatusDot } from "@/components/list";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { buttonClass, fullWidthOnPhone } from "@/components/ui";

/** The sentence for a Test sign-in that came back failed (`?microsoft_test=failed&reason=`). */
export function microsoftTestFailure(reason: string | null): string {
  switch (reason) {
    case "cancelled":
      return "The test sign-in was cancelled at Microsoft. Run it again and finish signing in.";
    case "expired":
      return "The test took longer than 10 minutes, or finished in another browser. Run it again.";
    case "other_tenant":
      return "That account isn't in this tenant. Test with your work account in it.";
    case "no_verified_email":
      return "Microsoft didn't vouch for the account's email. Check the app's optional claims email and xms_edov.";
    case "domain":
      return "The test signed in someone whose email domain isn't in the list. Add the domain, or test with an account at one of them.";
    case "not_yours":
      return "That test link belongs to another session. Run Test sign-in again from this page.";
    case "changed":
    case "no_setup":
      return "The tenant changed during the test. Run Test sign-in again.";
    default:
      return "The test sign-in didn't finish. Run it again.";
  }
}

function when(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function MicrosoftSection({ selfHosted, isOwner }: { selfHosted: boolean; isOwner: boolean }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<MicrosoftTenantSettings | null>(null);
  const [tenant, setTenant] = useState("");
  const [domains, setDomains] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; reason: string | null } | null>(null);

  const fill = useCallback((d: MicrosoftTenantSettings) => {
    setData(d);
    setTenant(d.setup?.tenant_id ?? "");
    setDomains((d.setup?.domains ?? []).join(", "));
  }, []);
  const load = useCallback(() => {
    api.microsoftTenant().then(fill, () => setData(null));
  }, [fill]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("microsoft_test");
    if (outcome) {
      setResult({ passed: outcome === "passed", reason: params.get("reason") });
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
    load();
  }, [load]);

  if (!data || !data.available) return null;
  const setup = data.setup;

  const run = async (f: () => Promise<MicrosoftTenantSettings | void>, done?: string) => {
    setBusy(true);
    setError("");
    try {
      const d = await f();
      if (d) fill(d);
      if (done) toast(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const list = domains.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
    run(() => api.microsoftTenantSave(tenant.trim(), list), "Tenant saved. Run Test sign-in, then turn it on.");
  };

  const test = () =>
    run(async () => {
      const r = await api.microsoftTenantTest();
      window.location.assign(r.test_url);
    });

  const toggle = (on: boolean) => run(() => api.microsoftTenantEnabled(on), on ? "Your tenant is on" : "Your tenant is off");

  const remove = async () => {
    const ok = await confirm({
      title: "Remove your Microsoft tenant?",
      message: "Every member's link to it is dropped. Sign in with Microsoft keeps working as before.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) run(() => api.microsoftTenantRemove(), "Tenant removed");
  };

  return (
    <SettingsSection
      id="microsoft"
      title="Microsoft Entra (your own tenant)"
      description={`For Require single sign-on with Microsoft: only accounts in ${selfHosted ? "the organization's" : "this team's"} own tenant count, never personal accounts or other companies' tenants. Members link their account in Settings, Security.`}
    >
      <div className="space-y-4 px-4 py-4" data-testid="microsoft-tenant">
        {setup && (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <MicrosoftMark />
              <StatusDot tone={setup.enabled ? "success" : "muted"} />
              <span id="ms-tenant-label" className="text-zinc-200">
                {setup.enabled ? "On" : "Off"}
                {setup.tested_at ? `, tested ${when(setup.tested_at)}` : ", not tested yet"}
              </span>
            </p>
            <Switch
              checked={setup.enabled}
              onChange={toggle}
              labelledBy="ms-tenant-label"
              disabled={busy || !isOwner}
              testId="microsoft-tenant-enabled"
            />
          </div>
        )}
        {result?.passed && <p role="status" className="text-sm text-emerald-300">Test sign-in passed. Turn it on within the hour.</p>}
        {result && !result.passed && (
          <p role="alert" className="text-sm text-red-300" data-testid="microsoft-test-failed">
            {microsoftTestFailure(result.reason)}
          </p>
        )}
        <p className="text-sm text-zinc-400">
          The deployment&apos;s Microsoft app redirects to <Code>{data.redirect_uri}</Code>.
        </p>
        <form onSubmit={save} className="space-y-3">
          <Field
            id="ms-tenant"
            label="Tenant ID"
            help="Microsoft Entra admin center, Overview: a GUID."
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
          />
          {!selfHosted && (
            <Field
              id="ms-domains"
              label="Email domains"
              help="The domains your people sign in with, such as example.com. Each is proven with the DNS TXT record shown below."
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
            />
          )}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !isOwner || !tenant.trim()} className={`${buttonClass("secondary")} ${fullWidthOnPhone}`}>
              Save tenant
            </button>
            {setup && (
              <button type="button" onClick={test} disabled={busy || !isOwner} className={`${buttonClass("primary")} ${fullWidthOnPhone}`} data-testid="microsoft-test">
                Test sign-in
              </button>
            )}
            {setup && (
              <button type="button" onClick={remove} disabled={busy || !isOwner} className={`${buttonClass("ghost")} ${fullWidthOnPhone}`}>
                Remove
              </button>
            )}
          </div>
          {!isOwner && <p className="text-sm text-zinc-400">Only the owner can change the tenant.</p>}
        </form>
        {(data.domains ?? []).length > 0 && (
          <button
            type="button"
            onClick={() => run(async () => { await api.oktaVerifyDomains(); load(); }, "Domains checked")}
            disabled={busy}
            className={`${buttonClass("secondary", "sm")} ${fullWidthOnPhone}`}
            data-testid="microsoft-verify-domains"
          >
            Verify domains
          </button>
        )}
        {(data.domains ?? []).length > 0 && (
          <ul className="space-y-2">
            {data.domains.map((d) => (
              <li key={d.domain} className="min-w-0 rounded-md border border-zinc-800 px-3 py-2 text-sm" data-testid="microsoft-domain">
                <p className="flex min-w-0 items-center gap-2">
                  <StatusDot tone={d.failing_since ? "attention" : d.verified_at ? "success" : "muted"} />
                  <span className="text-zinc-100 [overflow-wrap:anywhere]">{d.domain}</span>
                  <span className="text-zinc-400">{d.verified_at ? `Verified ${when(d.verified_at)}` : d.other_team ? "Verified by another team" : "Not verified"}</span>
                </p>
                {!d.verified_at && (
                  <p className="mt-1 text-zinc-400 [overflow-wrap:anywhere]">
                    TXT <Code>{d.txt_name}</Code> = <Code>{d.txt_value}</Code>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsSection>
  );
}
