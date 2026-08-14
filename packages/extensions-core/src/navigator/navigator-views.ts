import type { NavigatorView } from "@silo-code/sdk";

// Pure model for the Navigator's view list (RFC 0023). The panel names every
// registered view in a list at the top and renders one of them below; nothing
// here is special-cased for the Workspaces view — it is registered through the
// same public API as any other, and only named below as the fallback the panel
// opens on.

/**
 * The view the Navigator opens with when the user hasn't chosen one — the
 * workspace list, registered by `core.workspaces`. Only a *preference* for
 * which view leads: if it isn't registered, the first one is used instead.
 */
export const DEFAULT_VIEW_ID = "workspaces";

/**
 * Which view the panel should render. `savedId` is the user's last choice
 * (from global extension storage); it wins as long as it still resolves to a
 * registered view.
 *
 * The caller deliberately does *not* write the fallback back to storage: an
 * extension that is disabled and re-enabled should get its view selected again
 * rather than silently losing the user's choice. Returns `undefined` only when
 * nothing is registered at all.
 */
export function resolveActiveView(
  views: readonly NavigatorView[],
  savedId: string | undefined,
): string | undefined {
  if (savedId && views.some((v) => v.id === savedId)) return savedId;
  if (views.some((v) => v.id === DEFAULT_VIEW_ID)) return DEFAULT_VIEW_ID;
  return views[0]?.id;
}

/**
 * Where roving focus parks when it enters the view list — the active row, so
 * arrowing starts from what's on screen. `findIndex`'s `-1` (no active view,
 * e.g. nothing registered yet) is passed through rather than clamped here:
 * the sole caller feeds this straight to `useFocusGroup`'s `start`, which
 * already clamps a negative index to the first row, so a second clamp here
 * would just be the same guarantee asserted twice.
 */
export function activeViewIndex(
  views: readonly NavigatorView[],
  activeId: string | undefined,
): number {
  return views.findIndex((v) => v.id === activeId);
}

/** One row of the view list, as the panel renders it. */
export interface ViewRow {
  id: string;
  title: string;
  icon: NavigatorView["icon"];
  /** Whether this is the active view — the row's `aria-selected`. Not painted
   * (ADR 0038: the view header names the active view instead), but still the
   * one place "which row is the active one" is decided. */
  selected: boolean;
}

/**
 * Rows for the view list — every registered view in registry order. Pulled
 * out as data, mirroring the pre-ADR-0038 `buildViewMenuItems`, so "exactly
 * the active view is selected" is a unit test rather than something only
 * exercised by clicking through the running app.
 */
export function buildViewRows(
  views: readonly NavigatorView[],
  activeId: string | undefined,
): ViewRow[] {
  return views.map((v) => ({
    id: v.id,
    title: v.title,
    icon: v.icon,
    selected: v.id === activeId,
  }));
}
