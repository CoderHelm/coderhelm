"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnTitle, Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Modal } from "@/components/modal";
import { Menu } from "@/components/menu";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { usePaletteActions, type PageAction } from "@/components/command-palette";
import { ComposeIcon, MoreIcon, SidebarIcon } from "@/components/icons";
import { useCan } from "@/hooks/use-can";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton, smallSecondaryButton } from "@/components/ui";
import { useSmartScroll, ScrollPill } from "@/components/smart-scroll";
import { KNOWLEDGE_HREF } from "@/lib/routes";
import {
  askBrain,
  brainApi,
  NO_PICKS,
  uploadProblem,
  uploadToSignedUrl,
  type BrainMessage,
  type BrainSources,
  type BrainThread,
  type Citation,
  type Picks,
  type Rating,
  type Starter,
} from "@/lib/brain";
import { AnswerView, SourceIcon, type ToolStep } from "./answer";
import { ChatComposer, type PendingFile } from "./composer";
import { defaultPicks, picksCount, SourcePicker } from "./source-picker";
import { ThreadList } from "./thread-list";

// Chat: a question about the team's work, answered only from the sources the
// asker turns on (knowledge, repositories, connections, memories, data
// sources, skills), with a citation on every claim.
//
// The page opens on the question box, focused, with starter questions built
// from the team's own data. Chats sit in a sidebar on wide screens (it can
// be hidden) and in a sheet on narrower screens. A chat is yours until you share it;
// teammates then read it but only you ask in it.

export default function ChatPage() {
  return (
    <Suspense fallback={<Page><p className="text-sm text-zinc-500">Loading…</p></Page>}>
      <Chat />
    </Suspense>
  );
}

interface LiveAnswer {
  text: string;
  steps: ToolStep[];
  citations: Citation[];
  grounded: boolean;
  done: boolean;
  error?: string;
  /** The asker pressed Stop. */
  stopped?: boolean;
}

const ATTACH_LIMIT = { max_file_bytes: 10 * 1024 * 1024, extensions: ["pdf", "docx", "md", "markdown", "txt", "text", "csv", "xlsx", "html", "htm"] };
const MAX_FILES = 3;
const PICKS_KEY = "coderhelm:brain-sources";
const RAIL_KEY = "coderhelm:chat-rail";

function loadPicks(): Picks | null {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    return raw ? { ...NO_PICKS, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

/** A mouse or trackpad: focusing the box there doesn't pop up a keyboard. */
function finePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
}

function Chat() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const threadId = params.get("thread") ?? "";

  // Asking is the brain_ask capability; managing knowledge is knowledge_manage.
  const { can, ready: capsReady } = useCan();
  const canAsk = can("brain_ask");
  const canManageKnowledge = can("knowledge_manage");

  const [threads, setThreads] = useState<BrainThread[] | null>(null);
  const [sources, setSources] = useState<BrainSources | null>(null);
  const [starters, setStarters] = useState<Starter[] | null>(null);
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [thread, setThread] = useState<BrainThread | null>(null);
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [threadCanAsk, setThreadCanAsk] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [live, setLive] = useState<{ question: string; answer: LiveAnswer } | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [ratings, setRatings] = useState<Record<number, Rating | null>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [renaming, setRenaming] = useState<BrainThread | null>(null);
  const [mac, setMac] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { sentinelRef, showPill, scrollToBottom, onNewContent } = useSmartScroll(scrollRef);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    try {
      if (localStorage.getItem(RAIL_KEY) === "hidden") setRailOpen(false);
    } catch {}
  }, []);

  const toggleRail = useCallback((open: boolean) => {
    setRailOpen(open);
    try {
      localStorage.setItem(RAIL_KEY, open ? "shown" : "hidden");
    } catch {}
  }, []);

  const loadThreads = useCallback(() => {
    brainApi
      .threads()
      .then((r) => setThreads(r.threads))
      .catch(() => {
        setThreads([]);
        setLoadError("Your chats didn't load. Refresh the page to try again.");
      });
  }, []);

  useEffect(() => {
    loadThreads();
    brainApi
      .sources()
      .then((s) => {
        setSources(s);
        // Last time's picks (minus knowledge that is gone), else a sensible start.
        const saved = loadPicks();
        const ids = new Set(s.knowledge.map((b) => b.id));
        setPicks(saved ? { ...saved, knowledge: saved.knowledge.filter((k) => ids.has(k)) } : defaultPicks(s));
      })
      .catch(() => setSources({ kinds: [], knowledge: [], connections: [], repos: [], can_ask: false }));
    brainApi
      .starters()
      .then((r) => setStarters(r.starters ?? []))
      .catch(() => setStarters([]));
  }, [loadThreads]);

  const changePicks = (p: Picks) => {
    setPicks(p);
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(p));
    } catch {}
  };

  const focusBox = useCallback(() => {
    if (finePointer()) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // The box appears once the capabilities are known: focus it then.
  useEffect(() => {
    if (capsReady && canAsk) focusBox();
  }, [capsReady, canAsk, focusBox]);

  // Open the chat in the address.
  useEffect(() => {
    if (!threadId) {
      setThread(null);
      setMessages([]);
      setThreadCanAsk(true);
      setLoadingThread(false);
      focusBox();
      return;
    }
    if (live && !live.answer.done) return;
    let on = true;
    setLoadingThread(!thread || thread.id !== threadId);
    brainApi
      .thread(threadId)
      .then((r) => {
        if (!on) return;
        setThread(r.thread);
        setMessages(r.messages);
        setRatings({});
        setThreadCanAsk(r.can_ask);
        setLive(null);
        setLoadingThread(false);
        focusBox();
      })
      .catch(() => {
        if (!on) return;
        setLoadingThread(false);
        setLoadError("This chat didn't open. It may have been deleted; pick another or start a new one.");
      });
    return () => {
      on = false;
    };
    // `live` and `thread` are read only to skip reloading mid-answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, focusBox]);

  useEffect(() => {
    onNewContent(!!live && !live.answer.done);
  }, [messages, live, onNewContent]);

  const busy = !!live && !live.answer.done;
  const uploading = files.some((f) => f.status === "uploading");

  const attach = async (list: File[]) => {
    for (const file of list.slice(0, Math.max(0, MAX_FILES - files.length))) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      const problem = uploadProblem(file, ATTACH_LIMIT);
      if (problem) {
        setFiles((f) => [...f, { key, name: file.name, status: "failed", progress: 0, error: problem }]);
        continue;
      }
      setFiles((f) => [...f, { key, name: file.name, status: "uploading", progress: 0 }]);
      try {
        const r = await brainApi.attach({ name: file.name, size: file.size });
        await uploadToSignedUrl(r.upload, file, (p) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, progress: p } : x))));
        setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: "ready", id: r.id, name: r.name, progress: 1 } : x)));
      } catch (e) {
        setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: "failed", error: e instanceof Error ? e.message : "Upload failed" } : x)));
      }
    }
  };

  const ask = async (question: string, sourcesForIt: Picks) => {
    if (!question || busy || uploading) return;
    setInput("");
    const attachments = files.filter((f) => f.status === "ready" && f.id).map((f) => ({ id: f.id!, name: f.name }));
    setFiles([]);
    const answer: LiveAnswer = { text: "", steps: [], citations: [], grounded: true, done: false };
    setLive({ question, answer });
    window.setTimeout(() => scrollToBottom(true), 0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let newId = thread?.id ?? "";
    const update = (fn: (a: LiveAnswer) => LiveAnswer) => setLive((l) => (l ? { ...l, answer: fn(l.answer) } : l));
    try {
      await askBrain(
        { thread_id: thread?.id, question, sources: sourcesForIt, attachments },
        (e) => {
          switch (e.type) {
            case "thread":
              newId = e.id;
              break;
            case "text_delta":
              update((a) => ({ ...a, text: a.text + e.text }));
              break;
            case "text_reset":
              update((a) => ({ ...a, text: "" }));
              break;
            case "tool_start":
              update((a) => ({ ...a, steps: [...a.steps, { id: e.id, label: e.name.replace(/_/g, " "), status: "running" }] }));
              break;
            case "tool_result":
              update((a) => ({ ...a, steps: a.steps.map((s) => (s.id === e.id ? { ...s, label: e.label, status: e.status, summary: e.summary } : s)) }));
              break;
            case "answer":
              update((a) => ({ ...a, text: e.text, citations: e.citations, grounded: e.grounded }));
              break;
            case "error":
              update((a) => ({ ...a, error: e.message }));
              break;
            case "done":
              update((a) => ({ ...a, done: true }));
              break;
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      if (!ctrl.signal.aborted) update((a) => ({ ...a, error: e instanceof Error ? e.message : "No answer came back. Check your connection and ask again.", done: true }));
    }
    const stopped = ctrl.signal.aborted;
    update((a) => ({ ...a, done: true, stopped }));
    loadThreads();
    if (newId && newId !== threadId) router.replace(`/chat?thread=${encodeURIComponent(newId)}`);
    else if (newId && !stopped) {
      brainApi
        .thread(newId)
        .then((r) => {
          setThread(r.thread);
          setMessages(r.messages);
          setLive(null);
        })
        .catch(() => {});
    }
  };

  const send = () => ask(input.trim(), picks);
  const stop = () => abortRef.current?.abort();

  const startNew = useCallback(() => {
    if (busy) abortRef.current?.abort();
    setSheetOpen(false);
    setLive(null);
    setInput("");
    router.push("/chat");
    focusBox();
  }, [busy, router, focusBox]);

  // ⌘/ (Ctrl+/ elsewhere): a new chat, from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && canAsk) {
        e.preventDefault();
        startNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startNew, canAsk]);

  const share = async (t: BrainThread, shared: boolean) => {
    try {
      const r = await brainApi.updateThread(t.id, { shared });
      if (thread?.id === t.id) setThread(r.thread);
      loadThreads();
      toast(shared ? "Shared with your team" : "Only you can see this chat now");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sharing didn't change. Try again.", "error");
    }
  };

  const remove = async (t: BrainThread) => {
    const ok = await confirm({
      title: "Delete this chat?",
      message: "Its questions and answers are removed for everyone it was shared with. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await brainApi.deleteThread(t.id);
      setThreads((all) => (all ?? []).filter((x) => x.id !== t.id));
      if (t.id === threadId) router.replace("/chat");
      toast("Chat deleted");
    } catch (e) {
      toast(e instanceof Error ? e.message : "The chat wasn't deleted. Try again.", "error");
    }
  };

  const rename = async (t: BrainThread, title: string) => {
    try {
      const r = await brainApi.updateThread(t.id, { title });
      if (thread?.id === t.id) setThread(r.thread);
      setThreads((all) => (all ?? []).map((x) => (x.id === t.id ? { ...x, title: r.thread.title } : x)));
      setRenaming(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The name didn't save. Try again.", "error");
    }
  };

  const rate = async (seq: number, rating: Rating | null) => {
    if (!thread) return;
    const before = ratings[seq] ?? messages.find((m) => m.seq === seq)?.feedback ?? null;
    setRatings((r) => ({ ...r, [seq]: rating }));
    try {
      await brainApi.rate(thread.id, seq, rating);
      if (rating === "down") toast("Thanks for telling us. Ratings help tune what Chat reads.");
    } catch (e) {
      setRatings((r) => ({ ...r, [seq]: before }));
      toast(e instanceof Error ? e.message : "Your rating didn't save. Try again.", "error");
    }
  };

  const mayAsk = canAsk && threadCanAsk;
  const mine = !!thread?.mine && canAsk;
  const empty = !threadId && !live;
  const lastAnswerSeq = [...messages].reverse().find((m) => m.role === "assistant")?.seq;
  const retry = (seq: number) => {
    const q = [...messages].reverse().find((m) => m.role === "user" && m.seq < seq);
    if (q) ask(q.content, q.sources ? { ...NO_PICKS, ...q.sources } : picks);
  };

  const blocked = uploading ? "Wait for the file to finish uploading" : picksCount(picks) === 0 ? "Choose at least one place to search" : null;
  const shortcut = mac ? "⌘/" : "Ctrl+/";

  const paletteActions = useMemo<PageAction[] | null>(() => {
    const out: PageAction[] = [];
    if (canAsk) out.push({ id: "chat-new", label: "New chat", sub: `Chat · ${shortcut}`, keywords: ["ask", "question", "new"], run: startNew });
    out.push({ id: "chat-rail", label: railOpen ? "Hide the chat list" : "Show the chat list", sub: "Chat", keywords: ["sidebar", "threads", "history"], run: () => toggleRail(!railOpen) });
    if (thread && mine) {
      out.push({ id: "chat-rename", label: "Rename this chat", sub: "Chat", run: () => setRenaming(thread) });
      out.push({ id: "chat-share", label: thread.shared ? "Stop sharing this chat" : "Share this chat with the team", sub: "Chat", run: () => share(thread, !thread.shared) });
      out.push({ id: "chat-delete", label: "Delete this chat", sub: "Chat", run: () => remove(thread) });
    }
    return out;
    // share/remove are recreated each render; the list follows what they act on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAsk, shortcut, startNew, railOpen, toggleRail, thread, mine]);
  usePaletteActions(paletteActions);

  const list = (opts: { inSheet?: boolean }) => (
    <ThreadList
      threads={threads}
      currentId={threadId}
      canAsk={canAsk}
      knowledgeCount={sources ? sources.knowledge.length : null}
      onNew={startNew}
      onPick={() => setSheetOpen(false)}
      onRename={(t) => {
        setSheetOpen(false);
        setRenaming(t);
      }}
      onShare={share}
      onDelete={(t) => {
        setSheetOpen(false);
        remove(t);
      }}
      onCollapse={opts.inSheet ? undefined : () => toggleRail(false)}
      shortcut={opts.inSheet ? undefined : shortcut}
    />
  );

  const composer = (large: boolean) => (
    <ChatComposer
      ref={inputRef}
      value={input}
      onChange={setInput}
      onSend={send}
      onStop={stop}
      busy={busy}
      large={large}
      placeholder={thread ? "Ask a follow-up" : "Ask about your team's work"}
      sources={<SourcePicker sources={sources} value={picks} onChange={changePicks} disabled={busy} />}
      files={files}
      onAttach={attach}
      onRemoveFile={(key) => setFiles((all) => all.filter((x) => x.key !== key))}
      accept={ATTACH_LIMIT.extensions.map((e) => `.${e}`).join(",")}
      maxFiles={MAX_FILES}
      blocked={blocked}
    />
  );

  const readOnlyNote = (
    <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400" data-testid="read-only-note">
      {thread && !thread.mine
        ? `Shared by ${thread.owner_email}. You can read it; only they can ask in it.`
        : "You can read chats your team shares with you. To ask your own questions, ask an admin for access."}
    </p>
  );

  // The small bar over the conversation: the chat list (below 1024px wide,
  // or a hidden sidebar), the chat's name, and its actions.
  const paneBar = (
    <div className="flex min-h-10 min-w-0 items-center gap-1.5 pb-2">
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Chats"
        data-testid="open-chats"
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100 lg:hidden ${focusRing}`}
      >
        <SidebarIcon />
      </button>
      {!railOpen && (
        <button
          type="button"
          onClick={() => toggleRail(true)}
          aria-label="Show chats"
          title="Show chats"
          data-testid="show-chats"
          className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100 lg:inline-flex ${focusRing}`}
        >
          <SidebarIcon />
        </button>
      )}
      {canAsk && (!railOpen || !empty) && (
        <button
          type="button"
          onClick={startNew}
          aria-label="New chat"
          title={`New chat (${shortcut})`}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100 ${railOpen ? "lg:hidden" : ""} ${focusRing}`}
        >
          <ComposeIcon />
        </button>
      )}
      {/* The chat's name is the top bar's last crumb, so it isn't repeated here. */}
      <div className="min-w-0 flex-1" />
      {thread && mine && (
        <>
          <button type="button" onClick={() => share(thread, !thread.shared)} className={`${smallSecondaryButton} shrink-0`} data-testid="share-toggle">
            {thread.shared ? "Shared" : "Share"}
          </button>
          <Menu
            label="Chat actions"
            width="w-48"
            trigger={
              <button
                type="button"
                aria-label="More actions for this chat"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100 ${focusRing}`}
              >
                <MoreIcon />
              </button>
            }
            items={[
              { label: "Rename", onSelect: () => setRenaming(thread) },
              { label: thread.shared ? "Stop sharing" : "Share with team", onSelect: () => share(thread, !thread.shared) },
              { label: "Delete", onSelect: () => remove(thread), danger: true },
            ]}
          />
        </>
      )}
    </div>
  );

  const noData = !!sources && !!starters && starters.length === 0 && sources.knowledge.length === 0;

  return (
    <Page className="flex h-[calc(100dvh-5.25rem)] flex-col md:h-[calc(100dvh-7.25rem)]" testId="chat-page">
      {empty ? <OwnTitle /> : <PageHeader title="Chat" crumb={thread?.title} />}
      <div className="flex min-h-0 flex-1 gap-6">
        {railOpen && <aside className="hidden min-h-0 w-64 shrink-0 lg:flex lg:flex-col">{list({})}</aside>}

        <section aria-label="Conversation" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {paneBar}
          {loadError && (
            <div className="mx-auto mb-3 w-full max-w-3xl">
              <Callout variant="error" title={loadError} />
            </div>
          )}

          {empty ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="chat-empty">
              <div className="mx-auto my-auto flex w-full max-w-2xl flex-col pb-[6vh] pt-4">
                <h1 className="animate-chat-in text-center text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-100 sm:text-[2rem]">What would you like to know?</h1>
                <div className="mt-8">{!capsReady ? <Skeleton className="h-28 rounded-2xl" /> : canAsk ? composer(true) : readOnlyNote}</div>
                {canAsk && (
                  <div className="mt-4" data-testid="starters">
                    {starters === null ? (
                      <div className="grid gap-2 sm:grid-cols-2" aria-label="Loading suggestions">
                        {[0, 1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-[4.25rem] rounded-xl" />
                        ))}
                      </div>
                    ) : starters.length > 0 ? (
                      <ul className="grid gap-2.5 sm:grid-cols-2" aria-label="Suggested questions">
                        {starters.map((s, i) => (
                          <li key={s.question} className="animate-chat-in min-w-0" style={{ animationDelay: `${80 + i * 40}ms` }}>
                            <button
                              type="button"
                              data-testid="starter"
                              disabled={busy}
                              onClick={() => {
                                changePicks({ ...NO_PICKS, ...s.sources });
                                ask(s.question, { ...NO_PICKS, ...s.sources });
                              }}
                              className={`group flex h-full w-full min-w-0 items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/80 motion-reduce:transition-none ${focusRing}`}
                            >
                              <span aria-hidden="true" className="mt-0.5 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300 motion-reduce:transition-none [&_svg]:h-4 [&_svg]:w-4">
                                <SourceIcon kind={starterKind(s)} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm leading-snug text-zinc-200 [overflow-wrap:break-word]">{s.question}</span>
                                <span className="mt-1 block truncate text-xs text-zinc-500">{s.why}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : noData ? (
                      <p className="text-center text-sm text-zinc-500" data-testid="no-knowledge">
                        {canManageKnowledge ? (
                          <>
                            Add your team&apos;s documents so Chat can answer from them.{" "}
                            <Link href={KNOWLEDGE_HREF} className={linkButton}>
                              Add knowledge
                            </Link>
                          </>
                        ) : (
                          "An admin can add your team's documents so Chat can answer from them."
                        )}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden" aria-live="polite" aria-busy={busy}>
                <div className="mx-auto max-w-3xl space-y-8 pb-6 pt-2 sm:px-2">
                  {loadingThread && messages.length === 0 && !live ? (
                    <div className="space-y-4" aria-label="Loading the chat">
                      <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : null}
                  {messages.map((m) =>
                    m.role === "user" ? (
                      <Question key={m.seq} text={m.content} attachments={m.attachments} />
                    ) : (
                      <AnswerView
                        key={m.seq}
                        text={m.content}
                        citations={m.citations}
                        grounded={m.grounded}
                        steps={(m.used ?? []).map((u, i) => ({ id: `${m.seq}-${i}`, label: u.label, status: "success" as const }))}
                        rating={m.seq in ratings ? ratings[m.seq] : m.feedback ?? null}
                        onRate={mine ? (r) => rate(m.seq, r) : undefined}
                        onRetry={mayAsk && mine && m.seq === lastAnswerSeq && !busy ? () => retry(m.seq) : undefined}
                      />
                    ),
                  )}
                  {live && (
                    <>
                      <Question text={live.question} attachments={[]} />
                      {live.answer.error ? (
                        <Callout variant="error" title={live.answer.error} />
                      ) : live.answer.stopped && !live.answer.text ? (
                        <p className="text-sm text-zinc-500" data-testid="answer-stopped">
                          You stopped this answer. Ask again when you&apos;re ready.
                        </p>
                      ) : (
                        <AnswerView
                          text={live.answer.text}
                          citations={live.answer.citations}
                          grounded={live.answer.grounded}
                          streaming={!live.answer.done}
                          steps={live.answer.steps}
                        />
                      )}
                    </>
                  )}
                  <div ref={sentinelRef} className="h-px" />
                </div>
              </div>
              <ScrollPill visible={showPill} onClick={scrollToBottom} />
              <div className="mx-auto w-full max-w-3xl shrink-0 pb-1 pt-2 sm:px-2">
                {!capsReady ? null : mayAsk ? composer(false) : readOnlyNote}
              </div>
            </>
          )}
        </section>
      </div>

      <Modal open={sheetOpen} onOpenChange={setSheetOpen} title="Chats" testId="chats-sheet">
        <div className="h-[calc(100dvh-9rem)] min-h-0 sm:h-[60dvh]">{list({ inSheet: true })}</div>
      </Modal>

      <RenameDialog thread={renaming} onClose={() => setRenaming(null)} onSave={rename} />
    </Page>
  );
}

/** Which kind of source a starter question reads, for its icon. */
function starterKind(s: Starter): string {
  if (s.sources.knowledge?.length) return "knowledge";
  if (s.sources.memories) return "memory";
  if (s.sources.code) return "code";
  if (s.sources.connections) return "connection";
  return "knowledge";
}

function Question({ text, attachments }: { text: string; attachments: string[] }) {
  return (
    <div className="animate-chat-in flex justify-end" data-testid="question">
      <div className="max-w-[85%] min-w-0 rounded-3xl bg-zinc-800/90 px-4 py-2.5 text-sm leading-relaxed text-zinc-100">
        <p className="whitespace-pre-wrap [overflow-wrap:break-word]">{text}</p>
        {attachments.length > 0 && <p className="mt-1 truncate text-xs text-zinc-400">Attached: {attachments.join(", ")}</p>}
      </div>
    </div>
  );
}

function RenameDialog({ thread, onClose, onSave }: { thread: BrainThread | null; onClose: () => void; onSave: (t: BrainThread, title: string) => void }) {
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (thread) setTitle(thread.title);
  }, [thread]);
  const clean = title.trim();
  return (
    <Modal
      open={!!thread}
      onOpenChange={(o) => !o && onClose()}
      title="Rename chat"
      testId="rename-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        if (thread && clean) onSave(thread, clean);
      }}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={!clean || clean.length > 120} className={primaryButton}>
            Save
          </button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">Name</span>
        <input className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Chat name" />
      </label>
    </Modal>
  );
}
