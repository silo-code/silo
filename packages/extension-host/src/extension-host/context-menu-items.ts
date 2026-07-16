import type {
  ContextMenuContribution,
  Disposable,
  MenuSurface,
} from "@silo-code/sdk";

// Registered context-menu contributions (RFC 0013). Unlike the menubar's
// `menuItemRegistry`, contributions carry no `id` — identity is the object
// itself — so this keeps its own insertion-ordered set instead of reusing
// `Registry` (which keys by id). Menu *building* (grouping, when/checked
// evaluation, dispatch with the surface target) happens at the surface's
// right-click site; this module only stores and lists.

const contributions = new Set<ContextMenuContribution>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Register a contribution; backs `ctx.registerContextMenuItem`. */
export function registerContextMenuItem<S extends MenuSurface>(
  item: ContextMenuContribution<S>,
): Disposable {
  // Erase the surface generic at the host boundary (same move as
  // registerDockPanelKind) — storage is over the union; the surface field
  // keeps each entry routable to its menu, and listContextMenuItems narrows
  // back. `unknown` hop needed: the predicates are contravariant in S.
  const entry = item as unknown as ContextMenuContribution;
  contributions.add(entry);
  emit();
  return {
    dispose: () => {
      if (contributions.delete(entry)) emit();
    },
  };
}

/** All contributions targeting `surface`, in registration order. */
export function listContextMenuItems<S extends MenuSurface>(
  surface: S,
): ContextMenuContribution<S>[] {
  const out: ContextMenuContribution<S>[] = [];
  for (const c of contributions) {
    if (c.surface === surface)
      out.push(c as unknown as ContextMenuContribution<S>);
  }
  return out;
}

/** Notifies when the set of contributions changes (register/dispose). */
export function onContextMenuItemsChange(fn: () => void): Disposable {
  listeners.add(fn);
  return {
    dispose: () => {
      listeners.delete(fn);
    },
  };
}
