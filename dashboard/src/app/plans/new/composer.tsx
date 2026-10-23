"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { SquareIcon } from "@/components/stream-icons";
import { focusRing } from "@/components/ui";

// The message box: grows with what you type (up to a limit), Enter sends,
// Shift+Enter starts a new line, and the button turns into Stop while an
// answer is coming in.

export const Composer = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    busy: boolean;
    placeholder: string;
    /** The first question's bigger box. */
    large?: boolean;
    sendLabel?: string;
  }
>(function Composer({ value, onChange, onSend, onStop, busy, placeholder, large = false, sendLabel = "Send" }, outer) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outer, () => ref.current as HTMLTextAreaElement);

  // Grow to fit, up to about eight lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, large ? 320 : 200)}px`;
  }, [value, large]);

  return (
    <div
      className={`flex min-w-0 items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 focus-within:border-zinc-500 ${large ? "shadow-lg shadow-black/20" : ""}`}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!busy) onSend();
          }
        }}
        aria-label="Message"
        placeholder={placeholder}
        rows={large ? 3 : 1}
        disabled={busy}
        className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-60"
      />
      {busy ? (
        <button
          type="button"
          onClick={onStop}
          title="Stop (Esc)"
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-zinc-700 px-3 text-sm font-medium text-zinc-200 hover:bg-zinc-600 ${focusRing}`}
        >
          <SquareIcon />
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          className={`inline-flex min-h-9 shrink-0 items-center rounded-lg bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 ${focusRing}`}
        >
          {sendLabel}
        </button>
      )}
    </div>
  );
});
