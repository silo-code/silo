# Interface: ContextKeys

Defined in: [packages/sdk/src/context-keys.ts:13](https://github.com/silo-code/silo/blob/main/packages/sdk/src/context-keys.ts#L13)

Minimal context-keys store. Menu items, keybindings, and (later) view
contributions can declare `when` clauses that read these values; the host
re-evaluates the clauses whenever a key changes and updates UI state
(enabled/disabled menu items, etc.).

Keys are added as needed. Start narrow: only the keys we have a real use
for. Avoid the temptation to mirror every piece of app state into here.

## Properties

### activeEditorViewId

```ts
activeEditorViewId: string | null;
```

Defined in: [packages/sdk/src/context-keys.ts:20](https://github.com/silo-code/silo/blob/main/packages/sdk/src/context-keys.ts#L20)

The [Editor.id](Editor.md#id) of the presenter currently rendering the active dock
panel (e.g. `"core.text-editor"`, `"silo.markdown-preview"`), or `null`
when the active panel is not an editor. Identifies the *view type*, not the
tab instance — see [ContextKeys.activeEditorId](#activeeditorid) for the tab record id.

***

### activeEditorId

```ts
activeEditorId: string | null;
```

Defined in: [packages/sdk/src/context-keys.ts:26](https://github.com/silo-code/silo/blob/main/packages/sdk/src/context-keys.ts#L26)

The `editorId` of the active editor tab record, or `null` when the active
dock panel is not an editor tab. Identifies the *tab instance* — see
[ContextKeys.activeEditorViewId](#activeeditorviewid) for the view-type (presenter) id.

***

### ~~activeViewerId~~

```ts
activeViewerId: string | null;
```

Defined in: [packages/sdk/src/context-keys.ts:32](https://github.com/silo-code/silo/blob/main/packages/sdk/src/context-keys.ts#L32)

#### Deprecated

Use [ContextKeys.activeEditorViewId](#activeeditorviewid) instead.
Kept for one release so extensions compiled against the old SDK continue
to receive the correct value at runtime without a silent break.
