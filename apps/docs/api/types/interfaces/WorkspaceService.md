# Interface: WorkspaceService

Defined in: [packages/sdk/src/workspace-service.ts:232](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L232)

Consumer API for workspace state, exposed as [ExtensionContext.workspaces](ExtensionContext.md#workspaces).
Read via [getState](#getstate) /
[subscribe](#subscribe); drive via the create/rename/
close methods. Opening editor tabs lives on [ExtensionContext.editors](ExtensionContext.md#editors),
not here.

## Methods

### getState()

```ts
getState(): WorkspaceState;
```

Defined in: [packages/sdk/src/workspace-service.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L234)

Current frozen view of workspace state.

#### Returns

[`WorkspaceState`](WorkspaceState.md)

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L235)

#### Parameters

##### listener

(`s`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### get()

```ts
get(id): Workspace | undefined;
```

Defined in: [packages/sdk/src/workspace-service.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L240)

The workspace with this id, or `undefined`. A one-shot lookup for event
handlers; for reactive reads use [useServiceState](../functions/useServiceState.md) over the state.

#### Parameters

##### id

`string`

#### Returns

[`Workspace`](Workspace.md) \| `undefined`

***

### createFromFolderPicker()

```ts
createFromFolderPicker(): Promise<Workspace | null>;
```

Defined in: [packages/sdk/src/workspace-service.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L242)

Show a folder picker and create a workspace from the chosen folder.

#### Returns

`Promise`\<[`Workspace`](Workspace.md) \| `null`\>

***

### create()

```ts
create(input): Workspace;
```

Defined in: [packages/sdk/src/workspace-service.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L243)

#### Parameters

##### input

[`CreateWorkspaceInput`](CreateWorkspaceInput.md)

#### Returns

[`Workspace`](Workspace.md)

***

### rename()

```ts
rename(id, name): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:244](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L244)

#### Parameters

##### id

`string`

##### name

`string`

#### Returns

`void`

***

### reorder()

```ts
reorder(
   from, 
   to, 
   position): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:251](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L251)

Move a workspace to a new position relative to a reference workspace.

#### Parameters

##### from

`string`

Id of the workspace being dragged / moved.

##### to

`string`

Id of the reference workspace (the insertion anchor).

##### position

`"before"` \| `"after"`

Whether to place `from` before or after `to`.

#### Returns

`void`

***

### activate()

```ts
activate(id): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L253)

Activate (and reopen if closed).

#### Parameters

##### id

`string`

#### Returns

`void`

***

### close()

```ts
close(id): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:255](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L255)

Soft close — workspace stays saved but is hidden from the active list.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### reopen()

```ts
reopen(id): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L257)

Reverse of close.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### addFolder()

```ts
addFolder(id, folder): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:259](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L259)

Add an extra folder to a workspace (no-op if already present or is the primary).

#### Parameters

##### id

`string`

##### folder

`string`

#### Returns

`void`

***

### removeFolder()

```ts
removeFolder(id, folder): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:261](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L261)

Remove an extra folder from a workspace.

#### Parameters

##### id

`string`

##### folder

`string`

#### Returns

`void`

***

### delete()

```ts
delete(id): Promise<void>;
```

Defined in: [packages/sdk/src/workspace-service.ts:270](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L270)

Hard delete — permanent removal. Also reaps every terminal in the
workspace (removes records and kills live PTY sessions); callers do not
need a separate [TerminalService.closeWorkspace](TerminalService.md#closeworkspace) step. The entry is
removed from state synchronously (before this returns); the returned
promise resolves once the reaped PTYs have actually been killed, for
callers (e.g. tests) that need that guarantee. Most callers can ignore it.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

***

### setStatus()

```ts
setStatus(workspaceId, row): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L276)

Imperatively adorn a workspace row with a status line. `row.id` is the
adornment key for [WorkspaceService.clearStatus](#clearstatus).

#### Parameters

##### workspaceId

`string`

##### row

[`WorkspaceStatusRow`](WorkspaceStatusRow.md)

#### Returns

`void`

***

### clearStatus()

```ts
clearStatus(workspaceId, rowId): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:279](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L279)

Remove an imperative status row previously set via [WorkspaceService.setStatus](#setstatus).

#### Parameters

##### workspaceId

`string`

##### rowId

`string`

#### Returns

`void`

***

### bindStatus()

```ts
bindStatus(binder): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:299](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L299)

Keep a status projection in sync for every workspace. `provide` returns
an array of rows (may be empty). Prefer this over repeatedly calling
[WorkspaceService.setStatus](#setstatus).

#### Parameters

##### binder

[`WorkspaceStatusProvider`](WorkspaceStatusProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
ctx.subscriptions.push(
  ctx.workspaces.bindStatus({
    id: "my-ext.status",
    provide(workspaceId) {
      const running = getRunningTasks(workspaceId);
      return running.map(t => ({ id: t.id, activity: "working", label: t.name, startedAt: t.startedAt }));
    },
  }),
);
```

***

### ~~registerStatus()~~

```ts
registerStatus(provider): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:304](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L304)

#### Parameters

##### provider

[`WorkspaceStatusProvider`](WorkspaceStatusProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Deprecated

Prefer [WorkspaceService.bindStatus](#bindstatus).

***

### getStatus()

```ts
getStatus(workspaceId): WorkspaceStatusRow[];
```

Defined in: [packages/sdk/src/workspace-service.ts:311](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L311)

Concatenate imperative rows and all binders' rows for one workspace (in
binder registration order). Called synchronously during panel render —
binders must be fast and side-effect-free.

#### Parameters

##### workspaceId

`string`

#### Returns

[`WorkspaceStatusRow`](WorkspaceStatusRow.md)[]

***

### invalidateStatus()

```ts
invalidateStatus(): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:322](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L322)

Signal that binder data has changed. Fires all listeners registered
via [WorkspaceService.subscribeStatus](#subscribestatus), causing the Workspaces
panel to re-query binders and re-render the status rows.

Call this after any mutation to the state your `provide` function reads.
Imperative [WorkspaceService.setStatus](#setstatus) / [WorkspaceService.clearStatus](#clearstatus)
already notify listeners.

#### Returns

`void`

***

### subscribeStatus()

```ts
subscribeStatus(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:330](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L330)

Subscribe to status invalidations. The listener is called whenever
[WorkspaceService.invalidateStatus](#invalidatestatus) is invoked (or imperative
set/clear runs). Returns a [Disposable](Disposable.md) that cancels the
subscription.

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### registerSection()

```ts
registerSection(provider): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:354](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L354)

Register a section provider that mounts a React component inside workspace
rows in the Workspaces side panel. Returns a [Disposable](Disposable.md) that
unregisters the provider and unmounts the component from all rows.

Return `null` from your component for workspaces where the section should
not appear — this produces no DOM node and no visual gap.

#### Parameters

##### provider

[`WorkspaceSectionProvider`](WorkspaceSectionProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```tsx
ctx.subscriptions.push(
  ctx.workspaces.registerSection({
    id: "my-ext.section",
    component: ({ workspaceId }) => {
      const ws = ctx.workspaces.get(workspaceId);
      if (!ws?.terminals.length) return null;
      return <MyCard terminals={ws.terminals} />;
    },
  }),
);
```

***

### subscribeSection()

```ts
subscribeSection(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:371](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L371)

Subscribe to section registration changes. The listener is called whenever
a [WorkspaceSectionProvider](WorkspaceSectionProvider.md) is registered or unregistered. Returns a
[Disposable](Disposable.md) that cancels the subscription.

The Workspaces panel subscribes internally to re-render when providers
are added or removed.

**No `invalidateSection` by design.** Unlike status rows and badges, a
section is a live React component that re-renders on its own internal or
context-driven state changes — it is not a snapshot returned from a
`provide()` call, so there is nothing for the host to re-query. If a
section needs to trigger a full workspace-panel refresh (rare), it should
update its own state directly.

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### registerPropertyPage()

```ts
registerPropertyPage(page): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:396](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L396)

Register a property page that adds a tab to the workspace properties
modal. The host composes all registered pages into the modal's tab bar,
after the built-in General tab. The extension is responsible for
persisting its settings via `ctx.storage.workspace`, immediately on
change — the modal has no Save button.

Returns a [Disposable](Disposable.md) that unregisters the page and unmounts the
component from any open properties modal.

#### Parameters

##### page

[`WorkspacePropertyPage`](WorkspacePropertyPage.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```tsx
ctx.subscriptions.push(
  ctx.workspaces.registerPropertyPage({
    id: "silo.github-actions.properties",
    title: "GitHub Actions",
    icon: <IconGitHub size={14} />,
    component: GhActionsWorkspaceSettings,
    visible: (ws) => hasDetectedRepo(ws.id),
  }),
);
```

***

### getOpenWorkspaceMenuItems()

```ts
getOpenWorkspaceMenuItems(): Promise<MenuEntry[]>;
```

Defined in: [packages/sdk/src/workspace-service.ts:422](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L422)

The rows of the **Open Workspace** menu — the same menu the Navigator's
`+` button opens: any saved groups, then closed workspaces to reopen (a
missing folder is flagged), a separator, then "New workspace…" and
"New Group…".

Use it to offer workspace switching from your own UI without rebuilding
the list — the returned [entries](../type-aliases/MenuEntry.md) drop straight into
[UiService.showMenu](UiService.md#showmenu), including as a `submenu` of one of your own
rows. Async because the closed-workspace rows check whether each folder
still exists on disk.

#### Returns

`Promise`\<[`MenuEntry`](../type-aliases/MenuEntry.md)[]\>

#### Example

```ts
ctx.ui.showMenu({
  items: [
    { label: "Refresh", run: refresh },
    { type: "separator" },
    { label: "Workspace", submenu: await ctx.workspaces.getOpenWorkspaceMenuItems() },
  ],
  anchor,
});
```

***

### getWorkspaceMenuItems()

```ts
getWorkspaceMenuItems(workspaceId): MenuEntry[];
```

Defined in: [packages/sdk/src/workspace-service.ts:450](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L450)

The rows of one workspace's context menu — **Properties…**, **Close**, then
whatever extensions contributed on the `"workspace"`
[surface](../type-aliases/MenuSurface.md).

Use it when your own UI names a workspace without *being* the workspace
list — an agent row showing which workspace its terminal lives in, a
search result grouped by workspace — so the same actions are one
right-click away there too. Returns an empty array for an unknown id.

Group membership actions (Move to Group, Remove from Group) are **not**
included: group state is host-internal (ADR 0023), so the Workspaces view
appends those itself.

#### Parameters

##### workspaceId

`string`

#### Returns

[`MenuEntry`](../type-aliases/MenuEntry.md)[]

#### Example

```ts
ctx.ui.showMenu({
  items: [
    { label: "Mark as seen", run: acknowledge },
    { type: "separator" },
    { label: ws.name, submenu: ctx.workspaces.getWorkspaceMenuItems(ws.id) },
  ],
  at: { x: e.clientX, y: e.clientY },
});
```

***

### setBadge()

```ts
setBadge(workspaceId, badge): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:456](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L456)

Imperatively adorn a workspace name with a badge. `badge.id` is the
adornment key for [WorkspaceService.clearBadge](#clearbadge).

#### Parameters

##### workspaceId

`string`

##### badge

[`WorkspaceBadge`](WorkspaceBadge.md)

#### Returns

`void`

***

### clearBadge()

```ts
clearBadge(workspaceId, badgeId): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:459](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L459)

Remove an imperative badge previously set via [WorkspaceService.setBadge](#setbadge).

#### Parameters

##### workspaceId

`string`

##### badgeId

`string`

#### Returns

`void`

***

### bindBadge()

```ts
bindBadge(binder): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:479](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L479)

Keep a badge projection in sync for every workspace. `provide` returns
an array of badges (may be empty).

#### Parameters

##### binder

[`WorkspaceBadgeProvider`](WorkspaceBadgeProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
ctx.subscriptions.push(
  ctx.workspaces.bindBadge({
    id: "my-ext.badges",
    provide(workspaceId) {
      const status = getStatus(workspaceId);
      if (!status) return [];
      return [{ id: "status", text: status.label, color: status.color }];
    },
  }),
);
```

***

### ~~registerBadge()~~

```ts
registerBadge(provider): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:484](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L484)

#### Parameters

##### provider

[`WorkspaceBadgeProvider`](WorkspaceBadgeProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Deprecated

Prefer [WorkspaceService.bindBadge](#bindbadge).

***

### getBadges()

```ts
getBadges(workspaceId): WorkspaceBadge[];
```

Defined in: [packages/sdk/src/workspace-service.ts:490](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L490)

Concatenate imperative badges and all binders' badges for one workspace
(in binder registration order).

#### Parameters

##### workspaceId

`string`

#### Returns

[`WorkspaceBadge`](WorkspaceBadge.md)[]

***

### invalidateBadges()

```ts
invalidateBadges(): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:496](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L496)

Signal that badge binder data has changed. Imperative set/clear already
notify listeners.

#### Returns

`void`

***

### subscribeBadges()

```ts
subscribeBadges(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:501](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L501)

Subscribe to badge invalidations.

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)
