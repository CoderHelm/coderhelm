"use client";

// Okta sign-in for this team (hosted) or the organization (self-hosted). An
// admin enters the Okta domain or issuer, the client ID and secret, runs Test
// sign-in (Okta asks for a password, nothing changes for anyone else), and
// only settings whose test passed can be saved and turned on. The secret is
// sealed on the server and never comes back here.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type OktaSettings, type OktaSetup } from "@/lib/api";
import { Code, Field, SettingsSection, Switch } from "@/components/settings";
import { CopyButton } from "@/components/copy-button";
import { OktaMark } from "@/components/brand-icons";
import { StatusDot } from "@/components/list";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { buttonClass, fullWidthOnPhone } from "@/components/ui";

/** The sentence for a Test sign-in that came back failed (`?okta_test=failed&reason=`). */
export function oktaTestFailure(reason: string | null): string {
  switch (reason) {
    case "cancelled":
      return "The test sign-in was cancelled in Okta. Run it again and finish signing in.";
    case "expired":
      return "The test took longer than 10 minutes, or finished in another browser. Run it again.";
    case "discovery":
      return "Coderhelm couldn't read your Okta's sign-in settings. Check the Okta domain or issuer.";
    case "token_exchange":
      return "Okta didn't accept the client ID and secret. Check both, and that the app's sign-in redirect URI is the address above.";
    case "id_token":
      return "Okta's answer didn't pass Coderhelm's checks (issuer, client ID, signature). Check the issuer: use the one in your Okta app's sign-in settings.";
    case "no_verified_email":
      return "Okta didn't share a verified email address. Give the app the email scope, and check the person's email is verified in Okta.";
    case "domain":
      return "The test signed in someone whose email domain isn't in the list. Add the domain, or test with an account at one of them.";
    case "not_yours":
      return "That test link belongs to another admin's session. Run Test sign-in again from this page.";
    case "no_draft":
    case "changed":
      return "These settings changed during the test. Run Test sign-in again.";
    default:
      return "The test sign-in didn't finish. Run it again.";
  }
}

function splitDomains(v: string): string[] {
  return v
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

function when(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function OktaSection({ selfHosted }: { selfHosted: boolean }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<OktaSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [domains, setDomains] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The outcome of a Test sign-in, read once from the address it came back to.
  const [result, setResult] = useState<{ passed: boolean; reason: string | null } | null>(null);

  const fill = useCallback((d: OktaSettings) => {
    const from: OktaSetup | null = d.draft ?? d.live;
    setIssuer(from?.issuer ?? "");
    setClientId(from?.client_id ?? "");
    setDomains((from?.domains ?? []).join(", "));
    setSecret("");
  }, []);

  const load = useCallback(() => {
    setFailed(false);
    api.oktaSettings().then(
      (d) => {
        setData(d);
        fill(d);
      },
      () => setFailed(true),
    );
  }, [fill]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("okta_test");
    if (outcome) {
      setResult({ passed: outcome === "passed", reason: params.get("reason") });
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
    load();
  }, [load]);

  const draft = data?.draft ?? null;
  const live = data?.live ?? null;
  const hasSecret = !!(draft?.has_secret || live?.has_secret);
  const domainsRequired = !selfHosted;

  const test = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api.oktaTest({
        issuer: issuer.trim(),
        client_id: clientId.trim(),
        client_secret: secret.trim() || undefined,
        domains: splitDomains(domains),
      });
      // Okta asks for a password, then comes back to this page with the outcome.
      window.location.assign(r.test_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the test. Try again.");
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      if (!draft) return;
      const d = await api.oktaSave(true, { issuer: draft.issuer, client_id: draft.client_id, updated_at: draft.updated_at });
      setData(d);
      fill(d);
      setResult(null);
      toast("Okta sign-in is on");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (on: boolean) => {
    if (!on) {
      const ok = await confirm({
        title: "Turn off Okta sign-in?",
        message: "People who signed in with Okta keep their accounts. Until it's back on, they sign in another way.",
        confirmLabel: "Turn off",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const d = await api.oktaToggle(on);
      setData(d);
      toast(on ? "Okta sign-in is on" : "Okta sign-in is off");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Remove Okta sign-in?",
      message: "This removes the Okta settings and secret. People who signed in with Okta keep their accounts and sign in another way.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d = await api.oktaRemove();
      setData(d);
      fill(d);
      setResult(null);
      toast("Okta sign-in removed");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't remove it. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const d = await api.oktaVerifyDomains();
      setData(d);
      const left = (d.domains ?? []).filter((x) => !x.verified_at).map((x) => x.domain);
      toast(left.length ? `Not verified yet: ${left.join(", ")}. DNS can take a while to publish.` : "Every domain is verified", left.length ? "error" : undefined);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't check the domains. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const release = async (domain: string) => {
    const ok = await confirm({
      title: `Release ${domain}?`,
      message: "Okta sign-in stops for emails at this domain until it's verified again.",
      confirmLabel: "Release",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setData(await api.oktaReleaseDomain(domain));
      toast(`${domain} released`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't release it. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      const d = await api.oktaDiscardDraft();
      setData(d);
      fill(d);
      setResult(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't discard the changes. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const description = selfHosted
    ? "Let people sign in with your Okta. Each member links their own Okta account in Settings, Security first, and two-factor sign-in still applies. Only the owner can save it or turn it on."
    : "Let people on this team sign in with your Okta. Each member links their own Okta account in Settings, Security first, emails must be at domains you prove in DNS, and two-factor sign-in still applies. Only the owner can save it or turn it on.";

  return (
    <SettingsSection id="okta" title="Okta sign-in" description={description}>
      <div className="space-y-5 px-4 py-4" data-testid="okta-settings">
        {failed ? (
          <Problem title="Couldn't load the Okta settings" onRetry={load}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        ) : !data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {live && (
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-4" data-testid="okta-live">
                <div className="min-w-0">
                  <p id="okta-on-label" className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <OktaMark />
                    Sign in with Okta
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <StatusDot tone={live.enabled ? "success" : "muted"} />
                    <span className="text-zinc-300 [overflow-wrap:anywhere]">
                      {live.enabled ? "On" : "Off"}: {live.issuer}
                      {live.domains.length > 0 ? ` for ${live.domains.join(", ")}` : ""}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={live.enabled} onChange={toggle} labelledBy="okta-on-label" disabled={busy} testId="okta-enabled" />
                  <button type="button" onClick={remove} disabled={busy} className={buttonClass("ghost", "sm")}>
                    Remove
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-zinc-200">Sign-in redirect URI</p>
              <p className="text-sm text-zinc-400">
                In Okta, create an app integration: OIDC, Web Application. Put this address in its Sign-in redirect URIs.
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 text-sm" data-testid="okta-callback">
                  <Code>{data.callback_url}</Code>
                </span>
                <CopyButton text={data.callback_url} label="Copy" />
              </div>
            </div>

            {!selfHosted && (data.domains ?? []).length > 0 && (
              <div className="space-y-2" data-testid="okta-domains">
                <p className="text-sm font-medium text-zinc-200">Prove each email domain</p>
                <p className="text-sm text-zinc-400">
                  Add each TXT record in your domain&apos;s DNS, then choose Verify domains. Okta sign-in turns on only when every domain is verified.
                </p>
                <ul className="space-y-2">
                  {(data.domains ?? []).map((d) => (
                    <li key={d.domain} className="min-w-0 rounded-md border border-zinc-800 px-3 py-2 text-sm" data-testid="okta-domain">
                      <p className="flex min-w-0 items-center gap-2">
                        <StatusDot tone={d.failing_since ? "attention" : d.verified_at ? "success" : d.other_team ? "attention" : "muted"} />
                        <span className="text-zinc-100 [overflow-wrap:anywhere]">{d.domain}</span>
                        <span className="text-zinc-400" data-testid="okta-domain-state">
                          {d.failing_since
                            ? `TXT record missing since ${when(d.failing_since)}: add it back, then Verify domains`
                            : d.verified_at
                              ? `Verified ${when(d.verified_at)}`
                              : d.other_team
                                ? "Verified by another team"
                                : "Not verified"}
                        </span>
                        {d.verified_at && (
                          <button type="button" onClick={() => release(d.domain)} disabled={busy} className={buttonClass("ghost", "sm")}>
                            Release
                          </button>
                        )}
                      </p>
                      {!d.verified_at && !d.other_team && (
                        <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                          <dt className="text-zinc-400">Name</dt>
                          <dd className="flex min-w-0 flex-wrap items-center gap-2">
                            <Code>{d.txt_name}</Code>
                            <CopyButton text={d.txt_name} label="Copy" />
                          </dd>
                          <dt className="text-zinc-400">Value</dt>
                          <dd className="flex min-w-0 flex-wrap items-center gap-2">
                            <Code>{d.txt_value}</Code>
                            <CopyButton text={d.txt_value} label="Copy" />
                          </dd>
                        </dl>
                      )}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={verify} disabled={busy} className={`${buttonClass("secondary")} ${fullWidthOnPhone}`}>
                  Verify domains
                </button>
              </div>
            )}

            {result?.passed && draft?.tested_at && (
              <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300" data-testid="okta-test-passed">
                <p className="[overflow-wrap:anywhere]">
                  Test sign-in passed{draft.tested_email ? ` as ${draft.tested_email}` : ""}. Save to turn Okta sign-in on.
                </p>
              </div>
            )}
            {result && !result.passed && (
              <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300" data-testid="okta-test-failed">
                {oktaTestFailure(result.reason)}
              </div>
            )}

            <form onSubmit={test} className="space-y-4" aria-label="Okta settings">
              <Field
                id="okta-issuer"
                label="Okta domain or issuer"
                help="Such as acme.okta.com, or https://acme.okta.com/oauth2/default for a custom authorization server."
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
              />
              <Field
                id="okta-client-id"
                label="Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
                mono
              />
              <Field
                id="okta-client-secret"
                label="Client secret"
                type="password"
                help={hasSecret ? "Saved, and never shown again. Leave empty to keep it while the Okta domain and Client ID stay the same." : "Kept encrypted. Never shown again."}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="new-password"
                required={!hasSecret}
              />
              <Field
                id="okta-domains"
                label={domainsRequired ? "Email domains" : "Email domains (optional)"}
                help={
                  domainsRequired
                    ? "The work email domains that sign in with this Okta, such as example.com. Separate several with commas."
                    : "Leave empty to use the organization's allowed email domains, or everyone when there are none."
                }
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                required={domainsRequired}
              />
              {error && (
                <p role="alert" className="text-sm text-red-400" data-testid="okta-error">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <button type="submit" disabled={busy || !issuer.trim() || !clientId.trim() || (!hasSecret && !secret.trim())} className={`${buttonClass("secondary")} ${fullWidthOnPhone}`}>
                  {busy ? "Working…" : "Test sign-in"}
                </button>
                {draft?.tested_at && (
                  <button type="button" onClick={save} disabled={busy} className={`${buttonClass("primary")} ${fullWidthOnPhone}`}>
                    Save and turn on
                  </button>
                )}
                {draft && (
                  <button type="button" onClick={discard} disabled={busy} className={`${buttonClass("ghost")} ${fullWidthOnPhone}`}>
                    Discard changes
                  </button>
                )}
              </div>
              <p className="text-sm text-zinc-400">
                Test sign-in opens your Okta and asks you to sign in. Nothing changes for anyone else until a test passes and you save.
                {draft?.tested_at ? ` Last test passed ${when(draft.tested_at)}.` : ""}
              </p>
            </form>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
