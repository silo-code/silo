# Interface: WorkspaceStatusRow

Defined in: [packages/sdk/src/workspace-service.ts:14](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L14)

A single status row contributed by a [WorkspaceStatusProvider](WorkspaceStatusProvider.md).
Rows appear below the path line in the Workspaces side panel.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:16](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L16)

Stable key unique within this provider's results; used for reconciliation.

***

### status?

```ts
optional status?: "ok" | "warn" | "busy" | "error";
```

Defined in: [packages/sdk/src/workspace-service.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L18)

Semantic status dot shown to the left of the label.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:20](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L20)

Short label — the host truncates with an ellipsis when space is tight.

***

### startedAt?

```ts
optional startedAt?: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:26](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L26)

ISO timestamp for when this row started. The host renders it as elapsed
time using the same `formatElapsed` helper as workspace uptime ("6h", "2d",
"just now").
