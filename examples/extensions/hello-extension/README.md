# Hello — the starter extension

The minimal Silo extension and the recommended **starting point for your own**:
one command and one status-bar item, in ~40 lines. It requests no permissions,
so it installs without a consent prompt.

Pair it with the guides: [Your first extension](../../../apps/docs/guide/getting-started.md)
walks through the concepts; [Publishing an extension](../../../apps/docs/guide/publishing-an-extension.md)
covers the manifest and build.

## Use it as a template

1. Copy this folder (or, once published, use the GitHub **"Use this template"**
   repo).
2. Rename: set `name`, `displayName`, and especially `silo.id` in `package.json`
   to your own id (e.g. `you.cool-thing`) — it **must equal** `extension.id` in
   `src/index.tsx`.
3. Build and install:

   ```sh
   pnpm install
   pnpm --filter hello-extension build      # → dist/index.js
   ```

   In Silo: **Settings → Extensions → Install from folder…** and choose this
   folder. The **👋 Hello** item appears in the status bar; click it (or run the
   `Hello: Say hello` command).

## What to change next

- **Add UI** — a side panel (`ctx.registerSidePanel`), an editor
  (`ctx.registerEditor`), a settings page (`ctx.registerSettingsPage`).
- **Talk to the user** — `ctx.ui` (notifications, pickers, modals).
- **Reach the workspace** — `ctx.files` / `ctx.process` (workspace-scoped by
  default; declare `silo.permissions` to go beyond — see `permissions-demo`).

The full surface is the [`ctx` API reference](../../../apps/docs/api/index.md).
