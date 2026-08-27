import type { SettingsPage } from "@silo-code/sdk";

/**
 * Host-owned pane heading for the active settings page.
 *
 * `SettingsPage.title` is the single source — drawn by SettingsSheet, never by
 * the page component. Returns `null` when no page is active (empty pane).
 */
export function paneTitleFor(
  page: SettingsPage | null | undefined,
): string | null {
  return page?.title ?? null;
}

/**
 * Hide a page-drawn duplicate of the host title during the migration window.
 *
 * Extension settings pages used to render their own `<h2>{title}</h2>`. The
 * host now draws that title; until authors remove theirs, the first `h1`/`h2`
 * whose text matches `title` and that sits at the top of the page (no other
 * visible content before it) is hidden. Once the page stops drawing a title,
 * this is a no-op.
 *
 * Returns the element that was hidden, or `null` if nothing matched.
 */
export function eatDuplicateSettingsTitle(
  root: ParentNode,
  title: string,
): HTMLElement | null {
  const heading = root.querySelector("h1, h2");
  if (!(heading instanceof HTMLElement)) return null;
  if (heading.textContent?.trim() !== title) return null;

  for (const el of root.querySelectorAll("*")) {
    if (el === heading) {
      heading.hidden = true;
      return heading;
    }
    // Wrappers that only exist to hold the heading don't count as content.
    if (el.contains(heading)) continue;
    if (hasOwnVisiblePresence(el)) return null;
  }
  return null;
}

/** True when `el` itself (not via a descendant) shows something to the user. */
function hasOwnVisiblePresence(el: Element): boolean {
  if (
    el.tagName === "SCRIPT" ||
    el.tagName === "STYLE" ||
    el.tagName === "LINK"
  ) {
    return false;
  }
  if (
    el.matches(
      "input, textarea, select, button, img, svg, [role='tablist'], [role='tabs']",
    )
  ) {
    return true;
  }
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return true;
    }
  }
  return false;
}
