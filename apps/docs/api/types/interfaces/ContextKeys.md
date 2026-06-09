# Interface: ContextKeys

Defined in: [packages/sdk/src/context-keys.ts:13](https://github.com/silo-code/silo/blob/main/packages/sdk/src/context-keys.ts#L13)

Minimal context-keys store. Menu items, keybindings, and (later) view
contributions can declare `when` clauses that read these values; the host
re-evaluates the clauses whenever a key changes and updates UI state
(enabled/disabled menu items, etc.).

Keys are added as needed. Start narrow: only the keys we have a real use
for. Avoid the temptation to mirror every piece of app state into here.

## Properties

### activeViewerId

```ts
activeViewerId: string | null;
```

Defined in: [packages/sdk/src/context-keys.ts:15](https://github.com/silo-code/silo/blob/main/packages/sdk/src/context-keys.ts#L15)

id of the viewer rendered by the dock's active panel, or null.

***

### activeEditorId

```ts
activeEditorId: string | null;
```

Defined in: [packages/sdk/src/context-keys.ts:17](https://github.com/silo-code/silo/blob/main/packages/sdk/src/context-keys.ts#L17)

editorId of the active dock panel if it's an editor panel, or null.
