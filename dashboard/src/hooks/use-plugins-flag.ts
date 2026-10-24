"use client";

import { useEffect, useState } from "react";
import { pluginsApi } from "@/lib/plugins";

// Whether the team's `plugins` flag is on. Read once per page load and shared
// by the menu and every plugin page; an older backend (404) or a failed read
// counts as off, so nothing half-built shows.

export type FlagState = "checking" | "on" | "off";

let cached: Promise<boolean> | null = null;

function readFlag(): Promise<boolean> {
  if (!cached) {
    cached = pluginsApi
      .flag()
      .then((r) => !!r.enabled)
      .catch(() => false);
  }
  return cached;
}

/** Forget the cached answer (after a platform admin switches the flag). */
export function resetPluginsFlag() {
  cached = null;
}

export function usePluginsFlag(): FlagState {
  const [state, setState] = useState<FlagState>("checking");
  useEffect(() => {
    let live = true;
    readFlag().then((on) => live && setState(on ? "on" : "off"));
    return () => {
      live = false;
    };
  }, []);
  return state;
}
