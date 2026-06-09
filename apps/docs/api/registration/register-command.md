# ctx.registerCommand

Define a named, invokable action. Commands are the unit of "doing something" — menu items, keybindings, and status items all ultimately trigger a command.

```ts
ctx.registerCommand(cmd: Command): Disposable
```

## Example

```tsx
ctx.registerCommand({
  id: "acme.sayHi",
  label: "Acme: Say Hi",
  run: () => console.log("hi"),
});
```

## Types

Pass [`Command`](/api/types/interfaces/Command).

## See also

Other [Registration](/api/#registration) members on `ctx`.
