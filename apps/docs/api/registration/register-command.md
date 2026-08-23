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

## What `run` receives

The host passes a target **only** for invocations that have one. Everything else
calls `run()` with no arguments:

| Invoked from                | `args[0]`                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| a toolbar item              | [`ToolbarItemContext`](/api/types/interfaces/ToolbarItemContext)`[S]` — the tab the button sits on |
| a tab context menu          | [`MenuContext`](/api/types/interfaces/MenuContext)`[S]` — the tab that was right-clicked           |
| `ctx.executeCommand(id, …)` | whatever the caller passed                                                                         |
| a keybinding or menu item   | **nothing**                                                                                        |

A command that reads its target only from `args` therefore **cannot be bound to
a key** — it runs and silently does nothing, which looks exactly like the
shortcut never firing. Users can bind any command from Settings → Keyboard
Shortcuts, so this applies even to commands you never registered a keybinding
for.

If one command backs both a surface and a shortcut, fall back to the active tab:

```tsx
ctx.registerCommand({
  id: "acme.flagTab",
  label: "Acme: Flag Tab",
  run: (...args) => {
    const target = args[0] as { editorId?: string } | undefined;
    const editorId =
      target?.editorId ?? ctx.editors.getState().active?.editorId ?? null;
    if (!editorId) return; // nothing focused
    flag(editorId);
  },
});
```

Use [`ctx.terminals.getActive()`](/api/types/interfaces/TerminalService#getactive) for the terminal side — at
most one of the two is set, since both report the single active center-dock
panel.

## Types

Pass [`Command`](/api/types/interfaces/Command).

## See also

Other [Registration](/api/#registration) members on `ctx`.
