# Interface: WorkspaceBadge

Defined in: [packages/sdk/src/workspace-service.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L73)

A badge displayed next to the workspace name in the Workspaces side panel.
Contributed by a [WorkspaceBadgeProvider](WorkspaceBadgeProvider.md).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L75)

Stable key unique within this provider's results; used for reconciliation.

***

### text

```ts
text: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L77)

Short text rendered inside the badge.

***

### color?

```ts
optional color?: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L82)

Solid chip fill color. Text paints white on top for contrast. Falls back
to a muted solid background + hi text when omitted.
