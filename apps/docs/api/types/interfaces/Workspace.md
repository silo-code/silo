# Interface: Workspace

Defined in: [packages/sdk/src/domain-types.ts:115](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L115)

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

Defined in: [packages/sdk/src/domain-types.ts:116](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L116)

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L117)

***

### folder

```ts
folder: string;
```

Defined in: [packages/sdk/src/domain-types.ts:118](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L118)

***

### extraFolders?

```ts
optional extraFolders?: string[];
```

Defined in: [packages/sdk/src/domain-types.ts:120](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L120)

Additional folders beyond the primary one.

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:121](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L121)

***

### lastOpenedAt

```ts
lastOpenedAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:122](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L122)

***

### closedAt?

```ts
optional closedAt?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:128](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L128)

ISO timestamp of when the workspace was soft-closed, or null/undefined
if the workspace is open. Closed workspaces are hidden from the main
list and surfaced in a "reopen" picker.

***

### terminals

```ts
terminals: readonly TerminalRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L129)

***

### editors

```ts
editors: readonly EditorRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L131)

Editor tabs — text editors and diffs alike (a diff is a record with `mode: "diff"`).
