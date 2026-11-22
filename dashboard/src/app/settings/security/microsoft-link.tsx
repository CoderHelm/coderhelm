"use client";

// Link Microsoft: a member links their own account in the team's own
// Microsoft Entra tenant to their member record, from a session of theirs.
// A sign-in through that tenant then signs in exactly that member, never
// anyone matched by email. Shown only where the team (or a self-hosted
// install's organization) has its tenant on.

import { useCallback, useEffect, useState } from "react";
import { api, type MicrosoftLinkStatus } from "@/lib/api";
import { SettingsSection } from "@/components/settings";
import { StatusDot } from "@/components/list";
import { MicrosoftMark } from "@/components/brand-icons";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { buttonClass, fullWidthOnPhone } from "@/components/ui";

/** The sentence for a link that came back failed (`?microsoft_link=failed&reason=`). */
export function microsoftLinkFailure(reason: string | null): string {
  switch (reason) {
    case "cancelled":
      return "Linking was cancelled at Microsoft. Choose Link Microsoft to try again.";
    case "expired":
      return "Linking took longer than 10 minutes, or finished in another browser. Choose Link Microsoft to try again.";
    case "taken":
      return "That Microsoft account is already linked to another member of this team.";
    case "other_tenant":
      return "That account isn't in your team's Microsoft tenant. Sign in with your work account.";
    case "not_yours":
      return "That link belongs to another session. Choose Link Microsoft again from this page.";
    case "off":
      return "Your team's Microsoft tenant was turned off.";
    default:
      return "Microsoft didn't finish linking your account. Choose Link Microsoft to try again.";
  }
}

export function MicrosoftLinkSection() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [status, setStatus] = useState<MicrosoftLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ linked: boolean; reason: string | null } | null>(null);

  const load = useCallback(() => {
    api.microsoftLinkStatus().then(setStatus, () => setStatus(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("microsoft_link");
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
      const r = await api.microsoftLinkStart();
      window.location.assign(r.url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start linking. Try again.", "error");
      setBusy(false);
    }
  };

  const unlink = async () => {
    const ok = await confirm({
      title: "Unlink Microsoft?",
      message: "You won't be able to sign in through your team's Microsoft tenant until you link it again.",
      confirmLabel: "Unlink",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.microsoftUnlink();
      setResult(null);
      load();
      toast("Microsoft unlinked");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't unlink. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      id="microsoft"
      title="Microsoft (your team's tenant)"
      description="Sign in through your team's own Microsoft Entra tenant. It signs in only the work account you link here."
    >
      <div className="space-y-3 px-4 py-4" data-testid="microsoft-link">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <MicrosoftMark />
          <StatusDot tone={status.linked ? "success" : "muted"} />
          <span className="text-zinc-200">{status.linked ? "Linked to your team's tenant" : "Not linked to your team's tenant"}</span>
        </p>
        {result?.linked && <p role="status" className="text-sm text-emerald-300">Microsoft is linked. You can sign in through your team's tenant now.</p>}
        {result && !result.linked && (
          <p role="alert" className="text-sm text-red-300" data-testid="microsoft-link-failed">
            {microsoftLinkFailure(result.reason)}
          </p>
        )}
        {status.linked ? (
          <button type="button" onClick={unlink} disabled={busy} className={`${buttonClass("secondary")} ${fullWidthOnPhone}`}>
            Unlink Microsoft
          </button>
        ) : (
          <button type="button" onClick={link} disabled={busy} className={`${buttonClass("primary")} ${fullWidthOnPhone}`} data-testid="link-microsoft">
            {busy ? "Opening Microsoft…" : "Link Microsoft"}
          </button>
        )}
      </div>
    </SettingsSection>
  );
}
