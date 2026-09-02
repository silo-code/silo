import type { NavigatorView } from "@silo-code/sdk";

// Pure model for the Navigator's view list (RFC 0023 / RFC 0030). The panel
// names every enabled view in a list at the top and renders one of them below;
// nothing here is special-cased for the Workspaces view — it is registered
// through the same public API as any other, and only named below as the
// fallback the panel opens on.

/** The subset of {@link import("./navigator-prefs").NavigatorPrefs} the
 * resolver needs — kept structural so this module stays free of the prefs
 * store. */
export interface ViewArrangementPrefs {
  viewOrder: readonly string[];
  disabledViews: readonly string[];
}

/** Registered views split by the user's arrangement preferences. */
export interface ResolvedViewList {
  /** Every registered view in final sort order (enabled and disabled
   * interleaved) — the row order for the settings list. */
  ordered: NavigatorView[];
  /** Enabled views only, in the same order — what the Navigator renders. */
  enabled: NavigatorView[];
  /** Disabled-but-registered views, in the same order. */
  disabled: NavigatorView[];
}

/**
 * Sort registered views by the user's order, then resolve which are enabled.
 *
 * Order: ids listed in `prefs.viewOrder` come first, in that order; every
 * other registered view follows, by `NavigatorView.order ?? 0` then `title`.
 * A `viewOrder` id that isn't registered is skipped (but the caller keeps it
 * in storage, so it returns to its slot if its extension comes back).
 *
 * Enabled = not in `prefs.disabledViews`, with one guard: if that would leave
 * nothing enabled, the first view in sort order is forced on. The settings UI
 * also blocks the toggle that would get there, but storage can arrive from
 * another window, so the resolver is the real backstop.
 */
export function resolveViewList(
  registered: readonly NavigatorView[],
  prefs: ViewArrangementPrefs,
): ResolvedViewList {
  const byId = new Map(registered.map((v) => [v.id, v]));
  const listed = prefs.viewOrder
    .map((id) => byId.get(id))
    .filter((v): v is NavigatorView => v != null);
  const listedIds = new Set(listed.map((v) => v.id));
  const rest = registered
    .filter((v) => !listedIds.has(v.id))
    .sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
    );
  const ordered = [...listed, ...rest];

  const disabledSet = new Set(prefs.disabledViews);
  let enabled = ordered.filter((v) => !disabledSet.has(v.id));
  if (enabled.length === 0 && ordered.length > 0) enabled = [ordered[0]];
  const enabledIds = new Set(enabled.map((v) => v.id));
  const disabled = ordered.filter((v) => !enabledIds.has(v.id));

  return { ordered, enabled, disabled };
}

/**
 * The full ordered id list with `id` moved one slot in `dir` (`-1` up, `1`
 * down). A no-op at the ends or when `id` isn't present. This becomes the new
 * `viewOrder` — which then lists every registered view explicitly, so the
 * order is stable across restarts.
 */
export function moveViewInOrder(
  orderedIds: readonly string[],
  id: string,
  dir: -1 | 1,
): string[] {
  const from = orderedIds.indexOf(id);
  if (from === -1) return [...orderedIds];
  const to = from + dir;
  if (to < 0 || to >= orderedIds.length) return [...orderedIds];
  const next = [...orderedIds];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Add or remove `id` from the disabled list (idempotent). */
export function setViewDisabled(
  disabledViews: readonly string[],
  id: string,
  disabled: boolean,
): string[] {
  const has = disabledViews.includes(id);
  if (disabled === has) return [...disabledViews];
  return disabled
    ? [...disabledViews, id]
    : disabledViews.filter((x) => x !== id);
}

/**
 * Apply a one-slot move within the *displayed* (registered) order and weave
 * the result back into the full saved `viewOrder`, so ids for views that
 * aren't currently registered keep their slot — the navigator-prefs contract
 * ("a view returns to its slot when its extension is re-enabled").
 *
 * `displayedIds` is the registered views in their current on-screen order
 * (i.e. `resolveViewList(...).ordered` mapped to ids); its registered entries
 * that came from `savedOrder` are in `savedOrder`'s order, so the positional
 * weave below stays consistent.
 */
export function reorderSavedViews(
  savedOrder: readonly string[],
  displayedIds: readonly string[],
  id: string,
  dir: -1 | 1,
): string[] {
  const swapped = moveViewInOrder(displayedIds, id, dir);
  const displayed = new Set(displayedIds);
  const out: string[] = [];
  let i = 0;
  for (const vid of savedOrder) {
    if (displayed.has(vid)) out.push(swapped[i++]);
    else out.push(vid); // not registered right now — hold its position
  }
  for (; i < swapped.length; i++) out.push(swapped[i]); // newly-saved registered ids
  return out;
}

/** Toggle `id`'s membership in a list — used for stacked-mode collapse state. */
export function toggleIdInList(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

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
 * The synthetic `viewId` the Navigator passes from its single **unscoped-chrome
 * slot** — the Add-workspace "+"'s home (ADR 0048). Deliberately not any real
 * view's id: a per-view header item's `when` only ever sees a real id and never
 * matches this, while `core.workspaces.add` matches only this.
 */
export const UNSCOPED_CHROME_TARGET = "core.navigator:unscoped-chrome";

/**
 * The view whose row (one-at-a-time) or section header (stacked) carries
 * otherwise-unscoped `"navigator"` toolbar chrome — today just
 * `core.workspaces`' Add-workspace "+". It is the **Workspaces** view when
 * enabled, and `null` when it is not: the "+" then lives only on the workspace
 * status-bar item, not anywhere in the Navigator (ADR 0048). Unlike the old
 * stacked-only helper this has no "…or the top view" fallback — the "+" is the
 * Workspaces affordance or it is absent.
 */
export function chromeHostViewId(
  enabled: readonly NavigatorView[],
): string | null {
  return enabled.find((v) => v.id === DEFAULT_VIEW_ID)?.id ?? null;
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
  /** Whether this is the active view — the row's `aria-selected`, and what
   * bolds its label. The one place "which row is the active one" is
   * decided. */
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
