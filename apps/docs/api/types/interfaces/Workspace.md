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

### editorViewStates?

```ts
optional editorViewStates?: Record<string, unknown>;
```

Defined in: [packages/sdk/src/domain-types.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L131)

Monaco view states keyed by editor record ID. Each value is the opaque
JSON produced by `editor.saveViewState()` — captures cursor position,
selection, scroll, and folded regions. Supersedes
[Workspace.editorScrollPositions](#editorscrollpositions) for editors that support it;
scroll-only data is kept as a fallback for older persisted workspaces.

***

### closedAt?

```ts
optional closedAt?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L137)

ISO timestamp of when the workspace was soft-closed, or null/undefined
if the workspace is open. Closed workspaces are hidden from the main
list and surfaced in a "reopen" picker.

***

### sidePanelLocations?

```ts
optional sidePanelLocations?: Record<string, SidePanelSlot>;
```

Defined in: [packages/sdk/src/domain-types.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L139)

Per-workspace side panel state — saved/restored on workspace switch.

***

### sidePanelOrder?

```ts
optional sidePanelOrder?: Record<string, number>;
```

Defined in: [packages/sdk/src/domain-types.ts:140](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L140)

***

### activeSidePanelTabs?

```ts
optional activeSidePanelTabs?: Record<string, string>;
```

Defined in: [packages/sdk/src/domain-types.ts:141](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L141)

***

### sidePanelScrollPositions?

```ts
optional sidePanelScrollPositions?: Record<string, number>;
```

Defined in: [packages/sdk/src/domain-types.ts:142](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L142)

***

### sidePanelVisibility?

```ts
optional sidePanelVisibility?: Record<string, boolean>;
```

Defined in: [packages/sdk/src/domain-types.ts:145](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L145)

Hidden side panels, keyed by panel id; only an explicit `false` (hidden)
is stored, so an absent key means visible (the default).

***

### extensionState?

```ts
optional extensionState?: Record<string, Record<string, unknown>>;
```

Defined in: [packages/sdk/src/domain-types.ts:146](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L146)

***

### leftPanelCollapsed?

```ts
optional leftPanelCollapsed?: boolean;
```

Defined in: [packages/sdk/src/domain-types.ts:148](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L148)

Whether the left side column is collapsed. Per-workspace.

***

### rightPanelCollapsed?

```ts
optional rightPanelCollapsed?: boolean;
```

Defined in: [packages/sdk/src/domain-types.ts:150](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L150)

Whether the right side column is collapsed. Per-workspace.

***

### previewEditorId?

```ts
optional previewEditorId?: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:152](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L152)

ID of the current preview (temporary) editor, if any.
