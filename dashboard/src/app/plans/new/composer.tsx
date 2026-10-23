"use client";

import { forwardRef } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { SquareIcon } from "@/components/stream-icons";
import { focusRing } from "@/components/ui";

// The message box: grows with what you type (up to a limit), Enter sends,
// Shift+Enter starts a new line, and the button turns into Stop while an
// answer is coming in. Formatting sits behind the "Aa" button, as in Slack.

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
  return (
    <MarkdownEditor
      variant="compact"
      textareaRef={outer}
      value={value}
      onChange={onChange}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (!busy) onSend();
        }
      }}
      ariaLabel="Message"
      placeholder={placeholder}
      minRows={large ? 3 : 1}
      maxHeight={large ? 320 : 200}
      disabled={busy}
      className={large ? "shadow-lg shadow-black/20" : ""}
      actions={
        busy ? (
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
        )
      }
    />
  );
});
