"use client";

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { api, type BillingInfo } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ChatMarkdown } from "@/components/chat-markdown";
import { useStreamingChat, messageText, messageServers } from "@/hooks/use-streaming-chat";
import type { StreamMessage, ToolCallPart, ThinkingPart, TextPart } from "@/lib/stream-types";
import { ThinkingBlock } from "@/components/thinking-block";
import { ToolCallCard } from "@/components/tool-call-card";
import { StreamingCursor } from "@/components/streaming-cursor";
import { useSmartScroll, ScrollPill } from "@/components/smart-scroll";
import { SquareIcon, RefreshIcon, ZapIcon, PenIcon, CheckIcon, XIcon, CopyIcon } from "@/components/stream-icons";

interface DraftTask {
  title: string;
  description: string;
  acceptance_criteria: string;
  order: number;
}

interface DraftPlan {
  title: string;
  description: string;
  repo: string;
  tasks: DraftTask[];
}

function parsePlan(text: string): DraftPlan | null {
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse a partial/incomplete plan JSON while streaming */
function parsePartialPlan(text: string): Partial<DraftPlan> & { tasks: DraftTask[] } | null {
  const jsonStart = text.indexOf("```json\n");
  if (jsonStart === -1) return null;

  let json = text.slice(jsonStart + 8);
  // Remove trailing ``` if present
  const jsonEnd = json.indexOf("\n```");
  if (jsonEnd !== -1) json = json.slice(0, jsonEnd);

  // Try parsing as-is first
  try {
    return JSON.parse(json);
  } catch {
    // Try to close open braces/brackets for partial JSON
    try {
      let attempt = json.trim();
      // Close any unclosed strings/arrays/objects
      const opens = { "{": 0, "[": 0 };
      let inString = false;
      let escape = false;
      for (const ch of attempt) {
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") opens["{"]++;
        if (ch === "}") opens["{"]--;
        if (ch === "[") opens["["]++;
        if (ch === "]") opens["["]--;
      }
      if (inString) attempt += '"';
      // If we're inside the tasks array, close current object + array + root
      for (let i = 0; i < opens["{"]; i++) attempt += "}";
      for (let i = 0; i < opens["["]; i++) attempt += "]";
      // Remove trailing commas before closing brackets
      attempt = attempt.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === "object") {
        return { tasks: [], ...parsed };
      }
    } catch {
      // Can't parse even with fixes
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Thinking indicator (shown before first token arrives)
// ---------------------------------------------------------------------------

function ThinkingIndicator() {
  return (
    <div className="flex justify-start animate-message-in">
      <div className="px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center">
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy button for full messages
// ---------------------------------------------------------------------------

function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  if (!text.trim()) return null;

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors opacity-0 group-hover/msg:opacity-100 cursor-pointer"
      title={copied ? "Copied!" : "Copy message"}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Editable user message bubble
// ---------------------------------------------------------------------------

const EditableUserBubble = memo(function EditableUserBubble({
  msg,
  onEdit,
  disabled,
}: {
  msg: StreamMessage;
  onEdit: (newText: string) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const textContent = messageText(msg);

  const startEdit = () => {
    setEditText(textContent);
    setEditing(true);
  };

  const submitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== textContent) {
      onEdit(trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex justify-end animate-message-in">
        <div className="max-w-[85%] w-full">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitEdit();
              }
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
            rows={3}
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-600 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 resize-none"
          />
          <div className="flex justify-end gap-2 mt-1.5">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <XIcon />
              Cancel
            </button>
            <button
              onClick={submitEdit}
              disabled={!editText.trim() || editText.trim() === textContent}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-zinc-100 text-zinc-900 rounded-md font-medium hover:bg-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <CheckIcon />
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end animate-message-in group">
      <div className="max-w-[85%] px-4 py-3 rounded-xl text-sm leading-relaxed bg-zinc-700 text-zinc-100 whitespace-pre-wrap relative">
        {textContent}
        {!disabled && (
          <button
            onClick={startEdit}
            className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            title="Edit message"
          >
            <PenIcon />
          </button>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Message bubble — renders multi-part messages
// ---------------------------------------------------------------------------

const MessageBubble = memo(function MessageBubble({ msg }: { msg: StreamMessage }) {
  const isUser = msg.role === "user";
  const textContent = messageText(msg);
  const servers = messageServers(msg);
  const thinkingParts = msg.parts.filter((p): p is ThinkingPart => p.type === "thinking");
  const toolParts = msg.parts.filter((p): p is ToolCallPart => p.type === "tool_call");
  const textParts = msg.parts.filter((p): p is TextPart => p.type === "text");

  const hasContent = textContent || thinkingParts.length > 0 || toolParts.length > 0;

  if (!hasContent && !msg.streaming) return null;

  // Detect plan JSON in text for badge
  const hasPlan = textContent.includes("```json");
  const cleanText = hasPlan
    ? textContent.replace(/```json\n[\s\S]*?\n```/g, "").trim()
    : textContent;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-message-in group/msg`}>
      <div
        className={`max-w-[85%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
          isUser
            ? "bg-zinc-700 text-zinc-100 whitespace-pre-wrap"
            : "bg-zinc-900 border border-zinc-800 text-zinc-200"
        }`}
      >
        {/* MCP server badges */}
        {servers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {servers.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-500 text-xs font-medium"
              >
                <ZapIcon />
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Thinking block */}
        {thinkingParts.map((part, i) => (
          <ThinkingBlock
            key={i}
            content={part.content}
            streaming={msg.streaming && i === thinkingParts.length - 1}
          />
        ))}

        {/* Tool call cards */}
        {toolParts.map((part) => (
          <ToolCallCard key={part.id} tool={part} />
        ))}

        {/* Plan generated badge */}
        {hasPlan && !isUser && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-400 text-xs font-medium">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Plan generated — see preview
            </span>
          </div>
        )}

        {/* Text content */}
        {!isUser && cleanText ? (
          <span>
            <ChatMarkdown>{cleanText}</ChatMarkdown>
            {msg.streaming && <StreamingCursor />}
          </span>
        ) : isUser ? (
          textContent
        ) : msg.streaming && !cleanText && toolParts.length === 0 && thinkingParts.length === 0 ? null : (
          <span>
            {cleanText}
            {msg.streaming && <StreamingCursor />}
          </span>
        )}

        {/* Copy button for assistant messages */}
        {!isUser && !msg.streaming && cleanText && (
          <div className="flex justify-end mt-1">
            <MessageCopyButton text={cleanText} />
          </div>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NewPlanPage() {
  const { messages, status, error, send, stop, retry, clear, editAndResend } = useStreamingChat();
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<DraftPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [destination, setDestination] = useState<"github" | "jira">("github");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  const { sentinelRef, showPill, scrollToBottom, onNewContent } = useSmartScroll(scrollContainerRef);

  // Load billing + workflow settings
  useEffect(() => {
    api
      .getBilling()
      .then((b) => setBilling(b))
      .catch(() => {})
      .finally(() => setBillingLoading(false));
    api.getWorkflowSettings().then((s) => setDestination(s.default_destination ?? "github")).catch(() => {});
  }, []);

  const plansEnabled = billingLoading || billing?.subscription_status === "active";

  // Parse draft plan from latest assistant message (memoized)
  const lastAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messageText(messages[i]);
    }
    return "";
  }, [messages]);
  const isStreamingPlan = (status === "streaming" || status === "submitted") && lastAssistantText.includes("```json") && !lastAssistantText.includes("\n```\n");

  useEffect(() => {
    const parsed = parsePlan(lastAssistantText);
    if (parsed) setDraft(parsed);
  }, [lastAssistantText]);

  // Parse partial plan during streaming for incremental task display (throttled)
  const [streamingPartialPlan, setStreamingPartialPlan] = useState<ReturnType<typeof parsePartialPlan>>(null);
  const lastParseRef = useRef(0);

  useEffect(() => {
    if (!isStreamingPlan) {
      setStreamingPartialPlan(null);
      return;
    }
    const now = Date.now();
    if (now - lastParseRef.current < 200) return;
    lastParseRef.current = now;
    setStreamingPartialPlan(parsePartialPlan(lastAssistantText));
  }, [isStreamingPlan, lastAssistantText]);

  // Auto-scroll on new content (merged: new messages + streaming updates)
  const prevMsgCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length !== prevMsgCount.current) {
      prevMsgCount.current = messages.length;
      onNewContent();
    } else if (status === "streaming") {
      onNewContent(true);
    }
  }, [messages, status, onNewContent]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    send(text);
    scrollToBottom();
  }, [input, send, scrollToBottom]);

  const savePlan = async () => {
    if (!plansEnabled) {
      toast("Plans requires Pro or the Plans add-on", "error");
      return;
    }
    if (!draft) return;
    setSaving(true);
    try {
      const { plan_id } = await api.createPlan({ ...draft, destination });
      clear();
      setDraft(null);
      toast("Plan created!");
      router.push(`/plans/detail?id=${plan_id}`);
    } catch {
      toast("Failed to save plan", "error");
      setSaving(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Esc → stop generation
      if (e.key === "Escape" && (status === "submitted" || status === "streaming")) {
        e.preventDefault();
        stop();
      }
      // Cmd+Shift+Backspace → clear conversation
      if (e.key === "Backspace" && e.metaKey && e.shiftKey) {
        e.preventDefault();
        clear();
        setDraft(null);
        setInput("");
      }
      // ↑ in empty input → edit last user message
      if (e.key === "ArrowUp" && status !== "submitted" && status !== "streaming") {
        const textarea = inputRef.current;
        if (textarea && document.activeElement === textarea && !input.trim()) {
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          if (lastUser) {
            e.preventDefault();
            editAndResend(lastUser.id, messageText(lastUser));
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [status, stop, clear, input, messages, editAndResend]);

  if (!plansEnabled) {
    return (
      <div className="max-w-2xl">
        <a href="/plans" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Plans
        </a>
        <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6">
          <h1 className="text-lg font-semibold text-yellow-300">Plans is a paid feature</h1>
          <p className="text-sm text-yellow-200/80 mt-2">
            Upgrade to Pro (or add the Plans add-on) to use AI planning and create executable task lists.
          </p>
          <a
            href="/billing"
            className="inline-block mt-4 px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200"
          >
            Go to Billing
          </a>
        </div>
      </div>
    );
  }

  const isActive = status === "submitted" || status === "streaming";

  return (
    <div className="max-w-4xl flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-3 mb-4">
        <a href="/plans" className="text-zinc-500 hover:text-zinc-300 text-sm">← Plans</a>
        {messages.length > 1 && (
          <button
            onClick={() => {
              clear();
              setDraft(null);
              setInput("");
            }}
            disabled={isActive}
            className="ml-auto px-3 py-1.5 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            Start over
          </button>
        )}
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Chat panel */}
        <div className="flex flex-col flex-1 min-h-0 relative">
          <div className="px-3 py-2 mb-2 text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            Responses are AI-generated and may contain errors. Review all suggestions carefully.
          </div>

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2">
            {messages.map((msg) =>
              msg.role === "user" ? (
                <EditableUserBubble
                  key={msg.id}
                  msg={msg}
                  onEdit={(newText) => editAndResend(msg.id, newText)}
                  disabled={isActive}
                />
              ) : (
                <MessageBubble key={msg.id} msg={msg} />
              ),
            )}
            {status === "submitted" &&
              messages[messages.length - 1]?.parts.length === 0 && <ThinkingIndicator />}
            <div ref={sentinelRef} className="h-px" />
          </div>

          {/* Scroll pill */}
          <ScrollPill visible={showPill} onClick={scrollToBottom} />

          {/* Error + retry bar */}
          {status === "error" && error && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg">
              <span className="text-zinc-500">Failed: {error}</span>
              <button
                onClick={retry}
                className="ml-auto flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <RefreshIcon />
                Retry
              </button>
            </div>
          )}

          {/* Input bar */}
          <div className="flex gap-2 pt-3 border-t border-zinc-800">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Describe what you want to build... (Enter to send)"
              rows={2}
              disabled={isActive}
              className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none disabled:opacity-50"
            />
            {isActive ? (
              <button
                onClick={stop}
                className="px-4 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-600 transition-colors self-end cursor-pointer flex items-center gap-1.5"
                title="Stop generation (Esc)"
              >
                <SquareIcon />
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors self-end cursor-pointer"
              >
                Send
              </button>
            )}
          </div>
        </div>

        {/* Draft plan panel */}
        {(draft || isStreamingPlan) && (
          <div className="w-96 flex-shrink-0 flex flex-col min-h-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4 overflow-y-auto flex-1">
              {isStreamingPlan && !draft ? (
                /* Live incremental plan while JSON is streaming in */
                <div className="space-y-4 animate-message-in">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Generating plan</p>
                    {streamingPartialPlan?.title ? (
                      <h3 className="text-base font-bold text-zinc-100">{streamingPartialPlan.title}</h3>
                    ) : (
                      <div className="h-5 bg-zinc-800 rounded w-3/4 animate-pulse mt-1" />
                    )}
                    {streamingPartialPlan?.description && (
                      <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{streamingPartialPlan.description}</p>
                    )}
                    {streamingPartialPlan?.repo && (
                      <p className="text-xs text-zinc-500 mt-1 font-mono">{streamingPartialPlan.repo}</p>
                    )}
                    {streamingPartialPlan?.tasks && streamingPartialPlan.tasks.length > 0 && (
                      <p className="text-xs text-zinc-500 mt-2">
                        {streamingPartialPlan.tasks.length} task{streamingPartialPlan.tasks.length !== 1 ? "s" : ""} so far...
                      </p>
                    )}
                    {!streamingPartialPlan && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="flex gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:0ms]" />
                          <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:150ms]" />
                          <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:300ms]" />
                        </span>
                        <span className="text-xs text-zinc-600">Building plan structure...</span>
                      </div>
                    )}
                  </div>

                  {/* Incrementally rendered tasks */}
                  {streamingPartialPlan?.tasks && streamingPartialPlan.tasks.length > 0 ? (
                    <div className="space-y-3">
                      {streamingPartialPlan.tasks.map((task, i) => (
                        <div key={i} className="border border-zinc-800 rounded-lg p-3 animate-message-in">
                          <div className="flex gap-2.5">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center text-xs mt-0.5">
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-200 font-medium">{task.title || "..."}</p>
                              {task.description && (
                                <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-wrap">{task.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Skeleton for next task being generated */}
                      <div className="border border-zinc-800 rounded-lg p-3 opacity-40">
                        <div className="flex gap-2.5">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3.5 bg-zinc-800 rounded w-3/4 animate-pulse" />
                            <div className="h-3 bg-zinc-800/60 rounded w-full animate-pulse [animation-delay:100ms]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : streamingPartialPlan ? (
                    /* Have title but no tasks yet — show skeleton tasks */
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="border border-zinc-800 rounded-lg p-3 space-y-2">
                          <div className="flex gap-2.5">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3.5 bg-zinc-800 rounded w-3/4 animate-pulse" />
                              <div className="h-3 bg-zinc-800/60 rounded w-full animate-pulse [animation-delay:100ms]" />
                              <div className="h-3 bg-zinc-800/60 rounded w-2/3 animate-pulse [animation-delay:200ms]" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* No parseable JSON yet — show full skeleton */
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="border border-zinc-800 rounded-lg p-3 space-y-2">
                          <div className="flex gap-2.5">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3.5 bg-zinc-800 rounded w-3/4 animate-pulse" />
                              <div className="h-3 bg-zinc-800/60 rounded w-full animate-pulse [animation-delay:100ms]" />
                              <div className="h-3 bg-zinc-800/60 rounded w-2/3 animate-pulse [animation-delay:200ms]" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : draft ? (
                /* Full plan render */
                <>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Generated plan</p>
                    <h3 className="text-base font-bold text-zinc-100">{draft.title}</h3>
                    {draft.description && <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{draft.description}</p>}
                    {draft.repo && <p className="text-xs text-zinc-500 mt-1 font-mono">{draft.repo}</p>}
                    <p className="text-xs text-zinc-500 mt-2">{draft.tasks.length} task{draft.tasks.length !== 1 ? "s" : ""}</p>
                  </div>

                  <div className="space-y-3">
                    {draft.tasks.map((task, i) => (
                      <div key={i} className="border border-zinc-800 rounded-lg p-3">
                        <div className="flex gap-2.5">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center text-xs mt-0.5">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-200 font-medium">{task.title}</p>
                            {task.description && (
                              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-wrap">{task.description}</p>
                            )}
                            {task.acceptance_criteria && (
                              <div className="mt-2">
                                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Acceptance criteria</p>
                                <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">{task.acceptance_criteria}</pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Destination</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDestination("github")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                          destination === "github"
                            ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                            : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                        GitHub Issues
                      </button>
                      <button
                        onClick={() => setDestination("jira")}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                          destination === "jira"
                            ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                            : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.36 4.36 0 004.34 4.34h1.8v1.72a4.36 4.36 0 004.34 4.34V7.63a.84.84 0 00-.84-.84H6.77zM2 11.6a4.35 4.35 0 004.34 4.34h1.8v1.72A4.35 4.35 0 0012.48 22v-9.57a.84.84 0 00-.84-.84H2z"/></svg>
                        Jira Tickets
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={savePlan}
                    disabled={saving}
                    className="w-full px-4 py-2.5 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving..." : "Save plan"}
                  </button>
                  <p className="text-xs text-zinc-500 text-center">You can edit tasks before executing</p>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
