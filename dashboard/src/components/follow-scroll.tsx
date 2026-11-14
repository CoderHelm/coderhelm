"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownIcon } from "./stream-icons";
import { focusRing } from "./ui";

/** How close to the end (px) still counts as "at the bottom". */
const NEAR_END = 48;

/**
 * Follows a live list (a streamed answer, a plan chat) only while the reader
 * is at its end.
 *
 * - Whether they are is read from the scroll position, so a wheel, trackpad,
 *   keyboard, scrollbar drag or touch all count. Any move up stops following,
 *   even one inside NEAR_END; reaching the end again resumes it.
 * - Scrolls the hook makes itself are remembered and never taken for the
 *   reader's.
 * - Content growth is watched with a ResizeObserver, so text, code that
 *   highlights late and images are all caught, before the frame paints.
 * - While not following, the element at the top of the reader's view is held
 *   where it is when anything above it changes height (a step list folding
 *   away when the answer ends, a block swapped for its saved copy). Blocks
 *   that carry `data-scroll-anchor` are found again by that key if their
 *   element was replaced.
 *
 * Attach `scrollRef` to the scrolling element and `contentRef` to the element
 * inside it that grows. `live` says new content is arriving: only then does
 * growth below a reader who scrolled up show "Jump to latest".
 */
export function useFollowScroll(live: boolean) {
  const scroller = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLElement | null>(null);
  const following = useRef(true);
  /** The scroll position last seen or set, to tell which way the reader moved. */
  const lastTop = useRef(0);
  /** A scrollTop this hook set whose scroll event hasn't arrived yet. */
  const ours = useRef<number | null>(null);
  const anchor = useRef<{ el: Element; at: number; key: string | null; keyAt: number } | null>(null);
  const height = useRef(0);
  const liveRef = useRef(live);
  const [behind, setBehind] = useState(false);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const setTop = (el: HTMLElement, top: number) => {
    el.scrollTop = top;
    ours.current = el.scrollTop;
    lastTop.current = el.scrollTop;
  };

  /** Notes the element at the top of the reader's view and where it sits. */
  const remember = useCallback(() => {
    const el = scroller.current;
    const inner = content.current;
    anchor.current = null;
    if (!el || !inner || following.current) return;
    const view = el.getBoundingClientRect();
    let hit: Element | null = document.elementFromPoint(view.left + view.width / 2, view.top + 8);
    if (!hit || !inner.contains(hit) || hit === inner) {
      hit = [...inner.children].find((c) => c.getBoundingClientRect().bottom > view.top) ?? null;
    }
    if (!hit) return;
    const block = hit.closest("[data-scroll-anchor]");
    anchor.current = {
      el: hit,
      at: hit.getBoundingClientRect().top - view.top,
      key: block && inner.contains(block) ? block.getAttribute("data-scroll-anchor") : null,
      keyAt: block ? block.getBoundingClientRect().top - view.top : 0,
    };
  }, []);

  const pin = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const end = el.scrollHeight - el.clientHeight;
    if (el.scrollTop < end - 0.5) setTop(el, end);
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop;
    if (ours.current !== null && Math.abs(top - ours.current) <= 1) {
      ours.current = null;
      lastTop.current = top;
      return;
    }
    ours.current = null;
    const gap = el.scrollHeight - el.clientHeight - top;
    const up = top < lastTop.current - 0.5;
    lastTop.current = top;
    following.current = gap <= 1 || (!up && gap <= NEAR_END);
    if (following.current) setBehind(false);
    remember();
  }, [remember]);

  /** Content or the view changed size: follow, or hold the reader's place. */
  const onResize = useCallback(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const h = inner.offsetHeight;
    const grew = h > height.current + 0.5;
    height.current = h;
    // The reader scrolled up and the event hasn't arrived yet: theirs wins.
    if (following.current && ours.current === null && el.scrollTop < lastTop.current - 0.5 && el.scrollHeight - el.clientHeight - el.scrollTop > 1) {
      following.current = false;
    }
    if (following.current) {
      pin();
      return;
    }
    const a = anchor.current;
    if (a) {
      const view = el.getBoundingClientRect();
      let moved = 0;
      if (a.el.isConnected) moved = a.el.getBoundingClientRect().top - view.top - a.at;
      else if (a.key) {
        const block = inner.querySelector(`[data-scroll-anchor="${CSS.escape(a.key)}"]`);
        if (block) moved = block.getBoundingClientRect().top - view.top - a.keyAt;
      }
      if (Math.abs(moved) > 0.5) setTop(el, el.scrollTop + moved);
    }
    remember();
    if (grew && liveRef.current) setBehind(true);
  }, [pin, remember]);

  // Callback refs: the elements may mount after the hook (an empty chat has none).
  const scrollObserver = useRef<ResizeObserver | null>(null);
  const scrollRef = useCallback(
    (node: HTMLElement | null) => {
      scroller.current?.removeEventListener("scroll", onScroll);
      scrollObserver.current?.disconnect();
      scroller.current = node;
      if (!node) return;
      lastTop.current = node.scrollTop;
      node.addEventListener("scroll", onScroll, { passive: true });
      if (typeof ResizeObserver !== "undefined") {
        scrollObserver.current = new ResizeObserver(onResize);
        scrollObserver.current.observe(node);
      }
    },
    [onScroll, onResize],
  );
  const contentObserver = useRef<ResizeObserver | null>(null);
  const contentRef = useCallback(
    (node: HTMLElement | null) => {
      contentObserver.current?.disconnect();
      content.current = node;
      if (!node || typeof ResizeObserver === "undefined") return;
      height.current = node.offsetHeight;
      contentObserver.current = new ResizeObserver(onResize);
      contentObserver.current.observe(node);
    },
    [onResize],
  );

  /** Go to the end now and follow from here (sending a message, Jump to latest, another chat). */
  const toLatest = useCallback(() => {
    following.current = true;
    anchor.current = null;
    setBehind(false);
    pin();
  }, [pin]);

  return { scrollRef, contentRef, behind, toLatest };
}

/** Shown while new content arrives below a reader who scrolled up. Floats, so it never moves the text. */
export function JumpToLatest({ visible, onClick, className = "bottom-20" }: { visible: boolean; onClick: () => void; className?: string }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="jump-to-latest"
      className={`absolute left-1/2 z-10 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 shadow-lg transition-colors animate-message-in hover:border-zinc-600 hover:text-zinc-100 motion-reduce:animate-none ${focusRing} ${className}`}
    >
      <ArrowDownIcon />
      Jump to latest
    </button>
  );
}
