"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { BookIcon, CodeIcon, PaperclipIcon, SendIcon, XIcon } from "@/components/icons";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { SquareIcon } from "@/components/stream-icons";
import { focusRing } from "@/components/ui";
import type { Mention } from "@/lib/brain";

// The question box: one rounded card with the text, the files attached to
// the question, and a row of controls under it (attach, @, send).
//
// Chat decides what to read on its own: everything the asker can see. To
// point a question at one repository or knowledge collection, type @ (or
// press the @ button) and pick it; it shows as a chip that can be removed.
// Nothing shows as a chip unless the asker chose it.
//
// Enter sends, Shift+Enter starts a new line, Escape stops an answer that is
// coming in, and files can be dropped on the box.

export interface PendingFile {
  key: string;
  name: string;
  status: "uploading" | "ready" | "failed";
  progress: number;
  id?: string;
  error?: string;
}

/** Something a question can be pointed at. */
export interface MentionOption extends Mention {
  /** The name shown: a repository's short name, a collection's name. */
  label: string;
  /** A few words under it: the repository's role, "Knowledge". */
  sub?: string;
}

/** The @word being typed just before the caret, if any. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\w.\-/]*)$/.exec(before);
  return m ? { start: before.length - m[2].length - 1, query: m[2] } : null;
}

/** Options matching what was typed after @: names starting with it first. */
export function matchMentions(options: MentionOption[], query: string, chosen: Mention[]): MentionOption[] {
  const q = query.toLowerCase();
  const free = options.filter((o) => !chosen.some((c) => c.kind === o.kind && c.id === o.id));
  if (!q) return free.slice(0, 8);
  const starts = free.filter((o) => o.label.toLowerCase().startsWith(q) || o.id.toLowerCase().startsWith(q));
  const has = free.filter((o) => !starts.includes(o) && (o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)));
  return [...starts, ...has].slice(0, 8);
}

function MentionIcon({ kind }: { kind: string }) {
  return kind === "repo" ? <CodeIcon /> : <BookIcon />;
}

export const ChatComposer = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    busy: boolean;
    placeholder: string;
    /** The empty page's bigger box. */
    large?: boolean;
    /** What the asker pointed the question at. */
    mentions: Mention[];
    onMentionsChange: (m: Mention[]) => void;
    mentionOptions: MentionOption[];
    files: PendingFile[];
    onAttach?: (files: File[]) => void;
    onRemoveFile: (key: string) => void;
    accept: string;
    maxFiles: number;
    /** Why sending is not possible now (an upload running). */
    blocked?: string | null;
  }
>(function ChatComposer(
  { value, onChange, onSend, onStop, busy, placeholder, large = false, mentions, onMentionsChange, mentionOptions, files, onAttach, onRemoveFile, accept, maxFiles, blocked },
  outer,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [fromButton, setFromButton] = useState(false);
  const [active, setActive] = useState(0);
  useImperativeHandle(outer, () => area.current as HTMLTextAreaElement);

  // Grow with the text, up to a limit; then it scrolls.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, large ? 280 : 220)}px`;
  }, [value, large]);

  const typed = mentionAt(value, caret);
  const query = typed && dismissed !== `${typed.start}:${typed.query}` ? typed.query : fromButton ? "" : null;
  const matches = useMemo(() => (query === null ? [] : matchMentions(mentionOptions, query, mentions)), [query, mentionOptions, mentions]);
  const menuOpen = query !== null && (matches.length > 0 || fromButton);
  useEffect(() => setActive(0), [query]);

  const label = (m: Mention) => mentionOptions.find((o) => o.kind === m.kind && o.id === m.id)?.label ?? m.id.split("/").pop() ?? m.id;

  const choose = (o: MentionOption) => {
    onMentionsChange([...mentions, { kind: o.kind, id: o.id }]);
    if (typed) {
      const next = value.slice(0, typed.start) + value.slice(typed.start + 1 + typed.query.length);
      onChange(next.replace(/\s{2,}$/, " "));
      setCaret(typed.start);
      window.setTimeout(() => {
        area.current?.setSelectionRange(typed.start, typed.start);
      }, 0);
    }
    setFromButton(false);
    area.current?.focus();
  };

  const canSend = !!value.trim() && !busy && !blocked;
  const failed = files.filter((f) => f.status === "failed");
  const roomForFiles = files.length < maxFiles;

  return (
    <Popover
      open={menuOpen}
      onOpenChange={(o) => {
        if (!o) {
          setFromButton(false);
          if (typed) setDismissed(`${typed.start}:${typed.query}`);
        }
      }}
    >
      <PopoverAnchor asChild>
        <div
          data-testid="composer"
          onDragOver={(e) => {
            if (!onAttach || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            if (!onAttach) return;
            e.preventDefault();
            setDragging(false);
            const list = Array.from(e.dataTransfer.files ?? []);
            if (list.length) onAttach(list);
          }}
          className={`relative min-w-0 rounded-2xl border bg-zinc-900 transition-colors motion-reduce:transition-none focus-within:border-zinc-600 ${dragging ? "border-emerald-500/60 bg-emerald-500/5" : "border-zinc-800"} ${large ? "shadow-xl shadow-black/30" : "shadow-lg shadow-black/20"}`}
        >
          {(mentions.length > 0 || files.length > 0) && (
            <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Pointed at and attached">
              {mentions.map((m) => (
                <li
                  key={`${m.kind}:${m.id}`}
                  data-testid="mention-chip"
                  className="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-lg bg-zinc-800 pl-2 pr-0.5 text-xs text-zinc-200"
                >
                  <span aria-hidden="true" className="shrink-0 text-zinc-400 [&_svg]:h-3.5 [&_svg]:w-3.5">
                    <MentionIcon kind={m.kind} />
                  </span>
                  <span className="min-w-0 truncate">{label(m)}</span>
                  <button
                    type="button"
                    aria-label={`Stop pointing at ${label(m)}`}
                    title="Remove"
                    onClick={() => onMentionsChange(mentions.filter((x) => !(x.kind === m.kind && x.id === m.id)))}
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 [&_svg]:h-3 [&_svg]:w-3 ${focusRing}`}
                  >
                    <XIcon />
                  </button>
                </li>
              ))}
              {files.map((f) => (
                <li
                  key={f.key}
                  data-testid="attachment-chip"
                  data-status={f.status}
                  title={f.error}
                  className={`inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-lg border pl-2 pr-0.5 text-xs ${f.status === "failed" ? "border-red-500/40 text-red-300" : "border-zinc-700 bg-zinc-800/60 text-zinc-200"}`}
                >
                  <span aria-hidden="true" className="shrink-0 text-zinc-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
                    <PaperclipIcon />
                  </span>
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="shrink-0 text-zinc-500">
                    {f.status === "uploading" ? `${Math.round(f.progress * 100)}%` : f.status === "failed" ? "Failed" : "Ready"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => onRemoveFile(f.key)}
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 [&_svg]:h-3 [&_svg]:w-3 ${focusRing}`}
                  >
                    <XIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={area}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setFromButton(false);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={(e) => {
              if (menuOpen && matches.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => (a + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                  return;
                }
                if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                  e.preventDefault();
                  choose(matches[active] ?? matches[0]);
                  return;
                }
              }
              if (menuOpen && e.key === "Escape") {
                e.preventDefault();
                setFromButton(false);
                if (typed) setDismissed(`${typed.start}:${typed.query}`);
                return;
              }
              if (e.key === "Backspace" && !value && mentions.length) {
                onMentionsChange(mentions.slice(0, -1));
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) onSend();
              } else if (e.key === "Escape" && busy) {
                e.preventDefault();
                onStop();
              }
            }}
            rows={large ? 2 : 1}
            aria-label="Message"
            aria-autocomplete="list"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? "mention-menu" : undefined}
            placeholder={placeholder}
            className={`block w-full resize-none bg-transparent px-4 text-base leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none sm:text-[0.95rem] ${large ? "pt-4 pb-2" : "pt-3 pb-1.5"}`}
          />
          <div className="flex min-w-0 items-center gap-1 px-2.5 pb-2.5">
            {onAttach && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  aria-label="Attach a file"
                  accept={accept}
                  data-testid="attach-input"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (list.length) onAttach(list);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy || !roomForFiles}
                  aria-label="Attach a file"
                  title={roomForFiles ? "Attach a file (or drop it here)" : `Up to ${maxFiles} files per question`}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 ${focusRing}`}
                >
                  <PaperclipIcon />
                </button>
              </>
            )}
            {mentionOptions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFromButton((o) => !o);
                  area.current?.focus();
                }}
                aria-label="Point at a repository or knowledge"
                title="Point at a repository or knowledge (or type @)"
                data-testid="mention-button"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
              >
                @
              </button>
            )}
            <div className="min-w-0 flex-1" />
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop"
                title="Stop (Esc)"
                data-testid="stop-button"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 hover:bg-white ${focusRing}`}
              >
                <SquareIcon />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                aria-label="Send"
                title={blocked ?? "Send (Enter)"}
                data-testid="send-button"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 ${focusRing}`}
              >
                <SendIcon />
              </button>
            )}
          </div>
          {failed.length > 0 && (
            <p className="border-t border-zinc-800 px-4 py-2 text-xs text-red-300" role="alert">
              {failed.map((f) => f.error).join(" ")}
            </p>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-[min(22rem,calc(100vw-2rem))] p-1"
      >
        <div id="mention-menu" role="listbox" aria-label="Point the question at" data-testid="mention-menu">
          <p className="px-2.5 pb-1 pt-1.5 text-[0.7rem] font-medium text-zinc-500">Point the question at</p>
          {matches.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-zinc-500">Nothing left to point at.</p>
          ) : (
            matches.map((o, i) => (
              <button
                key={`${o.kind}:${o.id}`}
                type="button"
                role="option"
                aria-selected={i === active}
                data-testid="mention-option"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={`flex w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left ${i === active ? "bg-zinc-800 text-zinc-50" : "text-zinc-300"}`}
              >
                <span aria-hidden="true" className="shrink-0 text-zinc-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
                  <MentionIcon kind={o.kind} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{o.label}</span>
                {o.sub && <span className="shrink-0 text-xs text-zinc-500">{o.sub}</span>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
