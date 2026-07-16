# ctx.registerContextMenuItem

Add a command to the right-click context menu of a built-in surface — the file-explorer entry, an editor tab, a terminal tab, or a workspace row. Unlike [`registerMenuItem`](/api/registration/register-menu-item) (the menubar), the invoked command receives a typed **target** — which file, which editor, which workspace — as its first argument, and the same target is threaded into the `when` (visibility) and `checked` (toggle checkmark) predicates.

```ts
ctx.registerContextMenuItem<S extends MenuSurface>(
  item: ContextMenuContribution<S>,
): Disposable
```

## Example

```tsx
ctx.registerCommand({
  id: "acme.toggleWatch",
  label: "Acme: Watch this workspace",
  run: (ws: Workspace) =>
    acmeStore.setWatched(ws.id, !acmeStore.isWatched(ws.id)),
});

ctx.subscriptions.push(
  ctx.registerContextMenuItem({
    surface: "workspace",
    command: "acme.toggleWatch",
    group: "acme",
    when: (_, ws) => acmeStore.supports(ws),
    checked: (_, ws) => acmeStore.isWatched(ws.id), // renders a toggle row
  }),
);
```

## Types

Pass [`ContextMenuContribution`](/api/types/interfaces/ContextMenuContribution). The target type per surface is declared by [`MenuContext`](/api/types/interfaces/MenuContext); surfaces are the [`MenuSurface`](/api/types/type-aliases/MenuSurface) union.

Related: [`ContextKeys`](/api/types/interfaces/ContextKeys) · [`Workspace`](/api/types/interfaces/Workspace) · [`Command`](/api/types/interfaces/Command).

## See also

- [`registerMenuItem`](/api/registration/register-menu-item) — the menubar equivalent (no target argument).
- Other [Registration](/api/#registration) members on `ctx`.
