"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SignInStart } from "./api";

// A sign-in started from a card on Integrations, from the click to its
// outcome.
//
// The sign-in page opens in a new tab and this page waits for it. The wait
// always ends: the callback page says how it went (connected, or why not),
// the person cancels, or the time the sign-in can still be finished in runs
// out. A browser that blocks the new tab is said so, with the choice to
// carry on in this tab.
//
// It used to send this tab to the sign-in page with the button left on
// "Opening sign-in…" and nothing to clear it. Whenever this page was still
// there afterwards (the browser's Back from the sign-in page brings it back
// exactly as it was left, a sign-in address that doesn't leave the page),
// the button stayed disabled for good.

/** What the callback page posts when a sign-in finished (also read by sign-in cards and Knowledge). */
export const SIGNED_IN = "coderhelm:mcp-connected";
/** What it posts when one didn't. */
export const SIGN_IN_FAILED = "coderhelm:sign-in-failed";
/** A waiting page's answer on the channel: someone heard. */
const SIGN_IN_ACK = "coderhelm:sign-in-ack";
/** Same-origin pages hear each other here even when the browser cut the tab's link to the page that opened it. */
const CHANNEL = "coderhelm-sign-in";

/** How a sign-in ended, as the callback page tells the page that started it. */
export interface SignInNews {
  type: typeof SIGNED_IN | typeof SIGN_IN_FAILED;
  /** The connection (`figma`, `app-figma`, `ks-confluence`), when known. */
  server?: string;
  /** Its catalog id (`figma`, `app:figma`, `source:confluence`), when known. */
  catalog_id?: string;
  /** Why it didn't finish, in words a person can act on. */
  message?: string;
  /** The provider's error code (`access_denied`), when it sent one. */
  code?: string;
}

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

/** Who heard the news: the page that opened this tab (`opener`), a card waiting for it (`acked`). */
export interface Heard {
  opener: boolean;
  acked: boolean;
}

/**
 * Tells the page that started a sign-in how it ended: the page that opened
 * this tab, and any card waiting on the channel, which answers that it
 * heard. A card that answers shows the outcome itself, so the callback page
 * can close; with nobody waiting it carries on in this tab as before.
 */
export function announceSignIn(news: SignInNews, waitMs = 500): Promise<Heard> {
  let opener = false;
  try {
    const o = window.opener as Window | null;
    if (o && !o.closed) {
      o.postMessage(news, window.location.origin);
      opener = true;
    }
  } catch {
    // No way to reach the opener: the channel below still can.
  }
  const ch = channel();
  if (!ch) return Promise.resolve({ opener, acked: false });
  return new Promise<Heard>((resolve) => {
    const done = (acked: boolean) => {
      ch.close();
      resolve({ opener, acked });
    };
    const timer = setTimeout(() => done(false), waitMs);
    ch.onmessage = (e) => {
      if ((e.data as { type?: string } | null)?.type !== SIGN_IN_ACK) return;
      clearTimeout(timer);
      done(true);
    };
    ch.postMessage(news);
  });
}

export type SignInOutcomeKind = "declined" | "blocked" | "timed_out" | "failed" | "cancelled";

/** How a sign-in ended without connecting: what happened and what to do next. */
export interface SignInOutcome {
  kind: SignInOutcomeKind;
  title: string;
  message: string;
  /** The provider's error code, for whoever needs it. */
  code?: string;
}

export type SignInState =
  | { stage: "idle" }
  /** The new tab is open and the API is being asked where to send it. */
  | { stage: "starting" }
  /** The person is signing in in the other tab, until `until` (epoch ms). */
  | { stage: "waiting"; until: number }
  | { stage: "ended"; outcome: SignInOutcome };

const DEFAULT_SECONDS = 600;
/** How long the API may take to say where the sign-in page is. */
const START_TIMEOUT_MS = 30_000;

/** "10 minutes", "1 minute", "45 seconds". */
export function spanWords(seconds: number): string {
  if (seconds >= 90) return `${Math.round(seconds / 60)} minutes`;
  if (seconds >= 60) return "1 minute";
  return `${Math.max(1, Math.round(seconds))} seconds`;
}

/** The outcome for the callback page's news that a sign-in didn't finish. */
export function outcomeOf(news: SignInNews, name: string): SignInOutcome {
  const declined = news.code === "access_denied";
  return {
    kind: declined ? "declined" : "failed",
    title: declined ? `${name} wasn't connected: access wasn't granted` : `${name} wasn't connected`,
    message: news.message || "The sign-in didn't finish. Nothing was connected. Try again.",
    code: news.code,
  };
}

function words(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * One sign-in at a time for a card. `ids` are the connection and catalog ids
 * whose news is this card's (`figma`, `app-figma`, `app:figma`).
 * `onConnected` reloads the card; `onReturn` runs when the person comes back
 * to this tab while it still waits, to look at the card again.
 */
export function useSignIn({
  name,
  ids,
  onConnected,
  onReturn,
}: {
  name: string;
  ids: string[];
  onConnected: () => void | Promise<void>;
  onReturn?: () => void | Promise<void>;
}) {
  const [state, setState] = useState<SignInState>({ stage: "idle" });
  const tab = useRef<Window | null>(null);
  const begin = useRef<(() => Promise<SignInStart>) | null>(null);
  const serverId = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef(true);
  // Read by the listeners, which outlive a render.
  const now = useRef(state);
  now.current = state;
  const cb = useRef({ onConnected, onReturn, ids, name });
  cb.current = { onConnected, onReturn, ids, name };

  const closeTab = () => {
    try {
      tab.current?.close();
    } catch {
      // Already gone.
    }
    tab.current = null;
  };
  const stopClock = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  /** Sets the state, and what the listeners read at once (two pieces of news can arrive before a render). */
  const put = useCallback((next: SignInState) => {
    now.current = next;
    if (live.current) setState(next);
  }, []);
  const end = useCallback(
    (outcome: SignInOutcome) => {
      stopClock();
      put({ stage: "ended", outcome });
    },
    [put],
  );

  /** Ends the wait without an outcome: the card shows what it is now. */
  const reset = useCallback(() => {
    stopClock();
    tab.current = null;
    put({ stage: "idle" });
  }, [put]);

  // The callback page's news, from the tab it opened or over the channel.
  useEffect(() => {
    live.current = true;
    const mine = (n: SignInNews) => {
      const got = [n.server, n.catalog_id].filter((x): x is string => !!x);
      // A sign-in the API couldn't match to a connection (its state had
      // expired) names nothing: it is the one this card waits for.
      return got.length === 0 || got.some((x) => cb.current.ids.includes(x));
    };
    // The same news arrives twice when the tab that brings it was opened
    // by this page (to its window, then over the channel): the second copy
    // is still answered, so the tab knows a card has it.
    let heardAt = 0;
    const hear = (n: SignInNews | null, ack?: () => void) => {
      if (!n || (n.type !== SIGNED_IN && n.type !== SIGN_IN_FAILED)) return;
      if (!mine(n)) return;
      if (now.current.stage !== "waiting" && now.current.stage !== "starting") {
        if (Date.now() - heardAt < 5000) ack?.();
        return;
      }
      heardAt = Date.now();
      ack?.();
      stopClock();
      tab.current = null;
      if (n.type === SIGNED_IN) {
        put({ stage: "idle" });
        void cb.current.onConnected();
      } else {
        end(outcomeOf(n, cb.current.name));
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin) hear(e.data as SignInNews | null);
    };
    window.addEventListener("message", onMessage);
    const ch = channel();
    if (ch) ch.onmessage = (e) => hear(e.data as SignInNews | null, () => ch.postMessage({ type: SIGN_IN_ACK }));
    // Back in this tab while it waits: look at the card again, in case the
    // sign-in finished somewhere this page couldn't hear.
    const onFocus = () => {
      if (now.current.stage === "waiting") void cb.current.onReturn?.();
    };
    window.addEventListener("focus", onFocus);
    // A page the browser brings back from its history is never left waiting
    // on a sign-in that happened in the meantime.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && now.current.stage !== "idle") reset();
    };
    window.addEventListener("pageshow", onShow);
    return () => {
      live.current = false;
      stopClock();
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onShow);
      ch?.close();
    };
  }, [end, reset, put]);

  const ask = async (): Promise<SignInStart> => {
    const fn = begin.current;
    if (!fn) throw new Error("Nothing to sign in to.");
    let slow: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      slow = setTimeout(() => reject(new Error("Coderhelm took too long to answer. Try again.")), START_TIMEOUT_MS);
    });
    try {
      const r = await Promise.race([fn(), late]);
      serverId.current = r.server_id ?? serverId.current;
      return r;
    } finally {
      clearTimeout(slow);
    }
  };

  /** Starts a sign-in: `fn` asks the API where the sign-in page is. Call it from the click. */
  const start = useCallback(
    async (fn: () => Promise<SignInStart>) => {
      begin.current = fn;
      stopClock();
      // Opened now, inside the click, so a popup blocker allows it.
      const w = window.open("about:blank", "_blank");
      tab.current = w;
      if (!w) {
        end({
          kind: "blocked",
          title: "Your browser blocked the sign-in tab",
          message: `Allow pop-ups for this site and try again, or sign in to ${cb.current.name} in this tab: you come back here when done.`,
        });
        return;
      }
      put({ stage: "starting" });
      try {
        const r = await ask();
        if (now.current.stage !== "starting") return; // Cancelled meanwhile.
        w.location.href = r.authorize_url;
        const seconds = r.expires_in && r.expires_in > 0 ? r.expires_in : DEFAULT_SECONDS;
        put({ stage: "waiting", until: Date.now() + seconds * 1000 });
        timer.current = setTimeout(() => {
          closeTab();
          const id = serverId.current;
          if (id) void api.cancelMcpSignIn(id).catch(() => {});
          end({
            kind: "timed_out",
            title: `The ${cb.current.name} sign-in wasn't finished in time`,
            message: `Nothing was connected. A sign-in has to be finished within ${spanWords(seconds)}. Try again when you're ready.`,
          });
        }, seconds * 1000);
      } catch (e) {
        closeTab();
        end({ kind: "failed", title: `The ${cb.current.name} sign-in couldn't start`, message: words(e, "Coderhelm couldn't start the sign-in. Try again.") });
      }
    },
    [end, put],
  );

  /** Stops waiting. The sign-in's link stops working, so nothing connects later by surprise. */
  const cancel = useCallback(() => {
    const id = serverId.current;
    closeTab();
    stopClock();
    if (id) void api.cancelMcpSignIn(id).catch(() => {});
    put({ stage: "ended", outcome: { kind: "cancelled", title: "Sign-in cancelled", message: "Nothing was connected." } });
  }, [put]);

  /** Starts the last sign-in again. */
  const retry = useCallback(() => {
    if (begin.current) void start(begin.current);
  }, [start]);

  /** For a blocked tab: sign in in this one. The callback page brings the person back to the card. */
  const continueHere = useCallback(async () => {
    put({ stage: "starting" });
    try {
      const r = await ask();
      window.location.assign(r.authorize_url);
      // If the page is still here in a moment the address went nowhere:
      // say so instead of waiting on it.
      timer.current = setTimeout(() => {
        end({ kind: "failed", title: `The ${cb.current.name} sign-in page didn't open`, message: "The sign-in address didn't leave this page. Try again." });
      }, 8000);
    } catch (e) {
      end({ kind: "failed", title: `The ${cb.current.name} sign-in couldn't start`, message: words(e, "Coderhelm couldn't start the sign-in. Try again.") });
    }
  }, [end, put]);

  return { state, start, cancel, retry, reset, continueHere };
}
