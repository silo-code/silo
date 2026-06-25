# Interface: WorkspaceService

Defined in: [packages/sdk/src/workspace-service.ts:123](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L123)

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

Defined in: [packages/sdk/src/workspace-service.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L125)

Current frozen view of workspace state.

#### Returns

[`WorkspaceState`](WorkspaceState.md)

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L126)

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

Defined in: [packages/sdk/src/workspace-service.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L131)

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

Defined in: [packages/sdk/src/workspace-service.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L133)

Show a folder picker and create a workspace from the chosen folder.

#### Returns

`Promise`\<[`Workspace`](Workspace.md) \| `null`\>

***

### create()

```ts
create(input): Workspace;
```

Defined in: [packages/sdk/src/workspace-service.ts:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L134)

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

Defined in: [packages/sdk/src/workspace-service.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L135)

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

Defined in: [packages/sdk/src/workspace-service.ts:136](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L136)

#### Parameters

##### from

`string`

##### to

`string`

##### position

`"after"` \| `"before"`

#### Returns

`void`

***

### activate()

```ts
activate(id): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:138](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L138)

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

Defined in: [packages/sdk/src/workspace-service.ts:140](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L140)

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

Defined in: [packages/sdk/src/workspace-service.ts:142](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L142)

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

Defined in: [packages/sdk/src/workspace-service.ts:144](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L144)

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

Defined in: [packages/sdk/src/workspace-service.ts:146](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L146)

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

Defined in: [packages/sdk/src/workspace-service.ts:148](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L148)

Hard delete — permanent removal.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### registerDecoration()

```ts
registerDecoration(provider): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:170](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L170)

Register a decoration provider that contributes status rows to workspace
rows in the Workspaces side panel. Multiple providers may be registered;
their rows are concatenated in registration order. Returns a
[Disposable](Disposable.md) that unregisters the provider.

#### Parameters

##### provider

[`WorkspaceDecorationProvider`](WorkspaceDecorationProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
ctx.subscriptions.push(
  ctx.workspaces.registerDecoration({
    id: "my-ext.decoration",
    provide(workspaceId) {
      const running = getRunningTasks(workspaceId);
      return running.map(t => ({ id: t.id, status: "busy", label: t.name, startedAt: t.startedAt }));
    },
  }),
  ctx.workspaces.subscribeDecorations(() => ctx.workspaces.invalidateDecorations()),
);
```

***

### getDecorations()

```ts
getDecorations(workspaceId): WorkspaceStatusRow[];
```

Defined in: [packages/sdk/src/workspace-service.ts:177](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L177)

Concatenate all registered providers' rows for one workspace (in
registration order). Called synchronously during panel render — providers
must be fast and side-effect-free.

#### Parameters

##### workspaceId

`string`

#### Returns

[`WorkspaceStatusRow`](WorkspaceStatusRow.md)[]

***

### invalidateDecorations()

```ts
invalidateDecorations(): void;
```

Defined in: [packages/sdk/src/workspace-service.ts:186](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L186)

Signal that decoration data has changed. Fires all listeners registered
via [WorkspaceService.subscribeDecorations](#subscribedecorations), causing the Workspaces
panel to re-query providers and re-render the status rows.

Call this after any mutation to the state your `provide` function reads.

#### Returns

`void`

***

### subscribeDecorations()

```ts
subscribeDecorations(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L196)

Subscribe to decoration invalidations. The listener is called whenever
[WorkspaceService.invalidateDecorations](#invalidatedecorations) is invoked. Returns a
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

Defined in: [packages/sdk/src/workspace-service.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L220)

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

Defined in: [packages/sdk/src/workspace-service.ts:230](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L230)

Subscribe to section registration changes. The listener is called whenever
a [WorkspaceSectionProvider](WorkspaceSectionProvider.md) is registered or unregistered. Returns a
[Disposable](Disposable.md) that cancels the subscription.

The Workspaces panel subscribes internally to re-render when providers
are added or removed.

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)
