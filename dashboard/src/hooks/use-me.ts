"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Me = Awaited<ReturnType<typeof api.me>>;

/** Who is signed in (null while loading or when the read failed). */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let live = true;
    api
      .me()
      .then((m) => live && setMe(m))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return me;
}
