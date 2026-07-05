---
status: draft
created: 2026-07-02
---

# 0013. Context-menu contributions for built-in surfaces

## Summary

Let extensions add items to the right-click context menus of built-in surfaces —
the file-explorer entry, the editor tab, and the terminal tab — by registering a
command against a named _menu surface_ with a `when` predicate, mirroring how
`registerMenuItem` targets the app menubar today. Each surface passes a typed
**context object** (the clicked path, editor id, or terminal id) to the command,
building on `Command`'s ability to take arguments (RFC-adjacent to the A1
commands-take-args change) and reusing the existing `when`-clause machinery.

## Motivation

`MenuId` (`packages/sdk/src/types.ts`) covers only the five top-level menubar
menus (`"file" | "edit" | "view" | "window" | "help"`). Extensions can put a
command in the menubar, but they **cannot** add an item to any context menu:

- the file explorer's right-click menu (e.g. "Open in integrated terminal
  here", "Copy relative path", a git "Stage this file"),
- the editor tab's right-click menu (e.g. "Format document", "Reveal in
  explorer"),
- the terminal tab's right-click menu (e.g. "Rename", "Duplicate with same
  cwd").

After A1 (commands accept arguments) this is the single biggest remaining
third-party extensibility gap: a command _can_ now receive "which file", but
there is no contribution point that _hands it_ the file. Every real
file/editor/terminal extension eventually wants this, and today the only recourse
is forking a built-in — exactly what the extension model exists to avoid.

This needs design rather than a direct addition because the hard part isn't the
registration call — it's defining **which surfaces are contribution points** and
**what context object each passes**. Getting the context contract wrong is a
breaking change to a public surface, so it's worth an RFC first.

## Design

### Surfaces

Introduce a `MenuSurface` id for context menus, distinct from the menubar
`MenuId`. Initial seed set (deliberately small; more added later as demand is
shown):

```ts
export type MenuSurface =
  | "explorer/item" // right-click on a file/folder in the file explorer
  | "editor/tab" // right-click on an editor tab
  | "terminal/tab"; // right-click on a terminal tab
```

### Context object per surface

Each surface passes a single, serializable context object to the invoked
command (as its first argument) and to the `when` predicate. The contract is
per-surface and closed:

```ts
export interface MenuContext {
  "explorer/item": { path: string; isDir: boolean; workspaceId: string };
  "editor/tab": { editorId: string; filePath: string | null; viewId: string };
  "terminal/tab": { terminalId: string; workspaceId: string };
}
```

### Registration

```ts
export interface ContextMenuContribution<S extends MenuSurface = MenuSurface> {
  /** Which context menu to contribute to. */
  surface: S;
  /** The command to run; receives the surface's MenuContext[S] as its first arg. */
  command: string;
  /** Menu label (falls back to the command's label). */
  label?: string;
  /** Ordering within the menu; lower sorts first. */
  order?: number;
  /** Optional group id — items with the same group render together with a
   *  separator between groups. */
  group?: string;
  /**
   * Enable/visibility predicate. Receives the same per-surface context as the
   * command plus the current context keys. Returning false hides the item.
   */
  when?: (ctx: ContextKeys, target: MenuContext[S]) => boolean;
}

// on ExtensionContext:
registerContextMenuItem<S extends MenuSurface>(
  item: ContextMenuContribution<S>,
): Disposable;
```

The host builds the menu when a surface is right-clicked: it collects the
registered contributions for that surface, evaluates each `when` against the
current context keys **and** the freshly-built target object, and dispatches the
chosen command with the target as its argument. This reuses:

- the **command dispatch with args** from A1 (`executeCommand(id, target)`),
- the existing **`when`-clause evaluation** path
  (`packages/extension-host/src/extension-host/menu-items.ts` +
  `context-keys.ts`), extended to also thread the per-surface target into the
  predicate.

### Relationship to other items

- **Depends on A1** (commands take arguments) — without it there's no way to
  hand the target to the command.
- **Complements B12** (extension-settable context keys) — a git extension can
  `setContextKey("silo.git:hasRepo", true)` and gate a context-menu item on it
  via `when`. B12 is not required to ship this, but the two compose. (Note: B12
  is currently deferred, so v1 `when` predicates read only built-in keys + the
  target object.)

## Alternatives considered

- **Reuse `MenuId` with new string values** (`"explorer/item"`, …) on the
  existing `registerMenuItem`. Rejected: menubar items and context items have
  different lifetimes and — critically — context items need a **target
  argument** that menubar items never have. Overloading one call would make the
  `when`/handler signatures lie about what they receive.
- **A declarative `contributes.menus` manifest block** (VS Code's model).
  Deferred: Silo's contributions are imperative (`ctx.register*`) today; a
  declarative manifest is a larger, separate direction (see RFC 0005) and
  shouldn't be introduced piecemeal for one surface family.
- **Passing the DOM event / rich node** instead of a flat context object.
  Rejected: it would couple extensions to host component internals and break the
  serializable-boundary rule. A closed, per-surface data object keeps the
  contract narrow and testable.

## Decision

_Draft._ Open questions to resolve before acceptance:

1. Final seed set of surfaces — is `terminal/tab` worth v1, or start with
   explorer + editor only?
2. Grouping/separator model — freeform `group` string vs. a fixed set of named
   groups (`"navigation" | "modification" | "…"`) as VS Code uses.
3. Multi-select in the explorer — does `explorer/item` pass a single `path` or
   `paths: string[]` when several entries are selected? (Leaning single for v1,
   with a `paths` follow-up.)
