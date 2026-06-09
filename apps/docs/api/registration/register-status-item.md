# ctx.registerStatusItem

Add a widget to one end of the status bar (the strip along the bottom of the window).

```ts
ctx.registerStatusItem(item: StatusItem): Disposable
```

## Example

```tsx
ctx.registerStatusItem({
  id: "acme.clock",
  alignment: "right",
  priority: 10,
  component: Clock, // a React component
});
```

## Types

Pass [`StatusItem`](/api/types/interfaces/StatusItem).

## See also

Other [Registration](/api/#registration) members on `ctx`.
