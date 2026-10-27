"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { Modal } from "@/components/modal";
import { StatusDot } from "@/components/list";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Field, SettingsSection, Switch } from "@/components/settings";
import { api, errorStatus, type SignInSettings } from "@/lib/api";
import { buttonClass, fullWidthOnPhone, linkButton, smallSecondaryButton } from "@/components/ui";

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
  const [domain, setDomain] = useState("");
  const [domainError, setDomainError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<Person | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    api.signInSettings().then(setData, () => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const header = (
    <div className="mb-6">
      <PageHeader
        title="Sign-in"
        lead="This install is for one organization. Choose who may join and whether everyone must use two-factor sign-in."
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
  if (!data.self_hosted) {
    return (
      <Page>
        {header}
        <p className="max-w-3xl text-sm text-zinc-400">These settings are for self-hosted installs.</p>
      </Page>
    );
  }

  const domains = data.domains ?? [];
  const people = data.people ?? [];
  const keys = data.api_keys ?? [];
  const required = !!data.require_2fa;
  const withFactor = people.filter((p) => p.two_factor).length;

  const saveDomains = async (next: string[]) => {
    setSaving(true);
    setDomainError("");
    try {
      const r = await api.updateSignInSettings({ domains: next });
      setData({ ...data, domains: r.domains });
      setDomain("");
      toast(r.domains.length ? "Allowed domains saved" : "Only people you invite can join now");
    } catch (e) {
      setDomainError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const addDomain = (e: FormEvent) => {
    e.preventDefault();
    const d = domain.trim().replace(/^@/, "").toLowerCase();
    if (!d) return;
    if (domains.includes(d)) {
      setDomain("");
      return;
    }
    saveDomains([...domains, d]);
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
      const missing = people.length - withFactor;
      const ok = await confirm({
        title: "Require two-factor sign-in for everyone?",
        message:
          missing > 0
            ? `${missing} ${missing === 1 ? "person hasn't" : "people haven't"} set it up yet. At their next request they'll see a setup screen, and nothing else works until they finish. API keys keep working.`
            : "Everyone has set it up. Anyone who joins later sets it up at their first sign-in. API keys keep working.",
        confirmLabel: "Require it",
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: "Stop requiring two-factor sign-in?",
        message: "People who set it up keep it. Others can sign in with only a password, Google or GitHub.",
        confirmLabel: "Stop requiring it",
        destructive: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const r = await api.updateSignInSettings({ require_2fa: on });
      setData({ ...data, require_2fa: r.require_2fa, require_2fa_since: r.require_2fa_since });
      toast(on ? "Two-factor sign-in is required" : "Two-factor sign-in is no longer required");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const canTurnOn = !!data.your_session_has_2fa;

  return (
    <Page>
      {header}
      <div className="max-w-3xl space-y-8">
        <SettingsSection
          id="who-may-join"
          title="Who may join"
          description="Nobody can sign up on their own. People join with an invite, or with an email at a domain you allow here."
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
            <div>
              <h3 className="text-sm font-medium text-zinc-200">Allowed email domains</h3>
              {domains.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-400" data-testid="domains-empty">
                  None: only people you invite can join.
                </p>
              ) : (
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
              )}
            </div>
            <form onSubmit={addDomain} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field
                id="add-domain"
                className="flex-1"
                label="Let anyone with an email at"
                help="Your company's domain, such as example.com. They join as members. Public email services can't be allowed."
                placeholder="example.com"
                autoComplete="off"
                spellCheck={false}
                value={domain}
                error={domainError || undefined}
                onChange={(e) => {
                  setDomain(e.target.value);
                  setDomainError("");
                }}
              />
              <button type="submit" disabled={saving || !domain.trim()} className={`${buttonClass("secondary")} ${fullWidthOnPhone} sm:mb-[1.85rem]`}>
                Allow
              </button>
            </form>
          </div>
        </SettingsSection>

        <SettingsSection
          id="two-factor"
          title="Two-factor sign-in"
          description="Everyone signs in with a code from an authenticator app too: after their password, and after Google or GitHub."
        >
          <div className="space-y-3 px-4 py-4">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <p id="require-2fa-label" className="text-sm font-medium text-zinc-100">
                  Require two-factor sign-in
                </p>
                <p id="require-2fa-help" className="mt-0.5 text-sm text-zinc-400">
                  {required
                    ? `Required${data.require_2fa_since ? ` since ${new Date(data.require_2fa_since).toLocaleDateString()}` : ""}. People without it see a setup screen and nothing else.`
                    : "Off: each person chooses for themselves in Settings, Security."}
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
                , then sign out and sign in again with your code. Then you can require it for everyone.
              </p>
            )}
          </div>
        </SettingsSection>

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

      {resetting && (
        <ResetDialog
          person={resetting}
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

function ResetDialog({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
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
      description="Only after you've checked it's really them, for example on a video call. Their next sign-in asks them to set it up again. This goes in the log under Settings, Roles."
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
