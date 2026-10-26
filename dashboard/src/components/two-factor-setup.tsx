"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { api, errorStatus } from "@/lib/api";
import { CopyButton } from "./copy-button";
import { Code, Field } from "./settings";
import { buttonClass, fullWidthOnPhone, primaryButton } from "./ui";

/**
 * Setting up two-factor sign-in with an authenticator app, in three steps:
 * (your password, for a password account), a code to scan, then a code from
 * the app. `kind` is the one that fits how the person signed in: Cognito's
 * codes after a password, Coderhelm's own after Google or GitHub.
 */
export function TwoFactorSetup({
  kind,
  onDone,
  onCancel,
}: {
  kind: "cognito" | "app";
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<"start" | "password" | "scan" | "code">("start");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [session, setSession] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const showSecret = async (s: string, uri: string) => {
    setSecret(s);
    try {
      setQr(await QRCode.toDataURL(uri, { width: 200, margin: 2, color: { dark: "#ffffff", light: "#00000000" } }));
    } catch {
      // No picture: the setup key below can be typed in instead.
    }
    setStep("scan");
  };

  const begin = async () => {
    setError("");
    if (kind === "cognito") {
      setStep("password");
      return;
    }
    setBusy(true);
    try {
      const r = await api.appTwoFactorSetup();
      await showSecret(r.secret, r.qr_uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the setup. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const withPassword = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await api.mfaSetup(password);
      setSession(r.session);
      await showSecret(r.secret, r.qr_uri);
    } catch (e) {
      setError(
        errorStatus(e) === 409
          ? "Two-factor sign-in is already on for you. Sign out, then sign in again with your code."
          : "That password didn't work. Check it and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setError("");
    setBusy(true);
    try {
      if (kind === "cognito") await api.mfaVerifySetup(password, code, session);
      else await api.appTwoFactorVerify(code);
      setPassword("");
      onDone();
    } catch {
      setError("That code didn't work. Enter the 6 digits the app shows now.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = onCancel && (
    <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
      Cancel
    </button>
  );

  return (
    <div className="space-y-4" data-testid="two-factor-setup" data-kind={kind} data-step={step}>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      {step === "start" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={begin} disabled={busy} className={`${primaryButton} ${fullWidthOnPhone}`}>
            {busy ? "Starting…" : "Set up an authenticator app"}
          </button>
          {cancel}
        </div>
      )}

      {step === "password" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            withPassword();
          }}
          className="space-y-4"
        >
          <Field
            id="two-factor-password"
            label="Your password"
            help="To check it's you before anything changes."
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !password} className={`${primaryButton} ${fullWidthOnPhone}`}>
              {busy ? "Checking…" : "Continue"}
            </button>
            {cancel}
          </div>
        </form>
      )}

      {step === "scan" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Scan this with your authenticator app (1Password, Google Authenticator, Authy or another).
          </p>
          {qr && (
            <div className="inline-block rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Code to scan with your authenticator app" width={180} height={180} className="block" />
            </div>
          )}
          <div>
            <p className="mb-1.5 text-sm text-zinc-400">Or type this setup key into the app:</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Code className="select-all [overflow-wrap:anywhere] tracking-wider">{secret}</Code>
              <CopyButton text={secret} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep("code")} className={`${primaryButton} ${fullWidthOnPhone}`}>
              Next: enter a code
            </button>
            {cancel}
          </div>
        </div>
      )}

      {step === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) finish();
          }}
          className="space-y-4"
        >
          <Field
            id="two-factor-code"
            label="Code from the app"
            help="The 6 digits your authenticator app shows now."
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            controlClassName="!w-40 text-center text-lg tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || code.length < 6} className={`${primaryButton} ${fullWidthOnPhone}`}>
              {busy ? "Checking…" : "Turn on two-factor sign-in"}
            </button>
            {cancel}
          </div>
        </form>
      )}
    </div>
  );
}
