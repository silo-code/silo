# ctx.registerContextMenuItem

Add a command to the right-click context menu of a built-in surface — the file-explorer entry, an editor tab, a terminal tab, a link inside a terminal, or a workspace row. Unlike [`registerMenuItem`](/api/registration/register-menu-item) (the menubar), the invoked command receives a typed **target** — which file, which editor, which workspace — as its first argument, and the same target is threaded into the `when` (visibility) and `checked` (toggle checkmark) predicates.

::: info Surface status
`"workspace"`, `"terminal/link"`, `"editor/tab"`, and `"terminal/tab"` dispatch
today (`DockTab` builds a real menu — Rename on terminals, then contributions).
`"explorer/item"` remains typed but not yet dispatched (see the
[Roadmap](/roadmap#context-menus)).
:::

```ts
ctx.registerContextMenuItem<S extends MenuSurface>(
  item: ContextMenuContribution<S>,
): Disposable
```

## Example

```tsx
// Command.run is `(...args: unknown[])` — a context-menu dispatch hands the
// surface's target (here, the clicked Workspace) as args[0]; narrow it in
// the body rather than typing the parameter directly (the latter doesn't
// satisfy Command.run's signature).
ctx.registerCommand({
  id: "acme.toggleWatch",
  label: "Acme: Watch this workspace",
  run: (...args) => {
    const ws = args[0] as Workspace;
    acmeStore.setWatched(ws.id, !acmeStore.isWatched(ws.id));
  },
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

`"terminal/link"` fires only when a right-click lands directly on a link span (ADR 0027); `target.kind` distinguishes a URL from a file-path link:

```tsx
ctx.registerCommand({
  id: "acme.openInViewer",
  label: "Acme: Open in viewer",
  run: (...args) => {
    const { text } = args[0] as MenuContext["terminal/link"];
    ctx.layout.openPanel("acme.viewer", { url: text });
  },
});

ctx.subscriptions.push(
  ctx.registerContextMenuItem({
    surface: "terminal/link",
    command: "acme.openInViewer",
    icon: <Globe size={14} weight="regular" />, // rendered leading the row, same as MenuItem.icon
    when: (_, target) => target.kind === "url",
  }),
);
```

## Types

Pass [`ContextMenuContribution`](/api/types/interfaces/ContextMenuContribution). The target type per surface is declared by [`MenuContext`](/api/types/interfaces/MenuContext); surfaces are the [`MenuSurface`](/api/types/type-aliases/MenuSurface) union.

Related: [`ContextKeys`](/api/types/interfaces/ContextKeys) · [`Workspace`](/api/types/interfaces/Workspace) · [`Command`](/api/types/interfaces/Command).

## See also

- [`registerMenuItem`](/api/registration/register-menu-item) — the menubar equivalent (no target argument).
- Other [Registration](/api/#registration) members on `ctx`.
