"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, type BillingInfo } from "@/lib/api";
import { useToast } from "@/components/toast";

interface Message {
  role: "user" | "assistant";
  content: string;
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

      const { content } = await api.planChat(chatMessages);

      const assistantMsg: Message = { role: "assistant", content };
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
      const { plan_id } = await api.createPlan(draft);
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
          <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user"
                      ? "bg-zinc-700 text-zinc-100"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-200"
                  }`}
                >
                  {msg.content.includes("```json")
                    ? msg.content.split(/```json\n[\s\S]*?\n```/).map((part, j, arr) => (
                        <span key={j}>
                          {part}
                          {j < arr.length - 1 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 my-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400 text-xs font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              Plan generated — see preview
                            </span>
                          )}
                        </span>
                      ))
                    : msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 text-sm">
                  Thinking...
                </div>
              </div>
            )}
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

              <button
                onClick={savePlan}
                disabled={saving}
                className="w-full px-4 py-2.5 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : "Save plan"}
              </button>
              <p className="text-xs text-zinc-500 text-center">You can edit tasks after saving</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
