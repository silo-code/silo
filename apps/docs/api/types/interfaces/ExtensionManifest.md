# Interface: ExtensionManifest

Defined in: [packages/sdk/src/types.ts:927](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L927)

Display metadata for an extension, surfaced in the **Extensions** settings
page (name, one-line description, version, and [\* \| publisher](#publisher) brand). For built-in extensions this is declared in-code on the
[Extension](Extension.md); for runtime-loaded third-party extensions the host reads
the equivalent fields from the package manifest (`displayName`/`description`/
`version` and the `silo.publisher` key) instead. Every field is optional — the
host falls back to the extension [id](Extension.md#id) (and the id's
namespace for the publisher) when one is absent.

## Properties

### name?

```ts
readonly optional name?: string;
```

Defined in: [packages/sdk/src/types.ts:929](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L929)

Human-friendly name shown in the Extensions list (falls back to the id).

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/types.ts:931](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L931)

One-line description shown beneath the name.

***

### version?

```ts
readonly optional version?: string;
```

Defined in: [packages/sdk/src/types.ts:933](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L933)

Version string shown next to the name.

***

### publisher?

```ts
readonly optional publisher?: string;
```

Defined in: [packages/sdk/src/types.ts:940](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L940)

The publisher/brand shown beside the name (e.g. `"Silo"`). Built-in
extensions are always branded `"Silo"` by the host regardless of this field;
third-party extensions set it via the `silo.publisher` manifest key and fall
back to their id's namespace (e.g. `"acme"` for `"acme.foo"`).
