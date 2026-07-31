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
| [`delete(id)`](/api/types/interfaces/WorkspaceService#delete)                               | Hard delete — permanent removal (also reaps the workspace's terminals).      |
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

## Workspace status

Ephemeral status rows below each workspace's path line (adorn verbs — see
[ADR 0029](https://github.com/silo-code/silo/blob/main/docs/decisions/0029-adornments-vs-registration.md)
/ [ADR 0030](https://github.com/silo-code/silo/blob/main/docs/decisions/0030-activity-chrome.md)).
`bindStatus` returns an **array** of rows per workspace (unlike tab
`bindActivity`, which returns a single adornment or `null`).

Each row may include an [`Activity`](/api/types/type-aliases/Activity)
(`working` | `ready` | `warn` | `error`). Omit `activity` for the neutral gray
fallback.

```ts
ctx.subscriptions.push(
  ctx.workspaces.bindStatus({
    id: "my-ext.status",
    provide(workspaceId) {
      return getRunningTasks(workspaceId).map((t) => ({
        id: t.id,
        activity: "working",
        label: t.name,
        startedAt: t.startedAt,
      }));
    },
  }),
);

// Or imperatively:
ctx.workspaces.setStatus(workspaceId, {
  id: "one-shot",
  activity: "ready",
  label: "Ready",
});
ctx.workspaces.clearStatus(workspaceId, "one-shot");
```

| Method                                                                        | What it does                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| [`setStatus` / `clearStatus`](/api/types/interfaces/WorkspaceService)         | Imperative rows                               |
| [`bindStatus`](/api/types/interfaces/WorkspaceService#bindstatus)             | Keep a projection in sync (`provide` → array) |
| [`registerStatus`](/api/types/interfaces/WorkspaceService#registerstatus)     | **Deprecated** shim → `bindStatus`            |
| [`getStatus`](/api/types/interfaces/WorkspaceService#getstatus)               | Imperative + binder rows                      |
| [`invalidateStatus`](/api/types/interfaces/WorkspaceService#invalidatestatus) | Re-query binders                              |
| [`subscribeStatus`](/api/types/interfaces/WorkspaceService#subscribestatus)   | Listen for changes                            |

Each row is a [`WorkspaceStatusRow`](/api/types/interfaces/WorkspaceStatusRow).

## Workspace sections

Extensions can mount an arbitrary React component inside each workspace row —
below the path line and any status rows. Sections are useful for richer
surfaces: interactive cards, agent-status summaries, call indicators, etc.

Return `null` from your component for workspaces where the section should not
appear. This produces no DOM node and no visual gap.

```tsx
ctx.subscriptions.push(
  ctx.workspaces.registerSection({
    id: "my-ext.section",
    component: ({ workspaceId }) => {
      const ws = ctx.workspaces.get(workspaceId);
      if (!ws?.terminals.length) return null;
      return <MyCard terminals={ws.terminals} />;
    },
    order: 0, // lower = higher in the stack, default 0
  }),
);
```

Multiple providers from different extensions stack vertically in ascending
`order`. Each component is responsible for its own top margin/padding and must
use only `--silo-*` design tokens.

| Method                                                                                  | What it does                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`registerSection(provider)`](/api/types/interfaces/WorkspaceService#registersection)   | Register a React component to mount in workspace rows. Returns a [`Disposable`](/api/types/interfaces/Disposable). |
| [`subscribeSection(listener)`](/api/types/interfaces/WorkspaceService#subscribesection) | Subscribe to provider registration changes. Returns a [`Disposable`](/api/types/interfaces/Disposable).            |

The provider shape is [`WorkspaceSectionProvider`](/api/types/interfaces/WorkspaceSectionProvider); component props are [`WorkspaceSectionProps`](/api/types/interfaces/WorkspaceSectionProps).

## Workspace badges

Inline badges next to the workspace name (same adorn verbs as status).

```ts
ctx.subscriptions.push(
  ctx.workspaces.bindBadge({
    id: "my-ext.badges",
    provide(workspaceId) {
      const env = getEnv(workspaceId);
      if (!env) return [];
      return [{ id: "env", text: env.label, color: env.color }];
    },
  }),
);

ctx.workspaces.setBadge(workspaceId, {
  id: "ci",
  text: "fail",
  color: "#f87171",
});
ctx.workspaces.clearBadge(workspaceId, "ci");
```

| Method                                                                        | What it does                      |
| ----------------------------------------------------------------------------- | --------------------------------- |
| [`setBadge` / `clearBadge`](/api/types/interfaces/WorkspaceService)           | Imperative badges                 |
| [`bindBadge`](/api/types/interfaces/WorkspaceService#bindbadge)               | Keep a projection in sync         |
| [`registerBadge`](/api/types/interfaces/WorkspaceService#registerbadge)       | **Deprecated** shim → `bindBadge` |
| [`getBadges`](/api/types/interfaces/WorkspaceService#getbadges)               | Imperative + binder badges        |
| [`invalidateBadges`](/api/types/interfaces/WorkspaceService#invalidatebadges) | Re-query binders                  |
| [`subscribeBadges`](/api/types/interfaces/WorkspaceService#subscribebadges)   | Listen for changes                |

Each badge is a [`WorkspaceBadge`](/api/types/interfaces/WorkspaceBadge).

## Workspace property pages

Extensions can contribute a tab to the **workspace properties modal** — the
right place for per-workspace configuration (persistent settings the user
adjusts through forms). The modal always shows a tab bar: the built-in
**General** tab (name, folders) first, then registered pages in ascending
`order`.

Persist the page's settings via `ctx.storage.workspace`, immediately on change
— the modal has no Save button. For one-shot _actions_ (refresh, clear) prefer
a [workspace context-menu item](/api/registration/register-context-menu-item)
instead; property pages are for configuration.

```tsx
ctx.subscriptions.push(
  ctx.workspaces.registerPropertyPage({
    id: "my-ext.properties",
    title: "My Extension",
    component: ({ ws }) => (
      <MySettingsForm
        value={readSettings(ws.id)}
        onChange={(next) => writeSettings(ws.id, next)}
      />
    ),
    visible: (ws) => isRelevant(ws), // hide the tab where it doesn't apply
  }),
);
```

| Method                                                                                      | What it does                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`registerPropertyPage(page)`](/api/types/interfaces/WorkspaceService#registerpropertypage) | Register a tab in the workspace properties modal. Returns a [`Disposable`](/api/types/interfaces/Disposable). |

The page shape is [`WorkspacePropertyPage`](/api/types/interfaces/WorkspacePropertyPage); component props are [`WorkspacePropertyPageProps`](/api/types/interfaces/WorkspacePropertyPageProps).

## Types

Pass [`WorkspaceService`](/api/types/interfaces/WorkspaceService).

Related: [`WorkspaceState`](/api/types/interfaces/WorkspaceState) · [`WorkspaceStatusRow`](/api/types/interfaces/WorkspaceStatusRow) · [`WorkspaceStatusProvider`](/api/types/interfaces/WorkspaceStatusProvider) · [`WorkspaceSectionProvider`](/api/types/interfaces/WorkspaceSectionProvider) · [`WorkspaceSectionProps`](/api/types/interfaces/WorkspaceSectionProps) · [`WorkspaceBadge`](/api/types/interfaces/WorkspaceBadge) · [`WorkspaceBadgeProvider`](/api/types/interfaces/WorkspaceBadgeProvider) · [`WorkspacePropertyPage`](/api/types/interfaces/WorkspacePropertyPage) · [`WorkspacePropertyPageProps`](/api/types/interfaces/WorkspacePropertyPageProps) · [`CreateWorkspaceInput`](/api/types/interfaces/CreateWorkspaceInput) · [`OpenFileOptions`](/api/types/interfaces/OpenFileOptions).

## See also

Other [State](/api/#state) members on `ctx`.
