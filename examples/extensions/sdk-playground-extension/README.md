# SDK Playground

A side panel that exercises the **newest `ctx` APIs live** — one runnable demo
per SDK-surface item. Press a button in a section and read the result inline.
Every call goes through the public [`@silo-code/sdk`](../../../apps/docs/api/index.md),
so it doubles as proof the surface works from a real, SDK-only extension.

## What it demonstrates

| Section            | API                                                    | Item |
| ------------------ | ------------------------------------------------------ | ---- |
| Document access    | `ctx.editors.getText` / `isDirty` / `onDidSave`        | B6   |
| Terminal           | `ctx.terminals.sendText` / `rename` / `close`          | B7   |
| Files              | `ctx.files.writeBytes` / `stat` / `copy`               | B8   |
| exec               | `ctx.process.exec` with `env` / `timeoutMs` / `signal` | B9   |
| Cancellable search | `ctx.search.search` with `signal`                      | B11  |
| Binary fetch       | `ctx.net.fetchBytes`                                   | B14  |

## Build and install

```sh
pnpm install
pnpm --filter sdk-playground-extension build   # → dist/index.js
```

Then **Settings → Extensions → Install from folder…** and choose this folder.
Reveal the panel from the right side column, or run **Open SDK Playground** from
the command palette.

## Notes

- The **Binary fetch** demo needs network access (it downloads a favicon).
- The **exec** demos assume a POSIX environment (`printenv`, `sleep`); on Windows
  those commands differ and the calls will surface an error in the output box —
  which is itself a fine demonstration of `exec`'s rejection handling.
- The **Files** demo writes and then deletes a scratch file
  (`.silo-playground-demo.bin`) in the active workspace folder.
