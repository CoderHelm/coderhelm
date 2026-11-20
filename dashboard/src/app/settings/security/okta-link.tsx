"use client";

// Link Okta: a member links their own Okta account to their member record
// from a session they started another way. Okta then signs in exactly that
// member, never anyone matched by email. Shown only where this team (or a
// self-hosted install's organization) has Okta sign-in on.

import { useCallback, useEffect, useState } from "react";
import { api, type OktaLinkStatus } from "@/lib/api";
import { SettingsSection } from "@/components/settings";
import { StatusDot } from "@/components/list";
import { OktaMark } from "@/components/brand-icons";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { buttonClass, fullWidthOnPhone } from "@/components/ui";

/** The sentence for a link that came back failed (`?okta_link=failed&reason=`). */
export function oktaLinkFailure(reason: string | null): string {
  switch (reason) {
    case "cancelled":
      return "Linking was cancelled in Okta. Choose Link Okta to try again.";
    case "expired":
      return "Linking took longer than 10 minutes, or finished in another browser. Choose Link Okta to try again.";
    case "taken":
      return "That Okta account is already linked to another member of this team.";
    case "not_yours":
      return "That link belongs to another session. Choose Link Okta again from this page.";
    case "off":
      return "Okta sign-in was turned off for this team.";
    default:
      return "Okta didn't finish linking your account. Choose Link Okta to try again.";
  }
}

function host(issuer: string | null): string {
  if (!issuer) return "your team's Okta";
  try {
    return new URL(issuer).host;
  } catch {
    return issuer;
  }
}

export function OktaLinkSection() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [status, setStatus] = useState<OktaLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ linked: boolean; reason: string | null } | null>(null);

  const load = useCallback(() => {
    api.oktaLinkStatus().then(setStatus, () => setStatus(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("okta_link");
    if (outcome) {
      setResult({ linked: outcome === "linked", reason: params.get("reason") });
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
    load();
  }, [load]);

  if (!status || (!status.available && !status.linked)) return null;

  const link = async () => {
    setBusy(true);
    try {
      const r = await api.oktaLinkStart();
      window.location.assign(r.url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start linking. Try again.", "error");
      setBusy(false);
    }
  };

  const unlink = async () => {
    const ok = await confirm({
      title: "Unlink Okta?",
      message: "You won't be able to sign in with Okta until you link it again. Your other ways in keep working.",
      confirmLabel: "Unlink",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.oktaUnlink();
      setResult(null);
      load();
      toast("Okta unlinked");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't unlink. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      id="okta"
      title="Okta"
      description="Sign in with your team's Okta. Okta signs in only the account you link here, from a sign-in you started another way."
    >
      <div className="space-y-3 px-4 py-4" data-testid="okta-link">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <OktaMark />
          <StatusDot tone={status.linked ? "success" : "muted"} />
          <span className="text-zinc-200 [overflow-wrap:anywhere]">
            {status.linked ? `Linked to ${host(status.issuer)}` : `Not linked to ${host(status.issuer)}`}
          </span>
        </p>
        {result?.linked && <p role="status" className="text-sm text-emerald-300">Okta is linked. You can sign in with Okta now.</p>}
        {result && !result.linked && (
          <p role="alert" className="text-sm text-red-300" data-testid="okta-link-failed">
            {oktaLinkFailure(result.reason)}
          </p>
        )}
        {status.from_okta ? (
          <p className="text-sm text-zinc-400">To link or unlink Okta, sign in with your password, Google, GitHub or Microsoft.</p>
        ) : status.linked ? (
          <button type="button" onClick={unlink} disabled={busy} className={`${buttonClass("secondary")} ${fullWidthOnPhone}`}>
            Unlink Okta
          </button>
        ) : (
          <button type="button" onClick={link} disabled={busy} className={`${buttonClass("primary")} ${fullWidthOnPhone}`}>
            {busy ? "Opening Okta…" : "Link Okta"}
          </button>
        )}
      </div>
    </SettingsSection>
  );
}
