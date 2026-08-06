import type { MenuEntry, NavigatorView } from "@silo-code/sdk";

// Pure model for the Navigator's view selector (RFC 0023). The panel renders
// one registered view at a time; nothing here is special-cased for the
// Workspaces view — it is registered through the same public API as any other,
// and only named below as the fallback the panel opens on.

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

/** The active view's title, for the header selector. */
export function activeViewTitle(
  views: readonly NavigatorView[],
  activeId: string | undefined,
): string {
  return views.find((v) => v.id === activeId)?.title ?? "Navigator";
}

/**
 * Rows for the header's view menu — every registered view in registry order,
 * with a check on the active one.
 */
export function buildViewMenuItems(
  views: readonly NavigatorView[],
  activeId: string | undefined,
  onPick: (viewId: string) => void,
): MenuEntry[] {
  return [
    { type: "header", label: "View" },
    ...views.map((v) => ({
      label: v.title,
      icon: v.icon,
      checked: activeId === v.id,
      run: () => onPick(v.id),
    })),
  ];
}
