# ctx.workspaces

Read and drive workspace state through `WorkspaceService` — create/rename/close
workspaces, manage their folders, and subscribe to a frozen snapshot. (Opening
editor tabs lives on [`ctx.editors`](/api/editors/), not here.)

```ts
ctx.workspaces: WorkspaceService
```

## Example

```tsx
import { useServiceState } from "@silo-code/sdk";

// read workspace state reactively in a component
function OpenCount() {
  const state = useServiceState(ctx.workspaces);
  return <span>{state.open.length} open</span>;
}

// or observe changes imperatively
const sub = ctx.workspaces.subscribe((state) => {
  console.log(state.open.length, "open workspaces");
});
```

## Methods

On [`ctx.workspaces`](/api/types/interfaces/WorkspaceService). Method names link
to the full signature.

| Method                                                                                      | What it does                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`getState()`](/api/types/interfaces/WorkspaceService#getstate)                             | Current frozen [`WorkspaceState`](/api/types/interfaces/WorkspaceState).     |
| [`subscribe(listener)`](/api/types/interfaces/WorkspaceService#subscribe)                   | Observe changes; returns a [`Disposable`](/api/types/interfaces/Disposable). |
| [`get(id)`](/api/types/interfaces/WorkspaceService#get)                                     | One-shot lookup of a workspace by id (for reactive reads, prefer the state). |
| [`create(input)`](/api/types/interfaces/WorkspaceService#create)                            | Create a workspace from a folder + name.                                     |
| [`createFromFolderPicker()`](/api/types/interfaces/WorkspaceService#createfromfolderpicker) | Show a folder picker, then create.                                           |
| [`rename(id, name)`](/api/types/interfaces/WorkspaceService#rename)                         | Rename a workspace.                                                          |
| [`reorder(from, to, position)`](/api/types/interfaces/WorkspaceService#reorder)             | Reorder workspaces.                                                          |
| [`activate(id)`](/api/types/interfaces/WorkspaceService#activate)                           | Activate (and reopen if closed).                                             |
| [`close(id)`](/api/types/interfaces/WorkspaceService#close)                                 | Soft close — hidden but still saved.                                         |
| [`reopen(id)`](/api/types/interfaces/WorkspaceService#reopen)                               | Reverse of `close`.                                                          |
| [`delete(id)`](/api/types/interfaces/WorkspaceService#delete)                               | Hard delete — permanent removal.                                             |
| [`addFolder(id, folder)`](/api/types/interfaces/WorkspaceService#addfolder)                 | Add an extra folder to a workspace.                                          |
| [`removeFolder(id, folder)`](/api/types/interfaces/WorkspaceService#removefolder)           | Remove an extra folder.                                                      |

## State

The readable state — a frozen [`WorkspaceState`](/api/types/interfaces/WorkspaceState)
from [`getState()`](/api/types/interfaces/WorkspaceService#getstate),
[`subscribe`](/api/types/interfaces/WorkspaceService#subscribe), or
[`useServiceState`](/api/other/use-service-state):

| Property   | Type                   | What it is                           |
| ---------- | ---------------------- | ------------------------------------ |
| `all`      | `readonly Workspace[]` | every workspace, in user order       |
| `open`     | `readonly Workspace[]` | open workspaces (not closed)         |
| `closed`   | `readonly Workspace[]` | closed workspaces, most-recent first |
| `activeId` | `string \| null`       | id of the active workspace           |
| `hydrated` | `boolean`              | true once persisted state has loaded |

## Workspace decoration

Extensions can contribute status rows below each workspace's path line in the
Workspaces panel. Rows carry a semantic dot, a label, and an optional elapsed
timestamp — useful for surfacing running tasks, agent sessions, CI status, etc.

```ts
ctx.subscriptions.push(
  ctx.workspaces.subscribe(() => ctx.workspaces.invalidateDecorations()),
  ctx.workspaces.registerDecoration({
    id: "my-ext.decoration",
    provide(workspaceId) {
      return getRunningTasks(workspaceId).map((t) => ({
        id: t.id,
        status: "busy",
        label: t.name,
        startedAt: t.startedAt,
      }));
    },
  }),
);
```

| Method                                                                                          | What it does                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`registerDecoration(provider)`](/api/types/interfaces/WorkspaceService#registerdecoration)     | Register a provider that returns status rows per workspace. Returns a [`Disposable`](/api/types/interfaces/Disposable). Multiple providers are concatenated in registration order. |
| [`getDecorations(workspaceId)`](/api/types/interfaces/WorkspaceService#getdecorations)          | Concatenate all registered providers' rows for one workspace (called during panel render).                                                                                         |
| [`invalidateDecorations()`](/api/types/interfaces/WorkspaceService#invalidatedecorations)       | Signal that decoration data changed — triggers a panel re-render.                                                                                                                  |
| [`subscribeDecorations(listener)`](/api/types/interfaces/WorkspaceService#subscribedecorations) | Subscribe to decoration invalidations. Returns a [`Disposable`](/api/types/interfaces/Disposable).                                                                                 |

Each row is a [`WorkspaceStatusRow`](/api/types/interfaces/WorkspaceStatusRow).

## Types

Pass [`WorkspaceService`](/api/types/interfaces/WorkspaceService).

Related: [`WorkspaceState`](/api/types/interfaces/WorkspaceState) · [`WorkspaceStatusRow`](/api/types/interfaces/WorkspaceStatusRow) · [`WorkspaceDecorationProvider`](/api/types/interfaces/WorkspaceDecorationProvider) · [`CreateWorkspaceInput`](/api/types/interfaces/CreateWorkspaceInput) · [`OpenFileOptions`](/api/types/interfaces/OpenFileOptions).

## See also

Other [State](/api/#state) members on `ctx`.
