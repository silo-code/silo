# ctx.registerDockPanelKind

Register a kind of center-dock tab (like the terminal) that workspaces can open by id. Register these early in `activate`, before anything opens a panel of the kind.

```ts
ctx.registerDockPanelKind<T extends object>(kind: DockPanelKind<T>): Disposable
```

## Example

```tsx
ctx.registerDockPanelKind({
  id: "acme.repl",
  component: ReplPanel, // receives DockPanelProps
});
```

The params generic `T` is inferred from the component's
[`DockPanelProps<T>`](/api/types/interfaces/DockPanelProps) annotation, so a
kind whose panels are opened with typed params registers without casts.

## Types

Pass [`DockPanelKind`](/api/types/interfaces/DockPanelKind).

Related: [`DockPanelApi`](/api/types/interfaces/DockPanelApi).

## See also

Other [Registration](/api/#registration) members on `ctx`.
