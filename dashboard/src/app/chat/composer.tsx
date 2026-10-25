"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { PaperclipIcon, SendIcon, XIcon } from "@/components/icons";
import { SquareIcon } from "@/components/stream-icons";
import { focusRing } from "@/components/ui";

// The question box: one rounded card with the text, the files attached to
// the question, and a row of controls under it (attach, what to search, send).
// Enter sends, Shift+Enter starts a new line, Escape stops an answer that is
// coming in, and files can be dropped on it.

export interface PendingFile {
  key: string;
  name: string;
  status: "uploading" | "ready" | "failed";
  progress: number;
  id?: string;
  error?: string;
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
    /** What to search (chips), in the control row. */
    sources: ReactNode;
    files: PendingFile[];
    onAttach?: (files: File[]) => void;
    onRemoveFile: (key: string) => void;
    accept: string;
    maxFiles: number;
    /** Why sending is not possible now (nothing picked, an upload running). */
    blocked?: string | null;
  }
>(function ChatComposer(
  { value, onChange, onSend, onStop, busy, placeholder, large = false, sources, files, onAttach, onRemoveFile, accept, maxFiles, blocked },
  outer,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  useImperativeHandle(outer, () => area.current as HTMLTextAreaElement);

  // Grow with the text, up to a limit; then it scrolls.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, large ? 280 : 220)}px`;
  }, [value, large]);

  const canSend = !!value.trim() && !busy && !blocked;
  const failed = files.filter((f) => f.status === "failed");
  const roomForFiles = files.length < maxFiles;

  return (
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
      className={`relative min-w-0 rounded-2xl border bg-zinc-900 transition-colors motion-reduce:transition-none focus-within:border-zinc-500 ${dragging ? "border-emerald-500/60 bg-emerald-500/5" : "border-zinc-700"} ${large ? "shadow-xl shadow-black/30" : "shadow-lg shadow-black/20"}`}
    >
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Attached files">
          {files.map((f) => (
            <li
              key={f.key}
              data-testid="attachment-chip"
              data-status={f.status}
              title={f.error}
              className={`inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg border pl-2.5 pr-1 text-xs ${f.status === "failed" ? "border-red-500/40 text-red-300" : "border-zinc-700 bg-zinc-800/60 text-zinc-200"}`}
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
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
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
        placeholder={placeholder}
        className={`block w-full resize-none bg-transparent px-4 text-base leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none sm:text-[0.95rem] ${large ? "pt-4 pb-2" : "pt-3 pb-1.5"}`}
      />
      <div className="flex min-w-0 items-end gap-2 px-2.5 pb-2.5">
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
        <div className="min-w-0 flex-1">{sources}</div>
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
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-400 ${focusRing}`}
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
  );
});
