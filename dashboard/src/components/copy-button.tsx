"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "./icons";
import { linkButton, secondaryButton } from "./ui";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection-based copy below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copies text and says "Copied" for two seconds. If the browser refuses, it
 * says so in place instead of failing silently.
 */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "button",
  className = "",
}: {
  /** The text, or a function called at click time (for values like the page URL). */
  text: string | (() => string);
  label?: ReactNode;
  copiedLabel?: ReactNode;
  variant?: "button" | "link";
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async () => {
    const ok = await copyText(typeof text === "function" ? text() : text);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), ok ? 2000 : 4000);
  };

  const base = variant === "link" ? `${linkButton} gap-1.5 text-left` : `${secondaryButton} gap-1.5 !px-3 !py-1 text-xs`;
  return (
    <button type="button" onClick={onClick} className={`${base} ${className}`}>
      {variant === "button" && <span aria-hidden="true" className="scale-90">{state === "copied" ? <CheckIcon /> : <CopyIcon />}</span>}
      <span aria-live="polite">
        {state === "copied" ? copiedLabel : state === "failed" ? "Couldn't copy. Select the text and copy it." : label}
      </span>
    </button>
  );
}
