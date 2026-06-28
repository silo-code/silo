# Interface: ExtensionStorageScopes

Defined in: [packages/sdk/src/extension-storage.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L40)

The two persisted-storage scopes available to an extension, exposed as
[ExtensionContext.storage](ExtensionContext.md#storage).

## Properties

### global

```ts
readonly global: ExtensionStorage;
```

Defined in: [packages/sdk/src/extension-storage.ts:45](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L45)

Per-extension storage shared across **all** workspaces — the place for
an extension's own settings (enabled features, layout choices, etc.).

***

### workspace

```ts
readonly workspace: ExtensionStorage;
```

Defined in: [packages/sdk/src/extension-storage.ts:51](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L51)

Per-extension storage scoped to the **active workspace** — the place for
state that should differ per workspace (last selection, per-project
toggles). The bag is swapped when the active workspace changes.
