# ctx.storage

Persisted, per-extension key/value storage in two scopes
([`ExtensionStorageScopes`](/api/types/interfaces/ExtensionStorageScopes)). Each
scope is an [`ExtensionStorage`](/api/types/interfaces/ExtensionStorage)
namespaced to your extension id, shared across all your surfaces (status bar,
side panels, settings page).

```ts
ctx.storage: ExtensionStorageScopes // { global, workspace }
```

| Scope                   | Lifetime                                  | Use for                                            |
| ----------------------- | ----------------------------------------- | -------------------------------------------------- |
| `ctx.storage.global`    | one bag, shared across **all** workspaces | the extension's own settings (enabled features, …) |
| `ctx.storage.workspace` | one bag per **active workspace**          | state that should differ per workspace             |

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

## Methods

On each [`ExtensionStorage`](/api/types/interfaces/ExtensionStorage) scope.
Method names link to the full signature.

| Method                                                                    | What it does                                                                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`get(key, fallback?)`](/api/types/interfaces/ExtensionStorage#get)       | Read a value; returns `fallback` (or `undefined`) when the key is missing.                                       |
| [`set(key, value)`](/api/types/interfaces/ExtensionStorage#set)           | Write a value. Passing `undefined` deletes the key.                                                              |
| [`keys()`](/api/types/interfaces/ExtensionStorage#keys)                   | The keys currently set in this namespace.                                                                        |
| [`subscribe(listener)`](/api/types/interfaces/ExtensionStorage#subscribe) | Observe changes in this namespace (also fires on hydration and workspace swap); returns an unsubscribe function. |

## Types

Pass [`ExtensionStorageScopes`](/api/types/interfaces/ExtensionStorageScopes)
(`{ global, workspace }`), each an
[`ExtensionStorage`](/api/types/interfaces/ExtensionStorage).

Related: [`SidePanelProps`](/api/types/interfaces/SidePanelProps) exposes the
same `workspace` scope keyed by panel id, for panel-local UI state.

## See also

Other [Services](/api/#services) on `ctx`.
