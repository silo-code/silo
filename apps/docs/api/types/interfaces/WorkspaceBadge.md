# Interface: WorkspaceBadge

Defined in: [packages/sdk/src/workspace-service.ts:69](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L69)

A badge displayed next to the workspace name in the Workspaces side panel.
Contributed by a [WorkspaceBadgeProvider](WorkspaceBadgeProvider.md).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:71](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L71)

Stable key unique within this provider's results; used for reconciliation.

***

### text

```ts
text: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L73)

Short text rendered inside the badge.

***

### color?

```ts
optional color?: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L78)

CSS color applied to both the badge border and text. Falls back to the
muted text color (`--silo-color-text-lo`) when omitted.
