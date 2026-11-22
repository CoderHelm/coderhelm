"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { Modal } from "@/components/modal";
import { StatusDot } from "@/components/list";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Field, SettingsSection, Switch } from "@/components/settings";
import { api, ApiError, errorStatus, type SignInSettings, type SsoOption, type SsoProvider, type UnlinkedMember } from "@/lib/api";
import { apiBase, isSelfHosted } from "@/lib/runtime-config";
import { buttonClass, fullWidthOnPhone, linkButton, smallSecondaryButton } from "@/components/ui";
import { OktaSection } from "./okta-section";
import { MicrosoftSection } from "./microsoft-section";

export default function SignInSettingsGuarded() {
  return (
    <RoleGuard need="sign_in">
      <SignInSettingsPage />
    </RoleGuard>
  );
}

type Person = NonNullable<SignInSettings["people"]>[number];

function who(p: Person): string {
  return p.name || p.email || (p.github_login ? `@${p.github_login}` : "A member");
}

function SignInSettingsPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<SignInSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [domainError, setDomainError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<Person | null>(null);
  const [claimUrl, setClaimUrl] = useState<{ who: string; url: string } | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    api.signInSettings().then(setData, () => setFailed(true));
  }, []);
  useEffect(load, [load]);

  // A self-hosted install is one organization (who may join, and one rule);
  // on hosted each team has its own rule.
  const selfHosted = data ? data.self_hosted : isSelfHosted();
  const header = (
    <div className="mb-6">
      <PageHeader
        title="Sign-in rules"
        lead={
          selfHosted
            ? "This install is for one organization. Admins add people, choose whether everyone must use two-factor sign-in, and can require single sign-on with Okta or Microsoft Entra."
            : "Choose whether everyone on this team must use two-factor sign-in, see who has it set up, and require single sign-on with Okta or Microsoft Entra."
        }
      />
    </div>
  );

  if (failed) {
    return (
      <Page>
        {header}
        <div className="max-w-3xl">
          <Problem title="Couldn't load the sign-in settings" onRetry={load}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        </div>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        {header}
        <div className="max-w-3xl space-y-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </Page>
    );
  }
  const domains = data.domains ?? [];
  const people = data.people ?? [];
  const keys = data.api_keys ?? [];
  const required = !!data.require_2fa;
  const withFactor = people.filter((p) => p.two_factor).length;
  const without = data.without_2fa ?? people.length - withFactor;
  const everyone = selfHosted ? "everyone" : "everyone on this team";

  const saveDomains = async (next: string[]) => {
    setSaving(true);
    setDomainError("");
    try {
      const r = await api.updateSignInSettings({ domains: next });
      setData({ ...data, domains: r.domains });
      toast(r.domains.length ? "Allowed domains saved" : "Only people you invite can join now");
    } catch (e) {
      setDomainError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeDomain = async (d: string) => {
    const ok = await confirm({
      title: `Stop letting people at ${d} join?`,
      message: "People already in the organization stay. New people at this domain will need an invite.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) saveDomains(domains.filter((x) => x !== d));
  };

  const setRequired = async (on: boolean) => {
    if (on) {
      const ok = await confirm({
        title: `Require two-factor sign-in for ${everyone}?`,
        message:
          without > 0
            ? `${without} ${without === 1 ? "person hasn't" : "people haven't"} set it up yet. We'll email ${without === 1 ? "them" : "each of them"} now. At their next request they'll see a setup screen, and nothing else works until they finish. API keys keep working.`
            : "Everyone has set it up. Anyone who joins later sets it up at their first sign-in. API keys keep working.",
        confirmLabel: "Require it",
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: "Stop requiring two-factor sign-in?",
        message: "People who set it up keep it. Others can sign in with only a password, Google, GitHub, Microsoft or Okta.",
        confirmLabel: "Stop requiring it",
        destructive: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const r = await api.updateSignInSettings({ require_2fa: on });
      setData({ ...data, require_2fa: r.require_2fa, require_2fa_since: r.require_2fa_since });
      toast(
        !on
          ? "Two-factor sign-in is no longer required"
          : r.notified
            ? `Two-factor sign-in is required. Emailed ${r.notified} ${r.notified === 1 ? "person who hasn't" : "people who haven't"} set it up.`
            : "Two-factor sign-in is required",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const canTurnOn = !!data.your_session_has_2fa;

  const ssoRequired: SsoProvider | null = data.require_sso ?? null;
  const selfEmail = people.find((p) => p.is_self)?.email ?? "";
  const teamId = data.team_id ?? "";
  const options = data.sso_options ?? [];
  const inUse = options.find((o) => o.provider === ssoRequired) ?? null;
  const claims = data.claim_links ?? [];
  const isOwner = options.some((o) => o.is_owner);
  const names = (list: UnlinkedMember[]) => list.map((m) => m.name || m.email || "A member").join(", ");

  const sendRequireSso = async (to: SsoProvider | "", acknowledge: boolean) => {
    const r = await api.updateSignInSettings(to ? { require_sso: to, acknowledge_unlinked: acknowledge } : { require_sso: "" });
    toast(to ? "Single sign-on is required. Sessions on this team from any other way in ended." : "Single sign-on is no longer required");
    setData({ ...data, require_sso: r.require_sso ?? null, require_sso_since: r.require_sso_since ?? null });
    load();
  };

  const turnOn = async (o: SsoOption) => {
    const ok = await confirm({
      title: `Require single sign-on with ${o.name} for ${everyone}?`,
      message: `${o.recovery}${
        o.unlinked.length > 0
          ? ` ${o.unlinked.length} ${o.unlinked.length === 1 ? "person hasn't" : "people haven't"} linked ${o.name} yet and can't sign in until an admin gives them a one-time link: ${names(o.unlinked)}.`
          : ""
      } Every session on this team from any other way in ends now, the owner's included. API keys and CI tokens keep working.`,
      confirmLabel: `Require ${o.name}`,
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await sendRequireSso(o.provider, true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "unlinked_members") {
        const list = Array.isArray(e.body?.unlinked) ? (e.body.unlinked as UnlinkedMember[]) : [];
        const again = await confirm({
          title: `Some people haven't linked ${o.name}`,
          message: `${names(list)} can't sign in while single sign-on is required, until an admin gives them a one-time link. Require it anyway?`,
          confirmLabel: `Require ${o.name}`,
          destructive: true,
        });
        if (again) {
          try {
            await sendRequireSso(o.provider, true);
          } catch (e2) {
            toast(e2 instanceof Error ? e2.message : "Couldn't save. Try again.", "error");
          }
        }
      } else {
        toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
      }
      load();
    } finally {
      setSaving(false);
    }
  };

  const turnOff = async () => {
    const ok = await confirm({
      title: "Stop requiring single sign-on?",
      message: "People can sign in with their password, Google, GitHub, Microsoft or Okta again.",
      confirmLabel: "Stop requiring it",
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await sendRequireSso("", false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
      load();
    } finally {
      setSaving(false);
    }
  };

  const makeClaim = async (m: UnlinkedMember) => {
    try {
      const r = await api.issueClaimLink(m.user_id);
      setClaimUrl({ who: m.name || m.email, url: r.url });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't make the link. Try again.", "error");
    }
  };
  const revokeClaim = async (userId: string) => {
    try {
      await api.revokeClaimLink(userId);
      toast("Link revoked");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't revoke it. Try again.", "error");
    }
  };

  return (
    <Page>
      {header}
      <div className="max-w-3xl space-y-8">
        {selfHosted && (
          <SettingsSection
            id="who-may-join"
            title="Who may join"
            description="Nobody can sign up on their own. An admin adds each person in Team, and they get an invite email with the link to set up their account."
          >
            <div className="space-y-4 px-4 py-4">
              <p className="text-sm text-zinc-300">
                {data.pending_invites
                  ? `${data.pending_invites} ${data.pending_invites === 1 ? "invite is" : "invites are"} waiting. `
                  : ""}
                <Link href="/settings/team" className={linkButton}>
                  Invite people in Team
                </Link>
              </p>
              {domains.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-200">Email domains from your install&apos;s setup</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    People with an email at these domains can also join. Remove one to make joining invite-only for it.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2" data-testid="domains">
                    {domains.map((d) => (
                      <li key={d} className="flex min-w-0 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 py-0.5 pl-3 pr-1 text-sm text-zinc-200">
                        <span className="[overflow-wrap:anywhere]">{d}</span>
                        <button
                          type="button"
                          onClick={() => removeDomain(d)}
                          disabled={saving}
                          aria-label={`Remove ${d}`}
                          className={buttonClass("ghost", "sm")}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  {domainError && <p className="mt-2 text-sm text-red-400" role="alert">{domainError}</p>}
                </div>
              )}
            </div>
          </SettingsSection>
        )}

        <SettingsSection
          id="two-factor"
          title="Two-factor sign-in"
          description="Everyone signs in with a code from an authenticator app too: after their password, and after Google, GitHub, Microsoft or Okta."
        >
          <div className="space-y-3 px-4 py-4">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <p id="require-2fa-label" className="text-sm font-medium text-zinc-100">
                  {selfHosted ? "Require two-factor sign-in" : "Require two-factor sign-in for this team"}
                </p>
                <p id="require-2fa-help" className="mt-0.5 text-sm text-zinc-400">
                  {required
                    ? `Required${data.require_2fa_since ? ` since ${new Date(data.require_2fa_since).toLocaleDateString()}` : ""}. People without it see a setup screen and nothing else.`
                    : "Off: each person chooses for themselves in Settings, Security."}
                </p>
                <p className="mt-1.5 flex items-center gap-2 text-sm" data-testid="without-2fa">
                  <StatusDot tone={without === 0 ? "success" : required ? "attention" : "muted"} />
                  <span className={without === 0 ? "text-zinc-300" : "text-zinc-200"}>
                    {without === 0
                      ? "Everyone has set it up."
                      : `${without} of ${people.length} ${people.length === 1 ? "person" : "people"} ${without === 1 ? "hasn't" : "haven't"} set it up yet.`}
                  </span>
                </p>
              </div>
              <Switch
                checked={required}
                onChange={setRequired}
                labelledBy="require-2fa-label"
                describedBy="require-2fa-help"
                disabled={saving || (!required && !canTurnOn)}
                testId="require-2fa"
              />
            </div>
            {!required && !canTurnOn && (
              <p className="text-sm text-amber-300" data-testid="set-up-yours-first">
                Set it up for yourself first in{" "}
                <Link href="/settings/security" className={linkButton}>
                  Settings, Security
                </Link>
                , then sign out and sign in again with your code. Then you can require it for {everyone}.
              </p>
            )}
          </div>
        </SettingsSection>

        {data.is_org !== false && (
          <SettingsSection
            id="require-sso"
            title="Require single sign-on"
            description={`While it's on, ${everyone} signs in only with ${selfHosted ? "the organization's" : "this team's"} own identity provider: its Okta, or its Microsoft Entra tenant. Password, Google, GitHub and every other Microsoft account stop working${selfHosted ? "" : " for this team"}, for everyone, the owner included, and sessions that started another way end at once.`}
          >
            <div className="space-y-5 px-4 py-4">
              <p className="text-sm text-zinc-300" data-testid="require-sso-state">
                {inUse
                  ? `Required with ${inUse.name}${data.require_sso_since ? ` since ${new Date(data.require_sso_since).toLocaleDateString()}` : ""}. Only the owner can turn it off.`
                  : "Off: people sign in any way this Coderhelm offers."}
              </p>
              {inUse && (
                <div className="space-y-3">
                  <p className="text-sm text-amber-300" data-testid="sso-recovery">{inUse.recovery}</p>
                  <button
                    type="button"
                    onClick={turnOff}
                    disabled={saving || !inUse.is_owner}
                    className={buttonClass("danger", "sm")}
                    data-testid="require-sso-off"
                  >
                    Stop requiring single sign-on
                  </button>
                </div>
              )}
              {!inUse &&
                options.map((o) => (
                  <div key={o.provider} className="space-y-2 rounded-md border border-zinc-800 px-3 py-3" data-testid={`sso-option-${o.provider}`}>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-zinc-100">{o.name}</p>
                      <button
                        type="button"
                        onClick={() => turnOn(o)}
                        disabled={saving || !o.ready}
                        className={buttonClass("primary", "sm")}
                        data-testid={`require-sso-${o.provider}`}
                      >
                        Require {o.name}
                      </button>
                    </div>
                    {!o.ready && (
                      <ul className="space-y-1 text-sm">
                        <Need ok={o.is_owner} testId={`need-owner-${o.provider}`}>
                          Only the owner can turn it on or off.
                        </Need>
                        <Need ok={o.set_up && o.enabled} testId={`need-on-${o.provider}`}>
                          {o.set_up ? `Turn ${o.name} sign-in on below.` : `Set up ${o.name} for ${selfHosted ? "the organization" : "this team"} below and turn it on.`}
                        </Need>
                        {!selfHosted && (
                          <Need ok={o.domains_verified} testId={`need-domains-${o.provider}`}>
                            Verify every email domain of the {o.name} setup in DNS.
                          </Need>
                        )}
                        <Need ok={o.session_from_provider} testId={`need-session-${o.provider}`}>
                          <span>Sign in with {selfHosted ? "the organization's" : "this team's"} {o.name} yourself first, as the account you linked, so you know it works for you.</span>
                          {!o.session_from_provider && o.set_up && o.enabled && o.provider === "okta" && selfEmail && (
                            <form method="post" action={`${apiBase()}/auth/okta`} className="mt-1">
                              <input type="hidden" name="email" value={selfEmail} />
                              <button type="submit" className={linkButton} data-testid="sign-in-with-okta">
                                Sign in with Okta
                              </button>
                            </form>
                          )}
                          {!o.session_from_provider && o.set_up && o.enabled && o.provider === "microsoft" && (
                            <a href={`${apiBase()}/auth/microsoft?team_id=${encodeURIComponent(teamId)}`} className={`mt-1 inline-block ${linkButton}`} data-testid="sign-in-with-microsoft">
                              Sign in with Microsoft
                            </a>
                          )}
                        </Need>
                      </ul>
                    )}
                    <p className="text-sm text-zinc-400" data-testid={`sso-recovery-${o.provider}`}>{o.recovery}</p>
                  </div>
                ))}
              {(inUse ? [inUse] : options.filter((o) => o.set_up)).map((o) => (
                <div key={`unlinked-${o.provider}`} data-testid={`sso-unlinked-${o.provider}`}>
                  <h3 className="text-sm font-medium text-zinc-200">Not linked to {o.name} yet</h3>
                  {o.unlinked.length === 0 ? (
                    <p className="mt-1 text-sm text-zinc-400">Everyone on the team has linked {o.name}.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-zinc-400">
                        {inUse
                          ? `They can't sign in until they're linked. Coderhelm never links anyone by email: an admin gives each of them a one-time link, good for 72 hours, that works only through ${o.name} with exactly their own email. The owners are emailed when one is made and when it is used.`
                          : `They link ${o.name} in Settings, Security. Once single sign-on is required, they can't sign in until an admin gives them a one-time link.`}
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-zinc-200" data-testid="unlinked-list">
                        {o.unlinked.map((m) => {
                          const claim = claims.find((c) => c.user_id === m.user_id && !c.used);
                          return (
                            <li key={m.user_id} className="flex min-w-0 flex-wrap items-center gap-2">
                              <StatusDot tone={inUse ? "attention" : "muted"} />
                              <span className="[overflow-wrap:anywhere]">
                                {m.name || m.email}
                                {m.name && m.email && <span className="text-zinc-400"> {m.email}</span>}
                              </span>
                              {inUse && m.role !== "owner" && (
                                claim ? (
                                  <span className="text-zinc-400">
                                    Link sent, good until {claim.expires_at ? new Date(claim.expires_at).toLocaleString() : "soon"}.{" "}
                                    <button type="button" onClick={() => revokeClaim(m.user_id)} className={linkButton} data-testid="revoke-claim">
                                      Revoke
                                    </button>{" "}
                                    <button type="button" onClick={() => makeClaim(m)} className={linkButton}>
                                      Make a new one
                                    </button>
                                  </span>
                                ) : (
                                  <button type="button" onClick={() => makeClaim(m)} className={smallSecondaryButton} data-testid="make-claim">
                                    Make a one-time link
                                  </button>
                                )
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              ))}
              <p className="text-sm text-zinc-400" data-testid="require-sso-keys">
                API keys and CI tokens aren&apos;t sessions: they never sign in, so they keep working while single sign-on is required.
              </p>
              <p className="text-sm text-zinc-400" data-testid="require-sso-support">
                Coderhelm support can open a support view of this team only with the support access you grant, and only from a session of
                theirs that passed a second factor. It is read-only, never a session in your team, and every page they read goes in your audit log.
              </p>
            </div>
          </SettingsSection>
        )}

        {data.is_org !== false && <OktaSection selfHosted={selfHosted} />}

        {data.is_org !== false && <MicrosoftSection selfHosted={selfHosted} isOwner={isOwner} />}

        <SettingsSection
          id="who-has-it"
          title="Who has two-factor sign-in"
          description={`${withFactor} of ${people.length} set up. If someone loses their phone, reset theirs after you check it's really them; they set it up again at their next sign-in.`}
        >
          <ul data-testid="people-2fa">
            {people.map((p) => (
              <li key={p.user_id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-800 px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm text-zinc-100 [overflow-wrap:anywhere]">
                    {who(p)}
                    {p.is_self && <span className="text-zinc-400"> (you)</span>}
                  </p>
                  {p.name && p.email && <p className="text-sm text-zinc-400 [overflow-wrap:anywhere]">{p.email}</p>}
                </div>
                <p className="flex items-center gap-2 text-sm">
                  <StatusDot tone={p.two_factor ? "success" : required ? "attention" : "muted"} />
                  <span className={p.two_factor ? "text-zinc-200" : "text-zinc-400"}>{p.two_factor ? "Set up" : "Not set up"}</span>
                </p>
                {p.two_factor && !p.is_self && (
                  <button type="button" onClick={() => setResetting(p)} className={smallSecondaryButton}>
                    Reset
                  </button>
                )}
              </li>
            ))}
          </ul>
        </SettingsSection>

        <SettingsSection
          id="api-keys"
          title="API keys"
          description="API keys aren't people: a key never signs in, so two-factor sign-in doesn't hold it back. Keys made before the rule may have been made without a second factor; revoke any you don't recognize or need."
        >
          <div className="space-y-2 px-4 py-4">
            {keys.length === 0 ? (
              <p className="text-sm text-zinc-400">No API keys.</p>
            ) : (
              <ul className="space-y-1 text-sm text-zinc-300" data-testid="api-keys">
                {keys.map((k) => (
                  <li key={k.id} className="[overflow-wrap:anywhere]">
                    {k.name}
                    {k.created_by && <span className="text-zinc-400">, made by {k.created_by}</span>}
                    {k.made_before_rule && (
                      <span className="text-amber-300" data-testid="key-review">
                        {" "}
                        (made before two-factor sign-in was required
                        {k.maker_on_team === false
                          ? ", by someone no longer on the team"
                          : !k.maker_two_factor
                            ? ", by someone who still has no second factor"
                            : ""}
                        )
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/settings/api-keys" className={linkButton}>
              Manage API keys
            </Link>
          </div>
        </SettingsSection>
      </div>

      {claimUrl && (
        <Modal
          open
          onOpenChange={(o) => !o && setClaimUrl(null)}
          title={`One-time link for ${claimUrl.who}`}
          description="Send it to them yourself. It works once, for 72 hours, only when they sign in through your identity provider with exactly their own email. It isn't shown again."
          testId="claim-link-dialog"
          footer={
            <button type="button" onClick={() => setClaimUrl(null)} className={buttonClass("ghost")}>
              Done
            </button>
          }
        >
          <input readOnly value={claimUrl.url} aria-label="One-time link" onFocus={(e) => e.target.select()} className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" data-testid="claim-url" />
        </Modal>
      )}

      {resetting && (
        <ResetDialog
          person={resetting}
          selfHosted={selfHosted}
          onClose={() => setResetting(null)}
          onDone={() => {
            toast(`Two-factor sign-in reset for ${who(resetting)}`);
            setResetting(null);
            load();
          }}
        />
      )}
    </Page>
  );
}

/** One thing turning Require single sign-on on needs, and whether it holds now. */
function Need({ ok, testId, children }: { ok: boolean; testId: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-2" data-testid={testId} data-ok={ok ? "yes" : "no"}>
      <span className="mt-1.5">
        <StatusDot tone={ok ? "success" : "attention"} />
      </span>
      <span className={`min-w-0 ${ok ? "text-zinc-400" : "text-zinc-200"}`}>
        <span className="sr-only">{ok ? "Done: " : "Needed: "}</span>
        {children}
      </span>
    </li>
  );
}

function ResetDialog({
  person,
  selfHosted,
  onClose,
  onDone,
}: {
  person: Person;
  selfHosted: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [how, setHow] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enough = how.trim().length >= 10;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!enough) return;
    setBusy(true);
    setError("");
    try {
      await api.resetTwoFactor(person.user_id, how.trim());
      onDone();
    } catch (err) {
      setError(
        errorStatus(err) === 403
          ? "Only an owner can reset an admin's or owner's two-factor sign-in."
          : err instanceof Error
            ? err.message
            : "Couldn't reset it. Try again.",
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Reset two-factor sign-in for ${who(person)}?`}
      description={
        selfHosted
          ? "Only after you've checked it's really them, for example on a video call. Their next sign-in asks them to set it up again. This goes in the log under Settings, Roles."
          : "Only after you've checked it's really them, for example on a video call. Their second factor is the same on every team they're on, so it's reset everywhere and they're signed out; they get an email saying so. This goes in the log under Settings, Roles."
      }
      onSubmit={submit}
      testId="reset-2fa-dialog"
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !enough} className={buttonClass("danger")}>
            {busy ? "Resetting…" : "Reset"}
          </button>
        </>
      }
    >
      <Field
        as="textarea"
        id="reset-how"
        label="How did you check it's them?"
        help="At least 10 characters. Kept in the log."
        rows={3}
        value={how}
        error={error || undefined}
        onChange={(e) => setHow(e.target.value)}
      />
    </Modal>
  );
}
