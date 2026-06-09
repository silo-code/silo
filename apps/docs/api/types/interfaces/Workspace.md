# Interface: Workspace

Defined in: [packages/sdk/src/domain-types.ts:110](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L110)

A workspace — the unit Silo switches between, keeping its terminals, editors,
and layout alive. Read via [WorkspaceService](WorkspaceService.md).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:111](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L111)

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:112](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L112)

***

### folder

```ts
folder: string;
```

Defined in: [packages/sdk/src/domain-types.ts:113](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L113)

***

### extraFolders?

```ts
optional extraFolders?: string[];
```

Defined in: [packages/sdk/src/domain-types.ts:115](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L115)

Additional folders beyond the primary one.

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:116](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L116)

***

### lastOpenedAt

```ts
lastOpenedAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L117)

***

### terminals

```ts
terminals: TerminalRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:118](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L118)

***

### editors

```ts
editors: EditorRecord[];
```

Defined in: [packages/sdk/src/domain-types.ts:120](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L120)

Editor tabs — text editors and diffs alike (a diff is a record with `mode: "diff"`).

***

### dockLayout

```ts
dockLayout: unknown;
```

Defined in: [packages/sdk/src/domain-types.ts:121](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L121)

***

### editorScrollPositions?

```ts
optional editorScrollPositions?: Record<string, {
  top: number;
  left: number;
}>;
```

Defined in: [packages/sdk/src/domain-types.ts:123](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L123)

Scroll positions keyed by editor record ID: { top, left } in pixels.

***

### closedAt?

```ts
optional closedAt?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L129)

ISO timestamp of when the workspace was soft-closed, or null/undefined
if the workspace is open. Closed workspaces are hidden from the main
list and surfaced in a "reopen" picker.

***

### sidePanelLocations?

```ts
optional sidePanelLocations?: Record<string, SidePanelSlot>;
```

Defined in: [packages/sdk/src/domain-types.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L131)

Per-workspace side panel state — saved/restored on workspace switch.

***

### sidePanelOrder?

```ts
optional sidePanelOrder?: Record<string, number>;
```

Defined in: [packages/sdk/src/domain-types.ts:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L132)

***

### activeSidePanelTabs?

```ts
optional activeSidePanelTabs?: Record<string, string>;
```

Defined in: [packages/sdk/src/domain-types.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L133)

***

### sidePanelScrollPositions?

```ts
optional sidePanelScrollPositions?: Record<string, number>;
```

Defined in: [packages/sdk/src/domain-types.ts:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L134)

***

### extensionState?

```ts
optional extensionState?: Record<string, Record<string, unknown>>;
```

Defined in: [packages/sdk/src/domain-types.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L135)

***

### leftPanelCollapsed?

```ts
optional leftPanelCollapsed?: boolean;
```

Defined in: [packages/sdk/src/domain-types.ts:136](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L136)

***

### rightPanelCollapsed?

```ts
optional rightPanelCollapsed?: boolean;
```

Defined in: [packages/sdk/src/domain-types.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L137)

***

### previewEditorId?

```ts
optional previewEditorId?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L139)

ID of the current preview (temporary) editor, if any.
