"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";
import { Page, PageHeader } from "@/components/page";
import { StatusDot } from "@/components/list";
import { CopyButton } from "@/components/copy-button";
import { Problem } from "@/components/problem";
import { ExternalLinkIcon } from "@/components/icons";
import { buttonClass, dangerButton, ghostButton, primaryButton } from "@/components/ui";
import { Code, Field, SettingsSection } from "@/components/settings";
import { TwoFactorSetup } from "@/components/two-factor-setup";
import { isSelfHosted } from "@/lib/runtime-config";
import type { MyTwoFactor } from "@/lib/api";

/** The one name for it on this page and in Settings. */
const TWO_STEP = "Two step sign in";

/** How each sign-in provider is spelled, and where its own security settings live. */
const PROVIDERS: Record<string, { name: string; settings: string }> = {
  github: { name: "GitHub", settings: "https://github.com/settings/security" },
  google: { name: "Google", settings: "https://myaccount.google.com/security" },
};

export default function SecurityPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [authProvider, setAuthProvider] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Two step sign in
  const [mfaStep, setMfaStep] = useState<"idle" | "password" | "setup" | "verify">("idle");
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaQrDataUrl, setMfaQrDataUrl] = useState("");
  const [mfaSession, setMfaSession] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  // A self-hosted install: Google and GitHub sign-ins get Coderhelm's own
  // authenticator-app codes.
  const [mine, setMine] = useState<MyTwoFactor | null>(null);
  const [appStep, setAppStep] = useState<"idle" | "setup" | "off">("idle");
  const [offCode, setOffCode] = useState("");
  const loadMine = useCallback(() => {
    if (isSelfHosted()) api.myTwoFactor().then(setMine, () => setMine(null));
  }, []);
  useEffect(loadMine, [loadMine]);

  const loadMe = useCallback(() => {
    setLoadFailed(false);
    api.me().then((u) => {
      setLogin(u.github_login ?? u.email ?? null);
      // The provider: the explicit field, or GitHub when the account has a GitHub login.
      if (u.auth_provider && u.auth_provider !== "email") {
        setAuthProvider(u.auth_provider);
      } else if (u.github_login) {
        setAuthProvider("github");
      } else {
        setAuthProvider(u.auth_provider ?? "email");
      }
      if (u.mfa_enabled) setMfaEnabled(true);
    }).catch(() => setLoadFailed(true));
  }, []);

  useEffect(loadMe, [loadMe]);

  const isOAuth = authProvider === "github" || authProvider === "google";
  const header = (
    <div className="mb-6">
      <PageHeader title="Security" lead={`Your password and ${TWO_STEP.toLowerCase()}.`} />
    </div>
  );

  if (loadFailed) {
    return (
      <Page>
        {header}
        <div className="max-w-3xl">
          <Problem title="Couldn't load your sign-in settings" onRetry={loadMe}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        </div>
      </Page>
    );
  }

  if (authProvider === null) {
    return (
      <Page>
        {header}
        <div className="max-w-3xl space-y-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-48 w-full" />
        </div>
      </Page>
    );
  }

  const mismatch = !!confirmPassword && newPassword !== confirmPassword;
  const tooShort = !!newPassword && newPassword.length < 8;

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast("Passwords don't match", "error");
      return;
    }
    if (newPassword.length < 8) {
      toast("Password must be at least 8 characters", "error");
      return;
    }
    setChangingPassword(true);
    setPasswordError(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError("The password was not changed. Check your current password.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleMfaSetup = async () => {
    if (!mfaPassword) {
      toast("Enter your password to continue", "error");
      return;
    }
    setMfaLoading(true);
    try {
      const result = await api.mfaSetup(mfaPassword);
      setMfaSecret(result.secret);
      setMfaSession(result.session);
      try {
        const url = await QRCode.toDataURL(result.qr_uri, { width: 200, margin: 2, color: { dark: "#ffffff", light: "#00000000" } });
        setMfaQrDataUrl(url);
      } catch {
        /* No QR code: the secret below can be typed in instead. */
      }
      setMfaStep("setup");
    } catch {
      toast(`Could not start ${TWO_STEP.toLowerCase()}. Check your password.`, "error");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (mfaCode.length < 6) return;
    setMfaLoading(true);
    try {
      await api.mfaVerifySetup(mfaPassword, mfaCode, mfaSession);
      setMfaEnabled(true);
      setMfaStep("idle");
      setMfaCode("");
      setMfaPassword("");
      toast(`${TWO_STEP} is on`);
    } catch {
      toast("That code didn't work. Try the newest one.", "error");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaDisable = async () => {
    const ok = await confirm({
      title: `Turn off ${TWO_STEP.toLowerCase()}?`,
      message: "Signing in will need only your password, so your account is easier to get into.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (!ok) return;
    setMfaLoading(true);
    try {
      await api.mfaDisable();
      setMfaEnabled(false);
      toast(`${TWO_STEP} is off`);
    } catch {
      toast(`Could not turn off ${TWO_STEP.toLowerCase()}`, "error");
    } finally {
      setMfaLoading(false);
    }
  };

  const cancelMfa = () => {
    setMfaStep("idle");
    setMfaCode("");
    setMfaPassword("");
  };

  if (isOAuth) {
    const provider = PROVIDERS[authProvider] ?? { name: authProvider, settings: "" };
    return (
      <Page>
        {header}
        <div className="max-w-3xl">
          <SettingsSection id="sign-in" title="Sign in">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-sm font-medium text-zinc-100">
                  Signed in with {provider.name}
                  {login ? <span className="font-normal text-zinc-400"> as {login}</span> : null}
                </p>
                <p className="mt-0.5 text-sm text-zinc-400">
                  Your password and {TWO_STEP.toLowerCase()} are managed in your {provider.name} account.
                </p>
              </div>
              {provider.settings && (
                <a href={provider.settings} target="_blank" rel="noreferrer" className={`${buttonClass("secondary")} gap-1.5`}>
                  Open {provider.name} security settings
                  <ExternalLinkIcon />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          </SettingsSection>
          {mine?.self_hosted && (
            <div className="mt-8">
              <SettingsSection
                id="app-two-step"
                title="Two-factor sign-in"
                description={`After ${provider.name}, Coderhelm asks for a code from an authenticator app on your phone.${mine.required ? " Your organization requires it." : ""}`}
              >
                <div className="space-y-4 px-4 py-4">
                  <p className="flex items-center gap-2 text-sm" data-testid="app-two-step-status">
                    <StatusDot tone={mine.set_up === "app" ? "success" : "muted"} />
                    <span className={mine.set_up === "app" ? "text-zinc-200" : "text-zinc-400"}>
                      {mine.set_up === "app" ? "Two-factor sign-in is on" : "Two-factor sign-in is off"}
                    </span>
                  </p>
                  {mine.set_up !== "app" && appStep === "idle" && (
                    <button type="button" onClick={() => setAppStep("setup")} className={primaryButton}>
                      Turn on two-factor sign-in
                    </button>
                  )}
                  {mine.set_up !== "app" && appStep === "setup" && (
                    <TwoFactorSetup
                      kind="app"
                      onCancel={() => setAppStep("idle")}
                      onDone={() => {
                        setAppStep("idle");
                        toast("Two-factor sign-in is on");
                        loadMine();
                      }}
                    />
                  )}
                  {mine.set_up === "app" && !mine.required && appStep !== "off" && (
                    <button type="button" onClick={() => setAppStep("off")} className={dangerButton}>
                      Turn off two-factor sign-in
                    </button>
                  )}
                  {mine.set_up === "app" && appStep === "off" && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await api.appTwoFactorDisable(offCode);
                          setAppStep("idle");
                          setOffCode("");
                          toast("Two-factor sign-in is off");
                          loadMine();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : "That didn't work. Try again.", "error");
                        }
                      }}
                      className="space-y-4"
                    >
                      <Field
                        id="app-off-code"
                        label="A code from the app, to check it's you"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        controlClassName="!w-40 text-center text-lg tracking-widest"
                        value={offCode}
                        onChange={(e) => setOffCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={offCode.length < 6} className={dangerButton}>Turn off</button>
                        <button type="button" onClick={() => setAppStep("idle")} className={ghostButton}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              </SettingsSection>
            </div>
          )}
        </div>
      </Page>
    );
  }

  return (
    <Page>
      {header}

      <div className="max-w-3xl space-y-8">
        <SettingsSection id="password" title="Password">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleChangePassword();
            }}
            className="space-y-4 px-4 py-4"
          >
            <Field
              id="current-password"
              name="current-password"
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Field
              id="new-password"
              name="new-password"
              label="New password"
              type="password"
              autoComplete="new-password"
              help="At least 8 characters."
              error={tooShort ? "Use at least 8 characters." : undefined}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Field
              id="confirm-password"
              name="confirm-password"
              label="New password again"
              type="password"
              autoComplete="new-password"
              error={mismatch ? "The two new passwords are different." : undefined}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {passwordError && <p role="alert" className="text-sm text-red-400">{passwordError}</p>}
            <button
              type="submit"
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className={primaryButton}
            >
              {changingPassword ? "Changing…" : "Change password"}
            </button>
          </form>
        </SettingsSection>

        <SettingsSection
          id="two-step"
          title={TWO_STEP}
          description="Signing in also asks for a code from an authenticator app on your phone."
        >
          <div className="space-y-4 px-4 py-4">
            <p className="flex items-center gap-2 text-sm" data-testid="two-step-status">
              <StatusDot tone={mfaEnabled ? "success" : "muted"} />
              <span className={mfaEnabled ? "text-zinc-200" : "text-zinc-400"}>{mfaEnabled ? `${TWO_STEP} is on` : `${TWO_STEP} is off`}</span>
            </p>

            {mfaStep === "idle" && !mfaEnabled && (
              <button type="button" onClick={() => setMfaStep("password")} disabled={mfaLoading} className={primaryButton}>
                Turn on {TWO_STEP.toLowerCase()}
              </button>
            )}

            {mfaStep === "idle" && mfaEnabled && mine?.required && (
              <p className="text-sm text-zinc-400">Your organization requires it, so it stays on.</p>
            )}

            {mfaStep === "idle" && mfaEnabled && !mine?.required && (
              <button type="button" onClick={handleMfaDisable} disabled={mfaLoading} className={dangerButton}>
                {mfaLoading ? "Turning off…" : `Turn off ${TWO_STEP.toLowerCase()}`}
              </button>
            )}

            {mfaStep === "password" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleMfaSetup();
                }}
                className="space-y-4"
              >
                <Field
                  id="mfa-password"
                  name="mfa-password"
                  label="Your password"
                  help="To check it's you before anything changes."
                  type="password"
                  autoComplete="current-password"
                  value={mfaPassword}
                  onChange={(e) => setMfaPassword(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={mfaLoading || !mfaPassword} className={primaryButton}>
                    {mfaLoading ? "Checking…" : "Continue"}
                  </button>
                  <button type="button" onClick={cancelMfa} className={ghostButton}>Cancel</button>
                </div>
              </form>
            )}

            {mfaStep === "setup" && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Scan this code with your authenticator app (Google Authenticator, Authy, 1Password or another).
                </p>
                {mfaQrDataUrl && (
                  <div className="inline-block rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <img src={mfaQrDataUrl} alt="Code to scan with your authenticator app" width={180} height={180} className="block" />
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-xs text-zinc-400">Or type this setup key into the app:</p>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Code className="select-all tracking-wider">{mfaSecret}</Code>
                    <CopyButton text={mfaSecret} />
                  </div>
                </div>
                <button type="button" onClick={() => setMfaStep("verify")} className={primaryButton}>
                  Next: enter a code
                </button>
              </div>
            )}

            {mfaStep === "verify" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleMfaVerify();
                }}
                className="space-y-4"
              >
                <Field
                  id="totp-code"
                  name="totp-code"
                  label="Code from the app"
                  help="The 6 digits your authenticator app shows now."
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  controlClassName="!w-40 text-center text-lg tracking-widest"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={mfaLoading || mfaCode.length < 6} className={primaryButton}>
                    {mfaLoading ? "Checking…" : `Turn on ${TWO_STEP.toLowerCase()}`}
                  </button>
                  <button type="button" onClick={cancelMfa} className={buttonClass("ghost")}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </SettingsSection>
      </div>
    </Page>
  );
}
