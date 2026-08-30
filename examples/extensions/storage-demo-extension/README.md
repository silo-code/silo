# Storage Demo

A live demonstration of `ctx.storage.globalDir()` / `workspaceDir()`
([RFC 0032](../../../docs/proposals/0032-ctx-extension-storage-directory)) —
the filesystem counterpart to `ctx.storage`'s key/value bags: a directory the
host owns on this extension's behalf, reachable through `ctx.files` with **no
`fs:read`/`fs:write` declared**.

Check the manifest — there's no `silo.permissions` key at all:

```jsonc
"silo": {
  "id": "silo.storage-demo",
  "engine": "^0.1",
  "main": "dist/index.js"
  // no "permissions" — installing this extension shows no consent prompt
}
```

Every file operation below runs against a path returned by `globalDir()` or
`workspaceDir()`. That it works with zero permissions declared **is** the
point: an extension's own storage directory is inside its sandbox
unconditionally, the same way the open workspace folder is.

## What it does

A **Storage Demo** side panel (also reachable via the `Open Storage Demo`
command) with five sections:

1. **Paths** — resolves and displays the real on-disk `globalDir()` /
   `workspaceDir()` paths. Compare them in a terminal, outside Silo entirely,
   against `~/.config/silo[-<identity>]/extension-storage/silo.storage-demo/`.
2. **Global storage** — append a line to `notes.log`, read it back, list the
   directory, delete the file. Shared across every workspace.
3. **Workspace storage** — the same four actions, scoped to the active
   workspace. With no workspace open, every action rejects with
   `NoWorkspaceError` (not `PathDeniedError` — nothing was denied, there's
   just nothing to scope to).
4. **Sandbox boundary** — three checks that should all report ✅:
   - a write to a path outside any storage directory is still denied (the
     lift doesn't widen `fs:write` generally);
   - a write to a directory that merely _shares the string prefix_ of the
     storage directory (`…/silo.storage-demo/global-evil`) is still denied
     (the containment test is a real path check, not a substring match);
   - running a command with its working directory inside the storage
     directory is still denied without the `process` permission (the lift
     covers `ctx.files` only).
5. **Watch a `cache/` subfolder** — starts `ctx.files.watch` on
   `<globalDir>/cache` and logs events live. A workspace watch silently drops
   events under directories named `cache/`, `dist/`, `node_modules/`, etc.
   (the project-tree noise filter); that filter is off inside extension
   storage, so writing a file here and seeing the event land is the proof.

## Manual checks this doesn't automate

Two behaviors need the real Extensions UI, not just this panel:

- **No consent prompt at install.** Install this extension and confirm
  Settings → Extensions shows no permission dialog at all.
- **Uninstall keeps the data by default.** Write some data (sections 2/3),
  then uninstall from Settings → Extensions:
  - with the **"Also delete its data"** checkbox left unchecked, the
    directory survives — its path is logged to Output → **Extension Host**,
    and reinstalling the extension finds the previous data still there
    (re-run "Read file" / "List directory");
  - with the checkbox checked, the directory is gone.
  - With no data written yet, uninstalling shows the plain confirm with no
    checkbox at all.

## Build & install

```sh
pnpm install
pnpm --filter storage-demo-extension build   # produces dist/index.js
```

Then in Silo: **Settings → Extensions → Install from folder…**, choose this
folder, and open **Storage Demo** from the right side panel.
