"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useChatNavSlot } from "@/components/chat-nav";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { JumpToLatest, useFollowScroll } from "@/components/follow-scroll";
import { KNOWLEDGE_HREF } from "@/lib/routes";
import {
  askBrain,
  brainApi,
  uploadProblem,
  uploadToSignedUrl,
  type BrainMessage,
  type BrainSources,
  type BrainThread,
  type Citation,
  type Mention,
  type Rating,
  type Starter,
} from "@/lib/brain";
import { AnswerView, SourceIcon, type ToolStep } from "./answer";
import { ChatComposer, type MentionOption, type PendingFile } from "./composer";
import { ThreadList } from "./thread-list";

// Chat: a question about the team's work, answered from the team's own code
// and knowledge, with a citation on every claim. Chat decides what to read
// (everything the asker can see); typing @ points a question at one
// repository or knowledge collection.
//
// The page opens on the question box, focused, with starter questions built
// from the team's own repositories, runs and knowledge. Answers sit in one
// readable column. Chats sit in a sidebar on wide screens (it can be hidden)
// and in a sheet on narrower screens. A chat is yours until you share it;
// teammates then read it but only you ask in it.

/** The reading column: about 740px, centred in the page. */
const COLUMN = "max-w-[46rem]";

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
  /** Every source read so far, for the numbers while the answer streams. */
  known: Citation[];
  grounded: boolean;
  done: boolean;
  error?: string;
  /** The asker pressed Stop. */
  stopped?: boolean;
}

const ATTACH_LIMIT = { max_file_bytes: 10 * 1024 * 1024, extensions: ["pdf", "docx", "md", "markdown", "txt", "text", "csv", "xlsx", "html", "htm"] };
const MAX_FILES = 3;
const RAIL_KEY = "coderhelm:chat-rail";
const DRAFT_KEY = "coderhelm:chat-draft:";

/** Two spellings of one thread id: ids are compared without case. */
function sameThread(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The unsent text for a chat ("" for a new one), kept in this browser so a reload or another chat never loses it. */
function readDraft(threadId: string): string {
  try {
    return localStorage.getItem(DRAFT_KEY + (threadId.toLowerCase() || "new")) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(threadId: string, text: string) {
  try {
    const key = DRAFT_KEY + (threadId.toLowerCase() || "new");
    if (text) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {}
}

/**
 * Puts a chat in the address without a navigation: the history entry changes
 * and useSearchParams follows, but no route is fetched. A router navigation
 * fetches the page's data from the server, and a tab running an older build
 * than the one deployed gets a full page load instead (the page reloads under
 * the reader).
 */
function chatUrl(threadId: string, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  url.search = threadId ? `?thread=${encodeURIComponent(threadId)}` : "";
  if (mode === "push") window.history.pushState(null, "", `${url.pathname}${url.search}`);
  else window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

/** A mouse or trackpad: focusing the box there doesn't pop up a keyboard. */
function finePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
}

function Chat() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const threadId = params.get("thread") ?? "";
  // Opened from a run or pull request: that run goes with the first question,
  // as a chip the asker can remove.
  const fromRun = /^[A-Za-z0-9_-]{1,64}$/.test(params.get("run") ?? "") ? params.get("run")! : "";
  const fromRunTitle = (params.get("title") ?? "").slice(0, 120);

  // Asking is the brain_ask capability; managing knowledge is knowledge_manage.
  const { can, ready: capsReady } = useCan();
  const canAsk = can("brain_ask");
  const canManageKnowledge = can("knowledge_manage");

  const [threads, setThreads] = useState<BrainThread[] | null>(null);
  const [sources, setSources] = useState<BrainSources | null>(null);
  const [starters, setStarters] = useState<Starter[] | null>(null);
  const [mentions, setMentions] = useState<Mention[]>(() => (fromRun && !threadId ? [{ kind: "run", id: fromRun }] : []));
  const [thread, setThread] = useState<BrainThread | null>(null);
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [threadCanAsk, setThreadCanAsk] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  /** Changes when another chat opens (not when this one gets its id or its id's spelling), so its blocks mount fresh. */
  const [convo, setConvo] = useState(0);
  /** A thread id this page put in the address itself: the chat it names is already on screen. */
  const ownUrl = useRef<string | null>(null);
  const [live, setLive] = useState<{ question: string; mentions: Mention[]; answer: LiveAnswer } | null>(null);
  const busy = !!live && !live.answer.done;
  // Follows the answer only while the reader is at the end of it.
  const follow = useFollowScroll(busy);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [ratings, setRatings] = useState<Record<number, Rating | null>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [renaming, setRenaming] = useState<BrainThread | null>(null);
  const [mac, setMac] = useState(true);
  // The app sidebar's chat menu, where the chat list lives (one column of navigation).
  const navSlot = useChatNavSlot();
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      .then(setSources)
      .catch(() => setSources({ knowledge: [], connections: [], repos: [], can_ask: false }));
    brainApi
      .starters()
      .then((r) => setStarters(r.starters ?? []))
      .catch(() => setStarters([]));
  }, [loadThreads]);

  const focusBox = useCallback(() => {
    if (finePointer()) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // The box appears once the capabilities are known: focus it then.
  useEffect(() => {
    if (capsReady && canAsk) focusBox();
  }, [capsReady, canAsk, focusBox]);

  // Open the chat in the address.
  useEffect(() => {
    if (ownUrl.current !== null && ownUrl.current === threadId) {
      ownUrl.current = null;
      return;
    }
    ownUrl.current = null;
    setConvo((c) => c + 1);
    follow.toLatest();
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
        // The address may spell the id in another case: show the thread's own spelling, in place.
        if (r.thread.id !== threadId && sameThread(r.thread.id, threadId)) {
          ownUrl.current = r.thread.id;
          chatUrl(r.thread.id, "replace");
        }
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
    // `live` and `thread` are read only to skip reloading mid-answer; `follow` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, focusBox]);

  // Each chat keeps its own unsent text; another chat (or a new one) brings back its own.
  const draftFor = threadId.toLowerCase();
  useEffect(() => {
    setInput(readDraft(draftFor));
  }, [draftFor]);
  const changeInput = useCallback(
    (text: string) => {
      setInput(text);
      writeDraft(draftFor, text);
    },
    [draftFor],
  );
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

  const ask = async (question: string, pointedAt: Mention[]) => {
    if (!question || busy || uploading) return;
    setInput("");
    writeDraft(threadId, "");
    setMentions([]);
    const attachments = files.filter((f) => f.status === "ready" && f.id).map((f) => ({ id: f.id!, name: f.name }));
    setFiles([]);
    const answer: LiveAnswer = { text: "", steps: [], citations: [], known: [], grounded: true, done: false };
    setLive({ question, mentions: pointedAt, answer });
    // Sending goes to the end once; from there the answer is followed while the reader stays.
    follow.toLatest();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let newId = thread?.id ?? "";
    const update = (fn: (a: LiveAnswer) => LiveAnswer) => setLive((l) => (l ? { ...l, answer: fn(l.answer) } : l));
    try {
      await askBrain(
        { thread_id: thread?.id, question, mentions: pointedAt, attachments },
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
            case "retrieved":
              update((a) => ({ ...a, known: [...a.known, ...e.sources] }));
              break;
            case "tool_start":
              update((a) => ({ ...a, steps: [...a.steps, { id: e.id, name: e.name, label: startLabel(e.name), status: "running" }] }));
              break;
            case "tool_result":
              update((a) => ({
                ...a,
                known: [...a.known, ...(e.sources ?? [])],
                steps: a.steps.map((s) => (s.id === e.id ? { ...s, name: e.name, repo: e.repo, label: e.label, status: e.status, summary: e.summary } : s)),
              }));
              break;
            case "step":
              update((a) => ({ ...a, steps: [...a.steps, { id: e.id, label: e.label, status: e.status }] }));
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
    if (!newId) return;
    const created = !sameThread(newId, threadId);
    // The new chat's address, or the thread's own spelling of its id: in place, never a navigation.
    if (newId !== threadId) {
      // Text typed into a new chat while it answered goes with it.
      if (created && !threadId) {
        writeDraft(newId, readDraft(""));
        writeDraft("", "");
      }
      ownUrl.current = newId;
      chatUrl(newId, "replace");
    }
    if (stopped && !created) return;
    brainApi
      .thread(newId)
      .then((r) => {
        setThread(r.thread);
        setMessages(r.messages);
        if (created) {
          setRatings({});
          setThreadCanAsk(r.can_ask);
        }
        setLive(null);
      })
      .catch(() => {});
  };

  const send = () => ask(input.trim(), mentions);
  const stop = () => abortRef.current?.abort();

  const startNew = useCallback(() => {
    if (busy) abortRef.current?.abort();
    setSheetOpen(false);
    setLive(null);
    chatUrl("", "push");
    focusBox();
  }, [busy, focusBox]);

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

  const pin = async (t: BrainThread, pinned: boolean) => {
    try {
      const r = await brainApi.updateThread(t.id, { pinned });
      if (thread?.id === t.id) setThread(r.thread);
      loadThreads();
      toast(pinned ? "Pinned to the top of your chats" : "Unpinned");
    } catch (e) {
      toast(e instanceof Error ? e.message : "The pin didn't change. Try again.", "error");
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
      writeDraft(t.id, "");
      if (sameThread(t.id, threadId)) chatUrl("", "replace");
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
    if (q) ask(q.content, q.mentions ?? []);
  };

  const blocked = uploading ? "Wait for the file to finish uploading" : null;

  // What a question can be pointed at with @: the team's repositories, then
  // the knowledge this person may read.
  const mentionOptions = useMemo<MentionOption[]>(() => {
    if (!sources) return [];
    const repos: MentionOption[] = (sources.repositories ?? sources.repos.map((name) => ({ name, short: name.split("/").pop() ?? name, role: null }))).map((r) => ({
      kind: "repo",
      id: r.name,
      label: r.short,
      sub: r.role ? `${r.role[0].toUpperCase()}${r.role.slice(1)} code` : "Code",
    }));
    const kbs: MentionOption[] = sources.knowledge.map((b) => ({ kind: "knowledge", id: b.id, label: b.name, sub: "Knowledge" }));
    const runs: MentionOption[] = fromRun ? [{ kind: "run", id: fromRun, label: fromRunTitle ? `Run: ${fromRunTitle}` : "This run", sub: "Run" }] : [];
    return [...repos, ...kbs, ...runs];
  }, [sources, fromRun, fromRunTitle]);
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
      onPin={pin}
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
      onChange={changeInput}
      onSend={send}
      onStop={stop}
      busy={busy}
      large={large}
      placeholder={thread ? "Ask a follow-up" : "Ask about your team's work"}
      mentions={mentions}
      onMentionsChange={setMentions}
      mentionOptions={mentionOptions}
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
      {!navSlot && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Chats"
          data-testid="open-chats"
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100 lg:hidden ${focusRing}`}
        >
          <SidebarIcon />
        </button>
      )}
      {!navSlot && !railOpen && (
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
      {canAsk && !navSlot && (!railOpen || !empty) && (
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

  const noData = !!sources && !!starters && starters.length === 0 && sources.knowledge.length === 0 && sources.repos.length === 0;
  const mentionName = (m: Mention) =>
    mentionOptions.find((o) => o.kind === m.kind && o.id === m.id)?.label ?? (m.kind === "run" ? "A run" : m.id.split("/").pop() ?? m.id);

  // One list for saved turns and the live one, keyed by position: when the
  // answer ends and its saved copy arrives, the same blocks stay mounted
  // instead of being swapped, so nothing moves under the reader.
  const turns: ReactNode[] = messages.map((m, i) =>
    m.role === "user" ? (
      <Question key={`${convo}-${i}`} anchor={`turn-${i}`} text={m.content} attachments={m.attachments} mentions={(m.mentions ?? []).map(mentionName)} />
    ) : (
      <AnswerView
        key={`${convo}-${i}`}
        anchor={`turn-${i}`}
        text={m.content}
        citations={m.citations}
        grounded={m.grounded}
        steps={(m.used ?? []).map((u, j) => ({ id: `${m.seq}-${j}`, label: u.label, name: u.name, repo: u.repo, summary: u.summary, status: "success" as const }))}
        rating={m.seq in ratings ? ratings[m.seq] : m.feedback ?? null}
        onRate={mine ? (r) => rate(m.seq, r) : undefined}
        onRetry={mayAsk && mine && m.seq === lastAnswerSeq && !busy ? () => retry(m.seq) : undefined}
      />
    ),
  );
  if (live) {
    const q = messages.length;
    turns.push(<Question key={`${convo}-${q}`} anchor={`turn-${q}`} text={live.question} attachments={[]} mentions={live.mentions.map(mentionName)} />);
    turns.push(
      live.answer.error ? (
        <Callout key={`${convo}-${q + 1}-error`} variant="error" title={live.answer.error} />
      ) : live.answer.stopped && !live.answer.text ? (
        <p key={`${convo}-${q + 1}-stopped`} className="text-sm text-zinc-500" data-testid="answer-stopped">
          You stopped this answer. Ask again when you&apos;re ready.
        </p>
      ) : (
        <AnswerView
          key={`${convo}-${q + 1}`}
          anchor={`turn-${q + 1}`}
          text={live.answer.text}
          citations={live.answer.done ? live.answer.citations : live.answer.known}
          grounded={live.answer.grounded}
          streaming={!live.answer.done}
          steps={live.answer.steps}
        />
      ),
    );
  }

  return (
    <Page className="flex h-[calc(100dvh-5.25rem)] flex-col md:h-[calc(100dvh-7.25rem)]" testId="chat-page">
      {/* The empty page draws its own heading; an open chat's name is a hidden one (and the top bar's last crumb). */}
      {navSlot && !empty ? <PageHeader title={thread?.title ?? "Chat"} crumb={thread?.title ?? false} titleClassName="sr-only" /> : navSlot ? <OwnTitle /> : empty ? <OwnTitle /> : <PageHeader title="Chat" crumb={thread?.title} />}
      {navSlot && createPortal(list({ inSheet: true }), navSlot)}
      <div className="flex min-h-0 flex-1 gap-6">
        {!navSlot && railOpen && <aside className="hidden min-h-0 w-64 shrink-0 lg:flex lg:flex-col">{list({})}</aside>}

        <section aria-label="Conversation" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {paneBar}
          {loadError && (
            <div className={`mx-auto mb-3 w-full ${COLUMN}`}>
              <Callout variant="error" title={loadError} />
            </div>
          )}

          {empty ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="chat-empty">
              <div className={`mx-auto my-auto flex w-full ${COLUMN} flex-col pb-[8vh] pt-4`}>
                <h1 className="animate-chat-in text-center text-[1.6rem] font-semibold leading-tight tracking-tight text-zinc-100 sm:text-[1.85rem]">What would you like to know?</h1>
                <p className="animate-chat-in mx-auto mt-2 max-w-[30rem] text-center text-sm leading-relaxed text-zinc-500">
                  Ask about your team&apos;s code, docs and work. Chat reads what it needs and shows where each answer comes from.
                </p>
                <div className="mt-7">{!capsReady ? <Skeleton className="h-28 rounded-2xl" /> : canAsk ? composer(true) : readOnlyNote}</div>
                {canAsk && mentionOptions.length > 0 && (
                  <p className="mt-2.5 text-center text-xs text-zinc-600" data-testid="mention-hint">
                    Type @ to focus on one repository or collection.
                  </p>
                )}
                {canAsk && (
                  <div className="mt-8" data-testid="starters">
                    {starters === null ? (
                      <div className="space-y-2" aria-label="Loading suggestions">
                        {[0, 1, 2].map((i) => (
                          <Skeleton key={i} className="h-10 rounded-xl" />
                        ))}
                      </div>
                    ) : starters.length > 0 ? (
                      <>
                        <p className="mb-1.5 px-3 text-xs font-medium text-zinc-500">Try asking</p>
                        <ul className="flex flex-col" aria-label="Suggested questions">
                          {starters.map((s, i) => (
                            <li key={s.question} className="animate-chat-in min-w-0" style={{ animationDelay: `${60 + i * 35}ms` }}>
                              <button
                                type="button"
                                data-testid="starter"
                                disabled={busy}
                                onClick={() => ask(s.question, s.mentions ?? [])}
                                className={`group flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-900 motion-reduce:transition-none ${focusRing}`}
                              >
                                <span aria-hidden="true" className="shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300 motion-reduce:transition-none [&_svg]:h-4 [&_svg]:w-4">
                                  <SourceIcon kind={starterKind(s)} />
                                </span>
                                <span className="min-w-0 flex-1 text-sm leading-snug text-zinc-300 group-hover:text-zinc-100">{s.question}</span>
                                <span className="hidden max-w-[11rem] truncate text-xs text-zinc-600 sm:block">{s.why}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : noData ? (
                      <p className="text-center text-sm text-zinc-500" data-testid="no-knowledge">
                        {canManageKnowledge ? (
                          <>
                            Connect a repository or add your team&apos;s documents so Chat has something to read.{" "}
                            <Link href={KNOWLEDGE_HREF} className={linkButton}>
                              Add knowledge
                            </Link>
                          </>
                        ) : (
                          "An admin can connect repositories or add your team's documents so Chat has something to read."
                        )}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div
                ref={follow.scrollRef}
                tabIndex={0}
                role="region"
                aria-label="Messages"
                className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [overflow-anchor:none] focus-visible:outline-none"
                aria-live="polite"
                aria-busy={busy}
                data-testid="chat-scroll"
              >
                <div ref={follow.contentRef} className={`mx-auto flex ${COLUMN} flex-col pb-8 pt-2 [&>[data-testid=answer]]:mt-5 [&>[data-testid=question]:not(:first-child)]:mt-12`}>
                  {loadingThread && messages.length === 0 && !live ? (
                    <div className="space-y-4" aria-label="Loading the chat">
                      <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : null}
                  {turns}
                </div>
              </div>
              <JumpToLatest visible={follow.behind} onClick={follow.toLatest} />
              <div className={`mx-auto w-full ${COLUMN} shrink-0 pb-1 pt-2`}>
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
  const p = s.sources;
  if (p?.knowledge?.length) return "knowledge";
  if (p?.memories && !p.code) return "memory";
  return "code";
}

function Question({ text, attachments, mentions, anchor }: { text: string; attachments: string[]; mentions: string[]; anchor?: string }) {
  return (
    <div className="animate-chat-in flex flex-col items-end gap-1.5" data-testid="question" data-scroll-anchor={anchor}>
      <div className="max-w-[85%] min-w-0 rounded-2xl bg-zinc-800/80 px-4 py-2.5 text-sm leading-relaxed text-zinc-100">
        <p className="whitespace-pre-wrap wrap-anywhere">{text}</p>
        {attachments.length > 0 && <p className="mt-1 truncate text-xs text-zinc-400">Attached: {attachments.join(", ")}</p>}
      </div>
      {mentions.length > 0 && <p className="max-w-[85%] truncate text-xs text-zinc-500">Only in {mentions.join(", ")}</p>}
    </div>
  );
}

/** What a step says while it runs, before its result names what it read. */
function startLabel(name: string): string {
  switch (name) {
    case "github__repo_overview":
      return "Looking the repository over";
    case "github__read_file":
      return "Reading a file";
    case "github__search_code":
      return "Searching the code";
    case "github__list_files":
      return "Listing files";
    case "github__list_repos":
      return "Listing your repositories";
    case "search_knowledge":
      return "Searching knowledge";
    case "search_memories":
      return "Checking past work";
    default:
      return name.startsWith("graph_") ? "Checking the code graph" : "Looking it up";
  }
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
