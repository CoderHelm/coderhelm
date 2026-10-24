"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { can as holds, type CapabilityHolder } from "@/lib/capabilities";

export type Me = Awaited<ReturnType<typeof api.me>>;

// One `/api/me` per page load, shared by every control that asks.
let pending: Promise<Me> | null = null;
function loadMe(): Promise<Me> {
  if (!pending) {
    pending = api.me().catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}

/**
 * `can("repos")`: whether the signed-in person may do that, from the
 * capabilities `/api/me` sends. Until it has loaded (and if it fails) the
 * answer is no, so nothing appears that the server would refuse.
 */
export function useCan(): { ready: boolean; failed: boolean; me: Me | null; can: (capability: string) => boolean } {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadMe()
      .then((m) => live && setMe(m))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  const can = useCallback((capability: string) => holds(me as CapabilityHolder | null, capability), [me]);
  return { ready: me !== null || failed, failed, me, can };
}
