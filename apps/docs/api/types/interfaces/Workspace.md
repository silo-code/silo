# Interface: Workspace

Defined in: [packages/sdk/src/domain-types.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L127)

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

Defined in: [packages/sdk/src/domain-types.ts:128](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L128)

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L129)

***

### folder

```ts
folder: string;
```

Defined in: [packages/sdk/src/domain-types.ts:130](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L130)

***

### extraFolders?

```ts
optional extraFolders?: string[];
```

Defined in: [packages/sdk/src/domain-types.ts:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L132)

Additional folders beyond the primary one.

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L133)

***

### lastOpenedAt

```ts
lastOpenedAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L134)

***

### closedAt?

```ts
optional closedAt?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:140](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L140)

ISO timestamp of when the workspace was soft-closed, or null/undefined
if the workspace is open. Closed workspaces are hidden from the main
list and surfaced in a "reopen" picker.

***

### terminals

```ts
terminals: readonly TerminalRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:141](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L141)

***

### editors

```ts
editors: readonly EditorRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:143](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L143)

Editor tabs — text editors and diffs alike (a diff is a record with `mode: "diff"`).
