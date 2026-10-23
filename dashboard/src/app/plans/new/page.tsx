"use client";

import { Suspense, useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Repo, type Template } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useStreamingChat, messageText, messageServers } from "@/hooks/use-streaming-chat";
import { prefetchStreamToken } from "@/lib/stream-client";
import { useSmartScroll, ScrollPill } from "@/components/smart-scroll";
import { RefreshIcon } from "@/components/stream-icons";
import { focusRing, secondaryButton } from "@/components/ui";
import { Page } from "@/components/page";
import { Segmented } from "@/components/segmented";
import { Composer } from "./composer";
import { AssistantMessage, TimeDivider, UserMessage, timeDivider } from "./conversation";
import { DraftPanel, diffPlans, parsePartialPlan, parsePlan, type DraftPlan, type PlanChange } from "./draft";
import { Starter } from "./starter";

// New plan. A fresh page asks one question ("What do you want to change?")
// with templates and the destination folded below it. Once you send, it is
// a conversation with a sticky message box; the plan it drafts sits beside
// it on wide screens and under a tab on a phone, with what changed marked.

// useSearchParams needs a Suspense boundary in a static export.
export default function NewPlanPage() {
  return (
    <Suspense fallback={<Page><p className="text-sm text-zinc-500">Loading…</p></Page>}>
      <NewPlan />
    </Suspense>
  );
}

const FOLLOW_UPS = ["Make the tasks smaller", "Add tests to each task", "What could go wrong?"];

function NewPlan() {
  const { messages, status, error, send, stop, retry, clear, editAndResend, chatId } = useStreamingChat();
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [destination, setDestination] = useState<"github" | "jira">("github");
  const [jiraReady, setJiraReady] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "plan">("chat");
  const [unseenPlan, setUnseenPlan] = useState(false);
  // When each answer started and finished, for "Worked for 12s".
  const [timing, setTiming] = useState<Record<string, { start: number; end?: number }>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillSent = useRef(false);
  const { toast } = useToast();

  // Auto-send prefill message from query param (e.g. from "Create Plan" on findings)
  useEffect(() => {
    if (prefillSent.current) return;
    const prefill = searchParams.get("prefill");
    // messages always starts with [GREETING], so length 1 means fresh chat
    if (prefill && messages.length <= 1 && status === "idle") {
      prefillSent.current = true;
      send(prefill);
    }
  }, [searchParams, messages.length, status, send]);

  const { sentinelRef, showPill, scrollToBottom, onNewContent } = useSmartScroll(scrollContainerRef);

  // Load workflow settings + prefetch stream token
  useEffect(() => {
    prefetchStreamToken();
    api.getWorkflowSettings().then((s) => setDestination(s.default_destination ?? "github")).catch(() => {});
    api.getJiraCheck().then((c) => setJiraReady(c.ready)).catch(() => {});
    api.listRepos().then((r) => setRepos(r.repos.filter((repo) => repo.enabled))).catch(() => {});
    api.listTemplates({ limit: 6 }).then((data) => setTemplates(data.templates)).catch(() => setTemplates([]));
  }, []);

  // Each answer's plan, and how it changed the one before.
  const plans = useMemo(() => {
    const out: Record<string, { plan: DraftPlan; change: PlanChange | null }> = {};
    let prev: DraftPlan | null = null;
    for (const m of messages) {
      if (m.role !== "assistant" || m.streaming) continue;
      const p = parsePlan(messageText(m));
      if (!p || !Array.isArray(p.tasks)) continue;
      out[m.id] = { plan: p, change: diffPlans(prev, p) };
      prev = p;
    }
    return out;
  }, [messages]);
  const latestPlanId = Object.keys(plans).pop();
  const draft = latestPlanId ? plans[latestPlanId].plan : null;
  const draftChange = latestPlanId ? plans[latestPlanId].change : null;

  const lastAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messageText(messages[i]);
    }
    return "";
  }, [messages]);
  const isActive = status === "submitted" || status === "streaming";
  const isStreamingPlan = isActive && lastAssistantText.includes("```json") && !lastAssistantText.includes("\n```\n");

  // Parse partial plan during streaming for incremental task display (throttled)
  const [partial, setPartial] = useState<ReturnType<typeof parsePartialPlan>>(null);
  const lastParseRef = useRef(0);
  useEffect(() => {
    if (!isStreamingPlan) {
      setPartial(null);
      return;
    }
    const now = Date.now();
    if (now - lastParseRef.current < 200) return;
    lastParseRef.current = now;
    setPartial(parsePartialPlan(lastAssistantText));
  }, [isStreamingPlan, lastAssistantText]);

  // A new plan while the chat tab is showing: mark the Plan tab.
  const seenPlan = useRef(latestPlanId);
  useEffect(() => {
    if (latestPlanId && latestPlanId !== seenPlan.current) {
      seenPlan.current = latestPlanId;
      if (tab === "chat") setUnseenPlan(true);
    }
  }, [latestPlanId, tab]);

  // Time each answer.
  const streamingId = [...messages].reverse().find((m) => m.role === "assistant" && m.streaming)?.id;
  const lastAnswerId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (streamingId && !timing[streamingId]) {
      lastAnswerId.current = streamingId;
      setTiming((t) => ({ ...t, [streamingId]: { start: Date.now() } }));
    }
  }, [streamingId, timing]);
  useEffect(() => {
    const id = lastAnswerId.current;
    if (!isActive && id && timing[id] && !timing[id].end) {
      setTiming((t) => ({ ...t, [id]: { ...t[id], end: Date.now() } }));
    }
  }, [isActive, timing]);

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

  const sendText = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      send(text);
      setTab("chat");
      scrollToBottom();
    },
    [send, scrollToBottom],
  );

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    sendText(text);
  }, [input, sendText]);

  const startOver = () => {
    clear();
    setInput("");
    setTiming({});
    setTab("chat");
    setUnseenPlan(false);
  };

  const savePlan = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      // Collect MCP servers actually used across all messages
      const usedServers = new Set<string>();
      for (const msg of messages) {
        for (const s of messageServers(msg)) usedServers.add(s);
      }
      const mcp_servers = usedServers.size > 0 ? Array.from(usedServers) : undefined;
      // A Jira default with no working Jira connection would make tickets that never send.
      const dest = destination === "jira" && !jiraReady ? "github" : destination;
      const { plan_id } = await api.createPlan({ ...draft, destination: dest, mcp_servers, chat_id: chatId() });
      clear();
      toast("Plan saved");
      router.push(`/plans/detail?id=${plan_id}`);
    } catch {
      toast("Couldn't save the plan", "error");
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

  const handleUseTemplate = async (templateId: string) => {
    setUsingTemplate(templateId);
    try {
      const { plan_id } = await api.useTemplate(templateId, {});
      router.push(`/plans/detail?id=${plan_id}`);
    } catch {
      toast("Couldn't create a plan from this template", "error");
      setUsingTemplate(null);
    }
  };

  // The chat always opens with one greeting, so a fresh chat has one message.
  if (messages.length <= 1) {
    return (
      <Page>
        <Starter
          input={input}
          setInput={setInput}
          onSend={handleSend}
          inputRef={inputRef}
          repos={repos}
          templates={templates}
          usingTemplate={usingTemplate}
          onUseTemplate={handleUseTemplate}
          destination={destination}
          jiraReady={jiraReady}
          onDestination={setDestination}
        />
      </Page>
    );
  }

  const panelShown = !!draft || isStreamingPlan;
  const lastMsg = messages[messages.length - 1];
  const showFollowUps = !isActive && status !== "error" && !!draft && lastMsg?.role === "assistant";
  const showPlan = () => {
    setTab("plan");
    setUnseenPlan(false);
  };

  return (
    <Page className="flex h-[calc(100dvh-6.5rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/plans" className={`rounded text-sm text-zinc-500 hover:text-zinc-300 ${focusRing}`}>
          ← Plans
        </Link>
        <h1 className="text-sm font-semibold text-zinc-200">New plan</h1>
        <button type="button" onClick={startOver} disabled={isActive} className={`ml-auto ${secondaryButton} !min-h-8 !px-3 text-xs`}>
          Start over
        </button>
      </div>

      {panelShown && (
        <div className="mb-3 lg:hidden">
          <Segmented
            label="Show"
            value={tab}
            onChange={(v) => {
              setTab(v as "chat" | "plan");
              if (v === "plan") setUnseenPlan(false);
            }}
            options={[
              { value: "chat", label: "Chat" },
              { value: "plan", label: `Plan${draft ? ` (${draft.tasks.length})` : ""}${unseenPlan ? " · updated" : ""}` },
            ]}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Conversation */}
        <section
          aria-label="Conversation"
          className={`relative min-h-0 min-w-0 flex-1 flex-col ${panelShown && tab === "plan" ? "hidden lg:flex" : "flex"}`}
        >
          <div ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden" aria-live="polite" aria-busy={isActive}>
            <div className="mx-auto max-w-3xl space-y-5 pb-4 pr-1">
              {messages.slice(1).map((msg, i, list) => {
                const divider = timeDivider(list[i - 1], msg);
                return (
                  <Fragment key={msg.id}>
                    {divider && <TimeDivider label={divider} />}
                    {msg.role === "user" ? (
                      <UserMessage msg={msg} onEdit={(t) => editAndResend(msg.id, t)} disabled={isActive} />
                    ) : (
                      <AssistantMessage
                        msg={msg}
                        latest={msg.id === lastMsg.id}
                        startedAt={timing[msg.id]?.start}
                        endedAt={timing[msg.id]?.end}
                        plan={plans[msg.id] ? { tasks: plans[msg.id].plan.tasks.length, change: plans[msg.id].change } : null}
                        onViewPlan={showPlan}
                      />
                    )}
                  </Fragment>
                );
              })}
              <div ref={sentinelRef} className="h-px" />
            </div>
          </div>

          <ScrollPill visible={showPill} onClick={scrollToBottom} />

          <div className="mx-auto w-full max-w-3xl shrink-0 space-y-2 border-t border-zinc-800/80 pt-3">
            {status === "error" && error && (
              <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
                <span className="min-w-0 break-words text-zinc-300" role="alert">
                  Couldn&apos;t get a reply: {error}
                </span>
                <button
                  type="button"
                  onClick={retry}
                  className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded text-zinc-300 hover:text-zinc-100 ${focusRing}`}
                >
                  <RefreshIcon />
                  Retry
                </button>
              </div>
            )}
            {showFollowUps && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Suggested replies">
                {FOLLOW_UPS.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      onClick={() => sendText(f)}
                      className={`rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 ${focusRing}`}
                    >
                      {f}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Composer
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSend={handleSend}
              onStop={stop}
              busy={isActive}
              placeholder={draft ? "Ask for a change to the plan" : "Reply to CoderHelm"}
            />
            <p className="px-1 text-xs text-zinc-600">
              <span className="hidden sm:inline">Enter to send, Shift+Enter for a new line. </span>Answers are AI-written; check them before you save.
            </p>
          </div>
        </section>

        {/* The plan being drafted */}
        {panelShown && (
          <aside
            aria-label="Draft plan"
            className={`min-h-0 w-full flex-col lg:flex lg:w-96 lg:shrink-0 ${tab === "plan" ? "flex" : "hidden"}`}
          >
            <DraftPanel
              draft={draft}
              partial={partial}
              streaming={isStreamingPlan}
              change={draftChange}
              destination={destination}
              jiraReady={jiraReady}
              onDestination={setDestination}
              saving={saving}
              onSave={savePlan}
            />
          </aside>
        )}
      </div>
    </Page>
  );
}
