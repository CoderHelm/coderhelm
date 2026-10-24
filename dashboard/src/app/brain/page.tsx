"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { useCan } from "@/hooks/use-can";
import { focusRing, linkButton, secondaryButton, smallSecondaryButton } from "@/components/ui";
import { useSmartScroll, ScrollPill } from "@/components/smart-scroll";
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
} from "@/lib/brain";
import { Composer } from "../plans/new/composer";
import { AnswerView, type ToolStep } from "./answer";
import { SourcePicker } from "./source-picker";

// The company brain: ask a question, get an answer from the team's own
// sources with a citation on every claim. Threads sit on the left (under a
// button on a phone); a thread is yours until you share it with the team.

export default function BrainPage() {
  return (
    <Suspense fallback={<Page><p className="text-sm text-zinc-500">Loading…</p></Page>}>
      <Brain />
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
}

interface PendingFile {
  key: string;
  name: string;
  status: "uploading" | "ready" | "failed";
  progress: number;
  id?: string;
  error?: string;
}

const ATTACH_LIMIT = { max_file_bytes: 10 * 1024 * 1024, extensions: ["pdf", "docx", "md", "markdown", "txt", "text", "csv", "xlsx", "html", "htm"] };
const PICKS_KEY = "coderhelm:brain-sources";

function loadPicks(): Picks | null {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    return raw ? { ...NO_PICKS, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function dayGroup(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  return "Older";
}

function Brain() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const threadId = params.get("thread") ?? "";

  const [threads, setThreads] = useState<BrainThread[] | null>(null);
  // Asking is the brain_ask capability (built-in or custom role).
  const { can } = useCan();
  const canAsk = can("brain_ask");
  const [sources, setSources] = useState<BrainSources | null>(null);
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [thread, setThread] = useState<BrainThread | null>(null);
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [threadCanAsk, setThreadCanAsk] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [live, setLive] = useState<{ question: string; answer: LiveAnswer } | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { sentinelRef, showPill, scrollToBottom, onNewContent } = useSmartScroll(scrollRef);

  const loadThreads = useCallback(() => {
    brainApi
      .threads()
      .then((r) => {
        setThreads(r.threads);
      })
      .catch((e) => {
        setThreads([]);
        setLoadError(e instanceof Error ? e.message : "Couldn't load threads");
      });
  }, []);

  useEffect(() => {
    loadThreads();
    brainApi
      .sources()
      .then((s) => {
        setSources(s);
        // Last time's picks, else every knowledge base.
        const saved = loadPicks();
        const ids = new Set(s.knowledge.map((b) => b.id));
        setPicks(
          saved
            ? { ...saved, knowledge: saved.knowledge.filter((k) => ids.has(k)) }
            : { ...NO_PICKS, knowledge: s.knowledge.map((b) => b.id) },
        );
      })
      .catch(() => setSources({ kinds: [], knowledge: [], connections: [], repos: [], can_ask: false }));
  }, [loadThreads]);

  const changePicks = (p: Picks) => {
    setPicks(p);
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(p));
    } catch {}
  };

  // Open the thread in the address.
  useEffect(() => {
    if (!threadId) {
      setThread(null);
      setMessages([]);
      setThreadCanAsk(true);
      return;
    }
    if (live && !live.answer.done) return;
    let on = true;
    brainApi
      .thread(threadId)
      .then((r) => {
        if (!on) return;
        setThread(r.thread);
        setMessages(r.messages);
        setThreadCanAsk(r.can_ask);
        setLive(null);
      })
      .catch((e) => on && setLoadError(e instanceof Error ? e.message : "Couldn't open the thread"));
    return () => {
      on = false;
    };
    // `live` is read only to skip reloading mid-answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    onNewContent(!!live && !live.answer.done);
  }, [messages, live, onNewContent]);

  const busy = !!live && !live.answer.done;
  const uploading = files.some((f) => f.status === "uploading");

  const attach = async (list: FileList | null) => {
    if (!list) return;
    for (const file of Array.from(list).slice(0, 3 - files.length)) {
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
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    const question = input.trim();
    if (!question || busy || uploading) return;
    setInput("");
    const attachments = files.filter((f) => f.status === "ready" && f.id).map((f) => ({ id: f.id!, name: f.name }));
    setFiles([]);
    const answer: LiveAnswer = { text: "", steps: [], citations: [], grounded: true, done: false };
    setLive({ question, answer });
    scrollToBottom();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let newId = thread?.id ?? "";
    const update = (fn: (a: LiveAnswer) => LiveAnswer) => setLive((l) => (l ? { ...l, answer: fn(l.answer) } : l));
    try {
      await askBrain(
        { thread_id: thread?.id, question, sources: picks, attachments },
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
      if (!ctrl.signal.aborted) update((a) => ({ ...a, error: e instanceof Error ? e.message : "The brain couldn't answer.", done: true }));
    }
    update((a) => ({ ...a, done: true }));
    loadThreads();
    if (newId && newId !== threadId) router.replace(`/brain?thread=${encodeURIComponent(newId)}`);
    else if (newId) {
      brainApi.thread(newId).then((r) => {
        setThread(r.thread);
        setMessages(r.messages);
        setLive(null);
      }).catch(() => {});
    }
  };

  const stop = () => abortRef.current?.abort();

  const share = async (shared: boolean) => {
    if (!thread) return;
    try {
      const r = await brainApi.updateThread(thread.id, { shared });
      setThread(r.thread);
      loadThreads();
      toast(shared ? "Shared with your team" : "Only you can see this thread now");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change sharing", "error");
    }
  };

  const remove = async () => {
    if (!thread) return;
    const ok = await confirm({ title: "Delete this thread?", message: "Its questions and answers are removed for everyone. This can't be undone.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    try {
      await brainApi.deleteThread(thread.id);
      loadThreads();
      router.replace("/brain");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete the thread", "error");
    }
  };

  const groups = useMemo(() => {
    const out: { label: string; items: BrainThread[] }[] = [];
    for (const t of threads ?? []) {
      const label = t.mine ? dayGroup(t.updated_at) : "Shared with the team";
      let g = out.find((x) => x.label === label);
      if (!g) out.push((g = { label, items: [] }));
      g.items.push(t);
    }
    return out;
  }, [threads]);

  const mayAsk = canAsk && threadCanAsk;
  const empty = !thread && !live;

  const rail = (
    <nav aria-label="Threads" className="flex min-h-0 flex-col gap-3" data-testid="thread-rail">
      <Link href="/brain" onClick={() => setRailOpen(false)} className={secondaryButton}>
        New question
      </Link>
      {threads === null ? (
        <p className="text-xs text-zinc-500">Loading threads…</p>
      ) : threads.length === 0 ? (
        <p className="text-xs text-zinc-500">No threads yet.</p>
      ) : (
        <div className="min-h-0 space-y-3 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</p>
              <ul className="space-y-0.5">
                {g.items.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/brain?thread=${encodeURIComponent(t.id)}`}
                      onClick={() => setRailOpen(false)}
                      aria-current={t.id === threadId ? "page" : undefined}
                      className={`block truncate rounded-md px-2 py-1.5 text-sm ${t.id === threadId ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"} ${focusRing}`}
                    >
                      {t.title}
                      {!t.mine && <span className="block truncate text-[11px] text-zinc-500">{t.owner_email}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <Link href="/brain/knowledge" className={`${linkButton} text-xs`}>
        Knowledge bases
      </Link>
    </nav>
  );

  return (
    <Page className="flex h-[calc(100dvh-5.25rem)] flex-col md:h-[calc(100dvh-7.25rem)]" testId="brain-page">
      <PageHeader
        title="Brain"
        lead={empty ? "Ask anything about your team's work. Answers come only from the sources you pick, each claim with its source." : undefined}
        actions={
          thread?.mine && canAsk ? (
            <>
              <button type="button" onClick={() => share(!thread.shared)} className={smallSecondaryButton} data-testid="share-toggle">
                {thread.shared ? "Stop sharing" : "Share with team"}
              </button>
              <button type="button" onClick={remove} className={smallSecondaryButton}>
                Delete
              </button>
            </>
          ) : undefined
        }
      />
      <div className="mb-2 md:hidden">
        <button type="button" onClick={() => setRailOpen((o) => !o)} className={smallSecondaryButton} aria-expanded={railOpen}>
          {railOpen ? "Hide threads" : "Threads"}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-6">
        <aside className={`${railOpen ? "flex" : "hidden"} min-h-0 w-full flex-col md:flex md:w-60 md:shrink-0`}>{rail}</aside>
        <section aria-label="Conversation" className={`${railOpen ? "hidden" : "flex"} relative min-h-0 min-w-0 flex-1 flex-col md:flex`}>
          {loadError && (
            <div className="mb-3">
              <Callout variant="error" title="Something didn't load">
                {loadError}
              </Callout>
            </div>
          )}
          <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden" aria-live="polite" aria-busy={busy}>
            <div className="mx-auto max-w-3xl space-y-6 pb-4 pr-1">
              {empty && (
                <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center" data-testid="brain-empty">
                  <p className="text-sm font-medium text-zinc-200">Your company brain</p>
                  <p className="mx-auto mt-1 max-w-prose text-sm text-zinc-500">
                    It reads your knowledge bases first, then your connections, repositories, memories and data sources if you turn them on.
                    When nothing supports an answer, it says so.
                  </p>
                  {sources && sources.knowledge.length === 0 && (
                    <p className="mt-3">
                      <Link href="/brain/knowledge" className={linkButton}>
                        Add a knowledge base
                      </Link>
                    </p>
                  )}
                </div>
              )}
              {thread && !thread.mine && (
                <p className="text-xs text-zinc-500">Shared by {thread.owner_email}. You can read it; only they can ask in it.</p>
              )}
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserBubble key={m.seq} text={m.content} attachments={m.attachments} />
                ) : (
                  <AnswerView
                    key={m.seq}
                    text={m.content}
                    citations={m.citations}
                    grounded={m.grounded}
                    steps={(m.used ?? []).map((u, i) => ({ id: `${m.seq}-${i}`, label: u.label, status: "success" as const }))}
                  />
                ),
              )}
              {live && (
                <>
                  <UserBubble text={live.question} attachments={[]} />
                  {live.answer.error ? (
                    <Callout variant="error" title="No answer">
                      {live.answer.error}
                    </Callout>
                  ) : (
                    <AnswerView
                      text={live.answer.text || (live.answer.done ? "" : "Reading your sources…")}
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
          <div className="mx-auto w-full max-w-3xl shrink-0 space-y-2 border-t border-zinc-800/80 pt-3">
            {mayAsk ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <SourcePicker sources={sources} value={picks} onChange={changePicks} disabled={busy} />
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    aria-label="Attach a file"
                    accept={ATTACH_LIMIT.extensions.map((e) => `.${e}`).join(",")}
                    onChange={(e) => attach(e.target.files)}
                    data-testid="attach-input"
                  />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || files.length >= 3} className={smallSecondaryButton}>
                    Attach a file
                  </button>
                  {files.map((f) => (
                    <span
                      key={f.key}
                      data-testid="attachment-chip"
                      data-status={f.status}
                      title={f.error}
                      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${f.status === "failed" ? "border-red-500/40 text-red-300" : "border-zinc-700 text-zinc-300"}`}
                    >
                      <span className="min-w-0 truncate">{f.name}</span>
                      <span className="shrink-0 text-zinc-500">
                        {f.status === "uploading" ? `${Math.round(f.progress * 100)}%` : f.status === "failed" ? "failed" : "ready"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))}
                        className={`shrink-0 text-zinc-500 hover:text-zinc-200 ${focusRing}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {files.some((f) => f.status === "failed") && (
                  <p className="text-xs text-red-300" role="alert">
                    {files.filter((f) => f.status === "failed").map((f) => f.error).join(" ")}
                  </p>
                )}
                <Composer
                  ref={inputRef}
                  value={input}
                  onChange={setInput}
                  onSend={send}
                  onStop={stop}
                  busy={busy}
                  placeholder={thread ? "Ask a follow-up" : "Ask your company brain"}
                  sendLabel={uploading ? "Uploading…" : "Ask"}
                />
                <p className="px-1 text-xs text-zinc-600">Answers cite your sources; open a number to read the passage.</p>
              </>
            ) : (
              <p className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400" data-testid="read-only-note">
                {thread && !thread.mine
                  ? "This thread is shared with you to read."
                  : "Viewers can read threads shared with the team. Ask a member or admin to ask the brain."}
              </p>
            )}
          </div>
        </section>
      </div>
    </Page>
  );
}

function UserBubble({ text, attachments }: { text: string; attachments: string[] }) {
  return (
    <div className="flex justify-end" data-testid="question">
      <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-zinc-800 px-3.5 py-2 text-sm text-zinc-100">
        <p className="whitespace-pre-wrap">{text}</p>
        {attachments.length > 0 && <p className="mt-1 truncate text-xs text-zinc-400">Attached: {attachments.join(", ")}</p>}
      </div>
    </div>
  );
}
