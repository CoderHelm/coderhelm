"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isSelfHosted } from "@/lib/runtime-config";

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = "G-6C41CN6BC6";

/** The only host the tag runs on: never a self-hosted install, localhost or a preview. */
export const ANALYTICS_HOST = "app.coderhelm.com";

/** Whether this page may send analytics to the hosted dashboard's Google Analytics. */
export function analyticsAllowed(): boolean {
  return typeof window !== "undefined" && window.location.hostname === ANALYTICS_HOST && !isSelfHosted();
}

/** Origin and path only: dashboard addresses carry ids and filters after `?`. */
function pageLocation(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

let started = false;

function start() {
  started = true;
  // The same dataLayer lib/gtm.ts pushes to; gtag must push the arguments object itself.
  const layer = (window.dataLayer = window.dataLayer ?? []) as unknown[];
  window.gtag = function gtag() {
    layer.push(arguments);
  };
  window.gtag("js", new Date());
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
}

/**
 * The tag's settings for the page now showing. Setting page_location here
 * also stops the tag's own history page views, so each page counts once.
 */
function configure() {
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    page_location: pageLocation(),
    page_referrer: "",
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

/**
 * Page views on app.coderhelm.com: the first load and every client-side route
 * change. gtag queues calls until its script loads, so the first view is
 * never lost. A self-hosted install (runtime-config.js says selfHosted) loads
 * nothing.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!analyticsAllowed()) return;
    if (!started) start();
    configure();
    window.gtag("event", "page_view", { page_location: pageLocation(), page_title: document.title });
  }, [pathname]);

  return null;
}
