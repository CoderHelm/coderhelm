"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import QRCode from "qrcode";

export default function SecurityPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [authProvider, setAuthProvider] = useState<string | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // MFA
  const [mfaStep, setMfaStep] = useState<"idle" | "password" | "setup" | "verify">("idle");
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaQrUri, setMfaQrUri] = useState("");
  const [mfaQrDataUrl, setMfaQrDataUrl] = useState("");
  const [mfaSession, setMfaSession] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.me().then((u) => {
      // Determine auth provider: explicit field, or infer from github_login presence
      if (u.auth_provider && u.auth_provider !== "email") {
        setAuthProvider(u.auth_provider);
      } else if (u.github_login) {
        setAuthProvider("github");
      } else {
        setAuthProvider(u.auth_provider ?? "email");
      }
    }).catch(() => {});
  }, []);

  const isOAuth = authProvider === "github" || authProvider === "google";

  if (authProvider === null) {
    return (
      <div className="max-w-xl">
        <a href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">← Settings</a>
        <h1 className="text-2xl font-bold mt-4 mb-2">Security</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Manage your password and two-factor authentication.
        </p>
        <div className="animate-pulse space-y-4">
          <div className="h-40 bg-zinc-900/50 border border-zinc-800 rounded-lg" />
        </div>
      </div>
    );
  }

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
    try {
      await api.changePassword(currentPassword, newPassword);
      toast("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast("Failed to change password. Check your current password.", "error");
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
      setMfaQrUri(result.qr_uri);
      setMfaSession(result.session);
      // Generate QR code data URL
      try {
        const url = await QRCode.toDataURL(result.qr_uri, {
          width: 200,
          margin: 2,
          color: { dark: "#ffffff", light: "#00000000" },
        });
        setMfaQrDataUrl(url);
      } catch { /* QR generation failed, user can enter manually */ }
      setMfaStep("setup");
    } catch {
      toast("Failed to start MFA setup. Check your password.", "error");
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
      toast("Two-factor authentication enabled");
    } catch {
      toast("Invalid code. Try again.", "error");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaDisable = async () => {
    if (!(await confirm({ title: "Disable 2FA", message: "Disable two-factor authentication? Your account will be less secure.", confirmLabel: "Disable", destructive: true }))) return;
    setMfaLoading(true);
    try {
      await api.mfaDisable();
      setMfaEnabled(false);
      toast("Two-factor authentication disabled");
    } catch {
      toast("Failed to disable MFA", "error");
    } finally {
      setMfaLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(mfaSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-xl">
      <a href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">← Settings</a>
      <h1 className="text-2xl font-bold mt-4 mb-2">Security</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Manage your password and two-factor authentication.
      </p>

      {isOAuth && (
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg mb-6">
          <p className="text-sm text-zinc-400">
            You signed in with <span className="text-zinc-200 font-medium capitalize">{authProvider}</span>. Password and two-factor authentication are managed by your identity provider.
          </p>
        </div>
      )}

      {/* Change Password */}
      {!isOAuth && (
      <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg mb-6">
        <h3 className="text-sm font-semibold text-zinc-100 mb-4">Change password</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="8+ characters"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {changingPassword ? "Updating..." : "Update password"}
          </button>
        </div>
      </div>
      )}

      {/* Two-Factor Authentication */}
      {!isOAuth && (
      <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Two-factor authentication</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Add an extra layer of security with a TOTP authenticator app.</p>
          </div>
          {mfaEnabled && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Enabled
            </span>
          )}
        </div>

        {mfaStep === "idle" && !mfaEnabled && (
          <button
            onClick={() => setMfaStep("password")}
            disabled={mfaLoading}
            className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            Enable 2FA
          </button>
        )}

        {mfaStep === "password" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Enter your password to set up two-factor authentication.</p>
            <input
              type="password"
              placeholder="Current password"
              autoComplete="off"
              data-1p-ignore
              value={mfaPassword}
              onChange={(e) => setMfaPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleMfaSetup()}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <div className="flex gap-3">
              <button
                onClick={handleMfaSetup}
                disabled={mfaLoading || !mfaPassword}
                className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {mfaLoading ? "Setting up..." : "Continue"}
              </button>
              <button
                onClick={() => { setMfaStep("idle"); setMfaPassword(""); }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mfaStep === "idle" && mfaEnabled && (
          <button
            onClick={handleMfaDisable}
            disabled={mfaLoading}
            className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {mfaLoading ? "Disabling..." : "Disable 2FA"}
          </button>
        )}

        {mfaStep === "setup" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc).
            </p>

            {mfaQrDataUrl && (
              <div className="flex justify-center py-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <img src={mfaQrDataUrl} alt="MFA QR Code" width={200} height={200} className="block" />
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-zinc-500 mb-1.5">Or enter this secret manually:</p>
              <div className="flex items-center gap-2 max-w-full">
                <code className="flex-1 min-w-0 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-200 font-mono tracking-wider break-all select-all">
                  {mfaSecret}
                </code>
                <button
                  onClick={copySecret}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer shrink-0"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <button
              onClick={() => setMfaStep("verify")}
              className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white transition-colors cursor-pointer"
            >
              Next — enter code
            </button>
          </div>
        )}

        {mfaStep === "verify" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Enter the 6-digit code from your authenticator app to verify setup.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              autoComplete="one-time-code"
              data-1p-ignore
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && handleMfaVerify()}
              className="w-48 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 text-center tracking-widest text-lg font-mono"
            />
            <div className="flex gap-3">
              <button
                onClick={handleMfaVerify}
                disabled={mfaLoading || mfaCode.length < 6}
                className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {mfaLoading ? "Verifying..." : "Verify & enable"}
              </button>
              <button
                onClick={() => { setMfaStep("idle"); setMfaCode(""); setMfaPassword(""); }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
