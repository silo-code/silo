# ctx.registerDockPanelKind

Register a kind of center-dock tab (like the terminal) that workspaces can open by id. Register these early in `activate`, before anything opens a panel of the kind.

```ts
ctx.registerDockPanelKind(kind: DockPanelKind): Disposable
```

## Example

```tsx
ctx.registerDockPanelKind({
  id: "acme.repl",
  component: ReplPanel, // receives the dockview panel props
});
```

## Types

Pass [`DockPanelKind`](/api/types/interfaces/DockPanelKind).

Related: [`DockPanelApi`](/api/types/type-aliases/DockPanelApi).

## See also

Other [Registration](/api/#registration) members on `ctx`.
