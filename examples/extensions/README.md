# Example extensions

Runnable, first-party examples of Silo extensions. Each one is a real package
that installs at runtime (**Settings → Extensions → Install from folder…**) and
touches the app **only** through `ctx` and the public
[`@silo-code/sdk`](../../apps/docs/api/index.md) — exactly as a third-party
extension would. Together they form a ladder: start at the top and add one new
surface at a time.

| Example                                              | What it teaches                                                                                                      | How you reach it          | Requests  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------- |
| **[hello](./hello-extension)**                       | The minimal skeleton — one command + one status item. **Copy this to start your own.**                               | status bar                | —         |
| **[clock](./clock-extension)**                       | Live state (a reactive store + `useServiceState`) and a **settings page**.                                           | status bar                | —         |
| **[notify-demo](./notify-demo-extension)**           | The `ctx.ui` surface — toasts, `showModal`, `confirm`, `prompt`, `showMenu`.                                         | View menu / `cmd+shift+m` | —         |
| **[scratchpad](./scratchpad-extension)**             | A **side panel** with persisted state.                                                                               | side panel                | —         |
| **[permissions-demo](./permissions-demo-extension)** | Workspace **path-scoping** and the capability consent flow.                                                          | status bar                | `fs:read` |
| **[sdk-playground](./sdk-playground-extension)**     | Live demos of the newest `ctx` APIs (editor text, terminal I/O, file bytes, exec, cancellable search, binary fetch). | side panel                | —         |
| **[modal-gallery](./modal-gallery-extension)**       | Live tour of every modal design-system component (RFC 0016) — Buttons through ModalActions, one tab per docs group.  | View menu / `cmd+shift+g` | —         |

## Which one do I want?

- **Building your first extension?** Copy **hello** — it's the permission-free
  starter (it's also the basis of the GitHub "use this template" repo). Then read
  [Your first extension](../../apps/docs/guide/getting-started.md).
- **Need persistent state or a settings page?** See **clock**.
- **Need to talk to the user** (notifications, dialogs, menus)? See
  **notify-demo**.
- **Building a panel** (notes, output, a tool view)? See **scratchpad**.
- **Reaching the filesystem or running commands beyond the workspace?** See
  **permissions-demo** — it declares `fs:read`, so installing it shows the
  consent prompt, and it demonstrates what a grant does (and doesn't) allow. See
  the [Permissions & access](../../apps/docs/guide/permissions.md) guide.
- **Building a modal?** See **modal-gallery** — every kit component from
  RFC 0016, live and interactive, grouped the same way as the
  [design docs](../../apps/docs/design/components/).

`hello` is deliberately a strict subset of `clock`: same shape (command + status
item), minus the state and settings page — so "what does the next step look
like?" is a one-file diff.

## Build and install any of them

```sh
pnpm install
pnpm --filter <name>-extension build      # e.g. hello-extension → dist/index.js
```

Then **Settings → Extensions → Install from folder…** and choose the folder. The
host copies it into `~/.config/silo/extensions/<id>/` and loads it immediately;
**Disable / Enable / Uninstall** manage it from there.

See [Publishing an extension](../../apps/docs/guide/publishing-an-extension.md)
for the full packaging contract (manifest, build externals, lifecycle).
