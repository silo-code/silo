import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import {
  REMOVE_SHELL_CLASS_AFTER_REACT_PAINT,
  waitForMarketingStyles,
} from "./homepage-mount";
import "./styles.css";

const roots = new WeakMap<Element, Root>();

function probeStyles(el: HTMLElement) {
  return {
    homeAccent: getComputedStyle(el).getPropertyValue("--home-accent"),
  };
}

function dropShellClassAfterPaint(el: HTMLElement, isCancelled: () => boolean) {
  // Two rAFs: after React's commit + the browser's subsequent paint, so the
  // SEO below-fold nodes are already gone before `.silo-home-shell` (which
  // was hiding them) is removed.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (isCancelled()) return;
      el.classList.remove("silo-home-shell");
    });
  });
}

/** Mount the marketing homepage into `el`, replacing any SSG SEO shell children. */
export function mountHomepage(el: HTMLElement): () => void {
  el.classList.add("silo-home");

  const existing = roots.get(el);
  if (existing) {
    existing.unmount();
    roots.delete(el);
  }

  let cancelled = false;
  let root: Root | null = null;

  void (async () => {
    // Layout preloads styles.css before this module; still wait so the first
    // React paint isn't unstyled if the CSS chunk is a frame behind.
    await waitForMarketingStyles(() => probeStyles(el), { timeoutMs: 2000 });
    if (cancelled) return;

    root = createRoot(el);
    roots.set(el, root);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    // Important: do NOT remove `silo-home-shell` before render — that un-hides
    // below-fold SEO sections for a paint (the ~11s flash in the repro video).
    if (REMOVE_SHELL_CLASS_AFTER_REACT_PAINT) {
      dropShellClassAfterPaint(el, () => cancelled);
    } else {
      el.classList.remove("silo-home-shell");
    }
  })();

  return () => {
    cancelled = true;
    const current = roots.get(el);
    if (current) {
      current.unmount();
      roots.delete(el);
    }
  };
}

export function unmountHomepage(el: HTMLElement): void {
  const root = roots.get(el);
  if (!root) return;
  root.unmount();
  roots.delete(el);
}
