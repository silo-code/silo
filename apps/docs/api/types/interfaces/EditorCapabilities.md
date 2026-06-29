# Interface: EditorCapabilities

Defined in: [packages/sdk/src/types.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L101)

Optional declarations about what an [Editor](Editor.md) can do, used by the host to
decide routing (e.g. whether the editor can own an untitled buffer).

## Properties

### readonly?

```ts
optional readonly?: boolean;
```

Defined in: [packages/sdk/src/types.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L107)

The editor only displays, it can't edit or save (e.g. the image viewer, a
future PDF/hex preview). Defaults to false — editors are editable unless
they opt out. Mirrors VS Code's read-only custom-editor variant.

***

### handlesUntitled?

```ts
optional handlesUntitled?: boolean;
```

Defined in: [packages/sdk/src/types.ts:109](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L109)

The editor can render a never-saved (untitled) buffer. Defaults to false.
