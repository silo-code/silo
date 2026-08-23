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

## The command runs with no arguments

A keybinding invokes its command with **no arguments** — unlike a toolbar item
or a tab context menu, which pass the tab they belong to. A command that reads
its target only from its arguments will run and silently do nothing when bound
to a key; see [what `run` receives](/api/registration/register-command#what-run-receives).

This applies to commands you never bind here too: users can assign a shortcut
to any command from Settings → Keyboard Shortcuts.

## Types

Pass [`Keybinding`](/api/types/interfaces/Keybinding).

Related: [`ContextKeys`](/api/types/interfaces/ContextKeys).

## See also

Other [Registration](/api/#registration) members on `ctx`.
