// ---------------------------------------------------------------------------
// SSE stream client — reads typed events from a streaming chat endpoint
// ---------------------------------------------------------------------------

import type { StreamEvent } from "./stream-types";
import { apiBase, streamBase } from "@/lib/runtime-config";

/**
 * A chat stream POST: its headers and body.
 *
 * On the dashboard's own hostname (a self-hosted install) the stream goes
 * through the install's CloudFront, which signs each call to the streaming
 * function (origin access control: the function URL takes only signed calls).
 * CloudFront's signature is the Authorization header, so the token goes in
 * its own header, and Lambda needs the body's SHA-256 in
 * x-amz-content-sha256 to accept a signed POST. A stream on another hostname
 * (the hosted service) takes the token as a bearer token, as before.
 */
export async function streamPost(token: string, payload: unknown): Promise<{ headers: Record<string, string>; body: string }> {
  const body = JSON.stringify(payload);
  if (streamBase() !== "") {
    return { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body };
  }
  return {
    headers: {
      "Content-Type": "application/json",
      "x-coderhelm-stream-token": token,
      "x-amz-content-sha256": await sha256Hex(body),
    },
    body,
  };
}

/** The SHA-256 of `text` (UTF-8), in lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** How long to wait for the token fetch or initial stream connection */
const CONNECT_TIMEOUT_MS = 15_000;
/** How long to wait between chunks during streaming before assuming connection lost */
const STREAM_IDLE_TIMEOUT_MS = 120_000;

export interface StreamOptions {
  /** The chat's id: what it reads, asks and looks up is logged under it. */
  chatId?: string;
  signal?: AbortSignal;
  onEvent: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// User-friendly error messages
// ---------------------------------------------------------------------------

function friendlyError(status: number, serverMsg?: string): string {
  if (serverMsg) return serverMsg;
  switch (status) {
    case 401:
      return "Your session has expired. Please refresh the page and try again.";
    case 403:
      return "You don't have permission to use the chat. Check your subscription.";
    case 429:
      return "Too many requests — please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
      return "The AI service is temporarily unavailable. Please try again in a moment.";
    case 504:
      return "The request timed out. Try a shorter message or try again.";
    default:
      return `Something went wrong (${status}). Please try again.`;
  }
}

function friendlyNetworkError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Request timed out. Check your connection and try again.";
  }
  if (err instanceof TypeError && (err.message.includes("fetch") || err.message.includes("network"))) {
    return "Can't reach the server. Check your internet connection.";
  }
  if (err instanceof Error && err.message.includes("offline")) {
    return "You appear to be offline. Check your connection.";
  }
  return err instanceof Error ? err.message : "Connection failed. Please try again.";
}

// ---------------------------------------------------------------------------
// Online detection
// ---------------------------------------------------------------------------

function assertOnline(): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("You appear to be offline. Check your internet connection and try again.");
  }
}

// ---------------------------------------------------------------------------
// Timeout helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DOMException(`${label} timed out`, "AbortError")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ---------------------------------------------------------------------------
// Token fetch
// ---------------------------------------------------------------------------

// Token cache — avoids re-fetching on every message send
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Fetch a short-lived stream token from the gateway (cached for 4 min). */
async function fetchStreamToken(signal?: AbortSignal): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  assertOnline();

  const res = await withTimeout(
    fetch(`${apiBase()}/api/plans/chat/token`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal,
    }),
    CONNECT_TIMEOUT_MS,
    "Authentication",
  );

  if (!res.ok) {
    throw new Error(friendlyError(res.status));
  }
  const { token } = await res.json();
  cachedToken = { token, expiresAt: Date.now() + 4 * 60 * 1000 };
  return token;
}

/** Warm the token cache so the first message doesn't pay the RTT. */
export function prefetchStreamToken(): void {
  fetchStreamToken().catch(() => {});
}

// ---------------------------------------------------------------------------
// Stream chat
// ---------------------------------------------------------------------------

/**
 * Open a streaming POST request and parse SSE events.
 * Fetches a short-lived auth token from the gateway, then opens
 * the SSE stream to the streaming endpoint.
 */
export async function streamChat(
  messages: { role: string; content: string }[],
  options: StreamOptions,
): Promise<void> {
  const { signal, onEvent, onError, chatId } = options;

  assertOnline();

  const token = await fetchStreamToken(signal);
  const post = await streamPost(token, { messages, chat_id: chatId });

  const res = await withTimeout(
    fetch(`${streamBase()}/api/plans/chat/stream`, {
      method: "POST",
      headers: post.headers,
      body: post.body,
      signal,
    }),
    CONNECT_TIMEOUT_MS,
    "Connection",
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let serverMsg = "";
    try {
      serverMsg = body ? JSON.parse(body).error || "" : "";
    } catch {}
    const msg = friendlyError(res.status, serverMsg);
    const err = new Error(msg);
    onError?.(err);
    onEvent({ type: "error", message: msg });
    return;
  }

  if (!res.body) {
    const msg = "No response body — the server returned an empty response.";
    const err = new Error(msg);
    onError?.(err);
    onEvent({ type: "error", message: msg });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Idle timeout — if no data arrives for STREAM_IDLE_TIMEOUT_MS, assume connection lost
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      reader.cancel().catch(() => {});
    }, STREAM_IDLE_TIMEOUT_MS);
  };

  try {
    resetIdle();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetIdle();
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      let currentData = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "" && currentEvent && currentData) {
          try {
            const parsed = JSON.parse(currentData);
            const event = { type: currentEvent, ...parsed } as StreamEvent;
            onEvent(event);
          } catch {
            // Malformed event — skip
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }

    // Flush any remaining event in buffer
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      let evt = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) evt = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (evt && data) {
        try {
          const parsed = JSON.parse(data);
          onEvent({ type: evt, ...parsed } as StreamEvent);
        } catch {}
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    const msg = friendlyNetworkError(err);
    const error = new Error(msg);
    onError?.(error);
    onEvent({ type: "error", message: msg });
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}
