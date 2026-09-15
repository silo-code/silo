# Interface: Workspace

Defined in: [packages/sdk/src/domain-types.ts:218](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L218)

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

Defined in: [packages/sdk/src/domain-types.ts:219](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L219)

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L220)

***

### folder

```ts
folder: string;
```

Defined in: [packages/sdk/src/domain-types.ts:221](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L221)

***

### extraFolders?

```ts
optional extraFolders?: string[];
```

Defined in: [packages/sdk/src/domain-types.ts:223](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L223)

Additional folders beyond the primary one.

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:224](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L224)

***

### lastOpenedAt

```ts
lastOpenedAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:225](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L225)

***

### closedAt?

```ts
optional closedAt?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:231](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L231)

ISO timestamp of when the workspace was soft-closed, or null/undefined
if the workspace is open. Closed workspaces are hidden from the main
list and surfaced in a "reopen" picker.

***

### terminals

```ts
terminals: readonly TerminalRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:232](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L232)

***

### editors

```ts
editors: readonly EditorRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L234)

Editor tabs — text editors and diffs alike (a diff is a record with `mode: "diff"`).

***

### panels

```ts
panels: readonly DockPanelRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L243)

Recorded dock panels — every panel of a [DockPanelKind](DockPanelKind.md) that declared
`persistence: "recorded"` (RFC 0041). Editors and terminals are **not** in
this list; they keep their own [Workspace.editors](#editors) /
[Workspace.terminals](#terminals) lists. A transient panel (a picker, a preview)
whose kind did not opt in is absent here — it lives only in the saved dock
layout.
