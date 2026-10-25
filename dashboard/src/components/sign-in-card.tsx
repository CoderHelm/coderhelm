"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SignInPrompt } from "@/lib/agent-policy";
import { buttonClass, linkButton } from "./ui";

// A sign-in card: an agent needs a connection this person hasn't made.
// Connect runs the connection's own sign-in in a popup; the callback page
// tells this window when it's done, and the card reports back so the chat
// carries on by itself. "Not now" is remembered for the conversation.

/** The message the sign-in callback page posts to the window that opened it. */
export const MCP_CONNECTED_MESSAGE = "coderhelm:mcp-connected";

type State = "idle" | "connecting" | "connected" | "declined" | "failed";

export function SignInCard({
  prompt,
  threadId,
  onConnected,
  onDeclined,
}: {
  prompt: SignInPrompt;
  /** The conversation, so "Not now" isn't asked again in it. Empty on a run. */
  threadId?: string;
  onConnected?: () => void;
  onDeclined?: () => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  const popup = useRef<Window | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; server?: string } | null;
      if (!d || d.type !== MCP_CONNECTED_MESSAGE || d.server !== prompt.server_id || done.current) return;
      done.current = true;
      setState("connected");
      onConnected?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [prompt.server_id, onConnected]);

  const connect = async () => {
    setError("");
    setState("connecting");
    // Open the window first, in the click, so a popup blocker allows it.
    const w = window.open("about:blank", "coderhelm-sign-in", "width=520,height=720");
    popup.current = w;
    try {
      const { authorize_url } = await api.connectMcpServer(prompt.server_id);
      if (w) w.location.href = authorize_url;
      else window.location.href = authorize_url;
    } catch (e) {
      w?.close();
      setState("failed");
      setError(e instanceof Error ? e.message : "The sign-in couldn't start.");
    }
  };

  const decline = async () => {
    setState("declined");
    if (threadId) await api.declineSignIn(threadId, prompt.server_id).catch(() => {});
    onDeclined?.();
  };

  return (
    <section
      aria-label={`Sign in to ${prompt.server_name}`}
      data-testid="sign-in-card"
      data-state={state}
      className="min-w-0 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4"
    >
      <p className="text-sm text-zinc-100">{prompt.message}</p>
      {state === "connected" ? (
        <p className="mt-2 text-sm text-emerald-300">{prompt.server_name} is connected.</p>
      ) : state === "declined" ? (
        <p className="mt-2 text-xs text-zinc-400">Not now. You won&apos;t be asked again in this conversation.</p>
      ) : prompt.ask_admin ? (
        <p className="mt-2 text-xs text-zinc-400">
          Only an admin can connect it for the team.{" "}
          <Link href={prompt.link_path} className={linkButton}>
            See integrations
          </Link>
        </p>
      ) : prompt.need === "team_missing" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={prompt.action_path || prompt.link_path} className={buttonClass("primary", "sm")}>
            {prompt.action_label || "Open settings"}
          </Link>
          {threadId && (
            <button type="button" onClick={decline} className={buttonClass("ghost", "sm")}>
              Not now
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={connect} disabled={state === "connecting"} className={buttonClass("primary", "sm")}>
            {state === "connecting" ? "Waiting for sign-in…" : `Connect ${prompt.server_name}`}
          </button>
          {threadId && (
            <button type="button" onClick={decline} className={buttonClass("ghost", "sm")}>
              Not now
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
