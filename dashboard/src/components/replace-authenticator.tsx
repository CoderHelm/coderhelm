"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { CopyButton } from "./copy-button";
import { Code, Field } from "./settings";
import { buttonClass, fullWidthOnPhone, primaryButton } from "./ui";

/**
 * Replacing the authenticator app (a new phone, or an app moved): prove the
 * one you have now with a current code (and your password, when the code is
 * on your password account), scan the new one, then enter a code from it.
 * The old app keeps working until that last step, and stops right after.
 */
export function ReplaceAuthenticator({
  needsPassword,
  onDone,
  onCancel,
}: {
  needsPassword: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"prove" | "scan" | "code">("prove");
  const [password, setPassword] = useState("");
  const [oldCode, setOldCode] = useState("");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  const prove = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await api.replaceTwoFactorStart(oldCode, needsPassword ? password : undefined);
      setSecret(r.secret);
      try {
        setQr(await QRCode.toDataURL(r.qr_uri, { width: 200, margin: 2, color: { dark: "#ffffff", light: "#00000000" } }));
      } catch {
        // No picture: the setup key below can be typed in instead.
      }
      setStep("scan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      setOldCode("");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setError("");
    setBusy(true);
    try {
      await api.replaceTwoFactorVerify(newCode);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't match. Try the newest one.");
      setNewCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="replace-authenticator">
      {step === "prove" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            prove();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-zinc-300">
            First, check it&apos;s you with the app you use now. Your current app keeps working until the new one is set up.
          </p>
          {needsPassword && (
            <Field
              id="replace-password"
              name="replace-password"
              label="Your password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <Field
            id="replace-old-code"
            name="replace-old-code"
            label="Code from your current app"
            help="The 6 digits it shows now."
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            controlClassName="!w-40 text-center text-lg tracking-widest"
            value={oldCode}
            onChange={(e) => setOldCode(digits(e.target.value))}
          />
          <p className="text-sm text-zinc-400" data-testid="lost-phone">
            Lost your phone? Ask an admin to reset your two-step sign-in. You&apos;ll set it up again when you next sign in.
          </p>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || oldCode.length < 6 || (needsPassword && !password)}
              className={`${primaryButton} ${fullWidthOnPhone}`}
            >
              {busy ? "Checking…" : "Continue"}
            </button>
            <button type="button" onClick={onCancel} className={buttonClass("ghost")}>Cancel</button>
          </div>
        </form>
      )}

      {step === "scan" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">Scan this code with the new app (Google Authenticator, Authy, 1Password or another).</p>
          {qr && (
            <div className="inline-block rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <img src={qr} alt="Code to scan with your new authenticator app" width={180} height={180} className="block" />
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs text-zinc-400">Or type this setup key into the app:</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Code className="select-all wrap-anywhere tracking-wider">{secret}</Code>
              <CopyButton text={secret} />
            </div>
          </div>
          <p className="text-xs text-zinc-400">This setup key works for 10 minutes. After that, start again.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep("code")} className={`${primaryButton} ${fullWidthOnPhone}`}>
              Next: enter a code
            </button>
            <button type="button" onClick={onCancel} className={buttonClass("ghost")}>Cancel</button>
          </div>
        </div>
      )}

      {step === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            finish();
          }}
          className="space-y-4"
        >
          <Field
            id="replace-new-code"
            name="replace-new-code"
            label="Code from the new app"
            help="Your old app stops working once this matches."
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            controlClassName="!w-40 text-center text-lg tracking-widest"
            value={newCode}
            onChange={(e) => setNewCode(digits(e.target.value))}
          />
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || newCode.length < 6} className={`${primaryButton} ${fullWidthOnPhone}`}>
              {busy ? "Checking…" : "Replace the app"}
            </button>
            <button type="button" onClick={onCancel} className={buttonClass("ghost")}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
