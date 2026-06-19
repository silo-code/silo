# Interface: WorkspaceService

Defined in: [packages/sdk/src/workspace-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L50)

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

Defined in: [packages/sdk/src/workspace-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L52)

Current frozen view of workspace state.

#### Returns

[`WorkspaceState`](WorkspaceState.md)

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/workspace-service.ts:53](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L53)

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

Defined in: [packages/sdk/src/workspace-service.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L58)

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

Defined in: [packages/sdk/src/workspace-service.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L60)

Show a folder picker and create a workspace from the chosen folder.

#### Returns

`Promise`\<[`Workspace`](Workspace.md) \| `null`\>

***

### create()

```ts
create(input): Workspace;
```

Defined in: [packages/sdk/src/workspace-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L61)

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

Defined in: [packages/sdk/src/workspace-service.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L62)

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

Defined in: [packages/sdk/src/workspace-service.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L63)

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

Defined in: [packages/sdk/src/workspace-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L65)

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

Defined in: [packages/sdk/src/workspace-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L67)

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

Defined in: [packages/sdk/src/workspace-service.ts:69](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L69)

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

Defined in: [packages/sdk/src/workspace-service.ts:71](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L71)

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

Defined in: [packages/sdk/src/workspace-service.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L73)

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

Defined in: [packages/sdk/src/workspace-service.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L75)

Hard delete — permanent removal.

#### Parameters

##### id

`string`

#### Returns

`void`
