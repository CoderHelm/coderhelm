"use client";

import { useEffect } from "react";

// Progressive enhancement for the <details> menus in the Nav: Escape closes
// the open menu and returns focus to its summary, and a press outside closes
// it. Without JavaScript the menus still open and close from their summary.
export function MenuCloser() {
  useEffect(() => {
    const openMenus = () => Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-menu][open]"));

    const onPointerDown = (e: PointerEvent) => {
      for (const d of openMenus()) {
        if (!d.contains(e.target as Node)) d.open = false;
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of openMenus()) {
        d.open = false;
        if (d.contains(document.activeElement)) d.querySelector("summary")?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return null;
}
