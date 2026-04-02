"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, type BillingInfo, type WorkflowSettings } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ChatMarkdown } from "@/components/chat-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  mcp_servers?: string[];
}

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

// Simple client-side plan parser from AI-structured markdown
function parsePlan(text: string): DraftPlan | null {
  try {
    // Try to find JSON block first
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return null;
  } catch {
    return null;
  }
}

const STORAGE_KEY = "coderhelm:plan-chat";

// Strip MCP tool_call / tool_response blocks from chat content and replace with badges
function formatChatContent(text: string): { clean: string; tools: string[] } {
  const tools: string[] = [];

  // Extract tool names from <tool_call> blocks
  const toolCallRe = /<tool_call>\s*\{?\s*"?name"?\s*:\s*"([^"]+)"[\s\S]*?<\/tool_call>/g;
  let m;
  while ((m = toolCallRe.exec(text)) !== null) {
    tools.push(m[1]);
  }

  let clean = text
    // Remove <tool_call>...</tool_call> blocks
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    // Remove <tool_response>...</tool_response> blocks
    .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, "")
    // Remove orphaned tags (unclosed)
    .replace(/<\/?tool_call>/g, "")
    .replace(/<\/?tool_response>/g, "")
    // Collapse multiple blank lines into one
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { clean, tools };
}

function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
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

function loadSession(): { messages: Message[]; draft: DraftPlan | null } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(messages: Message[], draft: DraftPlan | null) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, draft }));
  } catch { /* quota exceeded — ignore */ }
}

function clearSession() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export default function NewPlanPage() {
  const saved = typeof window !== "undefined" ? loadSession() : null;
  const [messages, setMessages] = useState<Message[]>(
    saved?.messages ?? [
      {
        role: "assistant",
        content: "Hi! Tell me what you want to build and I'll help you break it into an ordered plan of GitHub issues that Coderhelm can implement one by one.",
      },
    ],
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<DraftPlan | null>(saved?.draft ?? null);
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [destination, setDestination] = useState<"github" | "jira">("github");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    api
      .getBilling()
      .then((b) => setBilling(b))
      .catch(() => {})
      .finally(() => setBillingLoading(false));
    api.getWorkflowSettings().then((s) => setDestination(s.default_destination ?? "github")).catch(() => {});
  }, []);

  const plansEnabled = billing?.subscription_status === "active";

  // Persist chat state so navigation doesn't lose progress
  useEffect(() => {
    saveSession(messages, draft);
  }, [messages, draft]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput("");
    setSending(true);

    const updatedMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(updatedMessages);

    try {
      // Send full conversation history (skip the initial greeting) to the backend
      const chatMessages = updatedMessages
        .slice(1) // skip the initial assistant greeting
        .map((m) => ({ role: m.role, content: m.content }));

      const { content, mcp_servers } = await api.planChat(chatMessages);

      const assistantMsg: Message = { role: "assistant", content, mcp_servers };
      setMessages((prev) => [...prev, assistantMsg]);

      // Parse any plan from the response
      const parsed = parsePlan(content);
      if (parsed) {
        setDraft(parsed);
      }
    } catch {
      toast("Failed to get AI response", "error");
    } finally {
      setSending(false);
    }
  };

  const savePlan = async () => {
    if (!plansEnabled) {
      toast("Plans requires Pro or the Plans add-on", "error");
      return;
    }
    if (!draft) return;
    setSaving(true);
    try {
      const { plan_id } = await api.createPlan({ ...draft, destination });
      clearSession();
      toast("Plan created!");
      router.push(`/plans/detail?id=${plan_id}`);
    } catch {
      toast("Failed to save plan", "error");
      setSaving(false);
    }
  };

  if (billingLoading) {
    return <div className="text-sm text-zinc-500">Loading...</div>;
  }

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

  return (
    <div className="max-w-4xl flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-3 mb-4">
        <a href="/plans" className="text-zinc-500 hover:text-zinc-300 text-sm">← Plans</a>
        {messages.length > 1 && (
          <button
            onClick={() => {
              clearSession();
              setMessages([{ role: "assistant", content: "Hi! Tell me what you want to build and I'll help you break it into an ordered plan of GitHub issues that Coderhelm can implement one by one." }]);
              setDraft(null);
              setInput("");
            }}
            className="ml-auto px-3 py-1.5 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
          >
            Start over
          </button>
        )}
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Chat panel */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-3 py-2 mb-2 text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            Responses are AI-generated and may contain errors. Review all suggestions carefully.
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-zinc-700 text-zinc-100 whitespace-pre-wrap"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-200"
                  }`}
                >
                  {msg.mcp_servers && msg.mcp_servers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.mcp_servers.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded text-violet-400 text-xs font-medium">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const { clean, tools } = formatChatContent(msg.content);
                    return (
                      <>
                        {tools.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {tools.map((t, ti) => (
                              <span key={ti} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-xs font-medium">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                {t.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        )}
                        {msg.role === "assistant" ? (
                          <>
                            {clean.includes("```json") && (
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400 text-xs font-medium">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Plan generated — see preview
                                </span>
                              </div>
                            )}
                            <ChatMarkdown>{clean.replace(/```json\n[\s\S]*?\n```/g, "").trim()}</ChatMarkdown>
                          </>
                        ) : clean}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
            {sending && <ThinkingIndicator />}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 pt-3 border-t border-zinc-800">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Describe what you want to build... (Enter to send)"
              rows={2}
              className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors self-end cursor-pointer"
            >
              Send
            </button>
          </div>
        </div>

        {/* Draft plan panel */}
        {draft && (
          <div className="w-96 flex-shrink-0 flex flex-col min-h-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4 overflow-y-auto flex-1">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
