"use client";

import { useEffect, useState } from "react";

/** The width below which the dashboard lays out for a phone (Tailwind's `sm`). */
export const PHONE_QUERY = "(max-width: 639px)";

/** True on a phone-width screen. False on the server and on the first paint. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
}
