# Interface: Workspace

Defined in: [packages/sdk/src/domain-types.ts:162](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L162)

A workspace — the unit Silo switches between, keeping its terminals, editors,
and layout alive. Read via [WorkspaceService](WorkspaceService.md).

This is the public surface: it carries the fields an extension needs to read
(name, folder, open tabs). Layout, scroll, and panel-state fields are
host-internal (`WorkspaceInternal` in `@silo-code/extension-host`) and are
intentionally absent here.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:163](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L163)

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:164](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L164)

***

### folder

```ts
folder: string;
```

Defined in: [packages/sdk/src/domain-types.ts:165](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L165)

***

### extraFolders?

```ts
optional extraFolders?: string[];
```

Defined in: [packages/sdk/src/domain-types.ts:167](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L167)

Additional folders beyond the primary one.

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:168](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L168)

***

### lastOpenedAt

```ts
lastOpenedAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:169](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L169)

***

### closedAt?

```ts
optional closedAt?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:175](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L175)

ISO timestamp of when the workspace was soft-closed, or null/undefined
if the workspace is open. Closed workspaces are hidden from the main
list and surfaced in a "reopen" picker.

***

### terminals

```ts
terminals: readonly TerminalRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:176](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L176)

***

### editors

```ts
editors: readonly EditorRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:178](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L178)

Editor tabs — text editors and diffs alike (a diff is a record with `mode: "diff"`).
