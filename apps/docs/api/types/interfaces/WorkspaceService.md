# Interface: WorkspaceService

Defined in: [packages/sdk/src/workspace-service.ts:160](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L160)

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

Defined in: [packages/sdk/src/workspace-service.ts:162](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L162)

Current frozen view of workspace state.

#### Returns

[`WorkspaceState`](WorkspaceState.md)

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:163](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L163)

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

Defined in: [packages/sdk/src/workspace-service.ts:168](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L168)

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

Defined in: [packages/sdk/src/workspace-service.ts:170](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L170)

Show a folder picker and create a workspace from the chosen folder.

#### Returns

`Promise`\<[`Workspace`](Workspace.md) \| `null`\>

***

### create()

```ts
create(input): Workspace;
```

Defined in: [packages/sdk/src/workspace-service.ts:171](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L171)

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

Defined in: [packages/sdk/src/workspace-service.ts:172](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L172)

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

Defined in: [packages/sdk/src/workspace-service.ts:179](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L179)

Move a workspace to a new position relative to a reference workspace.

#### Parameters

##### from

`string`

Id of the workspace being dragged / moved.

##### to

`string`

Id of the reference workspace (the insertion anchor).

##### position

`"after"` \| `"before"`

Whether to place `from` before or after `to`.

#### Returns

`void`

***

### activate()

```ts
activate(id): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:181](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L181)

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

Defined in: [packages/sdk/src/workspace-service.ts:183](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L183)

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

Defined in: [packages/sdk/src/workspace-service.ts:185](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L185)

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

Defined in: [packages/sdk/src/workspace-service.ts:187](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L187)

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

Defined in: [packages/sdk/src/workspace-service.ts:189](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L189)

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
delete(id): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:191](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L191)

Hard delete — permanent removal.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### registerStatus()

```ts
registerStatus(provider): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:213](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L213)

Register a status provider that contributes status rows to workspace
rows in the Workspaces side panel. Multiple providers may be registered;
their rows are concatenated in registration order. Returns a
[Disposable](Disposable.md) that unregisters the provider.

#### Parameters

##### provider

[`WorkspaceStatusProvider`](WorkspaceStatusProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
ctx.subscriptions.push(
  ctx.workspaces.registerStatus({
    id: "my-ext.status",
    provide(workspaceId) {
      const running = getRunningTasks(workspaceId);
      return running.map(t => ({ id: t.id, status: "busy", label: t.name, startedAt: t.startedAt }));
    },
  }),
  ctx.workspaces.subscribeStatus(() => ctx.workspaces.invalidateStatus()),
);
```

***

### getStatus()

```ts
getStatus(workspaceId): WorkspaceStatusRow[];
```

Defined in: [packages/sdk/src/workspace-service.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L220)

Concatenate all registered providers' rows for one workspace (in
registration order). Called synchronously during panel render — providers
must be fast and side-effect-free.

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

Defined in: [packages/sdk/src/workspace-service.ts:229](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L229)

Signal that status data has changed. Fires all listeners registered
via [WorkspaceService.subscribeStatus](#subscribestatus), causing the Workspaces
panel to re-query providers and re-render the status rows.

Call this after any mutation to the state your `provide` function reads.

#### Returns

`void`

***

### subscribeStatus()

```ts
subscribeStatus(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L239)

Subscribe to status invalidations. The listener is called whenever
[WorkspaceService.invalidateStatus](#invalidatestatus) is invoked. Returns a
[Disposable](Disposable.md) that cancels the subscription.

The Workspaces panel subscribes internally; extensions may also subscribe
to observe invalidations.

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

Defined in: [packages/sdk/src/workspace-service.ts:263](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L263)

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

Defined in: [packages/sdk/src/workspace-service.ts:280](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L280)

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

### registerBadge()

```ts
registerBadge(provider): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:302](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L302)

Register a badge provider that contributes [WorkspaceBadge](WorkspaceBadge.md)s next to
the workspace name in the Workspaces side panel. Multiple providers may be
registered; their badges are concatenated in registration order. Returns a
[Disposable](Disposable.md) that unregisters the provider.

#### Parameters

##### provider

[`WorkspaceBadgeProvider`](WorkspaceBadgeProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
ctx.subscriptions.push(
  ctx.workspaces.registerBadge({
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

### getBadges()

```ts
getBadges(workspaceId): WorkspaceBadge[];
```

Defined in: [packages/sdk/src/workspace-service.ts:309](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L309)

Concatenate all registered providers' badges for one workspace (in
registration order). Called synchronously during panel render — providers
must be fast and side-effect-free.

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

Defined in: [packages/sdk/src/workspace-service.ts:318](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L318)

Signal that badge data has changed. Fires all listeners registered via
[WorkspaceService.subscribeBadges](#subscribebadges), causing the Workspaces panel to
re-query providers and re-render the name row.

Call this after any mutation to the state your `provide` function reads.

#### Returns

`void`

***

### subscribeBadges()

```ts
subscribeBadges(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:325](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L325)

Subscribe to badge invalidations. The listener is called whenever
[WorkspaceService.invalidateBadges](#invalidatebadges) is invoked. Returns a
[Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)
