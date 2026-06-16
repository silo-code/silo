import type { Disposable } from "@silo-code/sdk";

// The active-selection registry behind `ctx.ui.getActiveSelectionText()`. The
// focused surface (the editor, or a focused terminal) registers a getter for its
// current selection; the most-recently-registered one is "current". This lets a
// command read whatever the user has highlighted without knowing — or coupling
// to — which surface owns focus.

type SelectionGetter = () => string | null;

let current: SelectionGetter | null = null;

/**
 * Register the focused surface's selection getter. Call on focus; the returned
 * disposable clears it on blur/unmount (only if it's still the current source,
 * so a later focus elsewhere isn't clobbered).
 */
export function registerSelectionSource(getter: SelectionGetter): Disposable {
  current = getter;
  return {
    dispose: () => {
      if (current === getter) current = null;
    },
  };
}

/**
 * The current selection text from the focused surface, or `null` when nothing
 * is selected / no surface is focused. Backs `ctx.ui.getActiveSelectionText()`.
 */
export function getActiveSelectionText(): string | null {
  const text = current?.() ?? null;
  return text && text.length > 0 ? text : null;
}
