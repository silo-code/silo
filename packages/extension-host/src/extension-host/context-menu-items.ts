import type {
  ContextKeys,
  ContextMenuContribution,
  Disposable,
  MenuContext,
  MenuEntry,
  MenuSurface,
} from "@silo-code/sdk";
import { commandRegistry, executeCommand } from "./commands";
import { contextKeys } from "./context-keys";

// Registered context-menu contributions (RFC 0013). Unlike the menubar's
// `menuItemRegistry`, contributions carry no `id` — identity is the object
// itself — so this keeps its own insertion-ordered set instead of reusing
// `Registry` (which keys by id). A surface's right-click site calls
// `contextMenuEntriesFor(surface, target)` to append the registered rows to
// its own menu; the pure builder underneath is exported for tests.

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

/**
 * Pure menu-building core: filter by `when`, bucket by `group` (default
 * `"9_default"`, groups sorted lexically — same convention as the menubar's
 * `groupAndSort`), sort by `order` within each group, separators between
 * groups, `checked` evaluated per row. Exported for tests; runtime callers
 * use {@link contextMenuEntriesFor}.
 */
export function buildContextMenuEntries<S extends MenuSurface>(
  items: ContextMenuContribution<S>[],
  keys: ContextKeys,
  target: MenuContext[S],
  resolveLabel: (command: string) => string,
  dispatch: (command: string, target: MenuContext[S]) => void,
): MenuEntry[] {
  const visible = items.filter((c) => !c.when || c.when(keys, target));

  const byGroup = new Map<string, ContextMenuContribution<S>[]>();
  for (const item of visible) {
    const g = item.group ?? "9_default";
    let arr = byGroup.get(g);
    if (!arr) {
      arr = [];
      byGroup.set(g, arr);
    }
    arr.push(item);
  }

  const entries: MenuEntry[] = [];
  for (const g of [...byGroup.keys()].sort()) {
    const group = byGroup.get(g)!;
    group.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (entries.length > 0) entries.push({ type: "separator" });
    for (const item of group) {
      entries.push({
        label: item.label ?? resolveLabel(item.command),
        icon: item.icon,
        checked: item.checked ? item.checked(keys, target) : undefined,
        run: () => dispatch(item.command, target),
      });
    }
  }
  return entries;
}

/**
 * The registered context-menu rows for `surface`, ready to append to that
 * surface's `ctx.ui.showMenu` items. Labels fall back to the command's label
 * (then its id); clicking a row dispatches the command with `target` as its
 * first argument.
 */
export function contextMenuEntriesFor<S extends MenuSurface>(
  surface: S,
  target: MenuContext[S],
): MenuEntry[] {
  return buildContextMenuEntries(
    listContextMenuItems(surface),
    contextKeys,
    target,
    (command) => commandRegistry.get(command)?.label ?? command,
    (command, t) => {
      executeCommand(command, t);
    },
  );
}
