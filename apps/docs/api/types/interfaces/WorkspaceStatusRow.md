# Interface: WorkspaceStatusRow

Defined in: [packages/sdk/src/workspace-service.ts:16](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L16)

A single status row contributed by a [WorkspaceStatusProvider](WorkspaceStatusProvider.md).
Rows appear below the path line in the Workspaces side panel.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L18)

Stable key unique within this provider's results; used for reconciliation.

***

### activity?

```ts
optional activity?: Activity;
```

Defined in: [packages/sdk/src/workspace-service.ts:23](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L23)

Host-owned [Activity](../type-aliases/Activity.md) glyph to the left of the label. Omit for the
neutral gray fallback (same as today’s omitted `status`). See ADR 0030.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:25](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L25)

Short label — the host truncates with an ellipsis when space is tight.

***

### startedAt?

```ts
optional startedAt?: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:31](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L31)

ISO timestamp for when this row started. The host renders it as elapsed
time using the same `formatElapsed` helper as workspace uptime ("6h", "2d",
"just now").
