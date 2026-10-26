"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { UsedChips } from "@/components/work-used";
import { ToolCallCard } from "@/components/tool-call-card";
import { StreamingCursor } from "@/components/streaming-cursor";
import { CheckIcon, CopyIcon, LoaderIcon, PenIcon, XIcon } from "@/components/stream-icons";
import { ChevronRightIcon } from "@/components/icons";
import { focusRing } from "@/components/ui";
import { messageServers, messageText, messageUsed } from "@/hooks/use-streaming-chat";
import type { StreamMessage, ThinkingPart, ToolCallPart } from "@/lib/stream-types";
import { changeWords, withoutPlanJson, type PlanChange } from "./draft";

// The plan chat as a conversation: your messages as bubbles on the right,
// Coderhelm's answers as plain text on the left. Everything it looked at
// while answering folds into one line per answer ("Worked for 12s · read 3
// files"), which opens to each step. A plan in an answer shows as a small
// "Drafted the plan" card instead of its JSON.

/** When a message was sent, from its id ("msg_<ms>_<n>"); null for the greeting. */
export function sentAt(msg: StreamMessage): number | null {
  const ms = Number(msg.id.match(/^msg_(\d{12,})_/)?.[1]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** A time line between runs of messages more than this far apart. */
const GAP_MS = 10 * 60_000;

export function timeDivider(prev: StreamMessage | undefined, msg: StreamMessage): string | null {
  const t = sentAt(msg);
  if (!t) return null;
  const before = prev ? sentAt(prev) : null;
  if (before && t - before < GAP_MS) return null;
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return today ? `Today ${time}` : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function TimeDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-xs text-zinc-400" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-zinc-800" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}

// -- What an answer did, in words ------------------------------------------

const TOOL_WORDS: { match: RegExp; one: string; many: string; verb: string }[] = [
  { match: /read_file$/, one: "file", many: "files", verb: "read" },
  { match: /search_code$/, one: "code search", many: "code searches", verb: "ran" },
  { match: /list_directory$/, one: "folder", many: "folders", verb: "listed" },
  { match: /^read_skill$/, one: "skill", many: "skills", verb: "read" },
  { match: /^ask_team_agent$/, one: "agent", many: "agents", verb: "asked" },
];

/** "read 3 files · asked 1 agent · 2 lookups" from an answer's tool calls. */
export function workWords(tools: ToolCallPart[]): string {
  const counts = new Map<string, { n: number; one: string; many: string; verb: string }>();
  for (const t of tools) {
    const w = TOOL_WORDS.find((x) => x.match.test(t.name)) ?? { one: "lookup", many: "lookups", verb: "" };
    const key = `${w.verb} ${w.one}`;
    const c = counts.get(key) ?? { n: 0, ...w };
    c.n++;
    counts.set(key, c);
  }
  return [...counts.values()].map((c) => `${c.verb ? c.verb + " " : ""}${c.n} ${c.n === 1 ? c.one : c.many}`).join(" · ");
}

/** "read file" for a running tool, from "github__read_file". */
function toolDoing(name: string): string {
  const base = name.includes("__") ? name.split("__").pop()! : name;
  return base.replace(/_/g, " ");
}

function seconds(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** One line for everything an answer looked at; opens to each step. */
function WorkLine({
  tools,
  thinking,
  servers,
  streaming,
  startedAt,
  endedAt,
}: {
  tools: ToolCallPart[];
  thinking: ThinkingPart[];
  servers: string[];
  streaming: boolean;
  startedAt?: number;
  endedAt?: number;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!streaming) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [streaming]);
  const thought = thinking.some((t) => t.content.trim());
  if (tools.length === 0 && !thought) return null;
  const running = tools.find((t) => t.status === "running");
  const failed = tools.filter((t) => t.status === "error").length;
  const words = workWords(tools);
  const took = startedAt ? (streaming ? now : endedAt ?? 0) - startedAt : 0;
  const lead = streaming
    ? running
      ? `Working · ${toolDoing(running.name)}`
      : "Working"
    : took > 0
      ? `Worked for ${seconds(took)}`
      : tools.length > 0
        ? "Worked"
        : "Thought it through";
  return (
    <div className="mb-2 min-w-0" data-testid="work-line">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-md py-0.5 text-left text-xs text-zinc-400 hover:text-zinc-300 ${focusRing}`}
      >
        {streaming ? (
          <LoaderIcon className="shrink-0 animate-spin motion-reduce:animate-none" />
        ) : (
          <span aria-hidden="true" className={`inline-flex shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
            <ChevronRightIcon />
          </span>
        )}
        <span className="min-w-0 truncate">
          <span className="text-zinc-400">{lead}</span>
          {words && <> · {words}</>}
          {failed > 0 && <span className="text-amber-400/80"> · {failed} failed</span>}
          {streaming && took > 1000 && <span className="tabular-nums"> · {seconds(took)}</span>}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 ml-1.5 border-l border-zinc-800 pl-3">
          {servers.length > 0 && <p className="mb-1 text-xs text-zinc-400">Through {servers.join(", ")}</p>}
          {thinking
            .filter((t) => t.content.trim())
            .map((t, i) => (
              <p key={i} className="mb-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">
                {t.content}
              </p>
            ))}
          {tools.map((t) => (
            <ToolCallCard key={t.id} tool={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// -- Long text ----------------------------------------------------------------

/** Folds text taller than this, with "Show more". */
const CLAMP_PX = 360;

function Clamped({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    if (!enabled || !ref.current) return;
    setTall(ref.current.scrollHeight > CLAMP_PX + 80);
  }, [enabled, children]);
  const folded = enabled && tall && !open;
  return (
    <div>
      <div ref={ref} className={`relative ${folded ? "overflow-hidden" : ""}`} style={folded ? { maxHeight: CLAMP_PX } : undefined}>
        {children}
        {folded && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950 to-transparent" />}
      </div>
      {enabled && tall && (
        <button type="button" onClick={() => setOpen(!open)} className={`mt-1 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200 ${focusRing}`}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

// -- Messages -------------------------------------------------------------------

function CopyMessage({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied" : "Copy message"}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 ${focusRing}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  msg,
  latest,
  startedAt,
  endedAt,
  plan,
  onViewPlan,
  cards,
}: {
  /** Approval and sign-in cards this answer raised, drawn by the page. */
  cards?: ReactNode;
  msg: StreamMessage;
  /** The newest answer is never folded. */
  latest: boolean;
  startedAt?: number;
  endedAt?: number;
  /** Set when this answer carries a plan: how it changed the one before. */
  plan?: { tasks: number; change: PlanChange | null } | null;
  onViewPlan: () => void;
}) {
  const text = messageText(msg);
  const tools = msg.parts.filter((p): p is ToolCallPart => p.type === "tool_call");
  const thinking = msg.parts.filter((p): p is ThinkingPart => p.type === "thinking");
  const used = messageUsed(msg);
  const servers = messageServers(msg);
  const words = text.includes("```json") ? withoutPlanJson(text) : text;
  const streaming = !!msg.streaming;
  const writingPlan = streaming && text.includes("```json") && !plan;
  if (!words && tools.length === 0 && thinking.length === 0 && !streaming && !cards) return null;
  return (
    <div className="group/msg min-w-0 animate-message-in motion-reduce:animate-none" data-testid="assistant-message">
      <WorkLine tools={tools} thinking={thinking} servers={servers} streaming={streaming} startedAt={startedAt} endedAt={endedAt} />
      <UsedChips used={used} />
      {words ? (
        <Clamped enabled={!latest && !streaming}>
          <div className="text-sm leading-relaxed text-zinc-200">
            <ChatMarkdown>{words}</ChatMarkdown>
            {streaming && !writingPlan && <StreamingCursor />}
          </div>
        </Clamped>
      ) : streaming && tools.length === 0 && thinking.length === 0 ? (
        <Waiting />
      ) : null}
      {cards && <div className="mt-3 space-y-3">{cards}</div>}
      {writingPlan && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-sky-300">
          <LoaderIcon className="animate-spin motion-reduce:animate-none" /> Writing the plan…
        </p>
      )}
      {plan && (
        <button
          type="button"
          onClick={onViewPlan}
          className={`mt-2 flex w-full max-w-sm items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left hover:border-zinc-700 ${focusRing}`}
          data-testid="plan-card"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-300" aria-hidden="true">
            <CheckIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-zinc-200">{plan.change ? "Updated the plan" : "Drafted the plan"}</span>
            <span className="block truncate text-xs text-zinc-400">
              {plan.change ? changeWords(plan.change) || "No task changes" : `${plan.tasks} task${plan.tasks === 1 ? "" : "s"}`}
            </span>
          </span>
          <span className="shrink-0 text-xs text-zinc-400">View</span>
        </button>
      )}
      {!streaming && words && (
        <div className="mt-1 flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus-within:opacity-100">
          <CopyMessage text={words} />
        </div>
      )}
    </div>
  );
});

function Waiting() {
  return (
    <p className="inline-flex items-center gap-2 text-sm text-zinc-500" role="status">
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms] motion-reduce:animate-none" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms] motion-reduce:animate-none" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms] motion-reduce:animate-none" />
      </span>
      Thinking…
    </p>
  );
}

export { Waiting as ThinkingIndicator };

export const UserMessage = memo(function UserMessage({
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
  const text = messageText(msg);

  const submitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== text) onEdit(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="ml-auto w-full max-w-[85%] animate-message-in motion-reduce:animate-none">
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitEdit();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          rows={3}
          aria-label="Edit your message"
          className="w-full resize-none rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
        />
        <div className="mt-1.5 flex justify-end gap-2">
          <button type="button" onClick={() => setEditing(false)} className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-300 ${focusRing}`}>
            <XIcon />
            Cancel
          </button>
          <button
            type="button"
            onClick={submitEdit}
            disabled={!editText.trim() || editText.trim() === text}
            className={`flex items-center gap-1 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-900 hover:bg-white disabled:opacity-50 ${focusRing}`}
          >
            <CheckIcon />
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-message-in motion-reduce:animate-none items-start justify-end gap-1" data-testid="user-message">
      {!disabled && (
        <button
          type="button"
          onClick={() => {
            setEditText(text);
            setEditing(true);
          }}
          aria-label="Edit message"
          title="Edit message"
          className={`mt-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 ${focusRing}`}
        >
          <PenIcon />
        </button>
      )}
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-br-md bg-zinc-800 px-4 py-2.5 text-sm leading-relaxed text-zinc-100">
        <Clamped enabled>
          <ChatMarkdown breaks>{text}</ChatMarkdown>
        </Clamped>
      </div>
    </div>
  );
});
