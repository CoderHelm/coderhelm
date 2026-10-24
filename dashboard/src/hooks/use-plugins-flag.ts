"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Whether the team's `plugins` flag is on, from the signed-in person's
// `/api/me` (no extra request on every page). Read once per page load and
// shared by the menu and every plugin page; a backend that doesn't send it,
// or a failed read, counts as off, so nothing half-built shows.

export type FlagState = "checking" | "on" | "off";

let cached: Promise<boolean> | null = null;

function readFlag(): Promise<boolean> {
  if (!cached) {
    cached = api
      .me()
      .then((r) => !!r.flags?.plugins)
      .catch(() => {
        // Not signed in yet, or a blip: ask again next time.
        cached = null;
        return false;
      });
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
