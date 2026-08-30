# ctx.storage

Persisted, per-extension storage
([`ExtensionStorageScopes`](/api/types/interfaces/ExtensionStorageScopes)) in two
shapes: **key/value bags** for settings-sized state, and **directories** for real
data files. Both come in the same two scopes — global and workspace — and both
are namespaced to your extension id, shared across all your surfaces (status bar,
side panels, settings page).

```ts
ctx.storage: ExtensionStorageScopes // { global, workspace, globalDir(), workspaceDir() }
```

| Scope                        | Lifetime                                  | Use for                                            |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------- |
| `ctx.storage.global`         | one bag, shared across **all** workspaces | the extension's own settings (enabled features, …) |
| `ctx.storage.workspace`      | one bag per **active workspace**          | state that should differ per workspace             |
| `ctx.storage.globalDir()`    | one directory, shared across workspaces   | data files (a `.jsonl` log, a cache, an export)    |
| `ctx.storage.workspaceDir()` | one directory per **active workspace**    | per-project data files                             |

Pick a bag for something settings-shaped, and a directory for something a person
should be able to find, `grep`, back up, or point an agent at. A growing list
does not belong in a key/value bag — it would be invisible outside Silo and tied
to Silo's own persistence format.

## Example

Read settings up front in `activate` and persist on change. `get`/`set` are
safe to call immediately — but the app state hydrates asynchronously (and the
`workspace` bag is swapped when the active workspace changes), so `subscribe`
and re-read to pick up a value that lands after `activate`:

```ts
export const extension: Extension = {
  id: "my.extension",
  activate(ctx) {
    const store = ctx.storage.global;

    const apply = () => render(store.get<Settings>("settings", DEFAULTS));
    apply();
    ctx.subscriptions.push({ dispose: store.subscribe(apply) });

    // later, from a settings page or panel:
    store.set("settings", next);
  },
};
```

## Storage directories

`globalDir()` and `workspaceDir()` each resolve to an **absolute path** to a
directory the host owns on your behalf. The directory is created on first call
and lives under Silo's user-config root, namespaced by your extension id:

```
~/.config/silo/extension-storage/<your-extension-id>/
├── global/            ← ctx.storage.globalDir()
└── workspaces/<id>/   ← ctx.storage.workspaceDir()
```

(A non-production build is keyed to its own root — "Silo Dev" uses
`~/.config/silo-dev/…` — so a dev install never shares data with a stable one.)

### No filesystem permission is needed inside your own directory

Paths beneath these directories are readable and writable through
[`ctx.files`](/api/files/) **without** declaring `fs:read` or `fs:write`. Your own
storage is inside your sandbox, the same way the open workspace folder is — so an
extension whose only filesystem need is its own data file declares no permissions
at all, and its install prompt asks for nothing.

The lift stops at `ctx.files`. Running a command with a working directory inside
your own directory still needs the `process` permission; passing the path to a
command as an _argument_ needs nothing extra.

### Relative paths still resolve against the workspace

This is the one surprising part. `ctx.files.readText("notes.md")` resolves
against the workspace folder, not your storage directory — always join onto the
absolute path the host handed you:

```ts
const dir = await ctx.storage.globalDir();
await ctx.files.writeText(`${dir}/tasks.jsonl`, lines.join("\n"));
const back = await ctx.files.readText(`${dir}/tasks.jsonl`);
```

### The workspace directory follows the workspace, not the folder

`workspaceDir()` is keyed by the workspace's **identity**, so deleting a
workspace and re-adding the same folder gives you a new, empty directory — the
same rule `ctx.storage.workspace` already follows. Call it again after the active
workspace changes; don't cache the path across a switch.

With no workspace open it rejects with
[`NoWorkspaceError`](/api/types/classes/NoWorkspaceError) — distinct from a
[`PathDeniedError`](/api/types/classes/PathDeniedError), because nothing was
denied:

```ts
try {
  const dir = await ctx.storage.workspaceDir();
  await ctx.files.writeText(`${dir}/notes.md`, body);
} catch (err) {
  if (err instanceof NoWorkspaceError) return; // nothing to persist yet
  throw err;
}
```

### Your data outlives your extension

Uninstalling never deletes a storage directory on its own — the uninstall
confirm offers it as an unchecked option, and the retained path is written to the
Output panel. Reinstalling finds the previous data. Deleting a workspace leaves
its per-extension directories alone.

## Methods

On each [`ExtensionStorage`](/api/types/interfaces/ExtensionStorage) scope.
Method names link to the full signature.

| Method                                                                    | What it does                                                                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`get(key, fallback?)`](/api/types/interfaces/ExtensionStorage#get)       | Read a value; returns `fallback` (or `undefined`) when the key is missing.                                       |
| [`set(key, value)`](/api/types/interfaces/ExtensionStorage#set)           | Write a value. Passing `undefined` deletes the key.                                                              |
| [`keys()`](/api/types/interfaces/ExtensionStorage#keys)                   | The keys currently set in this namespace.                                                                        |
| [`subscribe(listener)`](/api/types/interfaces/ExtensionStorage#subscribe) | Observe changes in this namespace (also fires on hydration and workspace swap); returns an unsubscribe function. |

On [`ExtensionStorageScopes`](/api/types/interfaces/ExtensionStorageScopes)
itself:

| Method                                                                        | What it does                                                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`globalDir()`](/api/types/interfaces/ExtensionStorageScopes#globaldir)       | Absolute path to your directory, shared across workspaces. Created on first call.                  |
| [`workspaceDir()`](/api/types/interfaces/ExtensionStorageScopes#workspacedir) | Absolute path to your directory for the active workspace. Rejects with `NoWorkspaceError` if none. |

## Types

Pass [`ExtensionStorageScopes`](/api/types/interfaces/ExtensionStorageScopes)
(`{ global, workspace, globalDir(), workspaceDir() }`), whose two bags are each
an [`ExtensionStorage`](/api/types/interfaces/ExtensionStorage), and
[`NoWorkspaceError`](/api/types/classes/NoWorkspaceError).

Related: [`SidePanelProps`](/api/types/interfaces/SidePanelProps) exposes the
same `workspace` scope keyed by panel id, for panel-local UI state.

## See also

Other [Services](/api/#services) on `ctx`.
