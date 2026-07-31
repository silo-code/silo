# Interface: EditorsState

Defined in: [packages/sdk/src/editor-service.ts:193](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L193)

A frozen, referentially-stable snapshot of editor domain state. Returned by
[EditorService.getState](EditorService.md#getstate) and delivered to
[EditorService.subscribe](EditorService.md#subscribe) listeners.

Compatible with `useServiceState` — just pass `ctx.editors` directly.

## Properties

### active

```ts
active: ActiveEditorInfo | null;
```

Defined in: [packages/sdk/src/editor-service.ts:198](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L198)

The focused editor tab, or `null` when the active dock panel is not an
editor tab (e.g. a terminal, a dock panel kind, or nothing at all).

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L203)

`true` once the persisted workspace state has loaded from disk. Matches
`WorkspaceState.hydrated` — guard state-restoring code on this flag.
