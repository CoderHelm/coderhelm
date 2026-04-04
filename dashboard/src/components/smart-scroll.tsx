"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ArrowDownIcon } from "./stream-icons";

interface ScrollAnchorProps {
  /** Whether to track auto-scroll behavior */
  active: boolean;
  /** The scrollable container ref */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Smart auto-scroll with "↓ New content" pill.
 * - Auto-scrolls only if user is near the bottom
 * - Shows pill when new content arrives while user scrolled up
 */
export function useSmartScroll(containerRef: React.RefObject<HTMLDivElement | null>) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showPill, setShowPill] = useState(false);

  // Track whether user is at bottom using IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const atBottom = entry.isIntersecting;
        setIsAtBottom(atBottom);
        if (atBottom) setShowPill(false);
      },
      {
        root: container,
        threshold: 0,
        rootMargin: "0px 0px 100px 0px",
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [containerRef]);

  const scrollToBottom = useCallback((instant?: boolean) => {
    sentinelRef.current?.scrollIntoView({ behavior: instant ? "instant" : "smooth" });
    setShowPill(false);
  }, []);

  // Called when new content arrives — instant scroll during streaming, smooth otherwise
  const onNewContent = useCallback((streaming?: boolean) => {
    if (isAtBottom) {
      sentinelRef.current?.scrollIntoView({ behavior: streaming ? "instant" : "smooth" });
    } else {
      setShowPill(true);
    }
  }, [isAtBottom]);

  return { sentinelRef, isAtBottom, showPill, scrollToBottom, onNewContent };
}

export function ScrollPill({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors shadow-lg cursor-pointer animate-message-in"
    >
      <ArrowDownIcon />
      New content
    </button>
  );
}

export function ScrollSentinel({ ref }: { ref: React.RefObject<HTMLDivElement | null> }) {
  return <div ref={ref} className="h-px" />;
}
