# Interface: WorkspaceBadge

Defined in: [packages/sdk/src/workspace-service.ts:74](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L74)

A badge displayed next to the workspace name in the Workspaces side panel.
Contributed by a [WorkspaceBadgeProvider](WorkspaceBadgeProvider.md).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L76)

Stable key unique within this provider's results; used for reconciliation.

***

### text

```ts
text: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L78)

Short text rendered inside the badge.

***

### color?

```ts
optional color?: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L83)

Solid chip fill color. Text paints white on top for contrast. Falls back
to a muted solid background + hi text when omitted.
