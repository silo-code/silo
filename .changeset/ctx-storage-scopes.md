---
"@silo-code/sdk": minor
---

Add `ctx.storage` — persisted, per-extension key/value storage in two scopes
(`ExtensionStorageScopes`): `global` (shared across all workspaces) and
`workspace` (scoped to the active workspace). Both are `ExtensionStorage`
namespaced to the extension id and usable from `activate()`.

`ExtensionStorage` gains `keys()`, and `subscribe` is now namespace-scoped —
it fires on a change within the namespace, on hydration, and (for `workspace`)
when the active workspace changes.
