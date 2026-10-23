// What a tab does when the app's own files fail to load.
//
// Every deploy ships new /_next/static files. A tab opened before the deploy,
// or a page held in a cache, still names the old ones. If one of them cannot
// be fetched the app never starts and the page stays on "Loading...". These
// two strings go inline in <head> (app/layout.tsx), so they work even when
// every script and stylesheet the page names is missing.

/** sessionStorage key: when this tab last reloaded to recover. */
export const RELOAD_KEY = "coderhelm:asset-reload-at";

/** A second failure this soon after a recovery reload shows Reload instead of reloading again. */
export const RELOAD_WINDOW_MS = 60_000;

/** Seconds before the loading screen offers Reload when the app has not started. */
export const RELOAD_OFFER_SECONDS = 10;

/**
 * Reloads the tab once when a /_next file fails to load: a script or
 * stylesheet whose request errors, or a ChunkLoadError when a page loads code
 * on demand. The fresh page names files that exist. A second failure within
 * RELOAD_WINDOW_MS does not reload again (no loop); it marks <html> with
 * `ch-boot-failed` so the loading screen shows Reload right away. Any element
 * with `data-ch-reload` reloads the tab when clicked, with or without React.
 */
export const BOOT_RECOVERY_SCRIPT = `(function () {
  var KEY = ${JSON.stringify(RELOAD_KEY)};
  var WINDOW = ${RELOAD_WINDOW_MS};
  var done = false;
  function ownAsset(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin && u.pathname.indexOf("/_next/") === 0;
    } catch (e) {
      return false;
    }
  }
  function chunkError(err) {
    if (!err) return false;
    if (err.name === "ChunkLoadError") return true;
    return /Loading (CSS )?chunk \\S+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(String(err.message || ""));
  }
  function giveUp() {
    document.documentElement.classList.add("ch-boot-failed");
  }
  function recover() {
    if (done) return;
    done = true;
    var last = 0;
    try {
      last = Number(sessionStorage.getItem(KEY)) || 0;
      if (Date.now() - last < WINDOW) return giveUp();
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch (e) {
      // No sessionStorage, so no way to tell a second try from the first: never loop.
      return giveUp();
    }
    location.reload();
  }
  window.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) {
      var url = t.tagName === "SCRIPT" ? t.src : t.tagName === "LINK" && /stylesheet|preload/.test(t.rel) ? t.href : "";
      if (url && ownAsset(url)) recover();
      return;
    }
    if (chunkError(e.error)) recover();
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    if (chunkError(e.reason)) recover();
  });
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.closest && t.closest("[data-ch-reload]")) location.reload();
  });
})();`;

/**
 * The loading screen's look, inline so it holds when the stylesheet is the
 * file that failed: app colors and a system font instead of black Times on
 * white. Reload fades in after RELOAD_OFFER_SECONDS unless the app has
 * started (ClientShell sets data-ch-mounted), and at once after a failed
 * recovery.
 */
export const BOOT_STYLE = `html{background:#09090b;color-scheme:dark}
.ch-boot{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#09090b;color:#71717a;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.ch-boot-inner{display:flex;flex-direction:column;align-items:center;gap:12px}
.ch-boot-spinner{width:20px;height:20px;box-sizing:border-box;border:2px solid #3f3f46;border-top-color:#d4d4d8;border-radius:50%;animation:ch-boot-spin 1s linear infinite}
.ch-boot-reload{visibility:hidden;animation:ch-boot-offer 0s linear ${RELOAD_OFFER_SECONDS}s forwards;margin-top:4px;padding:6px 14px;border:1px solid #3f3f46;border-radius:6px;background:#18181b;color:#e4e4e7;font:inherit;cursor:pointer}
.ch-boot-reload:hover{background:#27272a}
.ch-boot-reload:focus-visible{outline:2px solid #a1a1aa;outline-offset:2px}
html.ch-boot-failed .ch-boot-reload{visibility:visible;animation:none}
html[data-ch-mounted] .ch-boot-reload{display:none}
@keyframes ch-boot-spin{to{transform:rotate(360deg)}}
@keyframes ch-boot-offer{to{visibility:visible}}`;
