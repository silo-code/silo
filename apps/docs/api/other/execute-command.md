# ctx.executeCommand

Invoke any registered command by id — including commands contributed by other extensions. The minimal "operate" primitive; pairs with the typed State services for read access.

```ts
ctx.executeCommand(id: string): void
```

## Example

```tsx
// trigger a core command from your own UI
ctx.executeCommand("view.toggleLeftPanel");
```

## Types

Pass [`Command`](/api/types/interfaces/Command).

## See also

Other [Other](/api/#other) members on `ctx`.
