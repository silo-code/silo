# Interface: ExtensionStorageScopes

Defined in: [packages/sdk/src/extension-storage.ts:45](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L45)

The two persisted-storage scopes available to an extension, exposed as
[ExtensionContext.storage](ExtensionContext.md#storage).

## Properties

### global

```ts
readonly global: ExtensionStorage;
```

Defined in: [packages/sdk/src/extension-storage.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L50)

Per-extension storage shared across **all** workspaces — the place for
an extension's own settings (enabled features, layout choices, etc.).

***

### workspace

```ts
readonly workspace: ExtensionStorage;
```

Defined in: [packages/sdk/src/extension-storage.ts:56](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L56)

Per-extension storage scoped to the **active workspace** — the place for
state that should differ per workspace (last selection, per-project
toggles). The bag is swapped when the active workspace changes.
