// `.editor-dock`'s focus-accent bar (CenterDock.css) used to be gated purely
// on CSS `:focus-within`. That breaks for extensions that embed a
// cross-origin `<iframe>` (e.g. local-web-viewer): clicking into the
// embedded page makes `document.activeElement` the `<iframe>` element itself
// (normal, spec-correct focus behavior), but this WebView's `:focus-within`
// implementation doesn't reliably propagate that up through ancestors for
// cross-origin frames — so the dock visually "loses focus" even though the
// panel the iframe lives in is exactly what the user is interacting with.
//
// This tracks the same thing `:focus-within` is supposed to via a plain
// `focusin` listener + DOM containment check instead, which only cares that
// `document.activeElement` (whatever it is, iframe included) is a descendant
// of a given `.editor-dock` — no CSS engine iframe quirk in the loop.
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
}
