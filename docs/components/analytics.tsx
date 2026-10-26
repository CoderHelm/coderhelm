'use client';

// Google Analytics on docs.coderhelm.com only (lib/analytics.ts says what is
// sent and what never is). Nothing loads on localhost, previews or a
// self-hosted build of the docs. The tag loads once the browser is idle or
// the reader first interacts, so it never competes with the page itself.

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  GA_ID,
  LINKER_DOMAINS,
  PAGE_VIEW_MARK,
  cleanUrl,
  clickEvent,
  isCollectUrl,
  outboundHost,
  scrubHit,
  shouldLoad,
  type DocsEvent,
} from '@/lib/analytics';

type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag; __chAnalytics?: boolean };

function active(): boolean {
  return typeof window !== 'undefined' && (window as AnalyticsWindow).__chAnalytics === true;
}

/** Sends one docs event; does nothing where analytics is off. */
export function track(event: DocsEvent | null): void {
  if (!event || !active()) return;
  const { name, ...fields } = event;
  (window as AnalyticsWindow).gtag?.('event', name, fields);
}

function here(): string {
  return cleanUrl(window.location.href) ?? window.location.origin;
}

/** Every hit leaves through scrubHit(), whichever transport the tag picks. */
function guardTransport(w: AnalyticsWindow) {
  const beacon = navigator.sendBeacon?.bind(navigator);
  if (beacon) {
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      const u = String(url);
      if (!isCollectUrl(u)) return beacon(url, data);
      if (data != null && typeof data !== 'string') return true; // only text bodies are ever built by the tag; anything else is not sent
      const hit = scrubHit(u, data);
      return hit ? beacon(hit.url, hit.body) : true;
    };
  }
  const fetchFn = w.fetch.bind(w);
  w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (!isCollectUrl(u)) return fetchFn(input, init);
    const body = init?.body;
    if (body != null && typeof body !== 'string') return Promise.resolve(new Response(null, { status: 204 }));
    const hit = scrubHit(u, body);
    if (!hit) return Promise.resolve(new Response(null, { status: 204 }));
    return fetchFn(hit.url, { ...init, body: hit.body ?? undefined });
  };
  // The tag's last fallback is an image request.
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (src?.set && src.get) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: src.enumerable,
      get: src.get,
      set(this: HTMLImageElement, v: string) {
        const s = String(v);
        if (!isCollectUrl(s)) return src.set!.call(this, v);
        const hit = scrubHit(s, null);
        if (hit) src.set!.call(this, hit.url);
      },
    });
  }
}

/**
 * The tag's settings for the page now showing. Setting page_location here
 * also stops the tag's own history page views, so each page counts once.
 */
function configure(w: AnalyticsWindow, referrer: string) {
  w.gtag?.('config', GA_ID, {
    send_page_view: false,
    page_location: here(),
    page_referrer: referrer,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    linker: { domains: LINKER_DOMAINS, accept_incoming: true },
  });
}

function start(w: AnalyticsWindow) {
  w.__chAnalytics = true;
  guardTransport(w);
  w.dataLayer = w.dataLayer || [];
  // gtag must push the arguments object itself.
  w.gtag = function gtag() {
    w.dataLayer!.push(arguments);
  };
  w.gtag('js', new Date());
  configure(w, document.referrer ? cleanUrl(document.referrer) ?? '' : '');

  // Load the tag when the browser is idle or the reader first interacts.
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    for (const t of INTERACTIONS) window.removeEventListener(t, load, true);
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
  };
  const INTERACTIONS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  for (const t of INTERACTIONS) window.addEventListener(t, load, { capture: true, passive: true, once: true });
  const idle = () => (window.requestIdleCallback ? window.requestIdleCallback(load, { timeout: 4000 }) : setTimeout(load, 2500));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });

  // Clicks worth counting: copy buttons and links that leave the docs.
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      const button = el.closest('button');
      if (button) return track(clickEvent(button.textContent));
      const a = el.closest('a[href]');
      const host = a ? outboundHost(a.getAttribute('href') ?? '', window.location.href) : null;
      if (host) track({ name: 'outbound_click', link_domain: host });
    },
    { capture: true },
  );
}

/** Page views, on the first load and on every client-side navigation. */
export function Analytics() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const w = window as AnalyticsWindow;
    if (!shouldLoad(window.location.hostname)) return;
    if (!w.__chAnalytics) start(w);
    else configure(w, previous.current ?? '');
    previous.current = here();
    w.gtag?.('event', 'page_view', {
      page_location: here(),
      page_title: document.title,
      [PAGE_VIEW_MARK]: 1,
    });
  }, [pathname]);
  return null;
}
