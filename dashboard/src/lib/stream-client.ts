// ---------------------------------------------------------------------------
// SSE stream client — reads typed events from a streaming chat endpoint
// ---------------------------------------------------------------------------

import type { StreamEvent } from "./stream-types";

const STREAM_BASE =
  process.env.NEXT_PUBLIC_STREAM_URL || "https://stream.coderhelm.com";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

export interface StreamOptions {
  signal?: AbortSignal;
  onEvent: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
}

/** Fetch a short-lived stream token from the gateway. */
async function fetchStreamToken(signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${API_BASE}/api/plans/chat/token`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Failed to get stream token: ${res.status}`);
  const { token } = await res.json();
  return token;
}

/**
 * Open a streaming POST request and parse SSE events.
 * Fetches a short-lived auth token from the gateway, then opens
 * the SSE stream to the streaming endpoint.
 */
export async function streamChat(
  messages: { role: string; content: string }[],
  options: StreamOptions,
): Promise<void> {
  const { signal, onEvent, onError } = options;

  const token = await fetchStreamToken(signal);

  const res = await fetch(`${STREAM_BASE}/api/plans/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = "";
    try {
      msg = body ? JSON.parse(body).error || "" : "";
    } catch {}
    const err = new Error(msg || `Stream error ${res.status}: ${res.statusText}`);
    onError?.(err);
    onEvent({ type: "error", message: err.message });
    return;
  }

  if (!res.body) {
    const err = new Error("No response body");
    onError?.(err);
    onEvent({ type: "error", message: err.message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

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
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);
    onEvent({ type: "error", message: error.message });
  }
}
