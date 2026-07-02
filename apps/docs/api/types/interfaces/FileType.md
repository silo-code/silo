# Interface: FileType

Defined in: [packages/sdk/src/types.ts:218](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L218)

Declarative metadata about a file extension — the open-ended counterpart to
Viewer (which is purely a renderer). A single source of truth that "New File"
surfaces (and, later, tab/explorer icons) can enumerate. Registering a
FileType does not register a viewer; the two are matched independently by
extension at dispatch time.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L220)

Unique id, conventionally namespaced.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:222](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L222)

Human label, e.g. "Foo File". Used to build "New {label}…" entries.

***

### extensions

```ts
extensions: string[];
```

Defined in: [packages/sdk/src/types.ts:224](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L224)

Extensions this type owns — leading dot, lowercase. e.g. [".foo"].

***

### newFile?

```ts
optional newFile?: NewFileTemplate;
```

Defined in: [packages/sdk/src/types.ts:226](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L226)

When present, the type can be created from "New File" surfaces.
