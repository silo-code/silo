# ctx.registerSidePanel

Add a panel to the left or right side column (like the file explorer or git panel).

```ts
ctx.registerSidePanel(panel: SidePanel): Disposable
```

## Example

```tsx
ctx.registerSidePanel({
  id: "acme.outline",
  location: "left",
  title: "Outline",
  component: OutlinePanel, // receives SidePanelProps (active, storage, hydrated)
  lazyMount: true,
});
```

If your panel would be _another way to navigate the app_, register a
[Navigator view](/api/registration/register-navigator-view) instead — two
navigators side by side leave the user with no rule for which one to trust.

## Types

Pass [`SidePanel`](/api/types/interfaces/SidePanel).

Related: [`SidePanelProps`](/api/types/interfaces/SidePanelProps) · [`ExtensionStorage`](/api/types/interfaces/ExtensionStorage).

## See also

Other [Registration](/api/#registration) members on `ctx`.
