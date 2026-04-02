"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[][];
  }
}

const GA_MEASUREMENT_ID = "G-N333B1RWMB";

export function GoogleAnalytics() {
  const pathname = usePathname();
  const loaded = useRef(false);

  useEffect(() => {
    // Only load GA after the page is fully idle
    if (loaded.current) {
      // Subsequent navigations — just send page_view
      if (typeof window.gtag === "function") {
        window.gtag("event", "page_view", { page_path: pathname });
      }
      return;
    }
    loaded.current = true;
  }, [pathname]);

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      strategy="lazyOnload"
      onLoad={() => {
        window.dataLayer = window.dataLayer || [];
        function gtag(...args: unknown[]) {
          window.dataLayer.push(args);
        }
        window.gtag = gtag;
        gtag("js", new Date());
        gtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
      }}
    />
  );
}
