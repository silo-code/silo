# Interface: Workspace

Defined in: [packages/sdk/src/domain-types.ts:206](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L206)

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

Defined in: [packages/sdk/src/domain-types.ts:207](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L207)

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:208](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L208)

***

### folder

```ts
folder: string;
```

Defined in: [packages/sdk/src/domain-types.ts:209](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L209)

***

### extraFolders?

```ts
optional extraFolders?: string[];
```

Defined in: [packages/sdk/src/domain-types.ts:211](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L211)

Additional folders beyond the primary one.

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:212](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L212)

***

### lastOpenedAt

```ts
lastOpenedAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:213](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L213)

***

### closedAt?

```ts
optional closedAt?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:219](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L219)

ISO timestamp of when the workspace was soft-closed, or null/undefined
if the workspace is open. Closed workspaces are hidden from the main
list and surfaced in a "reopen" picker.

***

### terminals

```ts
terminals: readonly TerminalRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L220)

***

### editors

```ts
editors: readonly EditorRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:222](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L222)

Editor tabs — text editors and diffs alike (a diff is a record with `mode: "diff"`).

***

### panels

```ts
panels: readonly DockPanelRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:231](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L231)

Recorded dock panels — every panel of a [DockPanelKind](DockPanelKind.md) that declared
`persistence: "recorded"` (RFC 0041). Editors and terminals are **not** in
this list; they keep their own [Workspace.editors](#editors) /
[Workspace.terminals](#terminals) lists. A transient panel (a picker, a preview)
whose kind did not opt in is absent here — it lives only in the saved dock
layout.
