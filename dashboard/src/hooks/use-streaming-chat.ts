"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type {
  StreamMessage,
  StreamStatus,
  StreamEvent,
  MessagePart,
  TextPart,
  ThinkingPart,
  ToolCallPart,
} from "@/lib/stream-types";
import { streamChat } from "@/lib/stream-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function uid(): string {
  return `msg_${Date.now()}_${++idCounter}`;
}

/** Extract plain text from a multi-part message */
export function messageText(msg: StreamMessage): string {
  return msg.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.content)
    .join("");
}

/** Extract all tool names used in a message */
export function messageTools(msg: StreamMessage): string[] {
  return msg.parts
    .filter((p): p is ToolCallPart => p.type === "tool_call")
    .map((p) => p.name);
}

/** Extract MCP server names from tool calls */
export function messageServers(msg: StreamMessage): string[] {
  const servers = new Set<string>();
  for (const part of msg.parts) {
    if (part.type === "tool_call" && part.server) {
      servers.add(part.server);
    }
  }
  return Array.from(servers);
}

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "coderhelm:plan-chat-v2";

function loadSession(): StreamMessage[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(messages: StreamMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* quota exceeded */
  }
}

function clearSessionStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    // Also clear legacy key
    sessionStorage.removeItem("coderhelm:plan-chat");
  } catch {}
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const GREETING: StreamMessage = {
  id: "greeting",
  role: "assistant",
  parts: [
    {
      type: "text",
      content:
        "Hi! Tell me what you want to build and I'll help you break it into an ordered plan of GitHub issues that Coderhelm can implement one by one.",
    },
  ],
};

interface UseStreamingChatReturn {
  messages: StreamMessage[];
  status: StreamStatus;
  error: string | null;
  send: (text: string) => void;
  stop: () => void;
  retry: () => void;
  clear: () => void;
  editAndResend: (messageId: string, newText: string) => void;
}

export function useStreamingChat(): UseStreamingChatReturn {
  const saved = typeof window !== "undefined" ? loadSession() : null;
  const [messages, setMessages] = useState<StreamMessage[]>(saved ?? [GREETING]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // rAF-throttled update for streaming message
  const pendingParts = useRef<MessagePart[]>([]);
  const rafId = useRef<number | undefined>(undefined);
  const streamingMsgId = useRef<string>("");

  // Persist messages (skip while streaming)
  useEffect(() => {
    if (status === "idle" || status === "ready" || status === "error") {
      saveSession(messages);
    }
  }, [messages, status]);

  const flushParts = useCallback(() => {
    if (pendingParts.current.length === 0) return;
    const parts = [...pendingParts.current];
    pendingParts.current = [];
    const msgId = streamingMsgId.current;

    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx === -1) return prev;
      const msg = prev[idx];
      const updated = { ...msg, parts: mergeParts(msg.parts, parts) };
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = undefined;
        flushParts();
      });
    }
  }, [flushParts]);

  const handleEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case "thinking":
          pendingParts.current.push({ type: "thinking", content: event.text });
          scheduleFlush();
          break;

        case "text_delta":
          setStatus("streaming");
          pendingParts.current.push({ type: "text", content: event.text });
          scheduleFlush();
          break;

        case "tool_start":
          pendingParts.current.push({
            type: "tool_call",
            id: event.id,
            name: event.name,
            server: event.server,
            input: "",
            status: "running",
          });
          scheduleFlush();
          break;

        case "tool_input_delta":
          pendingParts.current.push({
            type: "tool_call",
            id: event.id,
            name: "",
            input: event.partial_json,
            status: "running",
          });
          scheduleFlush();
          break;

        case "tool_result":
          pendingParts.current.push({
            type: "tool_call",
            id: event.id,
            name: "",
            input: "",
            status: event.status as "success" | "error",
            summary: event.summary,
          });
          scheduleFlush();
          break;

        case "usage":
          pendingParts.current.push({
            type: "usage",
            input_tokens: event.input_tokens,
            output_tokens: event.output_tokens,
            turns: event.turns,
          });
          scheduleFlush();
          break;

        case "done":
          // Final flush
          flushParts();
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === streamingMsgId.current);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], streaming: false };
            return next;
          });
          setStatus("ready");
          break;

        case "error":
          flushParts();
          setError(event.message);
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === streamingMsgId.current);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], streaming: false };
            return next;
          });
          setStatus("error");
          break;
      }
    },
    [scheduleFlush, flushParts],
  );

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || status === "submitted" || status === "streaming") return;

      setError(null);
      setStatus("submitted");

      const userMsg: StreamMessage = {
        id: uid(),
        role: "user",
        parts: [{ type: "text", content: text.trim() }],
      };

      const assistantMsg: StreamMessage = {
        id: uid(),
        role: "assistant",
        parts: [],
        streaming: true,
      };

      streamingMsgId.current = assistantMsg.id;
      pendingParts.current = [];

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      // Build plain messages for API (skip greeting)
      const allMsgs = [...messages, userMsg];
      const chatMessages = allMsgs.slice(1).map((m) => ({
        role: m.role,
        content: messageText(m),
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat(chatMessages, {
          signal: controller.signal,
          onEvent: handleEvent,
          onError: (err) => {
            if (controller.signal.aborted) return;
            setError(err.message);
            setStatus("error");
          },
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : "Failed to get response";
          setError(msg);
          setStatus("error");
        }
      }

      abortRef.current = null;
    },
    [messages, status, handleEvent],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Final flush and mark done
    flushParts();
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === streamingMsgId.current);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], streaming: false };
      return next;
    });
    setStatus("ready");
  }, [flushParts]);

  const retry = useCallback(() => {
    // Find last user message and re-send
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    // Remove last assistant message
    setMessages((prev) => {
      const lastAssistantIdx = prev.findLastIndex((m) => m.role === "assistant" && m.id !== "greeting");
      if (lastAssistantIdx === -1) return prev;
      return prev.slice(0, lastAssistantIdx);
    });

    // Re-send last user text
    const text = messageText(lastUser);
    // We need to delay slightly so the state settles
    setTimeout(() => send(text), 50);
  }, [messages, send]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    clearSessionStorage();
    setMessages([GREETING]);
    setStatus("idle");
    setError(null);
  }, []);

  const editAndResend = useCallback(
    (messageId: string, newText: string) => {
      if (!newText.trim() || status === "submitted" || status === "streaming") return;

      // Find the message to edit and truncate everything after it
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      // Keep messages up to (but not including) the edited message
      const truncated = messages.slice(0, idx);

      // Replace the edited message
      const editedMsg: StreamMessage = {
        id: uid(),
        role: "user",
        parts: [{ type: "text", content: newText.trim() }],
      };

      const assistantMsg: StreamMessage = {
        id: uid(),
        role: "assistant",
        parts: [],
        streaming: true,
      };

      streamingMsgId.current = assistantMsg.id;
      pendingParts.current = [];

      const newMessages = [...truncated, editedMsg, assistantMsg];
      setMessages(newMessages);
      setError(null);
      setStatus("submitted");

      // Build plain messages for API (skip greeting)
      const chatMessages = newMessages
        .slice(1)
        .filter((m) => !m.streaming)
        .map((m) => ({
          role: m.role,
          content: messageText(m),
        }));

      const controller = new AbortController();
      abortRef.current = controller;

      streamChat(chatMessages, {
        signal: controller.signal,
        onEvent: handleEvent,
        onError: (err) => {
          if (controller.signal.aborted) return;
          setError(err.message);
          setStatus("error");
        },
      }).catch((err) => {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : "Failed to get response";
          setError(msg);
          setStatus("error");
        }
      }).finally(() => {
        abortRef.current = null;
      });
    },
    [messages, status, handleEvent],
  );

  return { messages, status, error, send, stop, retry, clear, editAndResend };
}

// ---------------------------------------------------------------------------
// Part merging — coalesces streaming deltas into the parts array
// ---------------------------------------------------------------------------

function mergeParts(existing: MessagePart[], incoming: MessagePart[]): MessagePart[] {
  const result = [...existing];

  for (const part of incoming) {
    if (part.type === "text") {
      // Append to last text part or create new one
      const lastIdx = result.length - 1;
      if (lastIdx >= 0 && result[lastIdx].type === "text") {
        result[lastIdx] = {
          ...result[lastIdx],
          content: (result[lastIdx] as TextPart).content + part.content,
        } as TextPart;
      } else {
        result.push({ ...part });
      }
    } else if (part.type === "thinking") {
      // Append to last thinking part or create new one
      const lastThinking = result.findIndex((p) => p.type === "thinking");
      if (lastThinking >= 0) {
        result[lastThinking] = {
          ...result[lastThinking],
          content: (result[lastThinking] as ThinkingPart).content + part.content,
        } as ThinkingPart;
      } else {
        result.push({ ...part });
      }
    } else if (part.type === "tool_call") {
      // Update existing tool call or add new one
      const existingIdx = result.findIndex(
        (p) => p.type === "tool_call" && (p as ToolCallPart).id === part.id,
      );
      if (existingIdx >= 0) {
        const existing = result[existingIdx] as ToolCallPart;
        result[existingIdx] = {
          ...existing,
          name: part.name || existing.name,
          server: part.server || existing.server,
          input: existing.input + part.input,
          status: part.status,
          summary: part.summary || existing.summary,
        };
      } else {
        result.push({ ...part });
      }
    } else if (part.type === "usage") {
      // Replace any existing usage part
      const usageIdx = result.findIndex((p) => p.type === "usage");
      if (usageIdx >= 0) {
        result[usageIdx] = { ...part };
      } else {
        result.push({ ...part });
      }
    }
  }

  return result;
}
