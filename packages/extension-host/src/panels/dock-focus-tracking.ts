// `.editor-dock`'s focus-accent bar (CenterDock.css) used to be gated purely
// on CSS `:focus-within`. That breaks for extensions that embed a
// cross-origin `<iframe>` (e.g. local-web-viewer): clicking into the
// embedded page's *rendered content* moves focus into it, but neither
// `:focus-within` nor a `focusin` listener on this document reliably
// observes that — cross-origin iframe content doesn't forward ordinary DOM
// events (mouse or focus) to the parent document at all (the same reason
// this extension's pick-element/marquee features need a postMessage bridge
// instead of plain listeners, rather than a CSS engine quirk as first
// suspected). `document.activeElement` DOES correctly become the `<iframe>`
// element the moment focus lands inside it, though — so instead of waiting
// for an event that may never arrive, poll it.
//
// The `focusin` listener stays for the normal (non-iframe) case: instant
// response for regular clicks. Polling is a low-frequency reconciliation
// pass on top of that — it's the only thing that catches the iframe case.
const POLL_INTERVAL_MS = 150;
let installed = false;

export function installDockFocusTracking() {
  if (installed) return;
  installed = true;

  function apply(focused: Element | null) {
    document.querySelectorAll(".editor-dock").forEach((dock) => {
      dock.classList.toggle(
        "dock-has-focus",
        !!focused && dock.contains(focused),
      );
    });
  }

  window.addEventListener("focusin", (e) => apply(e.target as Element | null));
  // A real window/app-level blur (switching to another application) should
  // still drop the bar — unlike focus moving into a same-window iframe, that
  // case doesn't fire `focusin` for anything, so it needs its own listener.
  window.addEventListener("blur", () => apply(null));

  setInterval(() => apply(document.activeElement), POLL_INTERVAL_MS);
}
