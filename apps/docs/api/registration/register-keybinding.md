# ctx.registerKeybinding

Bind a keyboard shortcut to a command id. An optional `when` predicate over context keys makes the binding inert unless its condition holds.

```ts
ctx.registerKeybinding(binding: Keybinding): Disposable
```

## Example

```tsx
ctx.registerKeybinding({
  id: "acme.sayHi",
  key: "cmd+shift+h",
  command: "acme.sayHi",
});
```

## Types

Pass [`Keybinding`](/api/types/interfaces/Keybinding).

Related: [`ContextKeys`](/api/types/interfaces/ContextKeys).

## See also

Other [Registration](/api/#registration) members on `ctx`.
