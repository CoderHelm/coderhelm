"use client";

import { useState } from "react";
import type { KnowledgeSignIn, SignInStart } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { knowledge as knowledgeApi, type SourceKind } from "@/lib/knowledge";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";
import { DangerRow, SignInControl } from "./integration-panel";

// The sign-in a team made so Knowledge can sync a product (Confluence,
// Notion, Google Drive; for Sanity, each person's own), as its card on
// Integrations shows it: renewing it and disconnecting it.

/** Starts the Knowledge sign-in again: the team's, or this person's own. */
export async function beginKnowledgeSignIn(k: KnowledgeSignIn): Promise<SignInStart> {
  const kind = k.kind as SourceKind;
  if (k.personal) {
    const r = await knowledgeApi.signIn(kind);
    if (!r.authorize_url) throw new Error(`You are already signed in to ${k.label}.`);
    return { authorize_url: r.authorize_url, server_id: k.server_id };
  }
  return { server_id: k.server_id, ...(await knowledgeApi.connect(kind)) };
}

/** "Sign in again" for a Knowledge sign-in that stopped working. */
export function KnowledgeSignInControl({ k, label = "Sign in again", onChanged }: { k: KnowledgeSignIn; label?: string; onChanged: () => void | Promise<void> }) {
  return (
    <SignInControl
      name={k.label}
      ids={[k.server_id, `source:${k.kind}`]}
      label={label}
      begin={() => beginKnowledgeSignIn(k)}
      onConnected={onChanged}
      onReturn={onChanged}
      testId="knowledge-sign-in"
    />
  );
}

function sourcesWords(n: number): string {
  return `${n} source${n === 1 ? "" : "s"}`;
}

/** Disconnecting the team's Knowledge sign-in: what stops, and the button. */
export function KnowledgeDisconnect({
  k,
  beside = false,
  onChanged,
}: {
  k: KnowledgeSignIn;
  /** The card also has a connection for runs with its own way out: this one names Knowledge. */
  beside?: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const go = async () => {
    const ok = await confirm({
      title: `Disconnect ${k.label} from Knowledge?`,
      message:
        k.sources > 0
          ? `Its ${sourcesWords(k.sources)} in Knowledge stop syncing until someone signs in again. What is already synced stays.`
          : `Coderhelm forgets the ${k.label} sign-in Knowledge syncs with, and revokes it where ${k.label} allows.`,
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await knowledgeApi.disconnect(k.kind as SourceKind);
      toast(`${k.label} disconnected`);
      await onChanged();
    } catch (e) {
      toast(errorMessage(e, "Couldn't disconnect it."), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <DangerRow title={beside ? `Disconnect ${k.label} from Knowledge` : `Disconnect ${k.label}`} label="Disconnect" onClick={() => void go()} busy={busy} testId="disconnect-knowledge">
      {k.sources > 0
        ? `Coderhelm forgets the sign-in. Its ${sourcesWords(k.sources)} in Knowledge stop syncing until someone signs in again.`
        : "Coderhelm forgets the sign-in. Nothing in Knowledge syncs from it yet."}
    </DangerRow>
  );
}
