# Interface: WorkspacePropertyPageProps

Defined in: [packages/sdk/src/workspace-service.ts:123](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L123)

Props passed to a [WorkspacePropertyPage](WorkspacePropertyPage.md) component.

## Properties

### ws

```ts
ws: Workspace;
```

Defined in: [packages/sdk/src/workspace-service.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L125)

The workspace whose properties are being edited.

***

### workspaces

```ts
workspaces: WorkspaceService;
```

Defined in: [packages/sdk/src/workspace-service.ts:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L132)

The workspace service — read workspace state and subscribe to changes.
Persist the page's own settings via `ctx.storage.workspace`, applying
them immediately on change (the properties modal has no Save button —
every field persists as it changes).

***

### refresh?

```ts
optional refresh?: () => void;
```

Defined in: [packages/sdk/src/workspace-service.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L139)

Force a re-render of this tab's content. The host never persists
extension state — the extension owns that via `ctx.storage.workspace` —
but after an out-of-band change (e.g. a background poll updating what
the page displays) call this to refresh the mounted component.

#### Returns

`void`
