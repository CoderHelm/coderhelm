"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { normalizePath } from "@/lib/routes";
import { focusRing } from "./ui";

// In Chat, as in Settings, the left sidebar is the page's own menu: a way
// back, then your chats. One column of navigation, never two; on a phone it
// is the drawer. The chat page fills the slot with its chat list.

/** Paths that show the chat menu. */
export function inChat(pathname: string | null | undefined): boolean {
  const path = normalizePath(pathname);
  return path === "/chat" || path.startsWith("/chat/");
}

/** The element the chat page renders its list into. */
export const CHAT_NAV_SLOT = "chat-nav-slot";

export function ChatSidebarNav() {
  return (
    <div data-testid="chat-nav">
      <div data-settings-sticky="" className="sticky -top-3 z-10 -mx-3 bg-zinc-950 px-3 pb-1 pt-3">
        <Link
          href="/"
          className={`mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 ${focusRing}`}
        >
          <span aria-hidden="true">&lsaquo;</span> Back to Coderhelm
        </Link>
        <p className="px-2 text-base font-semibold text-zinc-50">Chat</p>
      </div>
      <div id={CHAT_NAV_SLOT} className="mt-2" />
    </div>
  );
}

/** The keys that open Chat from any page, as this keyboard writes them. */
export function chatShortcutLabel(mac: boolean): string {
  return mac ? "⌘J" : "Ctrl+J";
}

/** ⌘J (Ctrl+J) opens Chat from any page, as in Linear. */
export function useChatShortcut() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "j" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      e.preventDefault();
      router.push("/chat");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

/** The sidebar slot once the shell has rendered it (null elsewhere). */
export function useChatNavSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => setSlot(document.getElementById(CHAT_NAV_SLOT));
    find();
    // The shell renders after sign-in; watch for the slot to appear or go.
    const mo = new MutationObserver(find);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return slot;
}
